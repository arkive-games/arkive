package forum

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Service implements the forum use cases.
type Service struct {
	q       *coredb.Queries
	authors AuthorSource
	logger  *slog.Logger
}

// AuthorSource resolves the public view of an account.
//
// An interface rather than *users.Service so the forum depends on the one thing
// it needs — turning an author id into a name and an avatar — instead of on every
// account use case, and so tests can supply authors without a user service.
type AuthorSource interface {
	PublicByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]users.UserPublic, error)
}

// NewService wires the forum service.
func NewService(q *coredb.Queries, authors AuthorSource, logger *slog.Logger) *Service {
	return &Service{q: q, authors: authors, logger: logger}
}

// canPostToChannel decides who may post where.
//
// Today the rule is hardcoded: the official channel is administrators only,
// everything else is open to any signed-in account. It lives in one named
// function on purpose — it is a placeholder for a permission system that does not
// exist yet, and keeping it here makes replacing it a change to one function
// rather than a hunt through handlers.
func canPostToChannel(principal auth.Principal, channel Channel) bool {
	if channel == ChannelOfficial {
		return principal.IsSuperuser
	}
	return true
}

// CreatePost publishes a post.
func (s *Service) CreatePost(ctx context.Context, principal auth.Principal, in CreatePostInput) (PostRead, error) {
	if err := validateChannel(in.Channel); err != nil {
		return PostRead{}, err
	}
	if !canPostToChannel(principal, in.Channel) {
		return PostRead{}, apierr.New(apierr.Forbidden,
			"only administrators may post in the official channel")
	}
	if err := validateTitle(in.Title); err != nil {
		return PostRead{}, err
	}
	if err := validateBody(in.Body, "post"); err != nil {
		return PostRead{}, err
	}
	if err := validateTopic(in.Topic); err != nil {
		return PostRead{}, err
	}

	gameIDs, err := normaliseList(in.GameIDs, MaxGameIDs, MaxTagLength, "game")
	if err != nil {
		return PostRead{}, err
	}
	tags, err := normaliseList(in.Tags, MaxTags, MaxTagLength, "tag")
	if err != nil {
		return PostRead{}, err
	}

	post, err := s.q.CreateForumPost(ctx, coredb.CreateForumPostParams{
		ID:       uuid.New(),
		AuthorID: principal.ID,
		Channel:  string(in.Channel),
		Title:    trimmed(in.Title),
		Body:     trimmed(in.Body),
		Topic:    normaliseTopic(in.Topic),
		GameIDs:  gameIDs,
		Tags:     tags,
	})
	if err != nil {
		return PostRead{}, mapConstraintError(err)
	}

	author, err := s.author(ctx, post.AuthorID)
	if err != nil {
		return PostRead{}, err
	}
	return toPostRead(post, author, 0), nil
}

// PostByNo loads one post by its public number.
func (s *Service) PostByNo(ctx context.Context, postNo int64) (PostRead, error) {
	post, err := s.q.GetForumPostByNo(ctx, postNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PostRead{}, apierr.New(apierr.NotFound, "no such post")
		}
		return PostRead{}, fmt.Errorf("load post: %w", err)
	}

	comments, err := s.q.CountForumPostComments(ctx, post.ID)
	if err != nil {
		return PostRead{}, fmt.Errorf("count comments: %w", err)
	}
	author, err := s.author(ctx, post.AuthorID)
	if err != nil {
		return PostRead{}, err
	}
	return toPostRead(post, author, comments), nil
}

