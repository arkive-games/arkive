package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/comments"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// CreateMarkerCommentBody is a new comment under a map marker.
//
// The three location keys travel in the body rather than the path. They are the
// target of the comment, not a container this API owns: markers live in a data
// artifact, so there is no /markers/{…} resource to nest under, and path segments
// that exist only to be copied into a row are segments every handler has to
// remember to compare against it.
type CreateMarkerCommentBody struct {
	Game     GameKey    `json:"game" doc:"The game the marker belongs to"`
	Map      string     `json:"map" pattern:"^[A-Za-z0-9_-]{1,64}$" doc:"The map the marker is on"`
	Marker   string     `json:"marker" pattern:"^[A-Za-z0-9-]{1,40}$" doc:"The marker to comment on"`
	Body     string     `json:"body" minLength:"1" maxLength:"2000" doc:"Raw markdown"`
	ParentID *uuid.UUID `json:"parentId,omitempty" doc:"Reply to this comment; omit for a top-level comment"`
}

// UpdateMarkerCommentBody is an edit. Unlike a forum edit, the target never changes,
// so the body carries only what can change.
type UpdateMarkerCommentBody struct {
	Body string `json:"body" minLength:"1" maxLength:"2000" doc:"Raw markdown"`
}

// MarkerCommentLikeBody is the end state, not a toggle.
type MarkerCommentLikeBody struct {
	Liked bool `json:"liked" doc:"true to like, false to unlike. Both are idempotent."`
}

// MarkerCommentReportBody is a complaint about a marker comment.
type MarkerCommentReportBody struct {
	Reason string  `json:"reason" enum:"spam,abuse,offtopic,illegal,other" doc:"Why you are reporting it"`
	Detail *string `json:"detail,omitempty" maxLength:"2000" doc:"Anything you want to add"`
}

// MarkerCommentHideBody carries the moderator's reason.
type MarkerCommentHideBody struct {
	Reason *string `json:"reason,omitempty" maxLength:"500" doc:"Why it is being hidden"`
}

type listMarkerCommentsInput struct {
	Game     string `query:"game" required:"true" doc:"The game the marker belongs to"`
	Map      string `query:"map" required:"true" pattern:"^[A-Za-z0-9_-]{1,64}$" doc:"The map the marker is on"`
	Marker   string `query:"marker" required:"true" pattern:"^[A-Za-z0-9-]{1,40}$" doc:"The marker whose thread to read"`
	Sort     string `query:"sort" default:"latest" enum:"latest,popular" doc:"latest is newest first; popular is most-liked first"`
	Page     int    `query:"page" default:"1" minimum:"1" doc:"1-based page number"`
	PageSize int    `query:"pageSize" default:"20" minimum:"1" maximum:"50" doc:"Comments per page"`
}

type createMarkerCommentInput struct {
	Body CreateMarkerCommentBody
}

type markerCommentRepliesInput struct {
	ID       uuid.UUID `path:"id" doc:"The top-level comment whose replies to read"`
	Page     int       `query:"page" default:"1" minimum:"1" doc:"1-based page number"`
	PageSize int       `query:"pageSize" default:"20" minimum:"1" maximum:"50" doc:"Replies per page"`
}

type updateMarkerCommentInput struct {
	ID   uuid.UUID `path:"id" doc:"Comment identifier"`
	Body UpdateMarkerCommentBody
}

type markerCommentIDInput struct {
	ID uuid.UUID `path:"id" doc:"Comment identifier"`
}

type likeMarkerCommentInput struct {
	ID   uuid.UUID `path:"id" doc:"Comment identifier"`
	Body MarkerCommentLikeBody
}

type reportMarkerCommentInput struct {
	ID   uuid.UUID `path:"id" doc:"Comment identifier"`
	Body MarkerCommentReportBody
}

