// Package privacy decides who may see what about an account.
//
// It is a separate package, and the enforcement deliberately sits in the handler layer
// rather than inside `social` or `forum`. Answering "may this reader see it" needs the
// follow graph, and `social` needs no opinion about privacy — putting the check inside
// either one would create a cycle between them. A handler depending on both is the
// honest shape, and it keeps every decision visible at the route where it applies.
package privacy

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Level is who may see something.
type Level string

const (
	// Public is visible to anyone, signed in or not.
	Public Level = "public"
	// Followers is visible to accounts the owner has accepted — which here means
	// accounts that follow them, since following needs no approval.
	Followers Level = "followers"
	// Private is visible to the owner alone.
	Private Level = "private"
)

var levels = []Level{Public, Followers, Private}

// ValidLevel reports whether l names a level.
func ValidLevel(l Level) bool {
	for _, known := range levels {
		if l == known {
			return true
		}
	}
	return false
}

// Settings is an account's visibility choices.
type Settings struct {
	Profile  Level `json:"profileVisibility" enum:"public,followers,private" doc:"Who may see the profile"`
	Posts    Level `json:"postsVisibility" enum:"public,followers,private" doc:"Who may see posts listed on the profile"`
	Activity Level `json:"activityVisibility" enum:"public,followers,private" doc:"Who may see the follow lists and tallies"`
}

// Update is a partial change; a nil field leaves that setting alone.
type Update struct {
	Profile  *Level
	Posts    *Level
	Activity *Level
}

// FollowChecker answers whether one account follows another.
//
// An interface so this package does not import `social`, which is what would otherwise
// make the two mutually dependent once social started consulting privacy.
type FollowChecker interface {
	IsFollowing(ctx context.Context, follower uuid.UUID, followee uuid.UUID) (bool, error)
}

// Service reads and applies visibility settings.
type Service struct {
	q       *coredb.Queries
	follows FollowChecker
	logger  *slog.Logger
}

// NewService wires the privacy service.
func NewService(q *coredb.Queries, follows FollowChecker, logger *slog.Logger) *Service {
	return &Service{q: q, follows: follows, logger: logger}
}

// For reads an account's settings. An account that has never changed them has no row,
// and everything reads as public.
func (s *Service) For(ctx context.Context, userID uuid.UUID) (Settings, error) {
	row, err := s.q.GetUserPrivacy(ctx, userID)
	if err != nil {
		return Settings{}, fmt.Errorf("load privacy: %w", err)
	}
	return Settings{
		Profile:  Level(row.ProfileVisibility),
		Posts:    Level(row.PostsVisibility),
		Activity: Level(row.ActivityVisibility),
	}, nil
}

// Set applies a partial change and returns the result.
func (s *Service) Set(ctx context.Context, userID uuid.UUID, in Update) (Settings, error) {
	for _, level := range []*Level{in.Profile, in.Posts, in.Activity} {
		if level != nil && !ValidLevel(*level) {
			return Settings{}, apierr.New(apierr.Validation,
				fmt.Sprintf("%q is not a visibility level", *level))
		}
	}

	row, err := s.q.SetUserPrivacy(ctx, coredb.SetUserPrivacyParams{
		UserID:             userID,
		ProfileVisibility:  levelPtr(in.Profile),
		PostsVisibility:    levelPtr(in.Posts),
		ActivityVisibility: levelPtr(in.Activity),
	})
	if err != nil {
		return Settings{}, fmt.Errorf("set privacy: %w", err)
	}
	return Settings{
		Profile:  Level(row.ProfileVisibility),
		Posts:    Level(row.PostsVisibility),
		Activity: Level(row.ActivityVisibility),
	}, nil
}

// Allows reports whether viewer may see something the owner has set to level.
//
// The owner always sees their own, at every level: a setting is a choice about other
// people, and hiding your own profile from yourself would be a bug that looks like a
// feature. An anonymous viewer sees only what is public, because there is nobody for
// "followers" to be true of.
func (s *Service) Allows(ctx context.Context, owner uuid.UUID, viewer *uuid.UUID, level Level) (bool, error) {
	if level == Public {
		return true, nil
	}
	if viewer == nil {
		return false, nil
	}
	if *viewer == owner {
		return true, nil
	}
	if level == Private {
		return false, nil
	}
	return s.follows.IsFollowing(ctx, *viewer, owner)
}

// Require is Allows as a guard, answering the error a handler should return.
//
// 404 rather than 403, and that is the substantive choice in this package: 403 confirms
// the thing exists and is being withheld, which tells a blocked reader they were singled
// out and tells anyone that the account is real. Not-found reveals nothing either way.
func (s *Service) Require(ctx context.Context, owner uuid.UUID, viewer *uuid.UUID, level Level, what string) error {
	allowed, err := s.Allows(ctx, owner, viewer, level)
	if err != nil {
		return err
	}
	if !allowed {
		return apierr.New(apierr.NotFound, fmt.Sprintf("no such %s", what))
	}
	return nil
}

func levelPtr(l *Level) *string {
	if l == nil {
		return nil
	}
	s := string(*l)
	return &s
}