// ListPosts returns a page of the feed and the total matching count.
//
// Offset paging, matching the composer's numbered pager. On an append-heavy feed
// that duplicates rows as new posts arrive, which the client de-duplicates, and
// skips rows when posts are deleted, which it cannot; both are recorded in the
// design as accepted for this slice.
func (s *Service) ListPosts(ctx context.Context, filter ListFilter) ([]PostRead, int64, error) {
	filter.normalise()

	if filter.Channel != nil {
		if err := validateChannel(Channel(*filter.Channel)); err != nil {
			return nil, 0, err
		}
	}

	total, err := s.q.CountForumPosts(ctx, coredb.CountForumPostsParams{
		Channel:  filter.Channel,
		GameID:   filter.GameID,
		Tag:      filter.Tag,
		AuthorID: filter.AuthorID,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("count posts: %w", err)
	}

	rows, err := s.q.ListForumPosts(ctx, coredb.ListForumPostsParams{
		Channel:      filter.Channel,
		GameID:       filter.GameID,
		Tag:          filter.Tag,
		AuthorID:     filter.AuthorID,
		ResultLimit:  int32(filter.PageSize),
		ResultOffset: filter.Offset(),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list posts: %w", err)
	}

	// One lookup for every author on the page rather than one per post, so a feed
	// of twenty posts costs two queries instead of twenty-one.
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.AuthorID)
	}
	authors, err := s.authors.PublicByIDs(ctx, ids)
	if err != nil {
		return nil, 0, fmt.Errorf("load authors: %w", err)
	}

	out := make([]PostRead, 0, len(rows))
	for _, r := range rows {
		// An author can be deleted between the rows being read and this lookup.
		// Their posts go with them by cascade, so the row is already on its way
		// out; rendering it would publish a UserPublic with uid 0, no name and a
		// year-one timestamp, which is a shape no client should have to handle.
		author, ok := authors[r.AuthorID]
		if !ok {
			continue
		}
		post := coredb.CoreForumPost{
			ID: r.ID, PostNo: r.PostNo, AuthorID: r.AuthorID, Channel: r.Channel,
			Title: r.Title, Body: r.Body, Topic: r.Topic, GameIDs: r.GameIDs, Tags: r.Tags,
			NextCommentNo: r.NextCommentNo, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
			EditedAt: r.EditedAt,
		}
		out = append(out, toPostRead(post, author, r.CommentCount))
	}
	return out, total, nil
}

// UpdatePost applies a partial edit to a post the caller owns.
func (s *Service) UpdatePost(ctx context.Context, principal auth.Principal, postNo int64, in UpdatePostInput) (PostRead, error) {
	post, err := s.ownedPost(ctx, principal, postNo)
	if err != nil {
		return PostRead{}, err
	}

	// An edit that supplies nothing is a no-op, and stamping edited_at for it
	// would tell every reader the post had been rewritten when it had not.
	if in.Title == nil && in.Body == nil && !in.Topic.Set && in.GameIDs == nil && in.Tags == nil {
		comments, err := s.q.CountForumPostComments(ctx, post.ID)
		if err != nil {
			return PostRead{}, fmt.Errorf("count comments: %w", err)
		}
		author, err := s.author(ctx, post.AuthorID)
		if err != nil {
			return PostRead{}, err
		}
		return toPostRead(post, author, comments), nil
	}

	params := coredb.UpdateForumPostParams{ID: post.ID}

	if in.Title != nil {
		if err := validateTitle(*in.Title); err != nil {
			return PostRead{}, err
		}
		t := trimmed(*in.Title)
		params.Title = &t
	}
	if in.Body != nil {
		if err := validateBody(*in.Body, "post"); err != nil {
			return PostRead{}, err
		}
		b := trimmed(*in.Body)
		params.Body = &b
	}
	if in.Topic.Set {
		if err := validateTopic(in.Topic.Value); err != nil {
			return PostRead{}, err
		}
		params.SetTopic = true
		params.Topic = normaliseTopic(in.Topic.Value)
	}
	if in.GameIDs != nil {
		games, err := normaliseList(*in.GameIDs, MaxGameIDs, MaxTagLength, "game")
		if err != nil {
			return PostRead{}, err
		}
		params.GameIDs = games
	}
	if in.Tags != nil {
		tags, err := normaliseList(*in.Tags, MaxTags, MaxTagLength, "tag")
		if err != nil {
			return PostRead{}, err
		}
		params.Tags = tags
	}

	updated, err := s.q.UpdateForumPost(ctx, params)
	if err != nil {
		return PostRead{}, mapConstraintError(err)
	}

	comments, err := s.q.CountForumPostComments(ctx, updated.ID)
	if err != nil {
		return PostRead{}, fmt.Errorf("count comments: %w", err)
	}
	author, err := s.author(ctx, updated.AuthorID)
	if err != nil {
		return PostRead{}, err
	}
	return toPostRead(updated, author, comments), nil
}

// DeletePost removes a post and, by cascade, its comments and their replies.
func (s *Service) DeletePost(ctx context.Context, principal auth.Principal, postNo int64) error {
	post, err := s.ownedPost(ctx, principal, postNo)
	if err != nil {
		return err
	}
	rows, err := s.q.DeleteForumPost(ctx, post.ID)
	if err != nil {
		return fmt.Errorf("delete post: %w", err)
	}
	if rows == 0 {
		return apierr.New(apierr.NotFound, "no such post")
	}
	return nil
}

