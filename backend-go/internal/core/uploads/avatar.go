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
	"image/jpeg"
	"image/png"
	"io"

	"golang.org/x/image/draw"

	// Decoders for every format accepted. GIF decodes to its first frame, which
	// is the right reading of an animated GIF offered as an avatar.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	// WebP decodes but cannot be encoded: x/image/webp is decode-only and the
	// build sets CGO_ENABLED=0, so no cgo encoder is available either. Accepting
	// WebP and emitting PNG or JPEG is the consequence.
	_ "golang.org/x/image/webp"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

const (
	// AvatarSize is the edge length of the stored square.
	AvatarSize = 256

	// MaxUploadBytes bounds the encoded upload. The route sets the same limit,
	// so this is the backstop for a caller that forgets to.
	MaxUploadBytes = 8 << 20

	// MaxPixels bounds the *decoded* image, which is the limit that matters: a
	// 10 KB PNG can describe a 30000x30000 canvas and decode to roughly a
	// gigabyte. A byte limit alone does not protect against that, so the
	// dimensions are read from the header before any pixel buffer is allocated.
	MaxPixels = 50_000_000

	// MinDimension rejects images too small to be worth storing, which are
	// almost always a mistake or a probe.
	MinDimension = 32

	// JPEGQuality is a deliberate compromise: at 256 px the difference from 95
	// is not visible, and the file is roughly half the size.
	JPEGQuality = 85

	avatarPrefix = "avatars/"
)

// Avatar describes a stored avatar object.
type Avatar struct {
	Key         string
	ContentType string
	Size        int64
}

// StoreAvatar normalises an uploaded image and writes it.
//
// The returned key is derived from the encoded bytes, so the same picture
// uploaded by two accounts yields one object and one key. That makes the object
// immutable, which is what lets the URL be cached indefinitely — and it is why
// nothing here deletes: another account may be relying on the same key.
func StoreAvatar(ctx context.Context, store blob.Store, r io.Reader) (Avatar, error) {
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
			fmt.Sprintf("an avatar must be at most %d MiB", MaxUploadBytes>>20))
	}
	if len(raw) == 0 {
		return Avatar{}, apierr.New(apierr.UploadInvalidImage, "no image was supplied")
	}

	encoded, contentType, err := renderAvatar(raw)
	if err != nil {
		return Avatar{}, err
	}

	key := avatarPrefix + digest(encoded) + ".256" + extensionFor(contentType)
	if err := store.Put(ctx, key, bytes.NewReader(encoded), int64(len(encoded)), contentType); err != nil {
		if errors.Is(err, blob.ErrNotConfigured) {
			return Avatar{}, apierr.New(apierr.StorageUnavailable,
				"avatar storage is not configured on this server")
		}
		return Avatar{}, fmt.Errorf("store avatar: %w", err)
	}

	return Avatar{Key: key, ContentType: contentType, Size: int64(len(encoded))}, nil
}

// renderAvatar decodes, validates and re-encodes, returning the bytes to store.
//
// Split from StoreAvatar so that every validation and format decision is
// testable without a store at all.
func renderAvatar(raw []byte) (encoded []byte, contentType string, err error) {
	// The header is read first, separately, because this is the only check that
	// happens before memory proportional to the image is committed.
	cfg, _, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return nil, "", apierr.New(apierr.UploadInvalidImage,
			"that file is not an image in a supported format (JPEG, PNG, GIF or WebP)")
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, "", apierr.New(apierr.UploadInvalidImage, "that image has no area")
	}
	if int64(cfg.Width)*int64(cfg.Height) > MaxPixels {
		return nil, "", apierr.New(apierr.UploadInvalidImage,
			fmt.Sprintf("that image is %dx%d, larger than the %d megapixel limit",
				cfg.Width, cfg.Height, MaxPixels/1_000_000))
	}
	if cfg.Width < MinDimension || cfg.Height < MinDimension {
		return nil, "", apierr.New(apierr.UploadInvalidImage,
			fmt.Sprintf("an avatar must be at least %dx%d pixels", MinDimension, MinDimension))
	}

	src, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		// The header parsed but the body did not: a truncated or corrupt file.
		return nil, "", apierr.New(apierr.UploadInvalidImage, "that image could not be read")
	}

	// Transparency decides the output format, and it must be read from the
	// source: scaling into an RGBA canvas would make every image look as though
	// it had an alpha channel.
	transparent := hasTransparency(src)

	square := scaleToSquare(src, AvatarSize)

	buf := new(bytes.Buffer)
	if transparent {
		if err := png.Encode(buf, square); err != nil {
			return nil, "", fmt.Errorf("encode png: %w", err)
		}
		return buf.Bytes(), "image/png", nil
	}
	if err := jpeg.Encode(buf, square, &jpeg.Options{Quality: JPEGQuality}); err != nil {
		return nil, "", fmt.Errorf("encode jpeg: %w", err)
	}
	return buf.Bytes(), "image/jpeg", nil
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
