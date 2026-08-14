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
		Description: "The tallies are subject to the account's activityVisibility and come " +
			"back null when withheld — a tally that stayed public would disclose exactly " +
			"what a private follower list hides. `following` is always answered, because it " +
			"describes the signed-in caller rather than the account being read; it is false " +
			"for an anonymous reader.",
		Tags:   []string{"social"},
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *followInput) (*api.Response[social.Counts], error) {
		counts, err := h.social.CountsForUID(ctx, in.UID, viewerFrom(ctx))
		if err != nil {
			return nil, err
		}
		// Withhold the tallies rather than the whole response. "Do I follow this
		// account" is the caller's own fact, and a profile that cannot learn it cannot
		// draw its follow button correctly — a worse outcome than the disclosure the
		// gate prevents, and one nothing else recovers from.
		visible, err := h.activityVisible(ctx, in.UID)
		if err != nil {
			return nil, err
		}
		if !visible {
			counts = counts.WithoutTallies()
		}
		return api.OK(counts), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listFollowers",
		Method:      http.MethodGet,
		Path:        "/users/{uid}/followers",
		Summary:     "List an account's followers",
		Description: "Newest first. Subject to the account's activityVisibility, so a " +
			"withheld list answers 404 rather than 403 — a 403 would confirm the account " +
			"exists and is withholding.",
		Tags:   []string{"social"},
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *followListInput) (*api.Response[api.List[social.FollowRead]], error) {
		if err := h.requireActivityVisible(ctx, in.UID); err != nil {
			return nil, err
		}
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
		Description: "Newest first. Subject to the account's activityVisibility.",
		Tags:        []string{"social"},
		Errors:      []int{http.StatusNotFound},
	}, func(ctx context.Context, in *followListInput) (*api.Response[api.List[social.FollowRead]], error) {
		if err := h.requireActivityVisible(ctx, in.UID); err != nil {
			return nil, err
		}
		list, total, err := h.social.Following(ctx, in.UID, in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})
}

// requireActivityVisible gates the follow lists on the owner's activity setting.
//
// The check lives here rather than inside `social` because answering it needs both the
// settings and the follow graph, and putting it in either package would make the two
// mutually dependent. See the privacy package's doc comment.
func (h *Handlers) requireActivityVisible(ctx context.Context, uid int64) error {
	ownerID, err := h.users.IDByUID(ctx, uid)
	if err != nil {
		return err
	}
	settings, err := h.privacy.For(ctx, ownerID)
	if err != nil {
		return err
	}
	return h.privacy.Require(ctx, ownerID, viewerFrom(ctx), settings.Activity, "account")
}

// activityVisible is requireActivityVisible as a question rather than a guard, for the
// tally route, which withholds part of a response instead of refusing all of it.
func (h *Handlers) activityVisible(ctx context.Context, uid int64) (bool, error) {
	ownerID, err := h.users.IDByUID(ctx, uid)
	if err != nil {
		return false, err
	}
	settings, err := h.privacy.For(ctx, ownerID)
	if err != nil {
		return false, err
	}
	return h.privacy.Allows(ctx, ownerID, viewerFrom(ctx), settings.Activity)
}
