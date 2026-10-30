package comments

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/games"
	"github.com/arkive-games/arkive/backend-go/internal/core/notify"
	"github.com/arkive-games/arkive/backend-go/internal/core/roles"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Service implements the marker-comment use cases.
type Service struct {
	q        *coredb.Queries
	authors  AuthorSource
	authz    Authorizer
	notifier Notifier
	markers  MarkerIndex
	logger   *slog.Logger
}

// Notifier receives the events a marker comment causes.
//
// The forum's own interface, and the forum's own inbox behind it. An interface so a
// test can assert an event was raised without a notifications table.
type Notifier interface {
	Notify(ctx context.Context, e notify.Event) error
}

// Authorizer answers the one permission question this package does not decide for
// itself: whether the caller moderates the game the comment belongs to.
type Authorizer interface {
	CanAny(ctx context.Context, p auth.Principal, action roles.Action, gameKeys []string) (bool, error)
}

// AuthorSource resolves the public view of an account.
type AuthorSource interface {
	PublicByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]users.UserPublic, error)
}

// NewService wires the comments service.
//
// A nil markers index is legitimate: it is what a deployment with no artifact host
// runs, and create then validates on format alone.
func NewService(q *coredb.Queries, authors AuthorSource, authz Authorizer, notifier Notifier, markers MarkerIndex, logger *slog.Logger) *Service {
	return &Service{q: q, authors: authors, authz: authz, notifier: notifier, markers: markers, logger: logger}
}

// Shape patterns for the two opaque location keys.
//
// They mirror the CHECK constraints on the table, so the caller gets a field-level
// 422 instead of a constraint violation surfacing as a 500. The bounds come from the
// data: PBZ's 2,476 marker ids are lowercase-plus-hyphen and at most 30 characters,
// and its map ids are PascalCase (DengDingShanDao).
var (
	mapShape    = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
	markerShape = regexp.MustCompile(`^[A-Za-z0-9-]{1,40}$`)
)

// Create adds a top-level comment or a reply.
func (s *Service) Create(ctx context.Context, principal auth.Principal, in CreateInput) (MarkerCommentRead, error) {
	target, err := validateTarget(in.GameKey, in.MapID, in.MarkerID)
	if err != nil {
		return MarkerCommentRead{}, err
	}
	body, err := validateBody(in.Body)
	if err != nil {
		return MarkerCommentRead{}, err
	}

	if in.ParentID != nil {
		return s.createReply(ctx, principal, target, body, *in.ParentID)
	}

	if err := s.requireMarker(ctx, target); err != nil {
		return MarkerCommentRead{}, err
	}

	comment, err := s.q.CreateMarkerComment(ctx, coredb.CreateMarkerCommentParams{
		ID:       uuid.New(),
		GameKey:  target.GameKey,
		MapID:    target.MapID,
		MarkerID: target.MarkerID,
		AuthorID: principal.ID,
		Body:     body,
	})
	if err != nil {
		return MarkerCommentRead{}, fmt.Errorf("create marker comment: %w", err)
	}
	return s.single(ctx, comment, &principal.ID)
}

// createReply adds a reply under a top-level comment.
//
// A reply is never checked against the marker index: the parent already exists, so
// the marker exists, and the parent's own location is the truth about where the
// reply belongs.
func (s *Service) createReply(ctx context.Context, principal auth.Principal, target Target, body string, parentID uuid.UUID) (MarkerCommentRead, error) {
	parent, err := s.q.GetMarkerCommentByID(ctx, parentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MarkerCommentRead{}, apierr.New(apierr.NotFound, "no such comment to reply to")
		}
		return MarkerCommentRead{}, fmt.Errorf("load parent comment: %w", err)
	}
	// A hidden parent is gone as far as a reader is concerned, so it cannot be
	// replied to either — otherwise a thread grows under content nobody can see.
	if withdrawn(parent) {
		return MarkerCommentRead{}, apierr.New(apierr.NotFound, "no such comment to reply to")
	}
	if parent.ParentID != nil {
		return MarkerCommentRead{}, apierr.New(apierr.Validation,
			"replies cannot be nested further; reply to the comment instead")
	}
	// The parent's location wins: replying to a comment under one marker cannot
	// attach the reply to another, which the composite foreign key would refuse
	// anyway as a 500 rather than an explanation.
	if parent.GameKey != target.GameKey || parent.MapID != target.MapID || parent.MarkerID != target.MarkerID {
		return MarkerCommentRead{}, apierr.New(apierr.Validation,
			"that comment belongs to a different marker")
	}

	comment, err := s.q.CreateMarkerCommentReply(ctx, coredb.CreateMarkerCommentReplyParams{
		ID:       uuid.New(),
		GameKey:  parent.GameKey,
		MapID:    parent.MapID,
		MarkerID: parent.MarkerID,
		AuthorID: principal.ID,
		ParentID: &parent.ID,
		Body:     body,
	})
	if err != nil {
		return MarkerCommentRead{}, fmt.Errorf("create marker comment reply: %w", err)
	}

	s.notify(ctx, notify.Event{
		Recipient:       parent.AuthorID,
		Kind:            notify.Reply,
		Actor:           &principal.ID,
		MarkerCommentID: &comment.ID,
	})
	return s.single(ctx, comment, &principal.ID)
}

