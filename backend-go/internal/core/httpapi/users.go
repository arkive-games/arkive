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
}

func (b UpdateUserBody) toInput() users.UpdateInput {
	return users.UpdateInput{
		Name:        b.Name,
		Email:       b.Email,
		Password:    b.Password,
		IsActive:    b.IsActive,
		IsSuperuser: b.IsSuperuser,
		IsVerified:  b.IsVerified,
	}
}

type updateMeInput struct {
	Body UpdateUserBody
}

type userIDInput struct {
	ID uuid.UUID `path:"id" doc:"Account identifier"`
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
		OperationID: "deleteUser",
		Method:      http.MethodDelete,
		Path:        "/users/{id}",
		Summary:     "Delete an account",
		Description: "Administrators only.",
		Tags:        []string{"users"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *userIDInput) (*api.Response[api.Empty], error) {
		if _, err := auth.RequireSuperuser(ctx); err != nil {
			return nil, err
		}
		if err := h.users.Delete(ctx, in.ID); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})
}

// writeJSON emits a body from middleware, which sits outside huma's normal
// response marshalling.
func writeJSON(ctx huma.Context, v any) {
	_ = json.NewEncoder(ctx.BodyWriter()).Encode(v)
}