// CreateComment adds a comment to a thread, or a reply when parentID is set.
//
// A top-level comment takes the next floor number for the thread; a reply takes
// none, because only top-level comments are numbered. Which statement runs is the
// only difference, and the schema refuses the wrong combination either way.
func (s *Service) CreateComment(ctx context.Context, principal auth.Principal, postNo int64, body string, parentID *uuid.UUID) (CommentRead, error) {
	if err := validateBody(body, "comment"); err != nil {
		return CommentRead{}, err
	}

	post, err := s.q.GetForumPostByNo(ctx, postNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CommentRead{}, apierr.New(apierr.NotFound, "no such post")
		}
		return CommentRead{}, fmt.Errorf("load post: %w", err)
	}

	var comment coredb.CoreForumComment
	if parentID == nil {
		comment, err = s.q.CreateForumComment(ctx, coredb.CreateForumCommentParams{
			ID:       uuid.New(),
			PostID:   post.ID,
			AuthorID: principal.ID,
			Body:     trimmed(body),
		})
	} else {
		parent, parentErr := s.q.GetForumCommentByID(ctx, *parentID)
		if parentErr != nil {
			if errors.Is(parentErr, pgx.ErrNoRows) {
				return CommentRead{}, apierr.New(apierr.NotFound, "no such comment to reply to")
			}
			return CommentRead{}, fmt.Errorf("load parent comment: %w", parentErr)
		}
		// Checked here so the caller gets a reason rather than a foreign-key
		// violation. The schema refuses both cases regardless.
		if parent.PostID != post.ID {
			return CommentRead{}, apierr.New(apierr.Validation,
				"that comment belongs to a different post")
		}
		if parent.ParentID != nil {
			return CommentRead{}, apierr.New(apierr.Validation,
				"replies cannot be nested further; reply to the comment instead")
		}

		comment, err = s.q.CreateForumReply(ctx, coredb.CreateForumReplyParams{
			ID:       uuid.New(),
			PostID:   post.ID,
			ParentID: parentID,
			AuthorID: principal.ID,
			Body:     trimmed(body),
		})
	}
	if err != nil {
		return CommentRead{}, mapConstraintError(err)
	}

	author, err := s.author(ctx, comment.AuthorID)
	if err != nil {
		return CommentRead{}, err
	}
	return toCommentRead(comment, author), nil
}

// ListComments returns a page of a thread's comments, each reply directly after
// the floor it belongs to, and the total number in the thread.
//
// Paged rather than whole: this route is public and unauthenticated, so an
// unbounded response would let anyone ask the server to assemble every comment on
// the busiest thread. The default page is generous enough that an ordinary
// conversation still arrives in one response.
func (s *Service) ListComments(ctx context.Context, postNo int64, page, pageSize int) ([]CommentRead, int64, error) {
	post, err := s.q.GetForumPostByNo(ctx, postNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, apierr.New(apierr.NotFound, "no such post")
		}
		return nil, 0, fmt.Errorf("load post: %w", err)
	}

	paging := ListFilter{Page: page, PageSize: pageSize}
	if paging.PageSize < 1 || paging.PageSize > MaxCommentPageSize {
		paging.PageSize = DefaultCommentPageSize
	}
	if paging.Page < 1 {
		paging.Page = 1
	}
	paging.clampOffset(MaxCommentPageSize)

	total, err := s.q.CountForumPostComments(ctx, post.ID)
	if err != nil {
		return nil, 0, fmt.Errorf("count comments: %w", err)
	}

	rows, err := s.q.ListForumComments(ctx, coredb.ListForumCommentsParams{
		PostID:       post.ID,
		ResultLimit:  int32(paging.PageSize),
		ResultOffset: paging.Offset(),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list comments: %w", err)
	}

	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.AuthorID)
	}
	authors, err := s.authors.PublicByIDs(ctx, ids)
	if err != nil {
		return nil, 0, fmt.Errorf("load authors: %w", err)
	}

	out := make([]CommentRead, 0, len(rows))
	for _, r := range rows {
		author, ok := authors[r.AuthorID]
		if !ok {
			continue
		}
		out = append(out, toCommentRead(r, author))
	}
	return out, total, nil
}

// UpdateComment edits a comment the caller owns.
func (s *Service) UpdateComment(ctx context.Context, principal auth.Principal, id uuid.UUID, body string) (CommentRead, error) {
	if err := validateBody(body, "comment"); err != nil {
		return CommentRead{}, err
	}
	if _, err := s.ownedComment(ctx, principal, id); err != nil {
		return CommentRead{}, err
	}

	updated, err := s.q.UpdateForumComment(ctx, coredb.UpdateForumCommentParams{
		ID:   id,
		Body: trimmed(body),
	})
	if err != nil {
		return CommentRead{}, mapConstraintError(err)
	}
	author, err := s.author(ctx, updated.AuthorID)
	if err != nil {
		return CommentRead{}, err
	}
	return toCommentRead(updated, author), nil
}

