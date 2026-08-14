package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/privacy"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// PrivacyBody is a partial change; an absent field leaves that setting alone.
type PrivacyBody struct {
	Profile  *privacy.Level `json:"profileVisibility,omitempty" enum:"public,followers,private" doc:"Who may see your profile"`
	Posts    *privacy.Level `json:"postsVisibility,omitempty" enum:"public,followers,private" doc:"Who may see your posts listed on your profile"`
	Activity *privacy.Level `json:"activityVisibility,omitempty" enum:"public,followers,private" doc:"Who may see your follows and reactions"`
}

type readPrivacyInput struct{}

type setPrivacyInput struct {
	Body PrivacyBody
}

// requirePostsVisible gates an author-filtered feed on that author's posts setting.
//
// An unknown author is left to the service, which answers an empty feed rather than an
// error — a stale profile link should not make the feed endpoint fail.
func (h *Handlers) requirePostsVisible(ctx context.Context, uid int64) error {
	ownerID, err := h.users.IDByUID(ctx, uid)
	if err != nil {
		if e, ok := apierr.As(err); ok && e.ErrorCode == apierr.UserNotFound {
			return nil
		}
		return err
	}
	settings, err := h.privacy.For(ctx, ownerID)
	if err != nil {
		return err
	}
	return h.privacy.Require(ctx, ownerID, viewerFrom(ctx), settings.Posts, "account")
}

// RegisterPrivacyRoutes mounts the visibility surface.
//
// Under /privacy rather than /users/me, for the same reason the roles surface is:
// the frontend's auth package claims /users/me and asserts it accounts for every
// operation there, and privacy is not an auth concern.
func (h *Handlers) RegisterPrivacyRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "getOwnPrivacy",
		Method:      http.MethodGet,
		Path:        "/privacy/me",
		Summary:     "Read your visibility settings",
		Description: "An account that has never changed these has no stored row and reads " +
			"as public throughout.",
		Tags:   []string{"privacy"},
		Errors: []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *readPrivacyInput) (*api.Response[privacy.Settings], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		settings, err := h.privacy.For(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(settings), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "setOwnPrivacy",
		Method:      http.MethodPatch,
		Path:        "/privacy/me",
		Summary:     "Change your visibility settings",
		Description: "Partial: an absent field is left alone. Note that postsVisibility " +
			"governs the listing on your profile, not whether your posts are published — " +
			"they stay in the global feed and at their permalinks either way.",
		Tags:   []string{"privacy"},
		Errors: []int{http.StatusUnauthorized, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *setPrivacyInput) (*api.Response[privacy.Settings], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		settings, err := h.privacy.Set(ctx, principal.ID, privacy.Update{
			Profile:  in.Body.Profile,
			Posts:    in.Body.Posts,
			Activity: in.Body.Activity,
		})
		if err != nil {
			return nil, err
		}
		return api.OK(settings), nil
	})
}
