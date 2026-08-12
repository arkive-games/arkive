// Package uploads turns bytes a user submitted into a stored, normalised image.
//
// It owns the whole pipeline — decode, validate, crop, resize, encode, address —
// and depends on blob.Store rather than any particular storage, so all of it is
// testable without a server.
//
// The pipeline exists for three reasons beyond making pictures square. It
// bounds what a client can make the server allocate; it strips metadata,
// including the GPS coordinates a phone writes into a photograph; and it means
// the bytes served to browsers were produced by this code rather than uploaded
// by a stranger.
package uploads

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"io"
	"strconv"

	"golang.org/x/image/draw"

	// Decoders for every format accepted. GIF decodes to its first frame, which
	// is the right reading of an animated GIF offered as an avatar.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	// x/image/webp is decode-only, and it is deliberately the *only* decoder of
	// uploaded bytes. WebP is written back by a third-party encoder in encode.go,
	// which never sees a file — only pixels this package has already decoded and
	// validated. See the avatar design for why that asymmetry is the point.
	_ "golang.org/x/image/webp"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

const (
	// AvatarSize is the edge length of the stored square.
	AvatarSize = 256

	// MaxUploadBytes bounds the encoded upload. The route sets the same limit,
	// so this is the backstop for a caller that forgets to.
	//
	// One mebibyte, matching what GitHub accepts for an avatar. Beyond being a
	// well-trodden number, it has a property the previous 8 MiB did not: it fits
	// under the reverse proxy's own body limit, so the message a user sees for an
	// oversized file is this service's rather than nginx's error page.
	MaxUploadBytes = 1 << 20

	// MaxDimension bounds each side of the *decoded* image, which is the limit
	// that matters: a 10 KB PNG can describe a 30000x30000 canvas and decode to
	// roughly a gigabyte, so a byte limit alone is no protection. The dimensions
	// are read from the header before any pixel buffer is allocated.
	//
	// 3000 matches GitHub. It also caps a decoded frame at 9 megapixels, or about
	// 36 MB of RGBA, which is what actually bounds the allocation — so there is no
	// separate pixel-count limit to keep in step with this one.
	MaxDimension = 3000

	// RecommendedDimension is advice, not a rule: an image around this size gives
	// the best result once cropped and resized, and it is what GitHub suggests.
	// Anything from MinDimension to MaxDimension is accepted.
	RecommendedDimension = 500

	// MinDimension rejects images too small to be worth storing, which are
	// almost always a mistake or a probe.
	MinDimension = 32

	// JPEGQuality is a deliberate compromise: at 256 px the difference from 95
	// is not visible, and the file is roughly half the size. It also serves as
	// the quality for lossy WebP.
	JPEGQuality = 85

	// UploadPrefix is where an account's own uploads live. Every object under
	// UploadPrefix + uid belongs to exactly one account, which is what makes
	// reclaiming superseded avatars a scoped delete rather than a bucket-wide
	// garbage collection with a grace period.
	UploadPrefix = "avatars/u/"

	// PresetPrefix is where the shared preset avatars live. They are written once
	// by the seed command and referenced by many accounts.
	PresetPrefix = "avatars/presets/"
)

// UserUploadPrefix is the prefix owned by one account.
func UserUploadPrefix(uid int64) string {
	return UploadPrefix + strconv.FormatInt(uid, 10) + "/"
}

// Avatar describes a stored avatar object.
type Avatar struct {
	Key         string
	ContentType string
	Size        int64
	Format      string
}

// StoreAvatar normalises an uploaded image and writes it under the account's own
// prefix.
//
// The key is UserUploadPrefix(uid) + digest + extension. Two properties follow
// from that shape and both matter:
//
//   - The digest makes the object immutable, so its URL can be cached for a year
//     behind a CDN. A key of avatars/u/<uid> alone would be a stable URL with
//     mutable content, which cannot be cached for long without serving a stale
//     picture.
//   - The prefix belongs to exactly one account, so the previous avatar can be
//     removed by deleting everything else under it. There is no sharing between
//     accounts to reference-count, and therefore no bucket-wide sweep and no
//     grace period. Orphans cannot accumulate.
//
// The stale objects are removed after the row is updated, by the caller, because
// only the caller knows the write was committed.
func StoreAvatar(ctx context.Context, store blob.Store, uid int64, r io.Reader) (Avatar, error) {
	if store == nil {
		return Avatar{}, apierr.New(apierr.StorageUnavailable,
			"avatar storage is not configured on this server")
	}

	// One extra byte distinguishes "exactly at the limit" from "over it".
	raw, err := io.ReadAll(io.LimitReader(r, MaxUploadBytes+1))
	if err != nil {
		return Avatar{}, fmt.Errorf("read upload: %w", err)
	}
	if len(raw) > MaxUploadBytes {
		return Avatar{}, apierr.New(apierr.RequestEntityTooBig,
			fmt.Sprintf("an avatar must be at most %d MB", MaxUploadBytes>>20))
	}
	if len(raw) == 0 {
		return Avatar{}, apierr.New(apierr.UploadInvalidImage, "no image was supplied")
	}

	encoded, format, err := renderAvatar(raw)
	if err != nil {
		return Avatar{}, err
	}

	key := UserUploadPrefix(uid) + digest(encoded) + format.Extension
	// Not mutable: the key carries the digest of these very bytes.
	putOpts := blob.PutOptions{ContentType: format.ContentType}
	if err := store.Put(ctx, key, bytes.NewReader(encoded), int64(len(encoded)), putOpts); err != nil {
		if errors.Is(err, blob.ErrNotConfigured) {
			return Avatar{}, apierr.New(apierr.StorageUnavailable,
				"avatar storage is not configured on this server")
		}
		return Avatar{}, fmt.Errorf("store avatar: %w", err)
	}

	return Avatar{
		Key:         key,
		ContentType: format.ContentType,
		Size:        int64(len(encoded)),
		Format:      format.Name,
	}, nil
}

