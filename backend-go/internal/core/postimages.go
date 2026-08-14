package core

import (
	"context"
	"io"

	"github.com/arkive-games/arkive/backend-go/internal/core/forum"
	"github.com/arkive-games/arkive/backend-go/internal/core/uploads"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

// postImageStore adapts the upload pipeline and the blob store to what the forum needs.
//
// The forum asks for three things — store an image, delete one, name one — and this is
// what keeps it from importing the whole upload package or knowing that object storage
// exists. Composition here rather than in `uploads` because the pipeline is a function of
// (store, uid, reader) and has no business holding a store of its own.
type postImageStore struct {
	blobs blob.Store
}

// StorePostImage validates, re-encodes and stores one image, returning its key and the
// dimensions it was stored at.
func (s postImageStore) StorePostImage(ctx context.Context, uid int64, r io.Reader) (string, int, int, error) {
	stored, err := uploads.StorePostImage(ctx, s.blobs, uid, r)
	if err != nil {
		return "", 0, 0, err
	}
	return stored.Key, stored.Width, stored.Height, nil
}

func (s postImageStore) Delete(ctx context.Context, key string) error {
	return s.blobs.Delete(ctx, key)
}

func (s postImageStore) PublicURL(key string) string {
	return s.blobs.PublicURL(key)
}

// newPostImageStore returns nil when storage is unconfigured, which the forum reads as
// "attaching is unavailable" rather than as a reason to refuse to start. Returning a typed
// nil would defeat that, so the nil is returned as the interface type.
func newPostImageStore(blobs blob.Store) forum.ImageStore {
	if blobs == nil {
		return nil
	}
	return postImageStore{blobs: blobs}
}

var _ forum.ImageStore = postImageStore{}
