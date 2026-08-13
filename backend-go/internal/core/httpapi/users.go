package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
)

// UpdateUserBody is a partial account edit.
//
// Every field is optional, and a field that is absent is left unchanged. The
// three privileged flags are accepted only from an administrator; for anyone
// else they are ignored rather than rejected, so a user cannot promote
// themselves by adding a field to a request against their own profile.
type UpdateUserBody struct {
	Name     *string `json:"name,omitempty" minLength:"1" maxLength:"64" doc:"New display name"`
	Email    *string `json:"email,omitempty" format:"email" maxLength:"320" doc:"New email address; changing it clears the verified flag"`
	Password *string `json:"password,omitempty" minLength:"8" maxLength:"1024" doc:"New password"`

	IsActive    *bool `json:"isActive,omitempty" doc:"Administrators only; ignored otherwise"`
	IsSuperuser *bool `json:"isSuperuser,omitempty" doc:"Administrators only; ignored otherwise"`
	IsVerified  *bool `json:"isVerified,omitempty" doc:"Administrators only; ignored otherwise"`

	// Three states, not two: omit the field to leave any existing number alone,
	// send null to revoke it, send a number to assign or move it. `omitzero`
	// rather than `omitempty` because the field is a struct, and without it huma
	// would treat it as required.
	SpecialUID api.Optional[int32] `json:"specialUid,omitzero" minimum:"0" maximum:"9999" doc:"Administrators only; ignored otherwise. A number assigns or moves the vanity uid, null revokes it, omitting the field leaves it unchanged."`
}

func (b UpdateUserBody) toInput() users.UpdateInput {
	return users.UpdateInput{
		Name:        b.Name,
		Email:       b.Email,
		Password:    b.Password,
		IsActive:    b.IsActive,
		IsSuperuser: b.IsSuperuser,
		IsVerified:  b.IsVerified,
		SpecialUID:  b.SpecialUID,
	}
}

type updateMeInput struct {
	Body UpdateUserBody
}

type userIDInput struct {
	ID uuid.UUID `path:"id" doc:"Account identifier"`
}

// userUIDInput takes either kind of public account number. There is no upper
// bound tag because real uids grow without limit; the lower bound rejects
// negatives, which no account can hold.
type userUIDInput struct {
	UID int64 `path:"uid" minimum:"0" doc:"A permanent account number (10000 or above) or a special uid (below 10000)"`
}

type updateUserInput struct {
	ID   uuid.UUID `path:"id" doc:"Account identifier"`
	Body UpdateUserBody
}

type searchUsersInput struct {
	// huma does not accept pointer query parameters, so an omitted filter
	// arrives as the empty string and is normalised to "no filter" below.
	Name     string `query:"name" doc:"Case-insensitive fragment of the display name"`
	Email    string `query:"email" doc:"Case-insensitive fragment of the email address"`
	Page     int    `query:"page" default:"1" minimum:"1" doc:"1-based page number"`
	PageSize int    `query:"pageSize" default:"20" minimum:"1" maximum:"100" doc:"Records per page"`
}

// optional turns an absent query filter into a nil pointer, so that "not
// supplied" and "supplied as empty" cannot be confused in the query.
func optional(v string) *string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return &v
}

