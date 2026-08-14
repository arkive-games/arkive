package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/forum"
	"github.com/arkive-games/arkive/backend-go/internal/core/uploads"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// postImageForm is the multipart body of a post-image upload.
//
// No contentType allow-list, for the same three reasons the avatar form documents: the
// part's declared type is chosen by the client and describes nothing, Go's own
// CreateFormFile labels every part application/octet-stream, and the refusal would arrive
// as an opaque "validation failed" instead of the pipeline's specific message.
type postImageForm struct {
	File huma.FormFile `form:"file" required:"true" doc:"The image: JPEG, PNG, GIF or WebP, at most 4 MB and at most 3000x3000 pixels. It is resized to fit 2048 on its longest side with the aspect ratio preserved, and re-encoded — which also discards metadata such as EXIF location. The declared content type is ignored; the bytes are decoded to determine the format."`
}

type attachImageInput struct {
	PostNo   int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
	Position int   `path:"position" minimum:"0" maximum:"8" doc:"Slot within the post, from 0"`
	RawBody  huma.MultipartFormFiles[postImageForm]
}

type detachImageInput struct {
	PostNo   int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
	Position int   `path:"position" minimum:"0" maximum:"8" doc:"Slot within the post"`
}

// RegisterPostImageRoutes mounts the post-image surface.
func (h *Handlers) RegisterPostImageRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "attachForumPostImage",
		Method:      http.MethodPut,
		Path:        "/forum/posts/{postNo}/images/{position}",
		Summary:     "Attach an image to a post",
		Description: "The author only. Re-attaching at the same position replaces what is " +
			"there, so correcting one slot needs no detach first. The image is always " +
			"re-encoded, so metadata including EXIF location is discarded, and an animated " +
			"GIF keeps only its first frame. Rate limited per account.",
		Tags: []string{"forum"},
		// The transfer limit. It bounds the request but not the decoded image — a small
		// file can describe an enormous canvas — so the pipeline checks dimensions from
		// the header before allocating any pixels.
		MaxBodyBytes: uploads.MaxPostImageBytes,
		Errors: []int{
			http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound,
			http.StatusRequestEntityTooLarge, http.StatusTooManyRequests,
			http.StatusUnprocessableEntity, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, in *attachImageInput) (*api.Response[forum.ImageRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		// The same limiter the avatar route uses, keyed on the account: an image upload
		// costs the same decode-and-re-encode work, so it belongs under the same budget
		// rather than a second one nobody would think to configure.
		if !h.avatarLimiter.AllowKey(principal.ID.String()) {
			return nil, apierr.New(apierr.RateLimitExceeded,
				"too many image uploads; please wait a moment")
		}

		file := in.RawBody.Data().File
		if !file.IsSet {
			return nil, apierr.New(apierr.UploadInvalidImage, "no image was supplied")
		}
		defer file.Close()

		// The object key is prefixed with the uploader's public number, which is what
		// makes reclamation a scoped list over one account.
		uid, err := h.users.UIDByID(ctx, principal.ID)
		if err != nil {
			return nil, err
		}

		image, err := h.forum.AttachImage(ctx, principal, in.PostNo, in.Position, uid, file)
		if err != nil {
			return nil, err
		}
		return api.OK(image), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "detachForumPostImage",
		Method:      http.MethodDelete,
		Path:        "/forum/posts/{postNo}/images/{position}",
		Summary:     "Remove an image from a post",
		Description: "The author only. Idempotent: a slot that carries nothing is already " +
			"in the state the caller asked for.",
		Tags:   []string{"forum"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *detachImageInput) (*api.Response[struct{}], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.forum.DetachImage(ctx, principal, in.PostNo, in.Position); err != nil {
			return nil, err
		}
		return api.OK(struct{}{}), nil
	})
}
