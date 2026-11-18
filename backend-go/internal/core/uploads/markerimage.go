package uploads

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
	"github.com/google/uuid"
)

// StoreMarkerImage uses the same bounded decode and re-encode as forum images.
// Each contribution has its own key so rolling back an upload cannot remove
// another contribution, even when the two contain identical bytes.
func StoreMarkerImage(ctx context.Context, store blob.Store, author uuid.UUID, r io.Reader) (PostImage, error) {
	if store == nil {
		return PostImage{}, apierr.New(apierr.StorageUnavailable, "image storage is not configured on this server")
	}
	raw, err := io.ReadAll(io.LimitReader(r, MaxPostImageBytes+1))
	if err != nil {
		return PostImage{}, fmt.Errorf("read marker image: %w", err)
	}
	if len(raw) > MaxPostImageBytes {
		return PostImage{}, apierr.New(apierr.RequestEntityTooBig, "an image must be at most 4 MB")
	}
	encoded, format, bounds, err := renderPostImage(raw)
	if err != nil {
		return PostImage{}, err
	}
	key := "markers/" + author.String() + "/" + uuid.NewString() + format.Extension
	if err := store.Put(ctx, key, bytes.NewReader(encoded), int64(len(encoded)), blob.PutOptions{ContentType: format.ContentType}); err != nil {
		return PostImage{}, fmt.Errorf("store marker image: %w", err)
	}
	return PostImage{Key: key, ContentType: format.ContentType, Size: int64(len(encoded)), Width: bounds.Dx(), Height: bounds.Dy()}, nil
}
