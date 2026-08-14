// Package notify writes notifications and reads them back.
//
// It is written to synchronously, in the same request that caused the event. There is no
// queue in this system, and adding one for a single INSERT would be the largest piece of
// new infrastructure in the forum slices. The trade is explicit: a notification that
// cannot be written fails the like or reply that caused it, rather than succeeding into a
// silently empty inbox.
//
// Nothing here renders a message. A notification stores its kind and its references, and
// the client turns that into words — so no display string is frozen into the database in
// one language, which for a site in five would be a migration waiting to happen.
package notify

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Kind is why a notification exists.
type Kind string

const (
	Reply       Kind = "reply"
	Mention     Kind = "mention"
	PostLike    Kind = "post_like"
	CommentLike Kind = "comment_like"
	Follow      Kind = "follow"
	System      Kind = "system"
)

// MaxMentionsPerBody caps mention fan-out.
//
// A body listing fifty names is a notification bomb with a legitimate-looking shape, and
// the cap is the cheapest defence that does not need a rate limiter. Mentions past the
// cap are dropped silently: telling the author which ones landed would make the limit
// itself a tool.
const MaxMentionsPerBody = 10

// Bounds on an inbox page.
const (
	DefaultPageSize = 30
	MaxPageSize     = 100
	MaxOffset       = 1 << 30
)

// mentionPattern matches @name in a body.
//
// Names allow letters, digits, underscore and hyphen, and the pattern requires a
// non-word character before the @ so that an email address in a body does not read as a
// mention of the part after it.
var mentionPattern = regexp.MustCompile(`(^|[^\w@])@([\w-]{1,64})`)

// Read is a notification as the API returns it.
type Read struct {
	ID        uuid.UUID  `json:"id" doc:"Notification identifier"`
	Kind      Kind       `json:"kind" enum:"reply,mention,post_like,comment_like,follow,system" doc:"Why it exists"`
	ActorUID  *int64     `json:"actorUid" doc:"Who caused it, or null for a system message"`
	PostNo    *int64     `json:"postNo" doc:"The post it is about, or null"`
	CommentID *uuid.UUID `json:"commentId" doc:"The comment it is about, or null"`
	Body      *string    `json:"body" doc:"The message text, for system notifications only"`
	ReadAt    *time.Time `json:"readAt" doc:"When it was read, or null"`
	CreatedAt time.Time  `json:"createdAt" doc:"When it arrived"`
}

// Preferences is which kinds an account wants.
type Preferences struct {
	Reply       bool `json:"reply" doc:"Replies to your posts and comments"`
	Mention     bool `json:"mention" doc:"Mentions of your name"`
	PostLike    bool `json:"postLike" doc:"Likes on your posts"`
	CommentLike bool `json:"commentLike" doc:"Likes on your comments"`
	Follow      bool `json:"follow" doc:"New followers"`
	System      bool `json:"system" doc:"Announcements from the site"`
}

// PreferencesUpdate is a partial change; a nil field is left alone.
type PreferencesUpdate struct {
	Reply       *bool
	Mention     *bool
	PostLike    *bool
	CommentLike *bool
	Follow      *bool
	System      *bool
}

// Event is one notification to write.
//
// Recipient and Kind are required; the rest depend on the kind. Nothing validates the
// combination here because the schema does: the actor constraint, the self-notification
// constraint and the kind check all reject a malformed event.
type Event struct {
	Recipient uuid.UUID
	Kind      Kind
	Actor     *uuid.UUID
	PostID    *uuid.UUID
	CommentID *uuid.UUID
	Body      *string
}

// AccountSource resolves accounts, so a mention can find the person it names and a
// notification can report an actor by public number.
type AccountSource interface {
	IDByName(ctx context.Context, name string) (uuid.UUID, error)
	UIDByID(ctx context.Context, id uuid.UUID) (int64, error)
}

// Service writes and reads notifications.
type Service struct {
	q        *coredb.Queries
	accounts AccountSource
	logger   *slog.Logger
}

// NewService wires the notification service.
func NewService(q *coredb.Queries, accounts AccountSource, logger *slog.Logger) *Service {
	return &Service{q: q, accounts: accounts, logger: logger}
}

// Notify writes one notification, if the recipient wants that kind.
//
// The preference check and the insert are one statement, so they cannot race a
// preference change, and a recipient who has turned the kind off simply gets no row —
// this is not an error.
func (s *Service) Notify(ctx context.Context, e Event) error {
	if err := s.q.CreateNotification(ctx, coredb.CreateNotificationParams{
		ID:          uuid.New(),
		RecipientID: e.Recipient,
		Kind:        string(e.Kind),
		ActorID:     e.Actor,
		PostID:      e.PostID,
		CommentID:   e.CommentID,
		Body:        e.Body,
	}); err != nil {
		return fmt.Errorf("write notification: %w", err)
	}
	return nil
}