// hideMarkerCommentInput carries an optional body, because the reason is optional
// and requiring an object just to omit its only field would be a 400 for doing
// nothing wrong.
type hideMarkerCommentInput struct {
	ID   uuid.UUID `path:"id" doc:"Comment identifier"`
	Body *MarkerCommentHideBody
}

// RegisterMarkerCommentRoutes mounts comments attached to map markers.
//
// Paths are flat under /map-markers rather than nested under /markers/{game}/{map}/
// {marker}: a comment is addressed by its own id for every write, and only the
// collection needs to know where it lives. The prefix is its own word for the same
// reason /forum is — the API does not own markers, so it must not publish a /markers
// root implying it does.
func (h *Handlers) RegisterMarkerCommentRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "listMarkerComments",
		Method:      http.MethodGet,
		Path:        "/map-markers/comments",
		Summary:     "Read a marker's comments",
		Description: "Public. Top-level comments only, newest first by default; each carries " +
			"its reply count and whether the reader liked it. Replies are fetched from " +
			"the comment's own endpoint, because a marker can carry a long thread and the " +
			"drawer only expands one at a time.",
		Tags:   []string{"comments"},
		Errors: []int{http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *listMarkerCommentsInput) (*api.Response[api.List[comments.MarkerCommentRead]], error) {
		target := comments.Target{GameKey: in.Game, MapID: in.Map, MarkerID: in.Marker}
		list, total, err := h.markerComments.List(ctx, target, comments.Sort(in.Sort), in.Page, in.PageSize, viewerID(ctx))
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "createMarkerComment",
		Method:      http.MethodPost,
		Path:        "/map-markers/comments",
		Summary:     "Comment on a marker",
		Description: "Signed in only. Published immediately: there is no pre-publication " +
			"review, and moderation happens after the fact. The marker is checked against " +
			"the game's data artifact, so a comment cannot be opened under a marker that " +
			"does not exist — except when the artifact is unreachable, which accepts the " +
			"comment rather than blaming the writer for it.",
		Tags:   []string{"comments"},
		Errors: []int{http.StatusUnauthorized, http.StatusTooManyRequests, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *createMarkerCommentInput) (*api.Response[comments.MarkerCommentRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		// The forum's comment budget, deliberately: the abuse being throttled is the
		// same abuse, and a second budget would only double it.
		if !h.commentLimiter.AllowKey(principal.ID.String()) {
			return nil, apierr.New(apierr.RateLimitExceeded,
				"you are commenting too quickly; please wait a moment")
		}
		comment, err := h.markerComments.Create(ctx, principal, comments.CreateInput{
			GameKey:  string(in.Body.Game),
			MapID:    in.Body.Map,
			MarkerID: in.Body.Marker,
			Body:     in.Body.Body,
			ParentID: in.Body.ParentID,
		})
		if err != nil {
			return nil, err
		}
		return api.OK(comment), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listMarkerCommentReplies",
		Method:      http.MethodGet,
		Path:        "/map-markers/comments/{id}/replies",
		Summary:     "Read a comment's replies",
		Description: "Public, oldest first: a reply reads in the order the conversation " +
			"happened, unlike the top-level list where the best answer should float.",
		Tags:   []string{"comments"},
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *markerCommentRepliesInput) (*api.Response[api.List[comments.MarkerCommentRead]], error) {
		list, total, err := h.markerComments.Replies(ctx, in.ID, in.Page, in.PageSize, viewerID(ctx))
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "updateMarkerComment",
		Method:      http.MethodPatch,
		Path:        "/map-markers/comments/{id}",
		Summary:     "Edit your comment",
		Description: "The author's own comment, and only theirs. A hidden comment answers 404 " +
			"to its author too, rather than revealing that it exists but is withheld.",
		Tags:   []string{"comments"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *updateMarkerCommentInput) (*api.Response[comments.MarkerCommentRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		comment, err := h.markerComments.Update(ctx, principal, in.ID, in.Body.Body)
		if err != nil {
			return nil, err
		}
		return api.OK(comment), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "deleteMarkerComment",
		Method:      http.MethodDelete,
		Path:        "/map-markers/comments/{id}",
		Summary:     "Delete your comment",
		Description: "The author's own comment. Deleting a top-level comment takes its replies " +
			"with it, which is what the cascade says and what a reader expects: a thread " +
			"hanging under a heading nobody can see is worse than losing it.",
		Tags:   []string{"comments"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *markerCommentIDInput) (*api.Response[api.Empty], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.markerComments.Delete(ctx, principal, in.ID); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "likeMarkerComment",
		Method:      http.MethodPut,
		Path:        "/map-markers/comments/{id}/like",
		Summary:     "Like or unlike a comment",
		Description: "Idempotent, so a double tap or a retried request means what it says. " +
			"Returns the updated comment so a client can render the new count without a " +
			"second round trip. The author is notified on the like and never on the unlike.",
		Tags:   []string{"comments"},
		Errors: []int{http.StatusUnauthorized, http.StatusNotFound},
	}, func(ctx context.Context, in *likeMarkerCommentInput) (*api.Response[comments.MarkerCommentRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		comment, err := h.markerComments.SetLike(ctx, principal, in.ID, in.Body.Liked)
		if err != nil {
			return nil, err
		}
		return api.OK(comment), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "reportMarkerComment",
		Method:      http.MethodPost,
		Path:        "/map-markers/comments/{id}/report",
		Summary:     "Report a comment",
		Description: "Any signed-in account may report. Reports land in the forum's own " +
			"moderation queue, so a moderator watches one inbox. Reporting the same comment " +
			"twice updates your report rather than filing a second.",
		Tags:   []string{"comments"},
		Errors: []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *reportMarkerCommentInput) (*api.Response[comments.MarkerCommentRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		comment, err := h.markerComments.Report(ctx, principal, in.ID, in.Body.Reason, in.Body.Detail)
		if err != nil {
			return nil, err
		}
		return api.OK(comment), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "hideMarkerComment",
		Method:      http.MethodPut,
		Path:        "/map-markers/comments/{id}/hidden",
		Summary:     "Hide a comment",
		Description: "Moderator action, reversible and attributed. Requires moderating the " +
			"game the comment's marker belongs to. A hidden comment answers 404 to every " +
			"reader, its author included.",
		Tags:   []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *hideMarkerCommentInput) (*api.Response[api.Empty], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		var reason *string
		if in.Body != nil {
			reason = in.Body.Reason
		}
		if err := h.markerComments.SetHidden(ctx, principal, in.ID, true, reason); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "unhideMarkerComment",
		Method:      http.MethodDelete,
		Path:        "/map-markers/comments/{id}/hidden",
		Summary:     "Restore a hidden comment",
		Description: "The counterpart to hide. Without it a hidden comment could be restored " +
			"only by someone who already knew its id.",
		Tags:   []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *markerCommentIDInput) (*api.Response[api.Empty], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.markerComments.SetHidden(ctx, principal, in.ID, false, nil); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listHiddenMarkerComments",
		Method:      http.MethodGet,
		Path:        "/map-markers/moderation/hidden-comments",
		Summary:     "Hidden comments you may restore",
		Description: "Moderator only, scoped to the games you moderate. Most recently hidden first.",
		Tags:        []string{"moderation"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden},
	}, func(ctx context.Context, in *moderationQueueInput) (*api.Response[api.List[comments.MarkerHiddenRead]], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		list, total, err := h.markerComments.HiddenComments(ctx, principal, in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})
}

// viewerID is the caller's id when signed in, and nil when anonymous.
//
// A nil viewer is not an error on any read: comments are public, and the only thing
// the viewer changes is whether each comment reports itself as liked.
func viewerID(ctx context.Context) *uuid.UUID {
	p, ok := auth.PrincipalFrom(ctx)
	if !ok {
		return nil
	}
	return &p.ID
}
