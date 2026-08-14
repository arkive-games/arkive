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

// viewerFrom reads the caller from a *public* endpoint, where being signed in is
// optional.
//
// This is the first non-test use of PrincipalFrom. The identity middleware runs on
// the whole module router before huma and deliberately never rejects — anonymous,
// expired, forged and stale-fingerprint callers all arrive identically as "no
// principal" — so a public route can ask who is reading without becoming a
// protected one. RequireUser is the wrong tool here: it would turn the feed into a
// sign-in wall.
//
// An inactive account reads as anonymous. Its reactions are still stored, so
// reactivating restores them, but nothing about a disabled account should surface.
//
// Every response shaped by this is per-viewer and must not be cached publicly.
func viewerFrom(ctx context.Context) *uuid.UUID {
	principal, ok := auth.PrincipalFrom(ctx)
	if !ok || !principal.IsActive {
		return nil
	}
	return &principal.ID
}

// optionalBool reads a three-state query parameter: absent, "true" or "false".
//
// huma does not accept pointer query parameters, and a plain bool cannot express
// "unset" — which is a real third case here, because the featured filter must be able
// to mean "both" as well as "only featured" and "only unfeatured". The enum on the
// field is what stops anything else arriving.
func optionalBool(v string) *bool {
	switch v {
	case "true":
		t := true
		return &t
	case "false":
		f := false
		return &f
	default:
		return nil
	}
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
	// No format or pattern tag: the host allowlist is a service-layer rule, and
	// expressing half of it here would let a schema and a validator disagree about
	// what is acceptable.
	VideoURL *string `json:"videoUrl,omitempty" maxLength:"300" doc:"Link to a Bilibili or Douyin video"`
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

	// Likewise tri-state: an author removing a video and an author editing a title
	// without touching the video both send no URL.
	VideoURL api.Optional[string] `json:"videoUrl,omitzero" maxLength:"300" doc:"A value sets the video link, null removes it, omitting it leaves it unchanged"`
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

	// Requires a signed-in caller; without one it answers with an empty feed rather
	// than silently widening to everything, which is the opposite of what was asked.
	Following bool `query:"following" doc:"Only posts by accounts you follow"`

	// Scoped to the caller and no one else. There is deliberately no way to ask
	// for another account's saved posts: a bookmark is a private note about what
	// you meant to come back to, not a public list, and the parameter shape is
	// what enforces that rather than a check that could be forgotten.
	Liked      bool `query:"liked" doc:"Only posts you have liked"`
	Bookmarked bool `query:"bookmarked" doc:"Only posts you have bookmarked"`

	// Validated by the enum, so an unknown order is refused rather than silently
	// falling back to newest — a client asking for "hot" and quietly receiving "new"
	// would be impossible to diagnose from the outside.
	Sort string `query:"sort" enum:"new,hot,top" doc:"Feed order; defaults to newest first"`

	// Substring search over title and body, answered by a trigram index so it behaves
	// for Chinese as well as English.
	Q string `query:"q" maxLength:"200" doc:"Search titles and bodies"`

	// Absent means both. This is a real three-state, which is why it is a string.
	Featured string `query:"featured" enum:"true,false" doc:"Only featured posts, or only unfeatured"`

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
		// A feed narrowed to one author is that author's profile listing, which their
		// postsVisibility governs. The unfiltered feed is not: withdrawing a post from
		// the board is deletion or moderation, never a privacy setting, so a "private"
		// account's posts still appear in the global feed and at their permalinks.
		if in.AuthorUID > 0 {
			if err := h.requirePostsVisible(ctx, in.AuthorUID); err != nil {
				return nil, err
			}
		}

		posts, total, err := h.forum.ListPosts(ctx, forum.ListFilter{
			Channel:        optional(in.Channel),
			GameID:         optional(in.GameID),
			Tag:            optional(in.Tag),
			AuthorUID:      optionalUID(in.AuthorUID),
			ViewerID:       viewerFrom(ctx),
			FollowedOnly:   in.Following,
			LikedOnly:      in.Liked,
			BookmarkedOnly: in.Bookmarked,
			Sort:           forum.Sort(in.Sort),
			Query:          optional(in.Q),
			Featured:       optionalBool(in.Featured),
			Page:           in.Page,
			PageSize:       in.PageSize,
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
		Description: "Public. When the caller is signed in, `liked` and `bookmarked` " +
			"describe that account; for an anonymous reader both are false.",
		Tags:   []string{"forum"},
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *postNoInput) (*api.Response[forum.PostRead], error) {
		post, err := h.forum.PostByNo(ctx, in.PostNo, viewerFrom(ctx))
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
			Channel:  forum.Channel(in.Body.Channel),
			Title:    in.Body.Title,
			Body:     in.Body.Body,
			Topic:    in.Body.Topic,
			GameIDs:  gameKeyStrings(in.Body.GameIDs),
			Tags:     in.Body.Tags,
			VideoURL: in.Body.VideoURL,
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
			Title:    in.Body.Title,
			Body:     in.Body.Body,
			Topic:    forum.Optional{Set: in.Body.Topic.Set, Value: in.Body.Topic.Value},
			GameIDs:  gameKeyStringsPtr(in.Body.GameIDs),
			Tags:     in.Body.Tags,
			VideoURL: forum.Optional{Set: in.Body.VideoURL.Set, Value: in.Body.VideoURL.Value},
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
		comments, total, err := h.forum.ListComments(ctx, in.PostNo, in.Page, in.PageSize, viewerFrom(ctx))
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

// RegisterReactionRoutes mounts the like and bookmark surface.
//
// Registered separately from RegisterForumRoutes only to keep two long functions
// readable; both mount under /forum.
//
// PUT and DELETE rather than POST, because these are idempotent statements of an end
// state: liking twice must mean the same as liking once, which is what makes a
// double tap or a retried request harmless. Each returns the updated post or comment
// so a client can render the new count without a second round trip.
func (h *Handlers) RegisterReactionRoutes(a huma.API) {
	type postReaction struct {
		PostNo int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
	}
	type commentReaction struct {
		ID uuid.UUID `path:"id" doc:"Comment identifier"`
	}

	post := func(op string, method string, path string, summary string, set func(context.Context, auth.Principal, int64) (forum.PostRead, error)) {
		huma.Register(a, huma.Operation{
			OperationID: op,
			Method:      method,
			Path:        path,
			Summary:     summary,
			Description: "Idempotent. Returns the post as the caller now sees it.",
			Tags:        []string{"forum"},
			Errors:      []int{http.StatusUnauthorized, http.StatusNotFound},
		}, func(ctx context.Context, in *postReaction) (*api.Response[forum.PostRead], error) {
			principal, err := auth.RequireUser(ctx)
			if err != nil {
				return nil, err
			}
			out, err := set(ctx, principal, in.PostNo)
			if err != nil {
				return nil, err
			}
			return api.OK(out), nil
		})
	}

	post("likeForumPost", http.MethodPut, "/forum/posts/{postNo}/like", "Like a post",
		func(ctx context.Context, p auth.Principal, no int64) (forum.PostRead, error) {
			return h.forum.SetPostLike(ctx, p, no, true)
		})
	post("unlikeForumPost", http.MethodDelete, "/forum/posts/{postNo}/like", "Remove your like from a post",
		func(ctx context.Context, p auth.Principal, no int64) (forum.PostRead, error) {
			return h.forum.SetPostLike(ctx, p, no, false)
		})
	post("bookmarkForumPost", http.MethodPut, "/forum/posts/{postNo}/bookmark", "Bookmark a post",
		func(ctx context.Context, p auth.Principal, no int64) (forum.PostRead, error) {
			return h.forum.SetPostBookmark(ctx, p, no, true)
		})
	post("unbookmarkForumPost", http.MethodDelete, "/forum/posts/{postNo}/bookmark", "Remove a bookmark",
		func(ctx context.Context, p auth.Principal, no int64) (forum.PostRead, error) {
			return h.forum.SetPostBookmark(ctx, p, no, false)
		})

	comment := func(op string, method string, summary string, liked bool) {
		huma.Register(a, huma.Operation{
			OperationID: op,
			Method:      method,
			Path:        "/forum/comments/{id}/like",
			Summary:     summary,
			Description: "Idempotent. Returns the comment as the caller now sees it.",
			Tags:        []string{"forum"},
			Errors:      []int{http.StatusUnauthorized, http.StatusNotFound},
		}, func(ctx context.Context, in *commentReaction) (*api.Response[forum.CommentRead], error) {
			principal, err := auth.RequireUser(ctx)
			if err != nil {
				return nil, err
			}
			out, err := h.forum.SetCommentLike(ctx, principal, in.ID, liked)
			if err != nil {
				return nil, err
			}
			return api.OK(out), nil
		})
	}

	comment("likeForumComment", http.MethodPut, "Like a comment", true)
	comment("unlikeForumComment", http.MethodDelete, "Remove your like from a comment", false)

	feature := func(op string, method string, summary string, featured bool) {
		huma.Register(a, huma.Operation{
			OperationID: op,
			Method:      method,
			Path:        "/forum/posts/{postNo}/featured",
			Summary:     summary,
			Description: "Requires administering a game the post is tagged with; a post " +
				"tagged with no game is site administrators only. Not an ownership " +
				"action — an author cannot feature their own post.",
			Tags:   []string{"forum"},
			Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
		}, func(ctx context.Context, in *postReaction) (*api.Response[forum.PostRead], error) {
			principal, err := auth.RequireUser(ctx)
			if err != nil {
				return nil, err
			}
			out, err := h.forum.SetFeatured(ctx, principal, in.PostNo, featured)
			if err != nil {
				return nil, err
			}
			return api.OK(out), nil
		})
	}

	feature("featureForumPost", http.MethodPut, "Put a post on the editorial shelf", true)
	feature("unfeatureForumPost", http.MethodDelete, "Take a post off the editorial shelf", false)
}
