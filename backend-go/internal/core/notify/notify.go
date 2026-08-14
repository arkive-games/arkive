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
	"time"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
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
	// IDsByNames resolves a batch, so the cost of a mention-heavy body is one query.
	IDsByNames(ctx context.Context, names []string) (map[string]uuid.UUID, error)
	// UIDsByIDs resolves a batch, so rendering an inbox costs one query and not one per row.
	UIDsByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]int64, error)
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
	names := mentionCandidates(body)
	if len(names) == 0 {
		return nil
	}

	// One query for the whole set, not one per name. The earlier version looked each
	// name up individually and only stopped once ten had been *sent*, so a body of ten
	// thousand names that match no account cost ten thousand sequential round trips
	// inside one request — the cap bounded the notifications and not the work.
	found, err := s.accounts.IDsByNames(ctx, names)
	if err != nil {
		return fmt.Errorf("resolve mentions: %w", err)
	}

	sent := 0
	for _, name := range names {
		id, ok := found[name]
		if !ok {
			// A body may contain an @ that was never meant as a mention, so an unknown
			// name is ignored rather than failing the post.
			continue
		}
		if sent >= MaxMentionsPerBody {
			break
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

// mentionCandidates extracts distinct @names, in the order they appear, bounded.
//
// The candidate cap is separate from MaxMentionsPerBody and larger than it: the send cap
// decides how many people hear about a post, this one decides how much work parsing it may
// cost. It can therefore drop a real mention: a body whose first fifty distinct names match
// nothing and whose fifty-first is a person notifies nobody. That is accepted — the
// alternative is letting one body decide how much work the server does — but it is a policy
// and not only an optimisation.
//
// Deduplication is exact rather than case-folded, because names are unique
// case-sensitively and folding here could merge two real accounts into one lookup.
func mentionCandidates(body string) []string {
	const maxCandidates = 50

	seen := make(map[string]struct{})
	out := make([]string, 0, MaxMentionsPerBody)

	for _, match := range mentionPattern.FindAllStringSubmatch(body, -1) {
		name := match[2]
		if _, dup := seen[name]; dup {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
		if len(out) >= maxCandidates {
			break
		}
	}
	return out
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

	// Two batch lookups for the page rather than two per row. At the maximum page size
	// this was up to two hundred sequential round trips to render one inbox.
	actorIDs := make([]uuid.UUID, 0, len(rows))
	postIDs := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		if row.ActorID != nil {
			actorIDs = append(actorIDs, *row.ActorID)
		}
		if row.PostID != nil {
			postIDs = append(postIDs, *row.PostID)
		}
	}

	actorUIDs, err := s.accounts.UIDsByIDs(ctx, actorIDs)
	if err != nil {
		return nil, 0, fmt.Errorf("load notification actors: %w", err)
	}
	postNos, err := s.postNos(ctx, postIDs)
	if err != nil {
		return nil, 0, err
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
		// A miss means the reference is gone or withheld: a post being deleted as this
		// reads cascades the notification away with it, and a deactivated account is
		// omitted deliberately, because the schema deactivates rather than deletes and a
		// disabled account should not keep appearing by name in other people's inboxes.
		// Rendering it without the reference beats failing the whole inbox for it — which
		// the post lookup used to do, by returning an unmapped ErrNoRows as a 500 while
		// the actor lookup beside it absorbed exactly the same race.
		if row.ActorID != nil {
			if uid, ok := actorUIDs[*row.ActorID]; ok {
				read.ActorUID = &uid
			}
		}
		if row.PostID != nil {
			if no, ok := postNos[*row.PostID]; ok {
				read.PostNo = &no
			}
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
// let one account touch another's inbox.
//
// The row count is discarded rather than checked: zero means either the id is not theirs or
// it was already read, both of which are "nothing to do", and reporting the difference would
// tell a caller whether an id they guessed exists.
func (s *Service) MarkRead(ctx context.Context, userID uuid.UUID, id uuid.UUID) error {
	if _, err := s.q.MarkNotificationRead(ctx, coredb.MarkNotificationReadParams{
		ID:          id,
		RecipientID: userID,
	}); err != nil {
		return fmt.Errorf("mark read: %w", err)
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

// postNos resolves a batch of post ids to their public numbers. A post being deleted as
// this reads is simply absent from the result, which the caller treats as a missing
// reference rather than an error.
func (s *Service) postNos(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]int64, error) {
	out := make(map[uuid.UUID]int64, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.q.GetForumPostNosByIDs(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("load notification posts: %w", err)
	}
	for _, row := range rows {
		out[row.ID] = row.PostNo
	}
	return out, nil
}

func paging(page, pageSize int) (limit int32, offset int32) {
	return api.ClampPaging(page, pageSize, DefaultPageSize, MaxPageSize)
}