// RemoveSupersededUploads deletes every object under the account's prefix except
// keep.
//
// This is what makes orphaned avatars structurally impossible rather than a job
// to be scheduled. It runs after the row is committed, so a failure here leaves
// an unreferenced object that the next upload will clean up — the operation is
// idempotent and self-healing, which is why its error is logged rather than
// failing the request.
func RemoveSupersededUploads(ctx context.Context, store blob.Store, uid int64, keep string) error {
	if store == nil {
		return nil
	}
	keys, err := store.List(ctx, UserUploadPrefix(uid))
	if err != nil {
		return fmt.Errorf("list previous avatars: %w", err)
	}
	for _, key := range keys {
		if key == keep {
			continue
		}
		if err := store.Delete(ctx, key); err != nil {
			return fmt.Errorf("delete superseded avatar %q: %w", key, err)
		}
	}
	return nil
}

// RemoveAllUploads deletes everything an account has ever uploaded, for use when
// the account itself goes away.
func RemoveAllUploads(ctx context.Context, store blob.Store, uid int64) error {
	return RemoveSupersededUploads(ctx, store, uid, "")
}

// renderAvatar decodes, validates and re-encodes, returning the bytes to store
// and the format they are in.
//
// Split from StoreAvatar so that every validation and format decision is
// testable without a store at all.
func renderAvatar(raw []byte) (encoded []byte, format Format, err error) {
	// The header is read first, separately, because this is the only check that
	// happens before memory proportional to the image is committed.
	cfg, decodedFormat, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return nil, Format{}, apierr.New(apierr.UploadInvalidImage,
			"that file is not an image in a supported format (JPEG, PNG, GIF or WebP)")
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, Format{}, apierr.New(apierr.UploadInvalidImage, "that image has no area")
	}
	if cfg.Width > MaxDimension || cfg.Height > MaxDimension {
		return nil, Format{}, apierr.New(apierr.UploadInvalidImage,
			fmt.Sprintf("that image is %dx%d; an avatar must be at most %dx%d pixels, "+
				"and around %dx%d gives the best result",
				cfg.Width, cfg.Height, MaxDimension, MaxDimension,
				RecommendedDimension, RecommendedDimension))
	}
	if cfg.Width < MinDimension || cfg.Height < MinDimension {
		return nil, Format{}, apierr.New(apierr.UploadInvalidImage,
			fmt.Sprintf("an avatar must be at least %dx%d pixels", MinDimension, MinDimension))
	}

	// The format is taken from the decoder, so it describes the bytes rather than
	// the filename or the client's Content-Type header. Neither of those is
	// evidence, and both are trivially forged.
	format, err = formatFor(decodedFormat)
	if err != nil {
		return nil, Format{}, err
	}

	src, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		// The header parsed but the body did not: a truncated or corrupt file.
		return nil, Format{}, apierr.New(apierr.UploadInvalidImage, "that image could not be read")
	}

	// Transparency no longer decides the *format* — the source does — but it still
	// selects the lossy or lossless variant of WebP. It has to be measured on the
	// source: scaling into an RGBA canvas would make every image look as though it
	// had an alpha channel.
	transparent := hasTransparency(src)

	square := scaleToSquare(src, AvatarSize)

	encoded, err = encode(square, format, transparent)
	if err != nil {
		return nil, Format{}, err
	}
	return encoded, format, nil
}

// scaleToSquare centre-crops to a square and resizes to size.
//
// Cropping before scaling, rather than squashing, keeps faces the right shape —
// the alternative distorts every avatar that was not already square.
func scaleToSquare(src image.Image, size int) image.Image {
	b := src.Bounds()
	edge := min(b.Dx(), b.Dy())
	crop := image.Rect(0, 0, edge, edge).
		Add(image.Pt(b.Min.X+(b.Dx()-edge)/2, b.Min.Y+(b.Dy()-edge)/2))

	dst := image.NewNRGBA(image.Rect(0, 0, size, size))
	// CatmullRom over ApproxBiLinear: an avatar is downscaled once and then
	// shown at many sizes, so the sharper result is worth the extra work.
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, crop, draw.Src, nil)
	return dst
}

// hasTransparency reports whether any pixel is not fully opaque.
func hasTransparency(img image.Image) bool {
	// Most standard image types answer this without a full scan, and the ones
	// that cannot be transparent at all (YCbCr from a JPEG, Gray, CMYK) answer
	// immediately.
	if o, ok := img.(interface{ Opaque() bool }); ok {
		return !o.Opaque()
	}
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if _, _, _, a := img.At(x, y).RGBA(); a != 0xffff {
				return true
			}
		}
	}
	return false
}

// digest addresses an object by its content.
//
// base64url without padding keeps the key short and free of characters that
// would need escaping in a URL path.
func digest(b []byte) string {
	sum := sha256.Sum256(b)
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func extensionFor(contentType string) string {
	if contentType == "image/png" {
		return ".png"
	}
	return ".jpg"
}
