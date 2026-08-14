package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/forum"
	"github.com/arkive-games/arkive/backend-go/internal/core/games"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

// GameKey is a game key on the wire.
//
// Its enum is built from internal/core/games rather than repeated in a struct tag,
// so the OpenAPI document, the TypeScript union generated from it, and the server's
// own validation all read one list and cannot drift. api.Optional uses the same
// huma.SchemaProvider hook.
//
// The payoff on the client is that `sites.ts` can type its game ids as this union:
// adding a game to the portal without adding it here then fails to compile instead
// of failing at request time.
type GameKey string

// Schema implements huma.SchemaProvider.
func (GameKey) Schema(huma.Registry) *huma.Schema {
	enum := make([]any, 0, len(games.Keys))
	for _, key := range games.Keys {
		enum = append(enum, key)
	}
	return &huma.Schema{
		Type:        huma.TypeString,
		Enum:        enum,
		Description: "A game the platform serves",
	}
}

// gameKeyStrings converts the wire type to what the service takes. The service
// speaks plain strings so that nothing below the handler depends on huma.
func gameKeyStrings(in []GameKey) []string {
	out := make([]string, 0, len(in))
	for _, key := range in {
		out = append(out, string(key))
	}
	return out
}

// gameKeyStringsPtr preserves nil, because on an edit nil means "leave the list
// alone" while an empty slice means "clear it". Converting the two into the same
// value would make clearing the games off a post impossible.
func gameKeyStringsPtr(in *[]GameKey) *[]string {
	if in == nil {
		return nil
	}
	out := gameKeyStrings(*in)
	return &out
}

// optionalUID turns an absent numeric query parameter into no filter. huma does not
// accept pointer query parameters, so an omitted authorUid arrives as zero — which
// is not a possible account number, since uid starts at 10000 and special_uid at 1.
func optionalUID(v int64) *int64 {
	if v <= 0 {
		return nil
	}
	return &v
}

// CreatePostBody is a new post.
//
// Body is raw markdown and is stored exactly as sent. It is never rendered by
// this service, which is what keeps a sanitiser bug out of the stored data — and
// which puts the corresponding obligation on whatever renders it. See the design.
type CreatePostBody struct {
	Channel string    `json:"channel" enum:"general,official,games" doc:"Where the post is filed. The official channel is administrators only."`
	Title   string    `json:"title" minLength:"1" maxLength:"200" doc:"Post title"`
	Body    string    `json:"body" minLength:"1" maxLength:"20000" doc:"Raw markdown. Render it with raw HTML disabled."`
	Topic   *string   `json:"topic,omitempty" enum:"guide,question,testing,discussion" doc:"Optional kind of post"`
	GameIDs []GameKey `json:"gameIds,omitempty" maxItems:"5" doc:"Games this post is about"`
	Tags    []string  `json:"tags,omitempty" maxItems:"10" doc:"Free-form tags"`
}

// UpdatePostBody is a partial edit; an absent field is left unchanged.
type UpdatePostBody struct {
	Title   *string    `json:"title,omitempty" minLength:"1" maxLength:"200" doc:"New title"`
	Body    *string    `json:"body,omitempty" minLength:"1" maxLength:"20000" doc:"New raw markdown body"`
	GameIDs *[]GameKey `json:"gameIds,omitempty" maxItems:"5" doc:"Replaces the whole list"`
	Tags    *[]string  `json:"tags,omitempty" maxItems:"10" doc:"Replaces the whole list"`

	// Three states rather than two: absent leaves the topic alone, null clears
	// it, a value sets it. A plain pointer cannot separate the first two.
	Topic api.Optional[string] `json:"topic,omitzero" enum:"guide,question,testing,discussion" doc:"A value sets the topic, null clears it, omitting it leaves it unchanged"`
}

// CreateCommentBody is a comment, or a reply when parentId is set.
type CreateCommentBody struct {
	Body     string     `json:"body" minLength:"1" maxLength:"20000" doc:"Raw markdown. Render it with raw HTML disabled."`
	ParentID *uuid.UUID `json:"parentId,omitempty" doc:"The comment being replied to. Omit for a top-level comment; a reply to a reply is refused."`
}

// UpdateCommentBody edits a comment.
type UpdateCommentBody struct {
	Body string `json:"body" minLength:"1" maxLength:"20000" doc:"New raw markdown body"`
}

