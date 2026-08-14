package forum

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/notify"
	"github.com/arkive-games/arkive/backend-go/internal/core/roles"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Service implements the forum use cases.
type Service struct {
	q        *coredb.Queries
	authors  AuthorSource
	authz    Authorizer
	notifier Notifier
	images   ImageStore
	logger   *slog.Logger
}

// Notifier receives the events the forum causes.
//
// An interface so the forum states what happened without depending on how anyone is told,
// and so a test can assert an event was raised without a notifications table.
type Notifier interface {
	Notify(ctx context.Context, e notify.Event) error
	NotifyMentions(ctx context.Context, body string, e notify.Event) error
}

// Authorizer answers permission questions the forum does not decide for itself.
//
// An interface for the same reason AuthorSource is one: the forum needs a verdict,
// not the role model behind it, and a test can supply a verdict without a database.
// Ownership is deliberately absent — ownedPost and ownedComment answer that, because
// an author is not a moderator and the two must not be conflated.
type Authorizer interface {
	Can(ctx context.Context, p auth.Principal, action roles.Action, game string) (bool, error)
	CanAny(ctx context.Context, p auth.Principal, action roles.Action, gameKeys []string) (bool, error)
}

// AuthorSource resolves the public view of an account.
//
// An interface rather than *users.Service so the forum depends on the one thing
// it needs — turning an author id into a name and an avatar — instead of on every
// account use case, and so tests can supply authors without a user service.
type AuthorSource interface {
	PublicByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]users.UserPublic, error)

	// IDByUID turns a public account number into the internal handle a feed filter
	// needs. It exists here rather than in the handler because the uuid is internal:
	// a client addresses an author by uid, and only the service crosses that line.
	IDByUID(ctx context.Context, uid int64) (uuid.UUID, error)
}

// NewService wires the forum service.
// images may be nil, which is the state a development server without object storage runs
// in. Attaching then reports StorageUnavailable and reads carry no images, rather than the
// whole forum refusing to start.
func NewService(q *coredb.Queries, authors AuthorSource, authz Authorizer, notifier Notifier, images ImageStore, logger *slog.Logger) *Service {
	return &Service{q: q, authors: authors, authz: authz, notifier: notifier, images: images, logger: logger}
}

// canPostToChannel decides who may post where.
//
// The official channel is administrators only; everything else is open to any
// signed-in account. The rule used to read principal.IsSuperuser directly, as a
// stated placeholder for a permission system that did not exist. It now asks the
// roles service, which is that system — and which answers PostOfficial as site-wide
// on purpose, since a game's administrator does not speak for the platform.
func (s *Service) canPostToChannel(ctx context.Context, principal auth.Principal, channel Channel) (bool, error) {
	if channel != ChannelOfficial {
		return true, nil
	}
	return s.authz.Can(ctx, principal, roles.PostOfficial, "")
}