// List returns a page of a marker's top-level comments and the total visible count.
func (s *Service) List(ctx context.Context, target Target, sort Sort, page, pageSize int, viewer *uuid.UUID) ([]MarkerCommentRead, int64, error) {
	if _, err := validateTarget(target.GameKey, target.MapID, target.MarkerID); err != nil {
		return nil, 0, err
	}
	if sort != SortLatest && sort != SortPopular {
		return nil, 0, apierr.New(apierr.Validation, fmt.Sprintf("%q is not a sort order", sort))
	}

	limit, offset := api.ClampPaging(page, pageSize, DefaultPageSize, MaxPageSize)
	rows, err := s.q.ListMarkerComments(ctx, coredb.ListMarkerCommentsParams{
		ViewerID:     viewer,
		GameKey:      target.GameKey,
		MapID:        target.MapID,
		MarkerID:     target.MarkerID,
		Sort:         string(sort),
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list marker comments: %w", err)
	}
	total, err := s.q.CountMarkerComments(ctx, coredb.CountMarkerCommentsParams{
		GameKey:  target.GameKey,
		MapID:    target.MapID,
		MarkerID: target.MarkerID,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("count marker comments: %w", err)
	}

	out, err := s.many(ctx, commentRows(rows))
	if err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// Replies returns a page of one comment's replies, oldest first.
func (s *Service) Replies(ctx context.Context, parentID uuid.UUID, page, pageSize int, viewer *uuid.UUID) ([]MarkerCommentRead, int64, error) {
	parent, err := s.q.GetMarkerCommentByID(ctx, parentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, apierr.New(apierr.NotFound, "no such comment")
		}
		return nil, 0, fmt.Errorf("load comment: %w", err)
	}
	if withdrawn(parent) {
		return nil, 0, apierr.New(apierr.NotFound, "no such comment")
	}

	limit, offset := api.ClampPaging(page, pageSize, DefaultPageSize, MaxPageSize)
	rows, err := s.q.ListMarkerCommentReplies(ctx, coredb.ListMarkerCommentRepliesParams{
		ViewerID:     viewer,
		ParentID:     &parentID,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list marker comment replies: %w", err)
	}
	total, err := s.q.CountMarkerCommentReplies(ctx, &parentID)
	if err != nil {
		return nil, 0, fmt.Errorf("count marker comment replies: %w", err)
	}
	out, err := s.many(ctx, replyRows(rows))
	if err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// Update replaces a comment's body, and is the author's alone.
func (s *Service) Update(ctx context.Context, principal auth.Principal, id uuid.UUID, body string) (MarkerCommentRead, error) {
	comment, err := s.owned(ctx, principal, id)
	if err != nil {
		return MarkerCommentRead{}, err
	}
	trimmed, err := validateBody(body)
	if err != nil {
		return MarkerCommentRead{}, err
	}
	updated, err := s.q.UpdateMarkerComment(ctx, coredb.UpdateMarkerCommentParams{ID: comment.ID, Body: trimmed})
	if err != nil {
		return MarkerCommentRead{}, fmt.Errorf("update marker comment: %w", err)
	}
	return s.single(ctx, updated, &principal.ID)
}

// Delete withdraws a comment, and with it its replies, from every reader. The
// author's own action.
//
// The row is kept: a hard delete cascaded into the reports against it, so deleting
// a reported comment erased the complaint along with it. Moderators still see the
// report and can answer it.
func (s *Service) Delete(ctx context.Context, principal auth.Principal, id uuid.UUID) error {
	comment, err := s.owned(ctx, principal, id)
	if err != nil {
		return err
	}
	if _, err := s.q.DeleteMarkerComment(ctx, comment.ID); err != nil {
		return fmt.Errorf("delete marker comment: %w", err)
	}
	return nil
}

// SetLike states an end position: liked twice means the same as liked once, so a
// double tap or a retried request is harmless.
func (s *Service) SetLike(ctx context.Context, principal auth.Principal, id uuid.UUID, liked bool) (MarkerCommentRead, error) {
	comment, err := s.visible(ctx, id)
	if err != nil {
		return MarkerCommentRead{}, err
	}

	if liked {
		err = s.q.LikeMarkerComment(ctx, coredb.LikeMarkerCommentParams{CommentID: comment.ID, UserID: principal.ID})
	} else {
		err = s.q.UnlikeMarkerComment(ctx, coredb.UnlikeMarkerCommentParams{CommentID: comment.ID, UserID: principal.ID})
	}
	if err != nil {
		return MarkerCommentRead{}, fmt.Errorf("set marker comment like: %w", err)
	}

	// Notified on the like and never on the unlike: an inbox that reports someone
	// changing their mind is noise. The mention of self is skipped inside notify.
	if liked {
		s.notify(ctx, notify.Event{
			Recipient:       comment.AuthorID,
			Kind:            notify.CommentLike,
			Actor:           &principal.ID,
			MarkerCommentID: &comment.ID,
		})
	}
	return s.single(ctx, comment, &principal.ID)
}

// Report files a complaint about a comment.
//
// Anyone signed in may report, and reporting the same thing twice updates the row
// rather than adding one — see CreateMarkerCommentReport. It returns nothing but
// success: the target may be hidden, and echoing it back would let anyone holding a
// hidden comment's id read what a moderator withheld.
func (s *Service) Report(ctx context.Context, principal auth.Principal, id uuid.UUID, reason string, detail *string) error {
	if !isReportReason(reason) {
		return apierr.New(apierr.Validation, fmt.Sprintf("%q is not a reason", reason))
	}
	// Deliberately no hidden guard, matching the forum: a report filed a moment
	// before a moderator hid the content should still land.
	comment, err := s.q.GetMarkerCommentByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.New(apierr.NotFound, "no such comment")
		}
		return fmt.Errorf("load comment: %w", err)
	}
	// Deleted is gone for everyone; there is nothing left for a report to act on.
	// Hidden is still reportable, as above.
	if comment.DeletedAt.Valid {
		return apierr.New(apierr.NotFound, "no such comment")
	}

	if detail != nil {
		trimmedDetail := strings.TrimSpace(*detail)
		if utf8.RuneCountInString(trimmedDetail) > 2000 {
			return apierr.New(apierr.Validation, "detail may be at most 2000 characters")
		}
		if trimmedDetail == "" {
			detail = nil
		} else {
			detail = &trimmedDetail
		}
	}

	if _, err := s.q.CreateMarkerCommentReport(ctx, coredb.CreateMarkerCommentReportParams{
		ID:              uuid.New(),
		ReporterID:      principal.ID,
		MarkerCommentID: &comment.ID,
		Reason:          reason,
		Detail:          detail,
	}); err != nil {
		return fmt.Errorf("file marker comment report: %w", err)
	}
	return nil
}

// SetHidden hides or restores a comment, for a moderator of its game.
//
// Hiding rather than deleting, as in the forum: a takedown that destroys the
// evidence cannot be reviewed or undone.
func (s *Service) SetHidden(ctx context.Context, principal auth.Principal, id uuid.UUID, hidden bool, reason *string) error {
	comment, err := s.q.GetMarkerCommentByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.New(apierr.NotFound, "no such comment")
		}
		return fmt.Errorf("load comment: %w", err)
	}
	// A moderator cannot resurrect what its author deleted.
	if comment.DeletedAt.Valid {
		return apierr.New(apierr.NotFound, "no such comment")
	}
	if err := s.mayModerate(ctx, principal, comment.GameKey); err != nil {
		return err
	}
	var trimmedReason *string
	if reason != nil {
		if r := strings.TrimSpace(*reason); r != "" {
			trimmedReason = &r
		}
	}
	var actor *uuid.UUID
	if hidden {
		actor = &principal.ID
	}
	if _, err := s.q.SetMarkerCommentHidden(ctx, coredb.SetMarkerCommentHiddenParams{
		Hidden:  hidden,
		ActorID: actor,
		Reason:  trimmedReason,
		ID:      comment.ID,
	}); err != nil {
		return fmt.Errorf("set marker comment hidden: %w", err)
	}
	return nil
}

