package uploads

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"io"

	"golang.org/x/image/draw"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

const (
	// MaxPostImageBytes bounds the encoded upload. Larger than an avatar because a
	// screenshot of a map is the point of the feature, and still small enough to sit
	// under the reverse proxy's own body limit so the message a user sees is this
	// service's rather than nginx's error page.
	MaxPostImageBytes = 4 << 20

	// MaxPostImageEdge is the longest side of the stored image. Unlike an avatar there
	// is no crop: a screenshot cropped to a square is a screenshot ruined, so the
	// aspect ratio is preserved and only the scale is bounded.
	MaxPostImageEdge = 2048

	// MinPostImageEdge rejects images too small to be worth storing, which are almost
	// always a mistake or a probe.
	MinPostImageEdge = 64

	// PostImagePrefix is where a post's images live, keyed on the *author* rather than
	// the post.
	//
	// blob.Store has no copy or move — only Put, Delete, List and PublicURL — so an
	// image cannot be uploaded to a draft prefix and relocated once the post exists.
	// Keying on the account means an upload can precede the post it belongs to, and it
	// makes reclaiming orphans a scoped List over one account's prefix rather than a
	// bucket-wide sweep. Same reasoning as avatars.
	PostImagePrefix = "forum/u/"
)

// PostImageUploadPrefix is where one account's post images live.
func PostImageUploadPrefix(uid int64) string {
	return fmt.Sprintf("%s%d/", PostImagePrefix, uid)
}

// PostImage is a stored post image.
type PostImage struct {
	Key           string
	ContentType   string
	Size          int64
	Width, Height int
}

// StorePostImage validates, re-encodes and stores one image for a post.
//
// The re-encode is not optional and not only about size: decoding to pixels and encoding
// fresh is what strips EXIF, which matters more here than for an avatar because a
// screenshot may carry a location. There is deliberately no "already small enough" fast
// path, since that would be a way for the original container to survive.
func StorePostImage(ctx context.Context, store blob.Store, uid int64, r io.Reader) (PostImage, error) {
	if store == nil {
		return PostImage{}, apierr.New(apierr.StorageUnavailable,
			"image storage is not configured on this server")
	}

	// One extra byte distinguishes "exactly at the limit" from "over it".
	raw, err := io.ReadAll(io.LimitReader(r, MaxPostImageBytes+1))
	if err != nil {
		return PostImage{}, fmt.Errorf("read upload: %w", err)
	}
	if len(raw) > MaxPostImageBytes {
		return PostImage{}, apierr.New(apierr.RequestEntityTooBig,
			fmt.Sprintf("an image must be at most %d MB", MaxPostImageBytes>>20))
	}
	if len(raw) == 0 {
		return PostImage{}, apierr.New(apierr.UploadInvalidImage, "no image was supplied")
	}

	encoded, format, bounds, err := renderPostImage(raw)
	if err != nil {
		return PostImage{}, err
	}

	key := PostImageUploadPrefix(uid) + digest(encoded) + format.Extension
	putOpts := blob.PutOptions{ContentType: format.ContentType}
	if err := store.Put(ctx, key, bytes.NewReader(encoded), int64(len(encoded)), putOpts); err != nil {
		if errors.Is(err, blob.ErrNotConfigured) {
			return PostImage{}, apierr.New(apierr.StorageUnavailable,
				"image storage is not configured on this server")
		}
		return PostImage{}, fmt.Errorf("store image: %w", err)
	}

	return PostImage{
		Key:         key,
		ContentType: format.ContentType,
		Size:        int64(len(encoded)),
		Width:       bounds.Dx(),
		Height:      bounds.Dy(),
	}, nil
}

// renderPostImage checks, decodes and re-encodes an upload, bounded by the longest edge.
func renderPostImage(raw []byte) (encoded []byte, format Format, bounds image.Rectangle, err error) {
	// The header first and separately: this is the only check that happens before
	// memory proportional to the image is committed. A 10 KB PNG can describe a
	// 30000x30000 canvas.
	cfg, decodedFormat, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return nil, Format{}, image.Rectangle{}, apierr.New(apierr.UploadInvalidImage,
			"that file is not an image in a supported format (JPEG, PNG, GIF or WebP)")
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, Format{}, image.Rectangle{}, apierr.New(apierr.UploadInvalidImage,
			"that image has no area")
	}
	if cfg.Width > MaxDimension || cfg.Height > MaxDimension {
		return nil, Format{}, image.Rectangle{}, apierr.New(apierr.UploadInvalidImage,
			fmt.Sprintf("that image is %dx%d; at most %dx%d pixels is accepted",
				cfg.Width, cfg.Height, MaxDimension, MaxDimension))
	}
	if cfg.Width < MinPostImageEdge && cfg.Height < MinPostImageEdge {
		return nil, Format{}, image.Rectangle{}, apierr.New(apierr.UploadInvalidImage,
			fmt.Sprintf("an image must be at least %d pixels on one side", MinPostImageEdge))
	}

	// From the decoder, so it describes the bytes rather than the filename or the
	// client's Content-Type — neither of which is evidence.
	format, err = formatFor(decodedFormat)
	if err != nil {
		return nil, Format{}, image.Rectangle{}, err
	}

	src, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, Format{}, image.Rectangle{}, apierr.New(apierr.UploadInvalidImage,
			"that image could not be read")
	}

	// Measured on the source: scaling into an RGBA canvas would make every image look
	// as though it had an alpha channel.
	transparent := hasTransparency(src)

	scaled := scaleToFit(src, MaxPostImageEdge)

	encoded, err = encode(scaled, format, transparent)
	if err != nil {
		return nil, Format{}, image.Rectangle{}, err
	}
	return encoded, format, scaled.Bounds(), nil
}

// scaleToFit shrinks an image so its longest edge is at most edge, preserving the aspect
// ratio. An image already within the bound is still copied into a fresh canvas, because
// returning the source would let its original container survive the re-encode.
func scaleToFit(src image.Image, edge int) image.Image {
	b := src.Bounds()
	width, height := b.Dx(), b.Dy()

	if width > edge || height > edge {
		if width >= height {
			height = height * edge / width
			width = edge
		} else {
			width = width * edge / height
			height = edge
		}
		// Integer division can floor a very thin image to nothing.
		width = max(width, 1)
		height = max(height, 1)
	}

	dst := image.NewNRGBA(image.Rect(0, 0, width, height))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Src, nil)
	return dst
}