// CreatePost publishes a post.
func (s *Service) CreatePost(ctx context.Context, principal auth.Principal, in CreatePostInput) (PostRead, error) {
	if err := validateChannel(in.Channel); err != nil {
		return PostRead{}, err
	}
	allowed, err := s.canPostToChannel(ctx, principal, in.Channel)
	if err != nil {
		return PostRead{}, err
	}
	if !allowed {
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
	if err := validateGameIDs(gameIDs); err != nil {
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
	// Mentions in the body reach the people named. Failing the post because a
	// notification could not be written would be the wrong trade here — but writing
	// nothing silently would be too, so the error is returned and the caller sees it.
	if err := s.notifier.NotifyMentions(ctx, post.Body, notify.Event{
		Actor:  &principal.ID,
		PostID: &post.ID,
	}); err != nil {
		return PostRead{}, err
	}

	// A brand-new post has no reactions and cannot have been liked by its author, so
	// the zero value is correct rather than a placeholder.
	return toPostRead(post, author, Reactions{}), nil
}

// PostByNo loads one post by its public number.
//
// viewer may be nil, for an anonymous reader; it decides only whose `liked` and
// `bookmarked` flags come back.
func (s *Service) PostByNo(ctx context.Context, postNo int64, viewer *uuid.UUID) (PostRead, error) {
	post, err := s.q.GetForumPostByNo(ctx, postNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PostRead{}, apierr.New(apierr.NotFound, "no such post")
		}
		return PostRead{}, fmt.Errorf("load post: %w", err)
	}
	if err := notFoundIfHidden(post.HiddenAt); err != nil {
		return PostRead{}, err
	}

	reactions, err := s.reactions(ctx, post.ID, viewer)
	if err != nil {
		return PostRead{}, err
	}
	author, err := s.author(ctx, post.AuthorID)
	if err != nil {
		return PostRead{}, err
	}
	images, err := s.imagesFor(ctx, post.ID)
	if err != nil {
		return PostRead{}, err
	}
	read := toPostRead(post, author, reactions)
	read.Images = images
	return read, nil
}

// MinQueryLength is the shortest search accepted.
//
// Two, not three, and the difference matters. Three is what the trigram index wants — a
// trigram is three characters, so anything shorter degrades to a sequential scan of every
// title and body. But a great many Chinese words are exactly two characters, and this
// site's largest audience writes queries of that shape constantly. Refusing them to protect
// an index would break search in the primary language to make it fast in the secondary one.
// The CJK case in the feed tests is what surfaced the trade.
//
// So two-character searches are accepted and scan. The board is small, the cost is bounded
// by the page size, and a one-character search — which matches most of everything and is
// the actually pathological case — is still refused.
const MinQueryLength = 2

// normaliseQuery trims, bounds and escapes a search term.
//
// The escaping is the part worth reading. The query reaches SQL as a parameter, so there is
// no injection — but it is interpolated into a LIKE pattern, where `%` and `_` are
// wildcards. Without this, a user typing `%` matches every post and a user searching for
// `foo_bar` also matches `fooXbar`. The backslash is escaped first, because escaping it
// afterwards would double the ones this function had just added.
func normaliseQuery(filter *ListFilter) error {
	if filter.Query == nil {
		return nil
	}

	term := trimmed(*filter.Query)
	if term == "" {
		filter.Query = nil
		return nil
	}
	if utf8.RuneCountInString(term) < MinQueryLength {
		return apierr.New(apierr.Validation,
			fmt.Sprintf("a search needs at least %d characters", MinQueryLength))
	}

	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(term)
	filter.Query = &escaped
	return nil
}

// reactions loads the counters and the viewer's own state for one post.
func (s *Service) reactions(ctx context.Context, postID uuid.UUID, viewer *uuid.UUID) (Reactions, error) {
	row, err := s.q.ForumPostReactions(ctx, coredb.ForumPostReactionsParams{
		PostID:   postID,
		ViewerID: viewer,
	})
	if err != nil {
		return Reactions{}, fmt.Errorf("load reactions: %w", err)
	}
	return Reactions{
		Comments:   row.CommentCount,
		Likes:      row.LikeCount,
		Bookmarks:  row.BookmarkCount,
		Liked:      row.Liked,
		Bookmarked: row.Bookmarked,
	}, nil
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
	if !ValidSort(filter.Sort) {
		return nil, 0, apierr.New(apierr.Validation,
			fmt.Sprintf("%q is not a feed order", filter.Sort))
	}
	if err := normaliseQuery(&filter); err != nil {
		return nil, 0, err
	}

	// An author filter naming nobody is an empty feed, not an error. A profile link
	// for a deleted account is a stale link, and answering it with 404 would make
	// the feed endpoint fail for a reason that has nothing to do with the feed.
	if filter.AuthorID == nil && filter.AuthorUID != nil {
		id, err := s.authors.IDByUID(ctx, *filter.AuthorUID)
		if err != nil {
			if e, ok := apierr.As(err); ok && e.ErrorCode == apierr.UserNotFound {
				return []PostRead{}, 0, nil
			}
			return nil, 0, fmt.Errorf("resolve author: %w", err)
		}
		filter.AuthorID = &id
	}

	// "Following only" without a signed-in reader would silently mean "everything",
	// which is the opposite of what was asked for. An empty feed is the honest answer.
	if filter.FollowedOnly && filter.ViewerID == nil {
		return []PostRead{}, 0, nil
	}
	var followedBy *uuid.UUID
	if filter.FollowedOnly {
		followedBy = filter.ViewerID
	}

	total, err := s.q.CountForumPosts(ctx, coredb.CountForumPostsParams{
		Channel:    filter.Channel,
		GameID:     filter.GameID,
		Tag:        filter.Tag,
		AuthorID:   filter.AuthorID,
		FollowedBy: followedBy,
		Featured:   filter.Featured,
		Query:      filter.Query,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("count posts: %w", err)
	}

	limit, offset := filter.Paging()
	rows, err := s.q.ListForumPosts(ctx, coredb.ListForumPostsParams{
		Channel:      filter.Channel,
		GameID:       filter.GameID,
		Tag:          filter.Tag,
		AuthorID:     filter.AuthorID,
		FollowedBy:   followedBy,
		Featured:     filter.Featured,
		Query:        filter.Query,
		Sort:         string(filter.Sort),
		ViewerID:     filter.ViewerID,
		ResultLimit:  limit,
		ResultOffset: offset,
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

	// One query for the whole page's images, rather than one per post — the same reason
	// the authors are loaded in a batch.
	postIDs := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		postIDs = append(postIDs, r.ID)
	}
	imagesByPost, err := s.imagesForPosts(ctx, postIDs)
	if err != nil {
		return nil, 0, err
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
		read := toPostRead(post, author, Reactions{
			Comments:   r.CommentCount,
			Likes:      r.LikeCount,
			Bookmarks:  r.BookmarkCount,
			Liked:      r.Liked,
			Bookmarked: r.Bookmarked,
		})
		if images, ok := imagesByPost[r.ID]; ok {
			read.Images = images
		}
		out = append(out, read)
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
		reactions, err := s.reactions(ctx, post.ID, &principal.ID)
		if err != nil {
			return PostRead{}, err
		}
		author, err := s.author(ctx, post.AuthorID)
		if err != nil {
			return PostRead{}, err
		}
		return toPostRead(post, author, reactions), nil
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
		keys, err := normaliseList(*in.GameIDs, MaxGameIDs, MaxTagLength, "game")
		if err != nil {
			return PostRead{}, err
		}
		if err := validateGameIDs(keys); err != nil {
			return PostRead{}, err
		}
		params.GameIDs = keys
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

	reactions, err := s.reactions(ctx, updated.ID, &principal.ID)
	if err != nil {
		return PostRead{}, err
	}
	author, err := s.author(ctx, updated.AuthorID)
	if err != nil {
		return PostRead{}, err
	}
	return toPostRead(updated, author, reactions), nil
}

// DeletePost removes a post and, by cascade, its comments and their replies.
func (s *Service) DeletePost(ctx context.Context, principal auth.Principal, postNo int64) error {
	post, err := s.ownedPost(ctx, principal, postNo)
	if err != nil {
		return err
	}
	// Read before the delete, because the image rows cascade with the post and the keys
	// go with them — after which nothing knows those objects exist.
	keys, err := s.imageKeys(ctx, post.ID)
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

	// Counted rather than deleted outright: another post may hold the same
	// content-addressed key. See reclaimIfUnreferenced.
	for _, key := range keys {
		s.reclaimIfUnreferenced(ctx, key)
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
	// Hidden content takes its thread with it. Without this a moderator's hide still
	// accepts comments, and every one fires a reply notification — so the author of
	// content nobody can see keeps being told about it.
	if err := notFoundIfHidden(post.HiddenAt); err != nil {
		return CommentRead{}, err
	}

	// Captured from the parent load below so the notification does not read the same row
	// a second time.
	var parentAuthor *uuid.UUID

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
		// A hidden parent is gone as far as a reader is concerned, so it cannot be
		// replied to either — otherwise a thread grows under content nobody can see.
		if err := notFoundIfCommentHidden(parent.HiddenAt); err != nil {
			return CommentRead{}, err
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

		parentAuthor = &parent.AuthorID

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
	// Who hears about it: the parent comment's author on a reply, the post's author on a
	// top-level comment. Either may be the commenter themselves, which the schema's
	// self-notification constraint drops.
	// The parent was already loaded above to validate the reply; reusing its author here
	// avoids a second read of the same row.
	recipient := post.AuthorID
	if parentAuthor != nil {
		recipient = *parentAuthor
	}
	if err := s.notifier.Notify(ctx, notify.Event{
		Recipient: recipient,
		Kind:      notify.Reply,
		Actor:     &principal.ID,
		PostID:    &post.ID,
		CommentID: &comment.ID,
	}); err != nil {
		return CommentRead{}, err
	}
	if err := s.notifier.NotifyMentions(ctx, comment.Body, notify.Event{
		Actor:     &principal.ID,
		PostID:    &post.ID,
		CommentID: &comment.ID,
	}); err != nil {
		return CommentRead{}, err
	}

	// A comment that has just been written has no likes, so the zero value is the
	// truth rather than a stand-in.
	return toCommentRead(comment, author, 0, false), nil
}

// ListComments returns a page of a thread's comments, each reply directly after
// the floor it belongs to, and the total number in the thread.
//
// Paged rather than whole: this route is public and unauthenticated, so an
// unbounded response would let anyone ask the server to assemble every comment on
// the busiest thread. The default page is generous enough that an ordinary
// conversation still arrives in one response.
func (s *Service) ListComments(ctx context.Context, postNo int64, page, pageSize int, viewer *uuid.UUID) ([]CommentRead, int64, error) {
	post, err := s.q.GetForumPostByNo(ctx, postNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, apierr.New(apierr.NotFound, "no such post")
		}
		return nil, 0, fmt.Errorf("load post: %w", err)
	}
	if err := notFoundIfHidden(post.HiddenAt); err != nil {
		return nil, 0, err
	}

	// The comment bounds, which are not the feed's: a thread is normally read whole, so the
	// default and the ceiling are both larger. Both values come from one call, so the limit
	// and the offset cannot be computed from different page sizes.
	limit, offset := api.ClampPaging(page, pageSize, DefaultCommentPageSize, MaxCommentPageSize)

	total, err := s.q.CountForumPostComments(ctx, post.ID)
	if err != nil {
		return nil, 0, fmt.Errorf("count comments: %w", err)
	}

	rows, err := s.q.ListForumComments(ctx, coredb.ListForumCommentsParams{
		PostID:       post.ID,
		ViewerID:     viewer,
		ResultLimit:  limit,
		ResultOffset: offset,
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
		comment := coredb.CoreForumComment{
			ID: r.ID, PostID: r.PostID, ParentID: r.ParentID, AuthorID: r.AuthorID,
			Body: r.Body, CommentNo: r.CommentNo, Depth: r.Depth,
			ParentDepth: r.ParentDepth, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
			EditedAt: r.EditedAt,
		}
		out = append(out, toCommentRead(comment, author, r.LikeCount, r.Liked))
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
	likes, err := s.q.ForumCommentReactions(ctx, coredb.ForumCommentReactionsParams{
		CommentID: updated.ID,
		ViewerID:  &principal.ID,
	})
	if err != nil {
		return CommentRead{}, fmt.Errorf("load comment reactions: %w", err)
	}
	return toCommentRead(updated, author, likes.LikeCount, likes.Liked), nil
}

// SetFeatured puts a post on the editorial shelf, or takes it off.
//
// Authorized through CanAny against the post's own game tags, which is the rule roles
// exists for: a Palworld administrator may feature a Palworld post and nothing else. A
// post tagged with no game reaches site administrators only, because the general
// channel belongs to nobody in particular.
//
// Not an ownership action: an author cannot feature their own post, which is the whole
// point of an editorial shelf.
func (s *Service) SetFeatured(ctx context.Context, principal auth.Principal, postNo int64, featured bool) (PostRead, error) {
	post, err := s.postByNoForReaction(ctx, postNo)
	if err != nil {
		return PostRead{}, err
	}

	allowed, err := s.authz.CanAny(ctx, principal, roles.FeaturePost, post.GameIDs)
	if err != nil {
		return PostRead{}, err
	}
	if !allowed {
		return PostRead{}, apierr.New(apierr.Forbidden,
			"you do not administer a game this post is about")
	}

	updated, err := s.q.SetForumPostFeatured(ctx, coredb.SetForumPostFeaturedParams{
		ID:       post.ID,
		Featured: featured,
		ActorID:  &principal.ID,
	})
	if err != nil {
		return PostRead{}, fmt.Errorf("set featured: %w", err)
	}

	s.logger.InfoContext(ctx, "post featured state changed",
		slog.Int64("postNo", post.PostNo), slog.Bool("featured", featured),
		slog.String("actor", principal.ID.String()))

	return s.postWithReactions(ctx, updated, &principal.ID)
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

// SetPostLike likes or unlikes a post, and returns the post as the actor now sees
// it.
//
// One method for both directions rather than two, because the two differ by a single
// statement and returning the updated post is what lets a client render the new
// count without a second request. Both directions are idempotent: the caller is
// stating an end state, so a double tap or a retry is not an error.
//
// Liking your own post is allowed. Nothing is gained by refusing it — the count is
// public either way — and the notifications slice suppresses the self-notification in
// the schema rather than here.
func (s *Service) SetPostLike(ctx context.Context, principal auth.Principal, postNo int64, liked bool) (PostRead, error) {
	post, err := s.postByNoForReaction(ctx, postNo)
	if err != nil {
		return PostRead{}, err
	}

	if liked {
		err = s.q.LikeForumPost(ctx, coredb.LikeForumPostParams{PostID: post.ID, UserID: principal.ID})
	} else {
		err = s.q.UnlikeForumPost(ctx, coredb.UnlikeForumPostParams{PostID: post.ID, UserID: principal.ID})
	}
	if err != nil {
		return PostRead{}, fmt.Errorf("set post like: %w", err)
	}

	// Only on the way up. Unliking does not send a notification, and does not withdraw
	// the one the like sent: the author was told something happened, and it did.
	if liked {
		if err := s.notifier.Notify(ctx, notify.Event{
			Recipient: post.AuthorID,
			Kind:      notify.PostLike,
			Actor:     &principal.ID,
			PostID:    &post.ID,
		}); err != nil {
			return PostRead{}, err
		}
	}
	return s.postWithReactions(ctx, post, &principal.ID)
}

// SetPostBookmark bookmarks or unbookmarks a post.
//
// A bookmark is private to the account that made it, but its *count* is not: the
// number is public, and only the `bookmarked` flag is per-reader.
func (s *Service) SetPostBookmark(ctx context.Context, principal auth.Principal, postNo int64, bookmarked bool) (PostRead, error) {
	post, err := s.postByNoForReaction(ctx, postNo)
	if err != nil {
		return PostRead{}, err
	}

	if bookmarked {
		err = s.q.BookmarkForumPost(ctx, coredb.BookmarkForumPostParams{PostID: post.ID, UserID: principal.ID})
	} else {
		err = s.q.UnbookmarkForumPost(ctx, coredb.UnbookmarkForumPostParams{PostID: post.ID, UserID: principal.ID})
	}
	if err != nil {
		return PostRead{}, fmt.Errorf("set post bookmark: %w", err)
	}
	return s.postWithReactions(ctx, post, &principal.ID)
}

// SetCommentLike likes or unlikes one comment.
func (s *Service) SetCommentLike(ctx context.Context, principal auth.Principal, id uuid.UUID, liked bool) (CommentRead, error) {
	comment, err := s.q.GetForumCommentByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CommentRead{}, apierr.New(apierr.NotFound, "no such comment")
		}
		return CommentRead{}, fmt.Errorf("load comment: %w", err)
	}
	if err := notFoundIfCommentHidden(comment.HiddenAt); err != nil {
		return CommentRead{}, err
	}
	// And the thread it lives in. A comment addressed by id is reachable without ever
	// touching the post, so hiding the post has to be checked here as well — otherwise
	// liking a comment under withheld content still notifies its author, which is the
	// harm hiding exists to stop.
	if err := s.postVisibleForComment(ctx, comment.PostID); err != nil {
		return CommentRead{}, err
	}

	if liked {
		err = s.q.LikeForumComment(ctx, coredb.LikeForumCommentParams{CommentID: comment.ID, UserID: principal.ID})
	} else {
		err = s.q.UnlikeForumComment(ctx, coredb.UnlikeForumCommentParams{CommentID: comment.ID, UserID: principal.ID})
	}
	if err != nil {
		return CommentRead{}, fmt.Errorf("set comment like: %w", err)
	}

	if liked {
		if err := s.notifier.Notify(ctx, notify.Event{
			Recipient: comment.AuthorID,
			Kind:      notify.CommentLike,
			Actor:     &principal.ID,
			PostID:    &comment.PostID,
			CommentID: &comment.ID,
		}); err != nil {
			return CommentRead{}, err
		}
	}

	author, err := s.author(ctx, comment.AuthorID)
	if err != nil {
		return CommentRead{}, err
	}
	reactions, err := s.q.ForumCommentReactions(ctx, coredb.ForumCommentReactionsParams{
		CommentID: comment.ID,
		ViewerID:  &principal.ID,
	})
	if err != nil {
		return CommentRead{}, fmt.Errorf("load comment reactions: %w", err)
	}
	return toCommentRead(comment, author, reactions.LikeCount, reactions.Liked), nil
}

// postByNoForReaction loads a post to react to. Unlike ownedPost it applies no
// ownership rule: anyone signed in may like a post they did not write, which is the
// entire point.
func (s *Service) postByNoForReaction(ctx context.Context, postNo int64) (coredb.CoreForumPost, error) {
	post, err := s.q.GetForumPostByNo(ctx, postNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return coredb.CoreForumPost{}, apierr.New(apierr.NotFound, "no such post")
		}
		return coredb.CoreForumPost{}, fmt.Errorf("load post: %w", err)
	}
	if err := notFoundIfHidden(post.HiddenAt); err != nil {
		return coredb.CoreForumPost{}, err
	}
	return post, nil
}

func (s *Service) postWithReactions(ctx context.Context, post coredb.CoreForumPost, viewer *uuid.UUID) (PostRead, error) {
	reactions, err := s.reactions(ctx, post.ID, viewer)
	if err != nil {
		return PostRead{}, err
	}
	author, err := s.author(ctx, post.AuthorID)
	if err != nil {
		return PostRead{}, err
	}
	return toPostRead(post, author, reactions), nil
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
	// Hidden before ownership, so an author editing a hidden post gets the same 404
	// every other reader does rather than learning it exists but is withheld. A
	// moderator restores it first; a site administrator sees it in the queue.
	if !principal.IsSuperuser {
		if err := notFoundIfHidden(post.HiddenAt); err != nil {
			return coredb.CoreForumPost{}, err
		}
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
	// Hidden before ownership, so an author editing a hidden comment gets the same 404
	// every other reader does rather than learning it exists but is withheld.
	if !principal.IsSuperuser {
		if err := notFoundIfCommentHidden(comment.HiddenAt); err != nil {
			return coredb.CoreForumComment{}, err
		}
		// Hiding a post takes its thread with it, so editing or deleting a comment under
		// a hidden post is refused for the same reason reading the thread is.
		if err := s.postVisibleForComment(ctx, comment.PostID); err != nil {
			return coredb.CoreForumComment{}, err
		}
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