// HiddenComments lists hidden comments a moderator may restore.
func (s *Service) HiddenComments(ctx context.Context, principal auth.Principal, page, pageSize int) ([]MarkerHiddenRead, int64, error) {
	scope, err := s.moderationScope(ctx, principal)
	if err != nil {
		return nil, 0, err
	}
	limit, offset := api.ClampPaging(page, pageSize, DefaultPageSize, MaxPageSize)
	rows, err := s.q.ListHiddenMarkerComments(ctx, coredb.ListHiddenMarkerCommentsParams{
		Games:        scope,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list hidden marker comments: %w", err)
	}
	total, err := s.q.CountHiddenMarkerComments(ctx, scope)
	if err != nil {
		return nil, 0, fmt.Errorf("count hidden marker comments: %w", err)
	}
	out := make([]MarkerHiddenRead, 0, len(rows))
	for _, row := range rows {
		out = append(out, MarkerHiddenRead{
			ID:       row.ID,
			GameKey:  row.GameKey,
			MapID:    row.MapID,
			MarkerID: row.MarkerID,
			Body:     row.Body,
			Reason:   row.HiddenReason,
			HiddenAt: row.HiddenAt.Time,
		})
	}
	return out, total, nil
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

// validateTarget checks the three location keys, in the order that fails cheapest.
func validateTarget(gameKey, mapID, markerID string) (Target, error) {
	if !games.Valid(gameKey) {
		return Target{}, apierr.New(apierr.Validation, fmt.Sprintf("%q is not a game", gameKey))
	}
	if !mapShape.MatchString(mapID) {
		return Target{}, apierr.New(apierr.Validation, "map is not a map identifier")
	}
	if !markerShape.MatchString(markerID) {
		return Target{}, apierr.New(apierr.Validation, "marker is not a marker identifier")
	}
	return Target{GameKey: gameKey, MapID: mapID, MarkerID: markerID}, nil
}

// validateBody trims a body and checks it against the rune limit.
func validateBody(body string) (string, error) {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return "", apierr.New(apierr.Validation, "a comment needs a body")
	}
	if utf8.RuneCountInString(trimmed) > MaxBody {
		return "", apierr.New(apierr.Validation,
			fmt.Sprintf("a comment may be at most %d characters", MaxBody))
	}
	return trimmed, nil
}

// isReportReason matches the forum's vocabulary, because the reports land in the
// same queue and its check constraint is the same list. Keeping the list here rather
// than sharing the forum's constant is deliberate: the two are separated by a
// package boundary the schema enforces, and a reason the queue rejects comes back as
// a constraint violation rather than a 422.
func isReportReason(reason string) bool {
	switch reason {
	case "spam", "abuse", "offtopic", "illegal", "other":
		return true
	}
	return false
}

// requireMarker is the third validation layer: does the marker exist?
//
// It fails open, deliberately. An index error means the artifact host could not be
// read or this deployment has none configured, and neither is the writer's fault;
// the comment is then accepted on shape alone. A marker that genuinely is not in the
// artifact is a 422, because the client's marker list and the artifact can only
// disagree for a moment.
func (s *Service) requireMarker(ctx context.Context, t Target) error {
	if s.markers == nil {
		return nil
	}
	found, err := s.markers.Exists(ctx, t)
	if err != nil {
		if !errors.Is(err, ErrNoArtifact) && s.logger != nil {
			s.logger.Warn("marker existence not checked; accepting on format",
				"game", t.GameKey, "map", t.MapID, "marker", t.MarkerID, "error", err)
		}
		return nil
	}
	if !found {
		return apierr.New(apierr.Validation, "no such marker on this map")
	}
	return nil
}

// visible loads a comment every reader may see.
func (s *Service) visible(ctx context.Context, id uuid.UUID) (coredb.CoreMarkerComment, error) {
	comment, err := s.q.GetMarkerCommentByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return coredb.CoreMarkerComment{}, apierr.New(apierr.NotFound, "no such comment")
		}
		return coredb.CoreMarkerComment{}, fmt.Errorf("load comment: %w", err)
	}
	if withdrawn(comment) {
		return coredb.CoreMarkerComment{}, apierr.New(apierr.NotFound, "no such comment")
	}
	return comment, nil
}

