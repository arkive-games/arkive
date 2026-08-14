package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/roles"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
)

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

// RoleBody names the role being granted or revoked.
type RoleBody struct {
	Role roles.Role `json:"role" enum:"game_admin,game_moderator" doc:"The role to grant"`
}

// gameKeyPath is the path parameter form of a game key.
//
// Unlike the feed's gameId query parameter, this one *is* enumerated: it addresses a
// game rather than filtering by one, so an unknown key is a wrong URL and should say
// so rather than answering with an empty list.
type gameKeyPath = GameKey

type listGameRolesInput struct {
	Game gameKeyPath `path:"game" doc:"The game whose staff to list"`
}

type grantRoleInput struct {
	Game gameKeyPath `path:"game" doc:"The game the role applies to"`
	UID  int64       `path:"uid" minimum:"1" doc:"Public number of the account to appoint"`
	Body RoleBody
}

// revokeRoleInput takes the role as a query parameter rather than a body. A DELETE
// body is legal but not universally forwarded — proxies and some client libraries
// drop it — and losing it here would silently turn "revoke moderator" into a request
// naming no role at all.
type revokeRoleInput struct {
	Game gameKeyPath `path:"game" doc:"The game the role applies to"`
	UID  int64       `path:"uid" minimum:"1" doc:"Public number of the account to remove"`
	Role roles.Role  `query:"role" required:"true" enum:"game_admin,game_moderator" doc:"The role to remove"`
}

type listOwnRolesInput struct{}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// RegisterRoleRoutes mounts the /roles surface.
func (h *Handlers) RegisterRoleRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "listGameRoles",
		Method:      http.MethodGet,
		Path:        "/roles/games/{game}",
		Summary:     "List a game's staff",
		Description: "Public. Administrators before moderators, oldest grant first. " +
			"This is what lets a game's page name the people who run it instead of " +
			"showing placeholders.",
		Tags:   []string{"roles"},
		Errors: []int{http.StatusNotFound, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *listGameRolesInput) (*api.Response[api.List[roles.GrantRead]], error) {
		grants, err := h.roles.ForGame(ctx, string(in.Game))
		if err != nil {
			return nil, err
		}
		return api.OKList(grants, int64(len(grants))), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "grantGameRole",
		Method:      http.MethodPut,
		Path:        "/roles/games/{game}/{uid}",
		Summary:     "Appoint a game's staff",
		Description: "Site administrators may appoint either role. A game administrator " +
			"may appoint moderators for their own game only, and cannot appoint another " +
			"administrator. Idempotent: granting a role already held succeeds.",
		Tags:   []string{"roles"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *grantRoleInput) (*api.Response[roles.GrantRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		grant, err := h.roles.Grant(ctx, principal, in.UID, in.Body.Role, string(in.Game))
		if err != nil {
			return nil, err
		}
		return api.OK(grant), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "revokeGameRole",
		Method:      http.MethodDelete,
		Path:        "/roles/games/{game}/{uid}",
		Summary:     "Remove a game's staff",
		Description: "The same permissions as granting. Revoking a role nobody holds " +
			"succeeds: the caller asked for an end state, and that state already holds.",
		Tags:   []string{"roles"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *revokeRoleInput) (*api.Response[api.Empty], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.roles.Revoke(ctx, principal, in.UID, in.Role, string(in.Game)); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listOwnRoles",
		Method:      http.MethodGet,
		// Under /roles rather than /users/me, deliberately. The frontend's auth
		// package owns the /users/me surface and asserts it handles or explicitly
		// declines every operation there; roles are not an auth concern, so nesting
		// this under the account would have meant filing a false exemption in that
		// guard. Keeping the roles surface cohesive is the better answer.
		Path:    "/roles/me",
		Summary: "List your own roles",
		Description: "Every game-scoped role the signed-in account holds. Site-wide " +
			"administration is not a grant and appears on the account itself, as isSuperuser.",
		Tags:   []string{"roles"},
		Errors: []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *listOwnRolesInput) (*api.Response[api.List[roles.GrantRead]], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		grants, err := h.roles.ForUser(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OKList(grants, int64(len(grants))), nil
	})
}