// RegisterUserRoutes mounts the /users surface.
//
// The static paths are registered before the parameterised one so that
// /users/search and /users/become-superuser are never captured by /users/{id}.
func (h *Handlers) RegisterUserRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "getCurrentUser",
		Method:      http.MethodGet,
		Path:        "/users/me",
		Summary:     "Get the signed-in account",
		Tags:        []string{"users"},
		Errors:      []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *struct{}) (*api.Response[users.UserRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		user, err := h.users.ByID(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "updateCurrentUser",
		Method:      http.MethodPatch,
		Path:        "/users/me",
		Summary:     "Update the signed-in account",
		Tags:        []string{"users"},
		Errors:      []int{http.StatusUnauthorized, http.StatusConflict, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *updateMeInput) (*api.Response[users.UserRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		user, err := h.users.Update(ctx, principal.ID, in.Body.toInput(), false)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "searchUsers",
		Method:      http.MethodGet,
		Path:        "/users/search",
		Summary:     "Search accounts",
		Description: "Administrators only. With both filters set, an account matching either one is returned.",
		Tags:        []string{"users"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden},
	}, func(ctx context.Context, in *searchUsersInput) (*api.Response[api.List[users.UserRead]], error) {
		if _, err := auth.RequireSuperuser(ctx); err != nil {
			return nil, err
		}
		results, total, err := h.users.Search(ctx, optional(in.Name), optional(in.Email), in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(results, total), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "becomeSuperuser",
		Method:      http.MethodPost,
		Path:        "/users/become-superuser",
		Summary:     "Claim the first administrator slot",
		Description: "Promotes the signed-in account, but only while no administrator exists. " +
			"It is the bootstrap for a fresh deployment and fails once anyone holds the role.",
		Tags:   []string{"users"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden},
	}, func(ctx context.Context, _ *struct{}) (*api.Response[users.UserRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		user, err := h.users.BecomeSuperuser(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	h.registerAvatarRoutes(a)

	huma.Register(a, huma.Operation{
		OperationID: "getUserByUID",
		Method:      http.MethodGet,
		Path:        "/users/uid/{uid}",
		Summary:     "Get an account by its public number",
		Description: "Public. Resolves either the permanent uid or a special uid, and returns " +
			"only publicly visible fields. Permanent links should use the uid, since a " +
			"special uid can be reassigned. Deactivated accounts are reported as not found.",
		Tags:   []string{"users"},
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *userUIDInput) (*api.Response[users.UserPublic], error) {
		user, err := h.users.ByAnyUID(ctx, in.UID)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "getUser",
		Method:      http.MethodGet,
		Path:        "/users/{id}",
		Summary:     "Get an account by id",
		Description: "Administrators only.",
		Tags:        []string{"users"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *userIDInput) (*api.Response[users.UserRead], error) {
		if _, err := auth.RequireSuperuser(ctx); err != nil {
			return nil, err
		}
		user, err := h.users.ByID(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "updateUser",
		Method:      http.MethodPatch,
		Path:        "/users/{id}",
		Summary:     "Update an account by id",
		Description: "Administrators only. Unlike /users/me this honours the privileged flags.",
		Tags:        []string{"users"},
		Errors: []int{
			http.StatusUnauthorized, http.StatusForbidden,
			http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity,
		},
	}, func(ctx context.Context, in *updateUserInput) (*api.Response[users.UserRead], error) {
		if _, err := auth.RequireSuperuser(ctx); err != nil {
			return nil, err
		}
		user, err := h.users.Update(ctx, in.ID, in.Body.toInput(), true)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "deactivateUser",
		Method:      http.MethodPost,
		Path:        "/users/{id}/deactivate",
		Summary:     "Deactivate an account",
		Description: "Administrators only. The account stops being able to sign in, but the " +
			"row is kept so that everything attributed to it — comments, contributions, " +
			"marker credit — keeps its author. There is deliberately no endpoint that " +
			"deletes an account.",
		Tags:   []string{"users"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *userIDInput) (*api.Response[users.UserRead], error) {
		if _, err := auth.RequireSuperuser(ctx); err != nil {
			return nil, err
		}
		// The "last administrator" rule lives in the service, not here: PATCH
		// /users/{id} reaches the same fields, so a check in this handler alone
		// was simply walked around.
		user, err := h.users.Deactivate(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "reactivateUser",
		Method:      http.MethodPost,
		Path:        "/users/{id}/reactivate",
		Summary:     "Restore a deactivated account",
		Description: "Administrators only. Deactivation is reversible precisely because " +
			"nothing was destroyed.",
		Tags:   []string{"users"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *userIDInput) (*api.Response[users.UserRead], error) {
		if _, err := auth.RequireSuperuser(ctx); err != nil {
			return nil, err
		}
		user, err := h.users.Reactivate(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})
}

// writeJSON emits a body from middleware, which sits outside huma's normal
// response marshalling.
func writeJSON(ctx huma.Context, v any) {
	_ = json.NewEncoder(ctx.BodyWriter()).Encode(v)
}