// withdrawn reports whether readers may no longer see a comment: a moderator hid it,
// or its author deleted it.
func withdrawn(c coredb.CoreMarkerComment) bool {
	return c.HiddenAt.Valid || c.DeletedAt.Valid
}

// notify raises a notification without letting its failure fail the request.
//
// The comment or like it is about has already been written, outside any shared
// transaction. Returning the error would tell the client the write failed, and a
// retry would then write it twice — a duplicate comment is worse than a missed
// inbox row.
func (s *Service) notify(ctx context.Context, e notify.Event) {
	if err := s.notifier.Notify(ctx, e); err != nil && s.logger != nil {
		s.logger.WarnContext(ctx, "marker comment notification not written",
			"kind", string(e.Kind), "error", err)
	}
}

// owned loads a comment the caller wrote.
//
// Hidden before ownership, so an author editing a hidden comment gets the same 404
// every other reader does rather than learning it exists but is withheld.
func (s *Service) owned(ctx context.Context, principal auth.Principal, id uuid.UUID) (coredb.CoreMarkerComment, error) {
	comment, err := s.visible(ctx, id)
	if err != nil {
		return coredb.CoreMarkerComment{}, err
	}
	if comment.AuthorID != principal.ID {
		return coredb.CoreMarkerComment{}, apierr.New(apierr.Forbidden, "that comment is not yours")
	}
	return comment, nil
}