type listPostsInput struct {
	// huma does not accept pointer query parameters, so an absent filter arrives
	// as the empty string and is normalised to "no filter" below.
	Channel string `query:"channel" enum:"general,official,games" doc:"Only posts in this channel"`

	// Deliberately not a GameKey: validation belongs on writes. A link carrying a
	// game key this build no longer serves should answer with an empty feed, not
	// reject the request, because the alternative breaks every shared or bookmarked
	// cabin URL the moment the registry changes.
	GameID string `query:"gameId" doc:"Only posts tagged with this game"`

	Tag string `query:"tag" doc:"Only posts carrying this tag"`

	// The public account number, not the uuid, which stays internal. Zero means no
	// filter: huma does not accept pointer query parameters, so absence and zero are
	// the same arrival and a real uid is at least 10000 anyway.
	AuthorUID int64 `query:"authorUid" minimum:"1" doc:"Only posts by this account"`

	Page     int `query:"page" default:"1" minimum:"1" doc:"1-based page number"`
	PageSize int `query:"pageSize" default:"20" minimum:"1" maximum:"100" doc:"Posts per page"`
}

type postNoInput struct {
	PostNo int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
}

type listCommentsInput struct {
	PostNo   int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
	Page     int   `query:"page" default:"1" minimum:"1" doc:"1-based page number"`
	PageSize int   `query:"pageSize" default:"100" minimum:"1" maximum:"200" doc:"Comments per page"`
}

type createPostInput struct {
	Body CreatePostBody
}

type updatePostInput struct {
	PostNo int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
	Body   UpdatePostBody
}

type createCommentInput struct {
	PostNo int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
	Body   CreateCommentBody
}

type commentIDInput struct {
	ID uuid.UUID `path:"id" doc:"Comment identifier"`
}

