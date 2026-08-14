// Package social implements the follow graph.
//
// It is its own package rather than more surface on `users` because it is about the
// relationship *between* accounts, not about an account: nothing here reads or writes
// a user row. That also keeps the dependency one-way — social needs the public view
// of an account, and users needs to know nothing about who follows whom.
package social

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/notify"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Bounds on a follower or following page. A profile shows a grid of faces, so the
// default is larger than a feed page and the ceiling is what stops an unbounded
// response on an account with many thousands of followers.
const (
	DefaultPageSize = 50
	MaxPageSize     = 200
)

// FollowRead is one edge of the graph as the API returns it.
type FollowRead struct {
	User      users.UserPublic `json:"user" doc:"The account on the other end of the follow"`
	CreatedAt time.Time        `json:"createdAt" doc:"When the follow was made"`
}

// Counts is the follow tally a profile shows, plus whether the reader follows this
// account.
type Counts struct {
	FollowerCount  int64 `json:"followerCount" doc:"How many accounts follow this one"`
	FollowingCount int64 `json:"followingCount" doc:"How many accounts this one follows"`

	// Per-reader, and false for an anonymous reader rather than absent, matching how
	// the forum reports `liked`. A response carrying it must not be cached publicly.
	Following bool `json:"following" doc:"Whether the current reader follows this account"`
}

// AccountSource resolves accounts. The same narrow interface the forum and roles
// packages take, for the same reason.
type AccountSource interface {
	PublicByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]users.UserPublic, error)
	IDByUID(ctx context.Context, uid int64) (uuid.UUID, error)
}

// Notifier receives the events the graph causes. An interface for the same reason the
// forum has one: social states what happened, not how anyone is told.
type Notifier interface {
	Notify(ctx context.Context, e notify.Event) error
}

// Service implements the follow graph.
type Service struct {
	q        *coredb.Queries
	accounts AccountSource
	notifier Notifier
	logger   *slog.Logger
}

// NewService wires the social service.
func NewService(q *coredb.Queries, accounts AccountSource, notifier Notifier, logger *slog.Logger) *Service {
	return &Service{q: q, accounts: accounts, notifier: notifier, logger: logger}
}

// SetFollow follows or unfollows an account, and returns the resulting tally.
//
// One method for both directions, as with reactions: they differ by one statement,
// both are idempotent, and returning the new counts lets a client render them without
// a second request.
func (s *Service) SetFollow(ctx context.Context, followerID uuid.UUID, uid int64, following bool) (Counts, error) {
	followeeID, err := s.accounts.IDByUID(ctx, uid)
	if err != nil {
		return Counts{}, err
	}

	// Refused here as well as by the check constraint. The constraint is what makes it
	// impossible; this is what makes the refusal say something useful instead of
	// surfacing a constraint violation as a 500.
	if followeeID == followerID {
		return Counts{}, apierr.New(apierr.Validation, "you cannot follow yourself")
	}

	if following {
		err = s.q.FollowUser(ctx, coredb.FollowUserParams{FollowerID: followerID, FolloweeID: followeeID})
	} else {
		err = s.q.UnfollowUser(ctx, coredb.UnfollowUserParams{FollowerID: followerID, FolloweeID: followeeID})
	}
	if err != nil {
		return Counts{}, fmt.Errorf("set follow: %w", err)
	}

	// Only on the way up: being unfollowed is not news anyone needs delivered.
	if following {
		if err := s.notifier.Notify(ctx, notify.Event{
			Recipient: followeeID,
			Kind:      notify.Follow,
			Actor:     &followerID,
		}); err != nil {
			return Counts{}, err
		}
	}
	return s.CountsFor(ctx, followeeID, &followerID)
}

// CountsFor tallies an account's follows. viewer may be nil for an anonymous reader.
func (s *Service) CountsFor(ctx context.Context, userID uuid.UUID, viewer *uuid.UUID) (Counts, error) {
	followers, err := s.q.CountFollowers(ctx, userID)
	if err != nil {
		return Counts{}, fmt.Errorf("count followers: %w", err)
	}
	following, err := s.q.CountFollowing(ctx, userID)
	if err != nil {
		return Counts{}, fmt.Errorf("count following: %w", err)
	}
	// With no viewer, `follower_id = NULL` is never true, so this is false without a
	// guard — the same shape an anonymous forum read gets.
	isFollowing, err := s.q.IsFollowing(ctx, coredb.IsFollowingParams{
		FollowerID: viewer,
		FolloweeID: userID,
	})
	if err != nil {
		return Counts{}, fmt.Errorf("check follow: %w", err)
	}
	return Counts{FollowerCount: followers, FollowingCount: following, Following: isFollowing}, nil
}

