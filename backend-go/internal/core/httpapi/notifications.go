package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/notify"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
)

// NotificationPreferencesBody is a partial change; an absent field is left alone.
type NotificationPreferencesBody struct {
	Reply       *bool `json:"reply,omitempty" doc:"Replies to your posts and comments"`
	Mention     *bool `json:"mention,omitempty" doc:"Mentions of your name"`
	PostLike    *bool `json:"postLike,omitempty" doc:"Likes on your posts"`
	CommentLike *bool `json:"commentLike,omitempty" doc:"Likes on your comments"`
	Follow      *bool `json:"follow,omitempty" doc:"New followers"`
	System      *bool `json:"system,omitempty" doc:"Announcements from the site"`
}

// UnreadCount is the badge.
type UnreadCount struct {
	Unread int64 `json:"unread" doc:"How many notifications have not been read"`
}

// MarkedCount reports how many rows a bulk mark-read touched.
type MarkedCount struct {
	Marked int64 `json:"marked" doc:"How many were marked read"`
}

type listNotificationsInput struct {
	UnreadOnly bool `query:"unread" doc:"Only unread notifications"`
	Page       int  `query:"page" default:"1" minimum:"1" doc:"1-based page number"`
	PageSize   int  `query:"pageSize" default:"30" minimum:"1" maximum:"100" doc:"Notifications per page"`
}

type unreadInput struct{}

type markReadInput struct {
	ID uuid.UUID `path:"id" doc:"Notification identifier"`
}

type markAllReadInput struct{}

type readNotificationPreferencesInput struct{}

type setNotificationPreferencesInput struct {
	Body NotificationPreferencesBody
}

// RegisterNotificationRoutes mounts the inbox.
//
// Under /notifications rather than /users/me, as with roles and privacy: the frontend's
// auth package claims the /users/me surface and accounts for every operation there.
func (h *Handlers) RegisterNotificationRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "listNotifications",
		Method:      http.MethodGet,
		Path:        "/notifications",
		Summary:     "Read your inbox",
		Description: "Newest first. Nothing here is a rendered message: a notification " +
			"carries its kind and its references, and the client turns that into words, so " +
			"no display string is frozen into the database in one language.",
		Tags:   []string{"notifications"},
		Errors: []int{http.StatusUnauthorized},
	}, func(ctx context.Context, in *listNotificationsInput) (*api.Response[api.List[notify.Read]], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		list, total, err := h.notify.List(ctx, principal.ID, in.UnreadOnly, in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "getUnreadNotificationCount",
		Method:      http.MethodGet,
		Path:        "/notifications/unread",
		Summary:     "The unread badge",
		Description: "Answered by a partial index, so it does not scan an inbox that only grows.",
		Tags:        []string{"notifications"},
		Errors:      []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *unreadInput) (*api.Response[UnreadCount], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		count, err := h.notify.Unread(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(UnreadCount{Unread: count}), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "markNotificationRead",
		Method:      http.MethodPost,
		Path:        "/notifications/{id}/read",
		Summary:     "Mark one notification read",
		Description: "Scoped to your own inbox. An id that is not yours does nothing and " +
			"says nothing, rather than revealing whether it exists.",
		Tags:   []string{"notifications"},
		Errors: []int{http.StatusUnauthorized},
	}, func(ctx context.Context, in *markReadInput) (*api.Response[struct{}], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.notify.MarkRead(ctx, principal.ID, in.ID); err != nil {
			return nil, err
		}
		return api.OK(struct{}{}), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "markAllNotificationsRead",
		Method:      http.MethodPost,
		Path:        "/notifications/read",
		Summary:     "Mark everything read",
		Tags:        []string{"notifications"},
		Errors:      []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *markAllReadInput) (*api.Response[MarkedCount], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		marked, err := h.notify.MarkAllRead(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(MarkedCount{Marked: marked}), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "getNotificationPreferences",
		Method:      http.MethodGet,
		Path:        "/notifications/preferences",
		Summary:     "Read your notification preferences",
		Description: "An account that has never changed these has no stored row and every " +
			"kind is on.",
		Tags:   []string{"notifications"},
		Errors: []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *readNotificationPreferencesInput) (*api.Response[notify.Preferences], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		prefs, err := h.notify.PreferencesFor(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(prefs), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "setNotificationPreferences",
		Method:      http.MethodPatch,
		Path:        "/notifications/preferences",
		Summary:     "Change your notification preferences",
		Description: "Partial: an absent field is left alone. A kind you turn off produces " +
			"no rows at all rather than rows you cannot see, so turning it back on does " +
			"not reveal what you missed.",
		Tags:   []string{"notifications"},
		Errors: []int{http.StatusUnauthorized},
	}, func(ctx context.Context, in *setNotificationPreferencesInput) (*api.Response[notify.Preferences], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		prefs, err := h.notify.SetPreferences(ctx, principal.ID, notify.PreferencesUpdate{
			Reply:       in.Body.Reply,
			Mention:     in.Body.Mention,
			PostLike:    in.Body.PostLike,
			CommentLike: in.Body.CommentLike,
			Follow:      in.Body.Follow,
			System:      in.Body.System,
		})
		if err != nil {
			return nil, err
		}
		return api.OK(prefs), nil
	})
}
