package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/uploads"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// avatarForm is the multipart body of an avatar upload.
//
// There is deliberately no `contentType` allow-list on the field, even though
// huma supports one and it would look like a security measure. It is not:
//
//   - The part's Content-Type is chosen by the client, so it cannot be trusted
//     to describe the bytes. Decoding them is the only real check, and the
//     pipeline does that.
//   - Enforcing it rejects legitimate clients. Go's own multipart
//     CreateFormFile labels every part application/octet-stream, as do many HTTP
//     libraries, so an allow-list of image types refuses correct uploads.
//   - The refusal is opaque. huma's per-field detail is discarded by the shared
//     error envelope, so the caller receives "validation failed" with no
//     indication of which field or why, instead of the pipeline's specific
//     message naming the supported formats.
//
// The accepted formats are therefore documented here rather than enforced here.
type avatarForm struct {
	File huma.FormFile `form:"file" required:"true" doc:"The image to use: JPEG, PNG, GIF or WebP, at least 32x32. It is cropped to a square, resized to 256 and re-encoded, which also strips any metadata such as EXIF location. The declared content type is ignored; the bytes are decoded to determine the format."`
}

type uploadAvatarInput struct {
	RawBody huma.MultipartFormFiles[avatarForm]
}

// registerAvatarRoutes mounts the avatar surface.
func (h *Handlers) registerAvatarRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "setCurrentUserAvatar",
		Method:      http.MethodPut,
		Path:        "/users/me/avatar",
		Summary:     "Replace the signed-in account's picture",
		Description: "Accepts JPEG, PNG, GIF or WebP and stores a 256x256 square. " +
			"The image is always re-encoded, so metadata including EXIF location is discarded. " +
			"Rate limited per account.",
		Tags: []string{"users"},
		// The transfer limit. It bounds the request, but not the decoded image —
		// a small file can describe an enormous canvas, so the pipeline checks
		// dimensions separately before allocating.
		MaxBodyBytes: uploads.MaxUploadBytes,
		Errors: []int{
			http.StatusUnauthorized, http.StatusRequestEntityTooLarge,
			http.StatusTooManyRequests, http.StatusUnprocessableEntity,
			http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, in *uploadAvatarInput) (*api.Response[users.UserRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		// Keyed on the account, not the address: see auth.RateLimiter.AllowKey.
		if !h.avatarLimiter.AllowKey(principal.ID.String()) {
			return nil, apierr.New(apierr.RateLimitExceeded,
				"too many avatar uploads; please wait a moment")
		}

		file := in.RawBody.Data().File
		if !file.IsSet {
			return nil, apierr.New(apierr.UploadInvalidImage, "no image was supplied")
		}
		defer file.Close()

		user, err := h.users.SetAvatar(ctx, principal.ID, file)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "deleteCurrentUserAvatar",
		Method:      http.MethodDelete,
		Path:        "/users/me/avatar",
		Summary:     "Remove the signed-in account's picture",
		Description: "Clears the account's picture. The stored object is retained, " +
			"because content-addressed objects may be shared with another account.",
		Tags:   []string{"users"},
		Errors: []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *struct{}) (*api.Response[users.UserRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		user, err := h.users.ClearAvatar(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "deleteUserAvatar",
		Method:      http.MethodDelete,
		Path:        "/users/{id}/avatar",
		Summary:     "Remove an account's picture",
		Description: "Administrators only. Exists so an unacceptable picture can be taken down " +
			"without disabling the account.",
		Tags:   []string{"users"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *userIDInput) (*api.Response[users.UserRead], error) {
		if _, err := auth.RequireSuperuser(ctx); err != nil {
			return nil, err
		}
		user, err := h.users.ClearAvatar(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})
}
