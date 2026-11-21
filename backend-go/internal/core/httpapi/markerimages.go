package httpapi

import (
	"context"
	"io"
	"net/http"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/comments"
	"github.com/arkive-games/arkive/backend-go/internal/core/uploads"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
)

type markerImageForm struct {
	File huma.FormFile `form:"file" required:"true" doc:"JPEG, PNG, GIF or WebP, up to 4 MB. Re-encoded to discard metadata."`
}

type markerCommentImagesForm struct {
	Text     string          `form:"body" minLength:"1" maxLength:"2000"`
	ParentID string          `form:"parentId" required:"false" doc:"Optional top-level comment to reply to"`
	Files    []huma.FormFile `form:"files" required:"true" minItems:"1" maxItems:"3"`
}

type uploadMarkerImageInput struct {
	Game    MarkerGameKey `query:"game" required:"true"`
	Map     string        `query:"map" required:"true" pattern:"^[A-Za-z0-9_-]{1,64}$"`
	Marker  string        `query:"marker" required:"true" pattern:"^[A-Za-z0-9_-]{1,128}$"`
	RawBody huma.MultipartFormFiles[markerImageForm]
}

type createMarkerCommentImagesInput struct {
	Game    MarkerGameKey `query:"game" required:"true"`
	Map     string        `query:"map" required:"true" pattern:"^[A-Za-z0-9_-]{1,64}$"`
	Marker  string        `query:"marker" required:"true" pattern:"^[A-Za-z0-9_-]{1,128}$"`
	RawBody huma.MultipartFormFiles[markerCommentImagesForm]
}

type reviewMarkerImageInput struct {
	ID   uuid.UUID `path:"id"`
	Body struct {
		Publish bool `json:"publish" doc:"Approve for public display, or reject/withdraw it"`
	}
}

// RegisterMarkerImageRoutes persists contributions in the existing object store.
// Uploads stay pending until a game moderator or site administrator approves them.
func (h *Handlers) RegisterMarkerImageRoutes(a huma.API) {
	huma.Register(a, huma.Operation{OperationID: "listMarkerImages", Method: http.MethodGet, Path: "/map-markers/images", Summary: "Read a marker's images", Tags: []string{"comments"}},
		func(ctx context.Context, in *listMarkerCommentsInput) (*api.Response[api.List[comments.MarkerImageRead]], error) {
			var viewer *auth.Principal
			if p, ok := auth.PrincipalFrom(ctx); ok {
				viewer = &p
			}
			rows, count, err := h.markerComments.ListImages(ctx, comments.Target{GameKey: in.Game, MapID: in.Map, MarkerID: in.Marker}, viewer, in.Page, in.PageSize)
			if err != nil {
				return nil, err
			}
			return api.OKList(rows, count), nil
		})
	huma.Register(a, huma.Operation{OperationID: "uploadMarkerImage", Method: http.MethodPost, Path: "/map-markers/images", Summary: "Submit a player image", Description: "New or restricted accounts enter the unified moderation queue; trusted accounts publish directly.", Tags: []string{"comments"}, MaxBodyBytes: uploads.MaxPostImageBytes + (1 << 20), Errors: []int{401, 413, 422, 429, 503}},
		func(ctx context.Context, in *uploadMarkerImageInput) (*api.Response[comments.MarkerImageRead], error) {
			p, err := h.markerImageWriter(ctx)
			if err != nil {
				return nil, err
			}
			file := in.RawBody.Data().File
			if !file.IsSet {
				return nil, apierr.New(apierr.UploadInvalidImage, "no image was supplied")
			}
			defer file.Close()
			row, err := h.markerComments.UploadGalleryImage(ctx, p, comments.Target{GameKey: string(in.Game), MapID: in.Map, MarkerID: in.Marker}, file)
			if err != nil {
				return nil, err
			}
			return api.OK(row), nil
		})
	huma.Register(a, huma.Operation{OperationID: "createMarkerCommentWithImages", Method: http.MethodPost, Path: "/map-markers/comments/with-images", Summary: "Submit a comment with up to three images", Description: "The text and every image form one complete submission. New or restricted accounts publish only after review; trusted accounts publish directly. A failed upload publishes neither a partial comment nor partial attachments.", Tags: []string{"comments"}, MaxBodyBytes: 3*uploads.MaxPostImageBytes + (1 << 20), Errors: []int{401, 413, 422, 429, 503}},
		func(ctx context.Context, in *createMarkerCommentImagesInput) (*api.Response[comments.MarkerCommentWithImagesRead], error) {
			p, err := h.markerImageWriter(ctx)
			if err != nil {
				return nil, err
			}
			if !h.commentLimiter.AllowKey(p.ID.String()) {
				return nil, apierr.New(apierr.RateLimitExceeded, "you are commenting too quickly; please wait a moment")
			}
			data := in.RawBody.Data()
			files := make([]io.Reader, 0, len(data.Files))
			for _, file := range data.Files {
				defer file.Close()
				files = append(files, file)
			}
			var parent *uuid.UUID
			if data.ParentID != "" {
				id, err := uuid.Parse(data.ParentID)
				if err != nil {
					return nil, apierr.New(apierr.Validation, "parentId is not a comment identifier")
				}
				parent = &id
			}
			row, err := h.markerComments.CreateWithImages(ctx, p, comments.CreateInput{GameKey: string(in.Game), MapID: in.Map, MarkerID: in.Marker, Body: data.Text, ParentID: parent}, files)
			if err != nil {
				return nil, err
			}
			return api.OK(row), nil
		})
	huma.Register(a, huma.Operation{OperationID: "listPendingMarkerImages", Method: http.MethodGet, Path: "/map-markers/moderation/images", Summary: "Player images awaiting your review", Tags: []string{"moderation"}, Errors: []int{401, 403}},
		func(ctx context.Context, in *moderationQueueInput) (*api.Response[api.List[comments.MarkerImageRead]], error) {
			p, err := auth.RequireUser(ctx)
			if err != nil {
				return nil, err
			}
			rows, count, err := h.markerComments.PendingImages(ctx, p, in.Page, in.PageSize)
			if err != nil {
				return nil, err
			}
			return api.OKList(rows, count), nil
		})
	huma.Register(a, huma.Operation{OperationID: "reviewMarkerImage", Method: http.MethodPut, Path: "/map-markers/images/{id}/review", Summary: "Approve or reject a player image", Tags: []string{"moderation"}, Errors: []int{401, 403, 404}},
		func(ctx context.Context, in *reviewMarkerImageInput) (*api.Response[comments.MarkerImageRead], error) {
			p, err := auth.RequireUser(ctx)
			if err != nil {
				return nil, err
			}
			row, err := h.markerComments.ReviewImage(ctx, p, in.ID, in.Body.Publish)
			if err != nil {
				return nil, err
			}
			return api.OK(row), nil
		})
}

func (h *Handlers) markerImageWriter(ctx context.Context) (auth.Principal, error) {
	p, err := auth.RequireUser(ctx)
	if err != nil {
		return p, err
	}
	if !h.avatarLimiter.AllowKey(p.ID.String()) {
		return p, apierr.New(apierr.RateLimitExceeded, "too many image uploads; please wait a moment")
	}
	return p, nil
}