// IsFollowing reports whether follower follows followee.
//
// Exported so the privacy package can answer "followers only" without importing this
// one's whole surface — and so that the dependency runs privacy → social rather than the
// other way, which is what keeps the two from becoming mutually dependent.
func (s *Service) IsFollowing(ctx context.Context, follower uuid.UUID, followee uuid.UUID) (bool, error) {
	found, err := s.q.IsFollowing(ctx, coredb.IsFollowingParams{
		FollowerID: &follower,
		FolloweeID: followee,
	})
	if err != nil {
		return false, fmt.Errorf("check follow: %w", err)
	}
	return found, nil
}

// CountsForUID is CountsFor addressed by public number.
func (s *Service) CountsForUID(ctx context.Context, uid int64, viewer *uuid.UUID) (Counts, error) {
	userID, err := s.accounts.IDByUID(ctx, uid)
	if err != nil {
		return Counts{}, err
	}
	return s.CountsFor(ctx, userID, viewer)
}

// Followers lists the accounts following this one.
func (s *Service) Followers(ctx context.Context, uid int64, page, pageSize int) ([]FollowRead, int64, error) {
	userID, err := s.accounts.IDByUID(ctx, uid)
	if err != nil {
		return nil, 0, err
	}
	limit, offset := paging(page, pageSize)

	total, err := s.q.CountFollowers(ctx, userID)
	if err != nil {
		return nil, 0, fmt.Errorf("count followers: %w", err)
	}
	rows, err := s.q.ListFollowers(ctx, coredb.ListFollowersParams{
		FolloweeID:   userID,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list followers: %w", err)
	}

	edges := make([]edge, 0, len(rows))
	for _, r := range rows {
		edges = append(edges, edge{ID: r.FollowerID, CreatedAt: r.CreatedAt})
	}
	out, err := s.resolve(ctx, edges)
	return out, total, err
}

// Following lists the accounts this one follows.
func (s *Service) Following(ctx context.Context, uid int64, page, pageSize int) ([]FollowRead, int64, error) {
	userID, err := s.accounts.IDByUID(ctx, uid)
	if err != nil {
		return nil, 0, err
	}
	limit, offset := paging(page, pageSize)

	total, err := s.q.CountFollowing(ctx, userID)
	if err != nil {
		return nil, 0, fmt.Errorf("count following: %w", err)
	}
	rows, err := s.q.ListFollowing(ctx, coredb.ListFollowingParams{
		FollowerID:   userID,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list following: %w", err)
	}

	edges := make([]edge, 0, len(rows))
	for _, r := range rows {
		edges = append(edges, edge{ID: r.FolloweeID, CreatedAt: r.CreatedAt})
	}
	out, err := s.resolve(ctx, edges)
	return out, total, err
}

type edge struct {
	ID        uuid.UUID
	CreatedAt time.Time
}

// resolve turns a page of edges into public views in one lookup, matching how the
// forum loads a page of authors.
func (s *Service) resolve(ctx context.Context, edges []edge) ([]FollowRead, error) {
	ids := make([]uuid.UUID, 0, len(edges))
	for _, e := range edges {
		ids = append(ids, e.ID)
	}
	people, err := s.accounts.PublicByIDs(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("load accounts: %w", err)
	}

	out := make([]FollowRead, 0, len(edges))
	for _, e := range edges {
		person, ok := people[e.ID]
		if !ok {
			// Deleted or deactivated between the two queries. Dropped rather than
			// rendered, as elsewhere: a UserPublic with no name is a shape no client
			// should have to handle.
			continue
		}
		out = append(out, FollowRead{User: person, CreatedAt: e.CreatedAt})
	}
	return out, nil
}

func paging(page, pageSize int) (limit int32, offset int32) {
	return api.ClampPaging(page, pageSize, DefaultPageSize, MaxPageSize)
}
