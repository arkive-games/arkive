package forum

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/games"
	"github.com/arkive-games/arkive/backend-go/internal/core/roles"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Why a report was filed. Fixed rather than free text, so a queue can be sorted and
// counted; `detail` carries the free text.
const (
	ReasonSpam     = "spam"
	ReasonAbuse    = "abuse"
	ReasonOfftopic = "offtopic"
	ReasonIllegal  = "illegal"
	ReasonOther    = "other"
)

// What a moderator decided. A report is open until someone answers it.
const (
	ReportOpen     = "open"
	ReportUpheld   = "upheld"
	ReportRejected = "rejected"
)

var (
	reportReasons = []string{ReasonSpam, ReasonAbuse, ReasonOfftopic, ReasonIllegal, ReasonOther}
	reportStates  = []string{ReportUpheld, ReportRejected}
)

// MaxReportDetail bounds the free-text half of a report.
const MaxReportDetail = 2000

// ReportRead is a report as the moderation queue returns it.
//
// The reporter is deliberately absent. A moderator judges the content, and knowing who
// complained invites deciding by who rather than by what; the reporter is in the table
// for abuse investigation, not for the queue.
type ReportRead struct {
	ID        uuid.UUID  `json:"id" doc:"Report identifier"`
	PostNo    *int64     `json:"postNo" doc:"The reported post, or the post a reported comment belongs to"`
	// nullable:"true" because huma drops the pointer for uuid fields; see the note
	// on CommentRead.ParentID.
	CommentID *uuid.UUID `json:"commentId" nullable:"true" doc:"The reported comment, or null when a post was reported"`
	Reason    string     `json:"reason" enum:"spam,abuse,offtopic,illegal,other" doc:"Why it was reported"`
	Detail    *string    `json:"detail" doc:"What the reporter added, or null"`
	State     string     `json:"state" enum:"open,upheld,rejected" doc:"open until a moderator answers it"`
	CreatedAt time.Time  `json:"createdAt" doc:"When it was filed"`
}

// HiddenRead is a hidden post as the moderation queue returns it.
type HiddenRead struct {
	PostNo   int64     `json:"postNo" doc:"Permanent post number"`
	Title    string    `json:"title" doc:"Post title"`
	GameIDs  []string  `json:"gameIds" doc:"Games the post is about"`
	Reason   *string   `json:"reason" doc:"Why it was hidden, or null"`
	HiddenAt time.Time `json:"hiddenAt" doc:"When it was hidden"`
}

// Report files a complaint about a post or a comment.
//
// Anyone signed in may report. Re-reporting the same target updates the existing row
// rather than adding a second, and reopens it if it had been answered — a fresh
// complaint about content a moderator let stand is new information, not a duplicate.
func (s *Service) Report(ctx context.Context, principal auth.Principal, postNo *int64, commentID *uuid.UUID, reason string, detail *string) (ReportRead, error) {
	if !slices.Contains(reportReasons, reason) {
		return ReportRead{}, apierr.New(apierr.Validation, fmt.Sprintf("%q is not a reason", reason))
	}
	if (postNo == nil) == (commentID == nil) {
		return ReportRead{}, apierr.New(apierr.Validation, "report exactly one of a post or a comment")
	}
	if detail != nil {
		trimmedDetail := trimmed(*detail)
		// Runes, not bytes, matching validateTitle, validateBody and normaliseList — and
		// the wire schema's maxLength, which counts characters too. With len() a Chinese
		// detail was refused at about 666 characters by a message that said 2000, on the
		// one free-text field of the reporting flow.
		if utf8.RuneCountInString(trimmedDetail) > MaxReportDetail {
			return ReportRead{}, apierr.New(apierr.Validation,
				fmt.Sprintf("detail may be at most %d characters", MaxReportDetail))
		}
		if trimmedDetail == "" {
			detail = nil
		} else {
			detail = &trimmedDetail
		}
	}

	params := coredb.CreateForumReportParams{
		ID:         uuid.New(),
		ReporterID: principal.ID,
		Reason:     reason,
		Detail:     detail,
	}

	// Reporting something that does not exist is a 404, not a stored row pointing
	// nowhere — the foreign keys would refuse it anyway, as a 500.
	//
	// Deliberately no hidden-content guard here, unlike every other post load. A report
	// filed a moment before a moderator hid the content should still land, and refusing
	// one for content already hidden would tell the reporter it had been actioned — which
	// is the disclosure the 404 elsewhere exists to prevent.
	var reportedPost *coredb.CoreForumPost
	if postNo != nil {
		post, err := s.q.GetForumPostByNo(ctx, *postNo)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ReportRead{}, apierr.New(apierr.NotFound, "no such post")
			}
			return ReportRead{}, fmt.Errorf("load post: %w", err)
		}
		params.PostID = &post.ID
		reportedPost = &post
	} else {
		comment, err := s.q.GetForumCommentByID(ctx, *commentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ReportRead{}, apierr.New(apierr.NotFound, "no such comment")
			}
			return ReportRead{}, fmt.Errorf("load comment: %w", err)
		}
		params.CommentID = &comment.ID
	}

	row, err := s.q.CreateForumReport(ctx, params)
	if err != nil {
		return ReportRead{}, mapConstraintError(err)
	}

	s.logger.InfoContext(ctx, "content reported",
		slog.String("reason", reason), slog.String("reporter", principal.ID.String()))

	return s.toReportRead(ctx, row, reportedPost)
}