// moderationScope is the games this principal may moderate.
func (s *Service) moderationScope(ctx context.Context, principal auth.Principal) ([]string, error) {
	if principal.IsSuperuser {
		return nil, nil
	}
	scope := make([]string, 0, len(games.Keys))
	for _, key := range games.Keys {
		ok, err := s.authz.CanAny(ctx, principal, roles.HideContent, []string{key})
		if err != nil {
			return nil, err
		}
		if ok {
			scope = append(scope, key)
		}
	}
	if len(scope) == 0 {
		return nil, apierr.New(apierr.Forbidden, "you do not moderate any game")
	}
	return scope, nil
}

// mayModerate authorizes acting on a comment in this game.
func (s *Service) mayModerate(ctx context.Context, principal auth.Principal, gameKey string) error {
	if principal.IsSuperuser {
		return nil
	}
	allowed, err := s.authz.CanAny(ctx, principal, roles.HideContent, []string{gameKey})
	if err != nil {
		return err
	}
	if !allowed {
		return apierr.New(apierr.Forbidden, "you do not moderate this game")
	}
	return nil
}

// single renders one comment, with its counters, for a viewer.
func (s *Service) single(ctx context.Context, comment coredb.CoreMarkerComment, viewer *uuid.UUID) (MarkerCommentRead, error) {
	author, err := s.author(ctx, comment.AuthorID)
	if err != nil {
		return MarkerCommentRead{}, err
	}
	reactions, err := s.q.MarkerCommentReactions(ctx, coredb.MarkerCommentReactionsParams{
		CommentID: comment.ID,
		ViewerID:  viewer,
	})
	if err != nil {
		return MarkerCommentRead{}, fmt.Errorf("load comment reactions: %w", err)
	}
	return toRead(comment, author, reactions.LikeCount, reactions.Liked, 0), nil
}

