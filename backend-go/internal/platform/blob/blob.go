// Package blob stores immutable objects in S3-compatible storage.
//
// It knows about buckets, keys and public URLs, and nothing about what the
// objects mean. That is what lets it sit in platform: the avatar feature, and
// the comment and feedback images that follow it, all depend on this rather than
// the other way round.
//
// Callers receive a Store, so every test above this package runs against
// NewMemory instead of a server.
package blob

import (
	"context"
	"errors"
	"io"
)

// ErrNotConfigured is returned by Store methods when object storage has no
// configuration.
//
// It exists so that a developer working on something unrelated is not forced to
// run MinIO: in debug mode the service starts without storage and only the
// upload routes fail, with this error, rather than the whole process refusing to
// boot. Outside debug, configuration is validated at startup and this is
// unreachable.
var ErrNotConfigured = errors.New("object storage is not configured")

// Store holds immutable objects.
//
// There is no Get. Objects are served to browsers straight from the bucket or a
// CDN in front of it, so the backend writes but never reads them back — adding a
// Get would invite a proxy route that defeats that.
type Store interface {
	// Put writes an object. Objects are content-addressed by their callers, so
	// writing an existing key with identical bytes is normal and must succeed
	// rather than conflict.
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error

	// Delete removes an object. Nothing in the avatar flow calls it — objects
	// are shared between accounts by content, so deleting one on change could
	// blank somebody else's picture — but reclaiming orphans later needs it.
	Delete(ctx context.Context, key string) error

	// PublicURL renders the durable address a browser fetches the object from.
	PublicURL(key string) string
}