// SetPostHidden hides or restores a post.
//
// Hiding is not deleting: the row stays, attributed and reversible. Authorized against
// the post's own game tags, so a game's moderator acts on that game's content and a
// post tagged with no game reaches site administrators only.
func (s *Service) SetPostHidden(ctx context.Context, principal auth.Principal, postNo int64, hidden bool, reason *string) error {
	post, err := s.q.GetForumPostByNo(ctx, postNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.New(apierr.NotFound, "no such post")
		}
		return fmt.Errorf("load post: %w", err)
	}

	if err := s.mayModerate(ctx, principal, post.GameIDs); err != nil {
		return err
	}

	if _, err := s.q.SetForumPostHidden(ctx, coredb.SetForumPostHiddenParams{
		ID:      post.ID,
		Hidden:  hidden,
		ActorID: &principal.ID,
		Reason:  reason,
	}); err != nil {
		return fmt.Errorf("set post hidden: %w", err)
	}

	s.logger.InfoContext(ctx, "post visibility changed by a moderator",
		slog.Int64("postNo", postNo), slog.Bool("hidden", hidden),
		slog.String("actor", principal.ID.String()))
	return nil
}

// SetCommentHidden hides or restores a comment. Scoped by the games of the post the
// comment belongs to, since a comment carries no tags of its own.
func (s *Service) SetCommentHidden(ctx context.Context, principal auth.Principal, id uuid.UUID, hidden bool, reason *string) error {
	comment, err := s.q.GetForumCommentByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.New(apierr.NotFound, "no such comment")
		}
		return fmt.Errorf("load comment: %w", err)
	}
	post, err := s.q.GetForumPostByID(ctx, comment.PostID)
	if err != nil {
		return fmt.Errorf("load the comment's post: %w", err)
	}

	if err := s.mayModerate(ctx, principal, post.GameIDs); err != nil {
		return err
	}

	if _, err := s.q.SetForumCommentHidden(ctx, coredb.SetForumCommentHiddenParams{
		ID:      comment.ID,
		Hidden:  hidden,
		ActorID: &principal.ID,
		Reason:  reason,
	}); err != nil {
		return fmt.Errorf("set comment hidden: %w", err)
	}

	s.logger.InfoContext(ctx, "comment visibility changed by a moderator",
		slog.String("comment", id.String()), slog.Bool("hidden", hidden),
		slog.String("actor", principal.ID.String()))
	return nil
}

// ResolveReport answers a report. Upholding it does not hide anything by itself: the
// two are separate decisions, and a moderator who hides content should have to say so.
func (s *Service) ResolveReport(ctx context.Context, principal auth.Principal, id uuid.UUID, state string) (ReportRead, error) {
	if !slices.Contains(reportStates, state) {
		return ReportRead{}, apierr.New(apierr.Validation,
			fmt.Sprintf("%q is not a resolution; use upheld or rejected", state))
	}

	existing, err := s.q.GetForumReport(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ReportRead{}, apierr.New(apierr.NotFound, "no such report")
		}
		return ReportRead{}, fmt.Errorf("load report: %w", err)
	}
	if err := s.mayModerateReport(ctx, principal, existing); err != nil {
		return ReportRead{}, err
	}

	row, err := s.q.ResolveForumReport(ctx, coredb.ResolveForumReportParams{
		ID:        id,
		State:     state,
		HandledBy: &principal.ID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// The WHERE clause requires state = 'open', so no row means it was already
			// answered. A second answer is a conflict, not a not-found.
			return ReportRead{}, apierr.New(apierr.Validation, "that report has already been answered")
		}
		return ReportRead{}, fmt.Errorf("resolve report: %w", err)
	}
	return s.toReportRead(ctx, row, nil)
}