// NotifyMentions finds @name in a body and notifies each named account once.
//
// Unknown names are ignored rather than reported: a body may contain an @ that was never
// meant as a mention, and failing the post would be absurd. The author mentioning
// themselves is dropped by the schema's self-notification constraint.
func (s *Service) NotifyMentions(ctx context.Context, body string, e Event) error {
	seen := make(map[string]struct{})
	sent := 0

	for _, match := range mentionPattern.FindAllStringSubmatch(body, -1) {
		name := match[2]
		key := strings.ToLower(name)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}

		if sent >= MaxMentionsPerBody {
			break
		}

		id, err := s.accounts.IDByName(ctx, name)
		if err != nil {
			if e, ok := apierr.As(err); ok && e.ErrorCode == apierr.UserNotFound {
				continue
			}
			return fmt.Errorf("resolve mention: %w", err)
		}

		event := e
		event.Recipient = id
		event.Kind = Mention
		if err := s.Notify(ctx, event); err != nil {
			return err
		}
		sent++
	}
	return nil
}

// List returns a page of an account's inbox.
func (s *Service) List(ctx context.Context, userID uuid.UUID, unreadOnly bool, page, pageSize int) ([]Read, int64, error) {
	limit, offset := paging(page, pageSize)

	total, err := s.q.CountNotifications(ctx, coredb.CountNotificationsParams{
		RecipientID: userID,
		UnreadOnly:  unreadOnly,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("count notifications: %w", err)
	}
	rows, err := s.q.ListNotifications(ctx, coredb.ListNotificationsParams{
		RecipientID:  userID,
		UnreadOnly:   unreadOnly,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list notifications: %w", err)
	}

	out := make([]Read, 0, len(rows))
	for _, row := range rows {
		read := Read{
			ID:        row.ID,
			Kind:      Kind(row.Kind),
			CommentID: row.CommentID,
			Body:      row.Body,
			CreatedAt: row.CreatedAt,
		}
		if row.ReadAt.Valid {
			t := row.ReadAt.Time
			read.ReadAt = &t
		}
		if row.ActorID != nil {
			uid, err := s.accounts.UIDByID(ctx, *row.ActorID)
			if err == nil {
				read.ActorUID = &uid
			}
			// A deleted actor cascades this row away, so a miss here means the delete is
			// in flight; reporting the notification without an actor beats failing the
			// whole inbox for it.
		}
		if row.PostID != nil {
			no, err := s.postNo(ctx, *row.PostID)
			if err != nil {
				return nil, 0, err
			}
			read.PostNo = &no
		}
		out = append(out, read)
	}
	return out, total, nil
}

// Unread is the badge count.
func (s *Service) Unread(ctx context.Context, userID uuid.UUID) (int64, error) {
	count, err := s.q.CountUnreadNotifications(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("count unread: %w", err)
	}
	return count, nil
}

// MarkRead marks one notification read. Scoped by recipient, so guessing a uuid does not
// let one account touch another's inbox; an id that is not theirs reads as not found.
func (s *Service) MarkRead(ctx context.Context, userID uuid.UUID, id uuid.UUID) error {
	rows, err := s.q.MarkNotificationRead(ctx, coredb.MarkNotificationReadParams{
		ID:          id,
		RecipientID: userID,
	})
	if err != nil {
		return fmt.Errorf("mark read: %w", err)
	}
	if rows == 0 {
		// Either it is not theirs, or it was already read. Both are "nothing to do", and
		// distinguishing them would leak whether the id exists.
		return nil
	}
	return nil
}

// MarkAllRead empties the badge.
func (s *Service) MarkAllRead(ctx context.Context, userID uuid.UUID) (int64, error) {
	rows, err := s.q.MarkAllNotificationsRead(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("mark all read: %w", err)
	}
	return rows, nil
}

// PreferencesFor reads an account's preferences; an absent row means every default.
func (s *Service) PreferencesFor(ctx context.Context, userID uuid.UUID) (Preferences, error) {
	row, err := s.q.GetNotificationPreferences(ctx, userID)
	if err != nil {
		return Preferences{}, fmt.Errorf("load preferences: %w", err)
	}
	return Preferences{
		Reply:       row.Reply,
		Mention:     row.Mention,
		PostLike:    row.PostLike,
		CommentLike: row.CommentLike,
		Follow:      row.Follow,
		System:      row.System,
	}, nil
}

// SetPreferences applies a partial change.
func (s *Service) SetPreferences(ctx context.Context, userID uuid.UUID, in PreferencesUpdate) (Preferences, error) {
	row, err := s.q.SetNotificationPreferences(ctx, coredb.SetNotificationPreferencesParams{
		UserID:      userID,
		Reply:       in.Reply,
		Mention:     in.Mention,
		PostLike:    in.PostLike,
		CommentLike: in.CommentLike,
		Follow:      in.Follow,
		System:      in.System,
	})
	if err != nil {
		return Preferences{}, fmt.Errorf("set preferences: %w", err)
	}
	return Preferences{
		Reply:       row.Reply,
		Mention:     row.Mention,
		PostLike:    row.PostLike,
		CommentLike: row.CommentLike,
		Follow:      row.Follow,
		System:      row.System,
	}, nil
}

func (s *Service) postNo(ctx context.Context, postID uuid.UUID) (int64, error) {
	post, err := s.q.GetForumPostByID(ctx, postID)
	if err != nil {
		return 0, fmt.Errorf("load the notification's post: %w", err)
	}
	return post.PostNo, nil
}

func paging(page, pageSize int) (limit int32, offset int32) {
	if pageSize < 1 || pageSize > MaxPageSize {
		pageSize = DefaultPageSize
	}
	if page < 1 {
		page = 1
	}
	off := (page - 1) * pageSize
	if off > MaxOffset {
		off = MaxOffset
	}
	return int32(pageSize), int32(off)
}