// markerCommentRow is the shape a page of comments and a page of replies share:
// the comment itself plus the three counters the drawer renders. sqlc generates a
// distinct struct per query even where the columns are identical, so the two are
// flattened into this one before rendering.
type markerCommentRow struct {
	comment    coredb.CoreMarkerComment
	LikeCount  int64
	Liked      bool
	ReplyCount int64
}

// commentRows flattens a page of top-level comments.
func commentRows(rows []coredb.ListMarkerCommentsRow) []markerCommentRow {
	out := make([]markerCommentRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, markerCommentRow{
			comment: coredb.CoreMarkerComment{
				ID:           row.ID,
				GameKey:      row.GameKey,
				MapID:        row.MapID,
				MarkerID:     row.MarkerID,
				AuthorID:     row.AuthorID,
				ParentID:     row.ParentID,
				Body:         row.Body,
				Depth:        row.Depth,
				ParentDepth:  row.ParentDepth,
				CreatedAt:    row.CreatedAt,
				UpdatedAt:    row.UpdatedAt,
				EditedAt:     row.EditedAt,
				HiddenAt:     row.HiddenAt,
				HiddenBy:     row.HiddenBy,
				HiddenReason: row.HiddenReason,
				DeletedAt:    row.DeletedAt,
			},
			LikeCount:  row.LikeCount,
			Liked:      row.Liked,
			ReplyCount: row.ReplyCount,
		})
	}
	return out
}

// replyRows flattens a page of replies, whose generated row type is identical in
// every field the renderer reads but is not the same Go type.
func replyRows(rows []coredb.ListMarkerCommentRepliesRow) []markerCommentRow {
	out := make([]markerCommentRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, markerCommentRow{
			comment: coredb.CoreMarkerComment{
				ID:           row.ID,
				GameKey:      row.GameKey,
				MapID:        row.MapID,
				MarkerID:     row.MarkerID,
				AuthorID:     row.AuthorID,
				ParentID:     row.ParentID,
				Body:         row.Body,
				Depth:        row.Depth,
				ParentDepth:  row.ParentDepth,
				CreatedAt:    row.CreatedAt,
				UpdatedAt:    row.UpdatedAt,
				EditedAt:     row.EditedAt,
				HiddenAt:     row.HiddenAt,
				HiddenBy:     row.HiddenBy,
				HiddenReason: row.HiddenReason,
				DeletedAt:    row.DeletedAt,
			},
			LikeCount:  row.LikeCount,
			Liked:      row.Liked,
			ReplyCount: row.ReplyCount,
		})
	}
	return out
}

// many renders a page, resolving every author in one query rather than one per row.
//
// It takes the shared shape rather than either generated type, so a page of comments
// and a page of replies render through one path.
func (s *Service) many(ctx context.Context, rows []markerCommentRow) ([]MarkerCommentRead, error) {
	if len(rows) == 0 {
		return []MarkerCommentRead{}, nil
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.comment.AuthorID)
	}
	authors, err := s.authors.PublicByIDs(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("load authors: %w", err)
	}
	out := make([]MarkerCommentRead, 0, len(rows))
	for _, row := range rows {
		out = append(out, toRead(row.comment, authors[row.comment.AuthorID], row.LikeCount, row.Liked, row.ReplyCount))
	}
	return out, nil
}

// author resolves one account's public view.
func (s *Service) author(ctx context.Context, id uuid.UUID) (users.UserPublic, error) {
	found, err := s.authors.PublicByIDs(ctx, []uuid.UUID{id})
	if err != nil {
		return users.UserPublic{}, fmt.Errorf("load author: %w", err)
	}
	return found[id], nil
}

func toRead(c coredb.CoreMarkerComment, author users.UserPublic, likes int64, liked bool, replies int64) MarkerCommentRead {
	return MarkerCommentRead{
		ID:         c.ID,
		ParentID:   c.ParentID,
		GameKey:    c.GameKey,
		MapID:      c.MapID,
		MarkerID:   c.MarkerID,
		Author:     author,
		Body:       c.Body,
		Likes:      likes,
		Liked:      liked,
		ReplyCount: replies,
		CreatedAt:  c.CreatedAt,
		EditedAt:   timeOrNil(c.EditedAt),
	}
}

func timeOrNil(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}