// OpenReports is the moderation queue, scoped to what the caller may act on.
func (s *Service) OpenReports(ctx context.Context, principal auth.Principal, page, pageSize int) ([]ReportRead, int64, error) {
	scope, err := s.moderationScope(ctx, principal)
	if err != nil {
		return nil, 0, err
	}
	limit, offset := moderationPaging(page, pageSize)

	total, err := s.q.CountOpenForumReports(ctx, scope)
	if err != nil {
		return nil, 0, fmt.Errorf("count reports: %w", err)
	}
	rows, err := s.q.ListOpenForumReports(ctx, coredb.ListOpenForumReportsParams{
		Games:        scope,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list reports: %w", err)
	}

	out := make([]ReportRead, 0, len(rows))
	for _, row := range rows {
		read, err := s.toReportRead(ctx, row, nil)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, read)
	}
	return out, total, nil
}

// HiddenPosts lists what a moderator can see and a reader cannot.
func (s *Service) HiddenPosts(ctx context.Context, principal auth.Principal, page, pageSize int) ([]HiddenRead, int64, error) {
	scope, err := s.moderationScope(ctx, principal)
	if err != nil {
		return nil, 0, err
	}
	limit, offset := moderationPaging(page, pageSize)

	total, err := s.q.CountHiddenForumPosts(ctx, scope)
	if err != nil {
		return nil, 0, fmt.Errorf("count hidden posts: %w", err)
	}
	rows, err := s.q.ListHiddenForumPosts(ctx, coredb.ListHiddenForumPostsParams{
		Games:        scope,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list hidden posts: %w", err)
	}

	out := make([]HiddenRead, 0, len(rows))
	for _, row := range rows {
		out = append(out, HiddenRead{
			PostNo:   row.PostNo,
			Title:    row.Title,
			GameIDs:  emptyIfNil(row.GameIDs),
			Reason:   row.HiddenReason,
			HiddenAt: row.HiddenAt.Time,
		})
	}
	return out, total, nil
}

// HiddenCommentRead is a hidden comment as the moderation queue returns it.
type HiddenCommentRead struct {
	ID       uuid.UUID `json:"id" doc:"Comment identifier, used to restore it"`
	PostNo   int64     `json:"postNo" doc:"The post it belongs to"`
	Body     string    `json:"body" doc:"What it said"`
	Reason   *string   `json:"reason" doc:"Why it was hidden, or null"`
	HiddenAt time.Time `json:"hiddenAt" doc:"When it was hidden"`
}

// HiddenComments lists hidden comments a moderator may act on.
//
// Without this, restoring a hidden comment requires already knowing its id — which nothing
// hands out once it is hidden — so hiding one would be reversible only in principle.
func (s *Service) HiddenComments(ctx context.Context, principal auth.Principal, page, pageSize int) ([]HiddenCommentRead, int64, error) {
	scope, err := s.moderationScope(ctx, principal)
	if err != nil {
		return nil, 0, err
	}
	limit, offset := moderationPaging(page, pageSize)

	total, err := s.q.CountHiddenForumComments(ctx, scope)
	if err != nil {
		return nil, 0, fmt.Errorf("count hidden comments: %w", err)
	}
	rows, err := s.q.ListHiddenForumComments(ctx, coredb.ListHiddenForumCommentsParams{
		Games:        scope,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list hidden comments: %w", err)
	}

	out := make([]HiddenCommentRead, 0, len(rows))
	for _, row := range rows {
		out = append(out, HiddenCommentRead{
			ID:       row.ID,
			PostNo:   row.PostNo,
			Body:     row.Body,
			Reason:   row.HiddenReason,
			HiddenAt: row.HiddenAt.Time,
		})
	}
	return out, total, nil
}

// moderationScope returns the games the caller may moderate, or nil meaning "all".
//
// nil is how a site administrator is expressed, because the queries read a NULL array
// as "no scope filter". A moderator with no grants gets Forbidden rather than an empty
// queue, so the answer distinguishes "nothing to do" from "not your queue".
func (s *Service) moderationScope(ctx context.Context, principal auth.Principal) ([]string, error) {
	if principal.IsSuperuser && principal.IsActive {
		return nil, nil
	}
	scope := make([]string, 0)
	for _, game := range games.Keys {
		ok, err := s.authz.Can(ctx, principal, roles.HandleReport, game)
		if err != nil {
			return nil, err
		}
		if ok {
			scope = append(scope, game)
		}
	}
	if len(scope) == 0 {
		return nil, apierr.New(apierr.Forbidden, "you do not moderate any game")
	}
	return scope, nil
}

// mayModerate authorizes acting on content belonging to these games.
func (s *Service) mayModerate(ctx context.Context, principal auth.Principal, gameKeys []string) error {
	allowed, err := s.authz.CanAny(ctx, principal, roles.HideContent, gameKeys)
	if err != nil {
		return err
	}
	if !allowed {
		return apierr.New(apierr.Forbidden, "you do not moderate a game this content belongs to")
	}
	return nil
}

// mayModerateReport resolves the report's target to the games it belongs to, so the
// same rule applies to answering a report as to acting on the content.
func (s *Service) mayModerateReport(ctx context.Context, principal auth.Principal, report coredb.CoreForumReport) error {
	var gameKeys []string
	switch {
	case report.PostID != nil:
		post, err := s.q.GetForumPostByID(ctx, *report.PostID)
		if err != nil {
			return fmt.Errorf("load the reported post: %w", err)
		}
		gameKeys = post.GameIDs
	case report.CommentID != nil:
		comment, err := s.q.GetForumCommentByID(ctx, *report.CommentID)
		if err != nil {
			return fmt.Errorf("load the reported comment: %w", err)
		}
		post, err := s.q.GetForumPostByID(ctx, comment.PostID)
		if err != nil {
			return fmt.Errorf("load the reported comment's post: %w", err)
		}
		gameKeys = post.GameIDs
	}

	allowed, err := s.authz.CanAny(ctx, principal, roles.HandleReport, gameKeys)
	if err != nil {
		return err
	}
	if !allowed {
		return apierr.New(apierr.Forbidden, "you do not moderate a game this report is about")
	}
	return nil
}

// toReportRead fills in the post number a client needs to navigate to the target.
// post is an optimisation for the caller that already loaded it.
func (s *Service) toReportRead(ctx context.Context, row coredb.CoreForumReport, post *coredb.CoreForumPost) (ReportRead, error) {
	read := ReportRead{
		ID:        row.ID,
		CommentID: row.CommentID,
		Reason:    row.Reason,
		Detail:    row.Detail,
		State:     row.State,
		CreatedAt: row.CreatedAt,
	}

	switch {
	case post != nil:
		read.PostNo = &post.PostNo
	case row.PostID != nil:
		found, err := s.q.GetForumPostByID(ctx, *row.PostID)
		if err != nil {
			return ReportRead{}, fmt.Errorf("load the reported post: %w", err)
		}
		read.PostNo = &found.PostNo
	case row.CommentID != nil:
		comment, err := s.q.GetForumCommentByID(ctx, *row.CommentID)
		if err != nil {
			return ReportRead{}, fmt.Errorf("load the reported comment: %w", err)
		}
		found, err := s.q.GetForumPostByID(ctx, comment.PostID)
		if err != nil {
			return ReportRead{}, fmt.Errorf("load the reported comment's post: %w", err)
		}
		read.PostNo = &found.PostNo
	}
	return read, nil
}

// notFoundIfHidden is the guard every non-moderation path applies after loading a post.
//
// Hidden content answers 404 for everyone, including its author. That is deliberate: a
// distinct "hidden" status would tell a spammer exactly which of their posts were
// caught, and letting the author still read it would mean maintaining two visibility
// rules. The moderation queue is the one way to see past this, and unhiding is how
// content comes back.
func notFoundIfHidden(hiddenAt pgtype.Timestamptz) error {
	if hiddenAt.Valid {
		return apierr.New(apierr.NotFound, "no such post")
	}
	return nil
}

// notFoundIfCommentHidden is the same guard for a comment.
//
// Separate only for the message. Hiding a comment shipped applying this to the thread
// listing and the comment count and nowhere else, so a hidden comment could still be
// liked, edited, deleted and replied to — the post side had all four covered and the
// comment side had none, which is the asymmetry that let it through.
//
// Exempt, deliberately: Report (see its comment), SetCommentHidden and the moderation
// queue, which are how hidden content is found and brought back.
func notFoundIfCommentHidden(hiddenAt pgtype.Timestamptz) error {
	if hiddenAt.Valid {
		return apierr.New(apierr.NotFound, "no such comment")
	}
	return nil
}

func moderationPaging(page, pageSize int) (limit int32, offset int32) {
	return api.ClampPaging(page, pageSize, DefaultPageSize, MaxPageSize)
}

// postVisibleForComment refuses an action on a comment whose post is hidden.
//
// Comment routes are addressed by comment id and never load the post, so without this a
// hidden post keeps accepting likes and edits on its comments — reachable by anyone
// holding ids from before the hide, and notifying the comment's author each time.
// `CreateComment` already guards the post directly; this is the same rule for the two
// paths that reach a comment without going through its thread.
func (s *Service) postVisibleForComment(ctx context.Context, postID uuid.UUID) error {
	post, err := s.q.GetForumPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.New(apierr.NotFound, "no such comment")
		}
		return fmt.Errorf("load the comment's post: %w", err)
	}
	if post.HiddenAt.Valid {
		// Reported as a missing comment, not a missing post: the caller asked about a
		// comment and must not learn that the post exists but is withheld.
		return apierr.New(apierr.NotFound, "no such comment")
	}
	return nil
}
