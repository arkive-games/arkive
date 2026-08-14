// Package forum implements the site-wide discussion board.
//
// It is the global forum that lives on the meta site, and it is deliberately not
// the game-scoped core/comments package the architecture document reserves for
// comments attached to a map marker. Games appear here as tags on a post.
//
// This package covers posts and comments. Reactions, images, follows, feeds,
// notifications and moderation are separate slices; see the design.
package forum

import (
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/games"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Channel is where a post lives.
type Channel string

// The channels a post can be filed under. "hot" is a derived feed rather than a
// stored channel, so it is deliberately absent.
const (
	ChannelGeneral  Channel = "general"
	ChannelOfficial Channel = "official"
	ChannelGames    Channel = "games"
)

// Topic is the optional kind of a post, matching the composer's fixed set.
const (
	TopicGuide      = "guide"
	TopicQuestion   = "question"
	TopicTesting    = "testing"
	TopicDiscussion = "discussion"
)

var (
	channels = []Channel{ChannelGeneral, ChannelOfficial, ChannelGames}
	topics   = []string{TopicGuide, TopicQuestion, TopicTesting, TopicDiscussion}
)

// Limits on what a post may contain. The database enforces the same bounds; these
// exist so a rejection names the limit instead of surfacing a check violation.
const (
	MaxTitleLength = 200
	MaxBodyLength  = 20000
	MaxGameIDs     = 5
	MaxTags        = 10
	MaxTagLength   = 32

	// MaxVideoURLLength matches both the composer's input cap and the column's
	// CHECK, so the three agree on what "too long" means.
	MaxVideoURLLength = 300

	// DefaultPageSize and MaxPageSize bound a feed request. The composer's pager
	// shows five pages of five posts, so the default matches what it asks for.
	DefaultPageSize = 20
	MaxPageSize     = 100

	// DefaultCommentPageSize is generous because a thread is normally read whole;
	// the limit exists to stop an unbounded response, not to force paging on a
	// conversation of twenty comments.
	DefaultCommentPageSize = 100
	MaxCommentPageSize     = 200
)

// PostRead is a post as the API returns it.
//
// The identity a client sees is PostNo, not the uuid: it is short, quotable and
// never reused, exactly as an account's uid is. The uuid stays internal.
type PostRead struct {
	PostNo int64            `json:"postNo" doc:"Permanent post number; use this in links" example:"1042"`
	Author users.UserPublic `json:"author" doc:"Who wrote it"`
	// The enum tag is what makes the generated TypeScript a union rather than a
	// bare string. CreatePostBody.Channel already carried one; this side did not,
	// so a client reading a response got no help from the type.
	Channel Channel `json:"channel" enum:"general,official,games" doc:"general, official or games" example:"general"`
	Title   string  `json:"title" doc:"Post title"`
	Body    string  `json:"body" doc:"Raw markdown, exactly as written. Render it with raw HTML disabled."`
	Topic   *string `json:"topic" doc:"guide, question, testing or discussion, or null"`
	// No enum here, deliberately, unlike the request bodies. Generating one would
	// mean either importing huma into this package or repeating the registry in a
	// struct tag, and a response needs no validation — the union that guards the
	// client is the one on what it sends. A reader comparing these against its own
	// game list is unaffected.
	GameIDs   []string `json:"gameIds" doc:"Games this post is about, at most 5"`
	Tags      []string `json:"tags" doc:"Free-form tags, at most 10"`
	Comments  int64    `json:"commentCount" doc:"Number of comments, replies included"`
	Likes     int64    `json:"likeCount" doc:"How many accounts have liked it"`
	Bookmarks int64    `json:"bookmarkCount" doc:"How many accounts have bookmarked it"`

	// The reader's own state. False for an anonymous reader rather than absent, so a
	// client needs no branch between signed-in and signed-out responses. A response
	// carrying these is per-viewer and must not be cached publicly.
	Liked      bool `json:"liked" doc:"Whether the current reader has liked it"`
	Bookmarked bool `json:"bookmarked" doc:"Whether the current reader has bookmarked it"`

	// Ordered by position. Empty rather than null, so a client can iterate without a
	// guard, and empty on a server with no object storage configured.
	Images []ImageRead `json:"images" doc:"Attached images, in order"`

	// A link, not an embed. The value is host-checked on the way in, but a client
	// rendering it still owes the usual care: it is a URL an untrusted author chose.
	VideoURL *string `json:"videoUrl" doc:"Linked Bilibili or Douyin video, or null"`

	// Null unless a game administrator has put it on the editorial shelf. The actor is
	// recorded in the database but not exposed: readers need to know a post is featured,
	// not who decided so.
	FeaturedAt *time.Time `json:"featuredAt" doc:"When it was featured, or null"`

	CreatedAt time.Time  `json:"createdAt" doc:"When it was posted"`
	EditedAt  *time.Time `json:"editedAt" doc:"When it was last edited, or null if never"`
}

// CommentRead is one comment or reply.
//
// CommentNo is the floor number, and it is null on a reply: only top-level
// comments are numbered. Replies carry an ID instead, which is what the edit and
// delete routes address them by.
type CommentRead struct {
	ID        uuid.UUID        `json:"id" doc:"Identifier, used to edit or delete this comment"`
	CommentNo *int64           `json:"commentNo" doc:"Floor number within the thread, or null on a reply" example:"21"`
	// nullable:"true" is required and is not decoration. huma infers nullability
	// from the pointer for `*int64` and `*time.Time`, but a `*uuid.UUID` takes the
	// encoding.TextUnmarshaler branch of its schema generation, which returns a
	// plain string and drops the pointer — so without this tag the document says
	// `"type": "string"` while the field really does serialise as null, and the
	// generated TypeScript types a top-level comment's parentId as a string. That
	// is the one field a client uses to tell a comment from a reply.
	ParentID *uuid.UUID `json:"parentId" nullable:"true" doc:"The comment this replies to, or null for a top-level comment"`
	Author    users.UserPublic `json:"author" doc:"Who wrote it"`
	Body      string           `json:"body" doc:"Raw markdown, exactly as written. Render it with raw HTML disabled."`
	Likes     int64            `json:"likeCount" doc:"How many accounts have liked it"`
	Liked     bool             `json:"liked" doc:"Whether the current reader has liked it"`
	CreatedAt time.Time        `json:"createdAt" doc:"When it was written"`
	EditedAt  *time.Time       `json:"editedAt" doc:"When it was last edited, or null if never"`
}

// CreatePostInput is a new post.
type CreatePostInput struct {
	Channel  Channel
	Title    string
	Body     string
	Topic    *string
	GameIDs  []string
	Tags     []string
	VideoURL *string
}

// UpdatePostInput is a partial edit; a nil field means "leave unchanged".
//
// Topic is the exception and uses a tri-state, because clearing a topic and
// leaving it alone are different intents that a plain pointer cannot separate.
type UpdatePostInput struct {
	Title   *string
	Body    *string
	Topic   Optional
	GameIDs *[]string
	Tags    *[]string
	// Tri-state for the same reason as Topic: removing a video and leaving it
	// alone both arrive as a nil pointer, and they are different edits.
	VideoURL Optional
}

// Optional carries the three states a nullable field needs: absent, explicitly
// cleared, or set. It mirrors api.Optional, kept here as a plain struct because
// the service layer should not depend on the transport's JSON decoding.
type Optional struct {
	Set   bool
	Value *string
}

// ListFilter narrows a feed request. Every field is optional.
type ListFilter struct {
	Channel *string
	GameID  *string
	Tag     *string

	// Exactly one of these addresses an author. AuthorID is the internal handle,
	// used by callers that already hold it; AuthorUID is the public number a client
	// sends, which the service resolves. Setting both is a programming error and
	// AuthorID wins.
	AuthorID  *uuid.UUID
	AuthorUID *int64

	// Who is reading, when anyone is. It selects nothing — it only decides whose
	// `liked` and `bookmarked` flags the rows carry, so an anonymous feed is the same
	// query with both flags false.
	ViewerID *uuid.UUID

	// FollowedOnly narrows the feed to accounts the viewer follows. It is separate
	// from ViewerID because the two answer different questions — whose flags to
	// report, and whose posts to include — and a reader browsing the whole feed still
	// wants their own `liked` state on every row.
	FollowedOnly bool

	// Featured narrows to the editorial shelf, or to everything off it.
	Featured *bool

	// Query is a substring search over title and body. Trimmed by normalise; empty
	// means no search rather than "match everything with an empty string".
	Query *string

	// Sort is one of SortNew, SortHot or SortTop. Empty means SortNew.
	Sort Sort

	Page     int
	PageSize int
}

// Sort names a feed order.
type Sort string

const (
	// SortNew is newest first — the only order before this slice, and still the
	// default, because a forum's front page is a record of what just happened.
	SortNew Sort = "new"
	// SortHot ranks engagement decayed by age.
	SortHot Sort = "hot"
	// SortTop ranks by likes alone, ignoring age.
	SortTop Sort = "top"
)

var sorts = []Sort{SortNew, SortHot, SortTop}

// ValidSort reports whether s names an order. Empty is valid and means SortNew.
func ValidSort(s Sort) bool {
	if s == "" {
		return true
	}
	for _, known := range sorts {
		if s == known {
			return true
		}
	}
	return false
}

// normalise clamps the non-paging arguments. The limit and offset are derived together by
// Paging, so that they cannot be computed from two different page sizes.
func (f *ListFilter) normalise() {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > MaxPageSize {
		f.PageSize = DefaultPageSize
	}
}

// Paging renders the SQL limit and offset for the post feed.
//
// One call returning both, rather than a Offset() beside an independently computed limit.
// The separated form had exactly one caller reading the wrong bounds — the comments route,
// whose page size legitimately reaches 200 while this method hard-coded the feed's 100 — so
// a comment page of 150 asked for `LIMIT 150 OFFSET 20` and served a page overlapping the
// one before it. Deriving both from a single call makes that shape unrepresentable rather
// than merely fixed.
func (f ListFilter) Paging() (limit int32, offset int32) {
	return api.ClampPaging(f.Page, f.PageSize, DefaultPageSize, MaxPageSize)
}

// Reactions is the engagement a post carries, plus how the current reader has
// reacted to it.
//
// Grouped into a struct rather than passed as four more positional arguments: the
// call sites already take an author and a row, and `toPostRead(p, a, 3, 7, 2, true,
// false)` is a bug waiting for someone to transpose two numbers.
type Reactions struct {
	Comments   int64
	Likes      int64
	Bookmarks  int64
	Liked      bool
	Bookmarked bool
}

func toPostRead(p coredb.CoreForumPost, author users.UserPublic, r Reactions) PostRead {
	return PostRead{
		PostNo:     p.PostNo,
		Author:     author,
		Channel:    Channel(p.Channel),
		Title:      p.Title,
		Body:       p.Body,
		Topic:      p.Topic,
		GameIDs:    emptyIfNil(p.GameIDs),
		Tags:       emptyIfNil(p.Tags),
		Images:     []ImageRead{},
		VideoURL:   p.VideoUrl,
		FeaturedAt: timeOrNil(p.FeaturedAt.Time, p.FeaturedAt.Valid),
		Comments:   r.Comments,
		Likes:      r.Likes,
		Bookmarks:  r.Bookmarks,
		Liked:      r.Liked,
		Bookmarked: r.Bookmarked,
		CreatedAt:  p.CreatedAt,
		EditedAt:   timeOrNil(p.EditedAt.Time, p.EditedAt.Valid),
	}
}

func toCommentRead(c coredb.CoreForumComment, author users.UserPublic, likes int64, liked bool) CommentRead {
	return CommentRead{
		ID:        c.ID,
		CommentNo: c.CommentNo,
		ParentID:  c.ParentID,
		Author:    author,
		Body:      c.Body,
		Likes:     likes,
		Liked:     liked,
		CreatedAt: c.CreatedAt,
		EditedAt:  timeOrNil(c.EditedAt.Time, c.EditedAt.Valid),
	}
}

// emptyIfNil keeps a JSON array from serialising as null, which would make every
// client check for it before iterating.
func emptyIfNil(v []string) []string {
	if v == nil {
		return []string{}
	}
	return v
}

func timeOrNil(t time.Time, valid bool) *time.Time {
	if !valid {
		return nil
	}
	return &t
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

func validateChannel(c Channel) error {
	for _, known := range channels {
		if known == c {
			return nil
		}
	}
	return apierr.New(apierr.Validation,
		fmt.Sprintf("channel must be one of %s", strings.Join(channelNames(), ", ")))
}

func channelNames() []string {
	out := make([]string, 0, len(channels))
	for _, c := range channels {
		out = append(out, string(c))
	}
	return out
}

func validateTopic(topic *string) error {
	if topic == nil || *topic == "" {
		return nil
	}
	for _, known := range topics {
		if known == *topic {
			return nil
		}
	}
	return apierr.New(apierr.Validation,
		fmt.Sprintf("topic must be one of %s", strings.Join(topics, ", ")))
}

// validateTitle and validateBody count runes rather than bytes, so a limit means
// the same thing to a Chinese post as to an English one.
func validateTitle(title string) error {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		return apierr.New(apierr.Validation, "a post needs a title")
	}
	if utf8.RuneCountInString(trimmed) > MaxTitleLength {
		return apierr.New(apierr.Validation,
			fmt.Sprintf("a title may be at most %d characters", MaxTitleLength))
	}
	return nil
}

func validateBody(body string, what string) error {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return apierr.New(apierr.Validation, fmt.Sprintf("a %s needs a body", what))
	}
	if utf8.RuneCountInString(trimmed) > MaxBodyLength {
		return apierr.New(apierr.Validation,
			fmt.Sprintf("a %s may be at most %d characters", what, MaxBodyLength))
	}
	// Bodies are stored raw and rendered by the client, so this is the last point
	// at which the server can refuse markdown that renders to script. It does not
	// replace the renderer's obligation to disable raw HTML; it means a hostile
	// body never reaches storage in the first place. See markdown.go.
	return validateMarkdownSafety(trimmed, what)
}