type updateCommentInput struct {
	ID   uuid.UUID `path:"id" doc:"Comment identifier"`
	Body UpdateCommentBody
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// RegisterForumRoutes mounts the /forum surface.
func (h *Handlers) RegisterForumRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "listForumPosts",
		Method:      http.MethodGet,
		Path:        "/forum/posts",
		Summary:     "List forum posts",
		Description: "Public. Newest first, with optional channel, game, tag and author filters. " +
			"Paginated by page number; a client should de-duplicate by postNo, because a " +
			"post arriving while someone reads can shift rows between pages.",
		Tags:   []string{"forum"},
		Errors: []int{http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *listPostsInput) (*api.Response[api.List[forum.PostRead]], error) {
		posts, total, err := h.forum.ListPosts(ctx, forum.ListFilter{
			Channel:   optional(in.Channel),
			GameID:    optional(in.GameID),
			Tag:       optional(in.Tag),
			AuthorUID: optionalUID(in.AuthorUID),
			Page:      in.Page,
			PageSize:  in.PageSize,
		})
		if err != nil {
			return nil, err
		}
		return api.OKList(posts, total), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "getForumPost",
		Method:      http.MethodGet,
		Path:        "/forum/posts/{postNo}",
		Summary:     "Get one post",
		Description: "Public.",
		Tags:        []string{"forum"},
		Errors:      []int{http.StatusNotFound},
	}, func(ctx context.Context, in *postNoInput) (*api.Response[forum.PostRead], error) {
		post, err := h.forum.PostByNo(ctx, in.PostNo)
		if err != nil {
			return nil, err
		}
		return api.OK(post), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "createForumPost",
		Method:      http.MethodPost,
		Path:        "/forum/posts",
		Summary:     "Publish a post",
		Description: "Rate limited per account. The official channel is administrators only.",
		Tags:        []string{"forum"},
		Errors: []int{
			http.StatusUnauthorized, http.StatusForbidden,
			http.StatusTooManyRequests, http.StatusUnprocessableEntity,
		},
	}, func(ctx context.Context, in *createPostInput) (*api.Response[forum.PostRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if !h.postLimiter.AllowKey(principal.ID.String()) {
			return nil, apierr.New(apierr.RateLimitExceeded,
				"you are posting too quickly; please wait a moment")
		}

		post, err := h.forum.CreatePost(ctx, principal, forum.CreatePostInput{
			Channel: forum.Channel(in.Body.Channel),
			Title:   in.Body.Title,
			Body:    in.Body.Body,
			Topic:   in.Body.Topic,
			GameIDs: gameKeyStrings(in.Body.GameIDs),
			Tags:    in.Body.Tags,
		})
		if err != nil {
			return nil, err
		}
		return api.OK(post), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "updateForumPost",
		Method:      http.MethodPatch,
		Path:        "/forum/posts/{postNo}",
		Summary:     "Edit a post",
		Description: "The author, or an administrator. Records when it was edited.",
		Tags:        []string{"forum"},
		Errors: []int{
			http.StatusUnauthorized, http.StatusForbidden,
			http.StatusNotFound, http.StatusUnprocessableEntity,
		},
	}, func(ctx context.Context, in *updatePostInput) (*api.Response[forum.PostRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		post, err := h.forum.UpdatePost(ctx, principal, in.PostNo, forum.UpdatePostInput{
			Title:   in.Body.Title,
			Body:    in.Body.Body,
			Topic:   forum.Optional{Set: in.Body.Topic.Set, Value: in.Body.Topic.Value},
			GameIDs: gameKeyStringsPtr(in.Body.GameIDs),
			Tags:    in.Body.Tags,
		})
		if err != nil {
			return nil, err
		}
		return api.OK(post), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "deleteForumPost",
		Method:      http.MethodDelete,
		Path:        "/forum/posts/{postNo}",
		Summary:     "Delete a post",
		Description: "The author, or an administrator. Its comments and their replies go with it.",
		Tags:        []string{"forum"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *postNoInput) (*api.Response[api.Empty], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.forum.DeletePost(ctx, principal, in.PostNo); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listForumComments",
		Method:      http.MethodGet,
		Path:        "/forum/posts/{postNo}/comments",
		Summary:     "List a thread's comments",
		Description: "Public. Floors in order, each reply directly after the comment it " +
			"belongs to. Paged, with a generous default so an ordinary thread still " +
			"arrives in one response; count is the total in the thread.",
		Tags:   []string{"forum"},
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *listCommentsInput) (*api.Response[api.List[forum.CommentRead]], error) {
		comments, total, err := h.forum.ListComments(ctx, in.PostNo, in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(comments, total), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "createForumComment",
		Method:      http.MethodPost,
		Path:        "/forum/posts/{postNo}/comments",
		Summary:     "Comment on a post, or reply to a comment",
		Description: "Rate limited per account. A top-level comment takes the next floor " +
			"number in the thread; a reply takes none. Replies cannot be nested further.",
		Tags: []string{"forum"},
		Errors: []int{
			http.StatusUnauthorized, http.StatusNotFound,
			http.StatusTooManyRequests, http.StatusUnprocessableEntity,
		},
	}, func(ctx context.Context, in *createCommentInput) (*api.Response[forum.CommentRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if !h.commentLimiter.AllowKey(principal.ID.String()) {
			return nil, apierr.New(apierr.RateLimitExceeded,
				"you are commenting too quickly; please wait a moment")
		}

		comment, err := h.forum.CreateComment(ctx, principal, in.PostNo, in.Body.Body, in.Body.ParentID)
		if err != nil {
			return nil, err
		}
		return api.OK(comment), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "updateForumComment",
		Method:      http.MethodPatch,
		Path:        "/forum/comments/{id}",
		Summary:     "Edit a comment",
		Description: "The author, or an administrator. Comments are addressed by id rather " +
			"than by floor number, because a reply has no floor number.",
		Tags: []string{"forum"},
		Errors: []int{
			http.StatusUnauthorized, http.StatusForbidden,
			http.StatusNotFound, http.StatusUnprocessableEntity,
		},
	}, func(ctx context.Context, in *updateCommentInput) (*api.Response[forum.CommentRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		comment, err := h.forum.UpdateComment(ctx, principal, in.ID, in.Body.Body)
		if err != nil {
			return nil, err
		}
		return api.OK(comment), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "deleteForumComment",
		Method:      http.MethodDelete,
		Path:        "/forum/comments/{id}",
		Summary:     "Delete a comment",
		Description: "The author, or an administrator. Deleting a top-level comment deletes " +
			"its replies, and its floor number stays retired.",
		Tags:   []string{"forum"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *commentIDInput) (*api.Response[api.Empty], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.forum.DeleteComment(ctx, principal, in.ID); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})
}
