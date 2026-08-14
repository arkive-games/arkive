package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/social"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
)

// Accounts are addressed by public number throughout this surface. The uuid stays
// internal, exactly as it does for the forum's author filter.
type followInput struct {
	UID int64 `path:"uid" minimum:"1" doc:"Public number of the account"`
}

type followListInput struct {
	UID      int64 `path:"uid" minimum:"1" doc:"Public number of the account"`
	Page     int   `query:"page" default:"1" minimum:"1" doc:"1-based page number"`
	PageSize int   `query:"pageSize" default:"50" minimum:"1" maximum:"200" doc:"Accounts per page"`
}

// RegisterSocialRoutes mounts the follow surface.
//
// These sit under /users/{uid} rather than /social, because they are addressed by
// account and read as part of a profile. Note that this is outside the /users/me
// prefix the frontend's auth package claims, so it does not land in that package's
// coverage slice — which is correct, since following is not an auth concern.
func (h *Handlers) RegisterSocialRoutes(a huma.API) {
	set := func(op string, method string, summary string, following bool) {
		huma.Register(a, huma.Operation{
			OperationID: op,
			Method:      method,
			Path:        "/users/{uid}/follow",
			Summary:     summary,
			Description: "Idempotent. Returns the target's follow tally as the caller now " +
				"sees it. Following yourself is refused.",
			Tags:   []string{"social"},
			Errors: []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusUnprocessableEntity},
		}, func(ctx context.Context, in *followInput) (*api.Response[social.Counts], error) {
			principal, err := auth.RequireUser(ctx)
			if err != nil {
				return nil, err
			}
			counts, err := h.social.SetFollow(ctx, principal.ID, in.UID, following)
			if err != nil {
				return nil, err
			}
			return api.OK(counts), nil
		})
	}

	set("followUser", http.MethodPut, "Follow an account", true)
	set("unfollowUser", http.MethodDelete, "Unfollow an account", false)

	huma.Register(a, huma.Operation{
		OperationID: "getFollowCounts",
		Method:      http.MethodGet,
		Path:        "/users/{uid}/follow",
		Summary:     "Get an account's follow tally",
		Description: "Public. `following` describes the signed-in caller and is false " +
			"for an anonymous reader.",
		Tags:   []string{"social"},
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *followInput) (*api.Response[social.Counts], error) {
		counts, err := h.social.CountsForUID(ctx, in.UID, viewerFrom(ctx))
		if err != nil {
			return nil, err
		}
		return api.OK(counts), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listFollowers",
		Method:      http.MethodGet,
		Path:        "/users/{uid}/followers",
		Summary:     "List an account's followers",
		Description: "Public. Newest first.",
		Tags:        []string{"social"},
		Errors:      []int{http.StatusNotFound},
	}, func(ctx context.Context, in *followListInput) (*api.Response[api.List[social.FollowRead]], error) {
		list, total, err := h.social.Followers(ctx, in.UID, in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listFollowing",
		Method:      http.MethodGet,
		Path:        "/users/{uid}/following",
		Summary:     "List the accounts an account follows",
		Description: "Public. Newest first.",
		Tags:        []string{"social"},
		Errors:      []int{http.StatusNotFound},
	}, func(ctx context.Context, in *followListInput) (*api.Response[api.List[social.FollowRead]], error) {
		list, total, err := h.social.Following(ctx, in.UID, in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})
}