// validateGameIDs rejects a key that names no game the platform serves.
//
// The wire layer already refuses these through an OpenAPI enum generated from the
// same registry, and the database refuses them again through
// forum_posts_game_ids_known. This is the middle of those three, and it is the one
// that covers a caller who is not an HTTP request — a test, or a future internal
// producer of posts. Without it, such a caller reaches the check constraint and
// turns a validation mistake into a 500.
func validateGameIDs(keys []string) error {
	for _, key := range keys {
		if !games.Valid(key) {
			return apierr.New(apierr.Validation,
				fmt.Sprintf("%q is not a game this platform serves", key))
		}
	}
	return nil
}

// videoHosts is the set of platforms a post may link a video on.
//
// An allowlist rather than a pattern, and kept in the service rather than in a
// CHECK constraint, because it is policy: adding a platform should be a code
// change with a test, not a migration against a table whose existing rows the
// new rule might reject.
var videoHosts = []string{"b23.tv", "bilibili.com", "douyin.com"}

// validateVideoURL accepts an absolute http(s) URL on one of the video hosts.
//
// The client checks the same thing before enabling the button, which is a
// convenience and not a control: anything reaching this function may have been
// typed straight at the API. Two properties matter beyond the host list.
//
// The scheme allowlist is what keeps `javascript:` and `data:` out of storage.
// The stored value is rendered as an `<a href>`, so a scheme check here is the
// difference between a link and script execution in every reader's browser.
//
// Credentials are refused outright. `https://bilibili.com@evil.com/x` has host
// `evil.com` — url.Parse reads it correctly and the host check below rejects it,
// so this is not what stops the attack. It is refused because the *displayed*
// string still begins with a name the reader trusts, and a link that reads as
// one destination while going to another is a phishing primitive whether or not
// the host allowlist happens to catch this particular spelling.
func validateVideoURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	if utf8.RuneCountInString(trimmed) > MaxVideoURLLength {
		return "", apierr.New(apierr.Validation,
			fmt.Sprintf("a video link may be at most %d characters", MaxVideoURLLength))
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", apierr.New(apierr.Validation, "that video link is not a valid URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", apierr.New(apierr.Validation, "a video link must be an http or https URL")
	}
	if parsed.User != nil {
		return "", apierr.New(apierr.Validation, "a video link may not carry credentials")
	}

	host := strings.ToLower(parsed.Hostname())
	for _, allowed := range videoHosts {
		// Exact host or a subdomain of it. The "."+allowed suffix is what keeps
		// `notbilibili.com` and `bilibili.com.evil.net` out: a bare
		// strings.HasSuffix(host, allowed) accepts the first, and a check without
		// the anchor at the end accepts the second.
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return trimmed, nil
		}
	}
	return "", apierr.New(apierr.Validation,
		fmt.Sprintf("a video link must point at one of: %s", strings.Join(videoHosts, ", ")))
}

// normaliseList trims, drops blanks and removes duplicates, so that ["a","a",""]
// stores as ["a"] rather than as three entries the caller did not mean.
func normaliseList(in []string, max int, maxLen int, what string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, raw := range in {
		v := strings.TrimSpace(raw)
		if v == "" {
			continue
		}
		if utf8.RuneCountInString(v) > maxLen {
			return nil, apierr.New(apierr.Validation,
				fmt.Sprintf("each %s may be at most %d characters", what, maxLen))
		}
		if _, dup := seen[v]; dup {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	if len(out) > max {
		return nil, apierr.New(apierr.Validation,
			fmt.Sprintf("a post may have at most %d %ss", max, what))
	}
	return out, nil
}
