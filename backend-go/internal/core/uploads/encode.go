package uploads

import (
	"bytes"
	"fmt"
	"image"
	"image/color/palette"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"

	dwebp "github.com/deepteams/webp"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Format is a stored avatar's encoding.
//
// An avatar is written back in the format it arrived in, so a PNG stays lossless
// and a WebP stays a WebP. The alternative — normalising everything to one
// format — either discards alpha or costs an order of magnitude in bytes for a
// photograph, and it surprises whoever uploaded the file.
type Format struct {
	Name        string
	ContentType string
	Extension   string
}

var (
	FormatJPEG = Format{"jpeg", "image/jpeg", ".jpg"}
	FormatPNG  = Format{"png", "image/png", ".png"}
	FormatGIF  = Format{"gif", "image/gif", ".gif"}
	FormatWebP = Format{"webp", "image/webp", ".webp"}
)

// formatFor maps a decoder's format name to the format written back.
//
// The name comes from image.Decode, so it reflects the bytes rather than the
// filename or the client's Content-Type header, neither of which is evidence.
func formatFor(decoded string) (Format, error) {
	switch decoded {
	case "jpeg":
		return FormatJPEG, nil
	case "png":
		return FormatPNG, nil
	case "gif":
		return FormatGIF, nil
	case "webp":
		return FormatWebP, nil
	default:
		return Format{}, apierr.New(apierr.UploadInvalidImage,
			"that image format is not supported; use JPEG, PNG, GIF or WebP")
	}
}

// encode writes img in the given format.
//
// transparent selects the lossy or lossless variant where a format has both. It
// is passed in rather than recomputed because it must be measured on the source
// image: scaling into an RGBA canvas would make every image look as though it
// had an alpha channel.
func encode(img image.Image, f Format, transparent bool) ([]byte, error) {
	buf := new(bytes.Buffer)

	switch f.Name {
	case "jpeg":
		// JPEG cannot carry alpha, so a transparent source never reaches here:
		// its format would be PNG, GIF or WebP.
		if err := jpeg.Encode(buf, img, &jpeg.Options{Quality: JPEGQuality}); err != nil {
			return nil, fmt.Errorf("encode jpeg: %w", err)
		}
	case "png":
		enc := png.Encoder{CompressionLevel: png.BestCompression}
		if err := enc.Encode(buf, img); err != nil {
			return nil, fmt.Errorf("encode png: %w", err)
		}
	case "gif":
		if err := encodeGIF(buf, img); err != nil {
			return nil, err
		}
	case "webp":
		if err := encodeWebP(buf, img, transparent); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("no encoder for format %q", f.Name)
	}

	return buf.Bytes(), nil
}

// encodeGIF writes a single-frame GIF.
//
// Animation is deliberately not preserved: only the first frame is kept, which
// is what GitHub does with an animated upload. Keeping it would mean resizing
// every frame and serving a multi-megabyte object on each page that renders the
// account, for a decoration.
//
// GIF is paletted, so the resized truecolour image has to be quantised. Go's
// encoder will not do that itself, and handing it a non-paletted image fails.
func encodeGIF(buf *bytes.Buffer, img image.Image) error {
	b := img.Bounds()
	// Plan9's 256-colour palette is what image/gif itself uses for this purpose.
	// FloydSteinberg dithering hides the banding that a flat quantisation of a
	// photographic avatar would otherwise show.
	paletted := image.NewPaletted(b, palette.Plan9)
	draw.FloydSteinberg.Draw(paletted, b, img, b.Min)

	if err := gif.Encode(buf, paletted, nil); err != nil {
		return fmt.Errorf("encode gif: %w", err)
	}
	return nil
}

// encodeWebP writes a WebP, lossless when the image has alpha.
//
// This is the one encoder from outside the standard library, and it is used for
// writing only: x/image/webp remains the sole decoder of uploaded bytes, so a
// hostile file never reaches this package's third-party dependency. Here it is
// handed pixels this service already decoded and validated.
//
// Lossless for a transparent image is not just about preserving alpha: measured
// at this rendition it produces roughly half the bytes of the equivalent PNG.
// Lossy for an opaque one is about 8% larger than JPEG q85, which is accepted so
// that a .webp upload stays a .webp.
//
// A panic is converted rather than allowed to escape. The codec is young, and a
// malformed-pixel crash inside it should be a rejected upload, not a dropped
// connection.
func encodeWebP(buf *bytes.Buffer, img image.Image, transparent bool) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = apierr.New(apierr.UploadInvalidImage,
				"that image could not be re-encoded as WebP")
		}
	}()

	opts := &dwebp.EncoderOptions{
		Lossless: transparent,
		Quality:  JPEGQuality,
	}
	if err := dwebp.Encode(buf, img, opts); err != nil {
		return fmt.Errorf("encode webp: %w", err)
	}
	return nil
}