// DeleteComment removes a comment the caller owns, and by cascade its replies.
func (s *Service) DeleteComment(ctx context.Context, principal auth.Principal, id uuid.UUID) error {
	if _, err := s.ownedComment(ctx, principal, id); err != nil {
		return err
	}
	rows, err := s.q.DeleteForumComment(ctx, id)
	if err != nil {
		return fmt.Errorf("delete comment: %w", err)
	}
	if rows == 0 {
		return apierr.New(apierr.NotFound, "no such comment")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

// ownedPost loads a post the caller is allowed to change.
//
// A caller who is neither the author nor an administrator gets 403 rather than
// 404. The post's existence is already public — anyone can read it — so hiding it
// here would only confuse the author of a legitimate request.
func (s *Service) ownedPost(ctx context.Context, principal auth.Principal, postNo int64) (coredb.CoreForumPost, error) {
	post, err := s.q.GetForumPostByNo(ctx, postNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return coredb.CoreForumPost{}, apierr.New(apierr.NotFound, "no such post")
		}
		return coredb.CoreForumPost{}, fmt.Errorf("load post: %w", err)
	}
	if post.AuthorID != principal.ID && !principal.IsSuperuser {
		return coredb.CoreForumPost{}, apierr.New(apierr.Forbidden, "that post is not yours")
	}
	return post, nil
}

func (s *Service) ownedComment(ctx context.Context, principal auth.Principal, id uuid.UUID) (coredb.CoreForumComment, error) {
	comment, err := s.q.GetForumCommentByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return coredb.CoreForumComment{}, apierr.New(apierr.NotFound, "no such comment")
		}
		return coredb.CoreForumComment{}, fmt.Errorf("load comment: %w", err)
	}
	if comment.AuthorID != principal.ID && !principal.IsSuperuser {
		return coredb.CoreForumComment{}, apierr.New(apierr.Forbidden, "that comment is not yours")
	}
	return comment, nil
}

// author resolves one account's public view.
func (s *Service) author(ctx context.Context, id uuid.UUID) (users.UserPublic, error) {
	found, err := s.authors.PublicByIDs(ctx, []uuid.UUID{id})
	if err != nil {
		return users.UserPublic{}, fmt.Errorf("load author: %w", err)
	}
	return found[id], nil
}

func trimmed(s string) string {
	return strings.TrimSpace(s)
}

func normaliseTopic(topic *string) *string {
	if topic == nil {
		return nil
	}
	t := strings.TrimSpace(*topic)
	if t == "" {
		return nil
	}
	return &t
}

// mapConstraintError turns a database constraint violation into the API's
// vocabulary.
//
// As in the accounts service, only Code and ConstraintName are read: a Postgres
// violation carries the whole offending row in Detail, and copying that into a
// response would publish a post's contents on an unrelated error.
func mapConstraintError(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return fmt.Errorf("write forum row: %w", err)
	}

	switch pgErr.Code {
	case "23514": // check_violation
		switch pgErr.ConstraintName {
		case "forum_posts_title_length":
			return apierr.New(apierr.Validation,
				fmt.Sprintf("a title may be at most %d characters", MaxTitleLength))
		case "forum_posts_body_length", "forum_comments_body_length":
			return apierr.New(apierr.Validation,
				fmt.Sprintf("a body may be at most %d characters", MaxBodyLength))
		case "forum_posts_games_count":
			return apierr.New(apierr.Validation,
				fmt.Sprintf("a post may name at most %d games", MaxGameIDs))
		case "forum_posts_tags_count":
			return apierr.New(apierr.Validation,
				fmt.Sprintf("a post may have at most %d tags", MaxTags))
		case "forum_posts_channel_check":
			return apierr.New(apierr.Validation, "that is not a channel")
		case "forum_posts_topic_check":
			return apierr.New(apierr.Validation, "that is not a topic")
		default:
			return apierr.New(apierr.Validation, "one of the supplied values is not acceptable")
		}
	case "23503": // foreign_key_violation
		// The composite key that caps the thread at two levels reports here when
		// a reply names another reply as its parent.
		if pgErr.ConstraintName == "forum_comments_parent_is_top_level" {
			return apierr.New(apierr.Validation,
				"replies cannot be nested further; reply to the comment instead")
		}
		return apierr.New(apierr.Validation, "that referenced record does not exist")
	case "23505": // unique_violation
		return apierr.New(apierr.Integrity, "that value is already in use")
	default:
		return fmt.Errorf("write forum row: %w", err)
	}
}
