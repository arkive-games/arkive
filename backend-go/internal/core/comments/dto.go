// Package comments implements comments attached to a map marker.
//
// It is the game-scoped comments package the architecture design reserves as
// core/comments, and it is deliberately not the forum: the forum is the site-wide
// board, whose target is a row this database owns. A marker comment's target lives
// in a data-<game> artifact repository, so the three location keys are opaque text
// here and nothing joins against them. What the two share they share on purpose —
// accounts, roles, the moderation queue, the notification inbox — rather than by
// copying a second implementation of each.
package comments

import (
	"time"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/users"
)

// Sort orders a marker's top-level comments.
type Sort string

const (
	// SortLatest is newest first, which is the default: a marker's comments are
	// usually a running list of what people found there.
	SortLatest Sort = "latest"

	// SortPopular is most-liked first, then newest. It is what a reader asks for
	// when a marker has forty comments and one of them is the answer.
	SortPopular Sort = "popular"
)

// Sorts is every accepted value, for the wire schema's enum.
var Sorts = []Sort{SortLatest, SortPopular}

// Bounds on a page. Generous enough that an ordinary marker's thread arrives whole.
const (
	DefaultPageSize = 20
	MaxPageSize     = 50
)

// MaxBody bounds a comment, in runes.
//
// Runes and not bytes, matching the forum: with len() a Chinese comment was refused
// at about a third of the stated limit by a message that still said 2000.
const MaxBody = 2000

// CommentRead is a comment as the API returns it.
type MarkerCommentRead struct {
	ID uuid.UUID `json:"id" doc:"Identifier, used to edit, delete, like or report this comment"`

	// nullable:"true" is required and is not decoration: huma infers nullability
	// from a pointer for *time.Time but a *uuid.UUID takes the TextUnmarshaler
	// branch and drops it, so without this the document would claim a reply's
	// parentId is always a string.
	ParentID *uuid.UUID `json:"parentId" nullable:"true" doc:"The comment this replies to, or null for a top-level comment"`

	GameKey  string `json:"game" doc:"The game the marker belongs to"`
	MapID    string `json:"map" doc:"The map the marker is on"`
	MarkerID string `json:"marker" doc:"The marker this comment is attached to"`

	Author     users.UserPublic `json:"author" doc:"Who wrote it"`
	Body       string           `json:"body" doc:"Raw markdown, exactly as written. Render it with raw HTML disabled."`
	Likes      int64            `json:"likeCount" doc:"How many accounts have liked it"`
	Liked      bool             `json:"liked" doc:"Whether the current reader has liked it"`
	ReplyCount int64            `json:"replyCount" doc:"How many visible replies it has"`

	CreatedAt time.Time  `json:"createdAt" doc:"When it was written"`
	EditedAt  *time.Time `json:"editedAt" doc:"When it was last edited, or null if never"`
}

// CreateInput is a new comment.
//
// ParentID is optional; when it is set the comment is a reply, and the parent must be
// a top-level comment on the same marker.
type CreateInput struct {
	GameKey  string
	MapID    string
	MarkerID string
	Body     string
	ParentID *uuid.UUID
}

// Target identifies one marker's thread.
type Target struct {
	GameKey  string
	MapID    string
	MarkerID string
}

// MarkerHiddenRead is a hidden marker comment as the moderation queue returns it.
type MarkerHiddenRead struct {
	ID       uuid.UUID `json:"id" doc:"Comment identifier"`
	GameKey  string    `json:"game" doc:"The game the marker belongs to"`
	MapID    string    `json:"map" doc:"The map the marker is on"`
	MarkerID string    `json:"marker" doc:"The marker the comment is attached to"`
	Body     string    `json:"body" doc:"What it said, so a moderator can judge a restore"`
	Reason   *string   `json:"reason" doc:"Why it was hidden, or null"`
	HiddenAt time.Time `json:"hiddenAt" doc:"When it was hidden"`
}
