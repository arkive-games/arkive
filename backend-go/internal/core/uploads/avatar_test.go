package uploads

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/http"
	"strings"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

func opaquePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 0x40, A: 0xff})
		}
	}
	buf := new(bytes.Buffer)
	if err := png.Encode(buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func transparentPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			a := uint8(0xff)
			// A transparent corner, as a logo or cut-out avatar would have.
			if x < w/2 && y < h/2 {
				a = 0
			}
			img.Set(x, y, color.RGBA{R: 0xd0, G: 0x20, B: 0x60, A: a})
		}
	}
	buf := new(bytes.Buffer)
	if err := png.Encode(buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func opaqueJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{R: 0x20, G: uint8(x % 256), B: 0x90, A: 0xff})
		}
	}
	buf := new(bytes.Buffer)
	if err := jpeg.Encode(buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func animatedGIF(t *testing.T, w, h, frames int) []byte {
	t.Helper()
	pal := color.Palette{color.RGBA{A: 0xff}, color.RGBA{R: 0xff, A: 0xff}, color.RGBA{B: 0xff, A: 0xff}}
	g := &gif.GIF{}
	for i := range frames {
		f := image.NewPaletted(image.Rect(0, 0, w, h), pal)
		for y := range h {
			for x := range w {
				f.SetColorIndex(x, y, uint8((i+1)%len(pal)))
			}
		}
		g.Image = append(g.Image, f)
		g.Delay = append(g.Delay, 10)
	}
	buf := new(bytes.Buffer)
	if err := gif.EncodeAll(buf, g); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// decompressionBomb builds a small PNG describing an enormous canvas.
//
// A single colour compresses to almost nothing, so the encoded file is tiny
// while the decoded pixels would be many gigabytes. This is the input a byte
// limit alone does not stop.
func decompressionBomb(t *testing.T) []byte {
	t.Helper()
	const edge = 20000 // 400 million pixels, eight times the limit
	img := image.NewGray(image.Rect(0, 0, edge, edge))
	buf := new(bytes.Buffer)
	if err := png.Encode(buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func decode(t *testing.T, raw []byte) image.Image {
	t.Helper()
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("stored bytes do not decode: %v", err)
	}
	return img
}

// testUID stands in for an account number. It appears in every key, so a test
// asserting the key shape is also asserting the account scoping.
const testUID int64 = 10042

func mustStore(t *testing.T, store blob.Store, raw []byte) Avatar {
	t.Helper()
	a, err := StoreAvatar(context.Background(), store, testUID, bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("StoreAvatar: %v", err)
	}
	return a
}

// ---------------------------------------------------------------------------
// Output shape and format
// ---------------------------------------------------------------------------

func TestStoredAvatarIsAlwaysA256Square(t *testing.T) {
	for _, tc := range []struct {
		name string
		raw  []byte
	}{
		{"wide", opaquePNG(t, 800, 300)},
		{"tall", opaquePNG(t, 300, 900)},
		{"already square", opaquePNG(t, 512, 512)},
		{"smaller than the target", opaquePNG(t, 64, 64)},
		{"exactly the minimum", opaquePNG(t, MinDimension, MinDimension)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := blob.NewMemory()
			a := mustStore(t, store, tc.raw)

			obj, ok := store.Get(a.Key)
			if !ok {
				t.Fatalf("key %q was not written", a.Key)
			}
			b := decode(t, obj.Body).Bounds()
			if b.Dx() != AvatarSize || b.Dy() != AvatarSize {
				t.Errorf("stored %dx%d, want %dx%d", b.Dx(), b.Dy(), AvatarSize, AvatarSize)
			}
			if a.Size != int64(len(obj.Body)) {
				t.Errorf("reported size %d but stored %d bytes", a.Size, len(obj.Body))
			}
		})
	}
}

// The stored avatar keeps the format it was uploaded in. Normalising everything
// to one format either discards alpha or costs an order of magnitude in bytes,
// and it surprises whoever chose the file.
func TestUploadedFormatIsPreserved(t *testing.T) {
	for _, tc := range []struct {
		name     string
		raw      []byte
		wantType string
		wantExt  string
	}{
		{"transparent PNG stays PNG", transparentPNG(t, 400, 400), "image/png", ".png"},
		{"opaque PNG stays PNG rather than becoming JPEG", opaquePNG(t, 400, 400), "image/png", ".png"},
		{"JPEG stays JPEG", opaqueJPEG(t, 400, 400), "image/jpeg", ".jpg"},
		{"GIF stays GIF", animatedGIF(t, 200, 200, 3), "image/gif", ".gif"},
		{"opaque WebP stays WebP", webpFixture(t, 300, 300, false), "image/webp", ".webp"},
		{"transparent WebP stays WebP", webpFixture(t, 300, 300, true), "image/webp", ".webp"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := blob.NewMemory()
			a := mustStore(t, store, tc.raw)

			if a.ContentType != tc.wantType {
				t.Errorf("content type = %q, want %q", a.ContentType, tc.wantType)
			}
			if !strings.HasSuffix(a.Key, tc.wantExt) {
				t.Errorf("key %q does not end in %q", a.Key, tc.wantExt)
			}
			obj, _ := store.Get(a.Key)
			if obj.ContentType != tc.wantType {
				t.Errorf("stored content type = %q, want %q", obj.ContentType, tc.wantType)
			}
			// The bytes must really be in that format, not merely labelled.
			_, format, err := image.DecodeConfig(bytes.NewReader(obj.Body))
			if err != nil {
				t.Fatalf("stored object does not decode: %v", err)
			}
			wantFormat := strings.TrimPrefix(tc.wantType, "image/")
			if format != wantFormat {
				t.Errorf("stored bytes are %s, want %s", format, wantFormat)
			}
			if a.Format != wantFormat {
				t.Errorf("reported format %q, want %q", a.Format, wantFormat)
			}
		})
	}
}

func TestTransparencySurvivesTheResize(t *testing.T) {
	store := blob.NewMemory()
	a := mustStore(t, store, transparentPNG(t, 400, 400))
	obj, _ := store.Get(a.Key)

	img := decode(t, obj.Body)
	if !hasTransparency(img) {
		t.Error("the stored avatar is fully opaque, so the alpha channel was lost")
	}
	// The transparent quarter was top-left in the source and must still be.
	if _, _, _, alpha := img.At(4, 4).RGBA(); alpha != 0 {
		t.Errorf("top-left alpha = %d, want 0", alpha)
	}
}

func TestAnimatedGIFStoresItsFirstFrame(t *testing.T) {
	store := blob.NewMemory()
	a := mustStore(t, store, animatedGIF(t, 200, 200, 4))

	obj, ok := store.Get(a.Key)
	if !ok {
		t.Fatal("nothing was stored")
	}
	b := decode(t, obj.Body).Bounds()
	if b.Dx() != AvatarSize || b.Dy() != AvatarSize {
		t.Errorf("stored %dx%d, want a %d square", b.Dx(), b.Dy(), AvatarSize)
	}
	// The format is preserved, so it is still a GIF. What matters is that a
	// multi-frame source became a single frame rather than staying animated.
	if _, format, _ := image.DecodeConfig(bytes.NewReader(obj.Body)); format != "gif" {
		t.Errorf("an uploaded GIF was stored as %s; the format must be preserved", format)
	}
	frames, err := gif.DecodeAll(bytes.NewReader(obj.Body))
	if err != nil {
		t.Fatalf("stored GIF does not decode: %v", err)
	}
	if len(frames.Image) != 1 {
		t.Errorf("stored GIF has %d frames, want 1: animation must be flattened", len(frames.Image))
	}
}

// ---------------------------------------------------------------------------
// Content addressing
// ---------------------------------------------------------------------------

func TestIdenticalUploadsByOneAccountProduceOneObject(t *testing.T) {
	store := blob.NewMemory()
	raw := opaquePNG(t, 400, 400)

	first := mustStore(t, store, raw)
	second := mustStore(t, store, raw)

	if first.Key != second.Key {
		t.Errorf("keys differ for identical input: %q vs %q", first.Key, second.Key)
	}
	if store.Len() != 1 {
		t.Errorf("stored %d objects for the same picture, want 1: %v", store.Len(), store.Keys())
	}
}

func TestDifferentImagesProduceDifferentKeys(t *testing.T) {
	store := blob.NewMemory()
	a := mustStore(t, store, opaquePNG(t, 400, 400))
	b := mustStore(t, store, opaqueJPEG(t, 400, 400))

	if a.Key == b.Key {
		t.Errorf("different pictures share the key %q", a.Key)
	}
	if store.Len() != 2 {
		t.Errorf("stored %d objects, want 2", store.Len())
	}
}

func TestKeyIsScopedToTheAccountAndURLSafe(t *testing.T) {
	store := blob.NewMemory()
	a := mustStore(t, store, opaquePNG(t, 400, 400))

	want := UserUploadPrefix(testUID)
	if !strings.HasPrefix(a.Key, want) {
		t.Errorf("key %q is not under the account's own prefix %q", a.Key, want)
	}
	// A prefix belonging to exactly one account is what makes reclaiming a
	// superseded avatar a scoped delete instead of a bucket-wide sweep.
	if strings.Count(a.Key, "/") != 3 {
		t.Errorf("key %q does not have the shape avatars/u/<uid>/<digest><ext>", a.Key)
	}
	// The key travels in a URL path, so it must need no escaping.
	for _, bad := range []string{"+", "=", " ", "?", "#", "%"} {
		if strings.Contains(a.Key, bad) {
			t.Errorf("key %q contains %q, which needs URL escaping", a.Key, bad)
		}
	}
}

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

// The check that matters: the bomb is refused from its header, before any pixel
// buffer proportional to those dimensions is allocated.
func TestDecompressionBombIsRejected(t *testing.T) {
	raw := decompressionBomb(t)
	if len(raw) > MaxUploadBytes {
		t.Fatalf("fixture is %d bytes, which the size limit would catch first; "+
			"this test must exercise the pixel limit", len(raw))
	}

	store := blob.NewMemory()
	_, err := StoreAvatar(context.Background(), store, testUID, bytes.NewReader(raw))
	if err == nil {
		t.Fatal("a 400-megapixel image was accepted")
	}
	assertStatus(t, err, http.StatusUnprocessableEntity)
	if store.Len() != 0 {
		t.Error("a rejected upload still wrote an object")
	}
}

func TestRejections(t *testing.T) {
	for _, tc := range []struct {
		name       string
		raw        []byte
		wantStatus int
	}{
		{
			// Content-Type is attacker-controlled, so decoding is the real check.
			name:       "bytes that are not an image at all",
			raw:        []byte("GIF89a this is not really a gif, it just starts like one"),
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "empty upload",
			raw:        []byte{},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "a truncated image whose header parses",
			raw:        opaquePNG(t, 400, 400)[:120],
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "below the minimum dimension",
			raw:        opaquePNG(t, MinDimension-1, MinDimension-1),
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "one side below the minimum",
			raw:        opaquePNG(t, 400, MinDimension-1),
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "larger than the byte limit",
			raw:        bytes.Repeat([]byte{0x89}, MaxUploadBytes+1),
			wantStatus: http.StatusRequestEntityTooLarge,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := blob.NewMemory()
			_, err := StoreAvatar(context.Background(), store, testUID, bytes.NewReader(tc.raw))
			if err == nil {
				t.Fatal("expected a rejection, got none")
			}
			assertStatus(t, err, tc.wantStatus)
			if store.Len() != 0 {
				t.Errorf("a rejected upload wrote %d objects", store.Len())
			}
		})
	}
}

func TestOversizeIsRejectedWithoutBufferingItAll(t *testing.T) {
	// An endless reader stands in for a client that keeps sending. If the
	// pipeline read without a limit this would not terminate.
	endless := endlessReader{}
	_, err := StoreAvatar(context.Background(), blob.NewMemory(), testUID, endless)
	if err == nil {
		t.Fatal("an unbounded upload was accepted")
	}
	assertStatus(t, err, http.StatusRequestEntityTooLarge)
}

type endlessReader struct{}

func (endlessReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 0x89
	}
	return len(p), nil
}

// ---------------------------------------------------------------------------
// Privacy and storage failures
// ---------------------------------------------------------------------------

// Re-encoding drops metadata. This asserts the property directly, because it is
// a privacy guarantee rather than an implementation detail: a phone photograph
// carries the location it was taken.
func TestMetadataIsStripped(t *testing.T) {
	secret := "GPS-51.5074N-0.1278W-SECRET-MARKER"

	// A JPEG with an EXIF-shaped APP1 segment carrying the marker, spliced in
	// after the SOI as a real camera would.
	base := opaqueJPEG(t, 400, 400)
	payload := append([]byte("Exif\x00\x00"), []byte(secret)...)
	segment := []byte{0xFF, 0xE1, byte((len(payload) + 2) >> 8), byte((len(payload) + 2) & 0xff)}
	withEXIF := append([]byte{}, base[:2]...)
	withEXIF = append(withEXIF, segment...)
	withEXIF = append(withEXIF, payload...)
	withEXIF = append(withEXIF, base[2:]...)

	if !bytes.Contains(withEXIF, []byte(secret)) {
		t.Fatal("fixture does not contain the marker, so the test would pass vacuously")
	}

	store := blob.NewMemory()
	a, err := StoreAvatar(context.Background(), store, testUID, bytes.NewReader(withEXIF))
	if err != nil {
		t.Fatalf("StoreAvatar on a JPEG with EXIF: %v", err)
	}
	obj, _ := store.Get(a.Key)
	if bytes.Contains(obj.Body, []byte(secret)) {
		t.Error("the stored avatar still contains the source metadata")
	}
}

func TestStorageFailureIsReportedNotSwallowed(t *testing.T) {
	store := blob.NewMemory()
	store.FailPut = errors.New("bucket is on fire")

	_, err := StoreAvatar(context.Background(), store, testUID, bytes.NewReader(opaquePNG(t, 400, 400)))
	if err == nil {
		t.Fatal("a failed Put was reported as success")
	}
	if !strings.Contains(err.Error(), "bucket is on fire") {
		t.Errorf("error %q does not carry the cause", err)
	}
}

func TestUnconfiguredStorageIsAClearServiceError(t *testing.T) {
	_, err := StoreAvatar(context.Background(), nil, testUID, bytes.NewReader(opaquePNG(t, 400, 400)))
	if err == nil {
		t.Fatal("expected an error with no store configured")
	}
	assertStatus(t, err, http.StatusServiceUnavailable)
}

func assertStatus(t *testing.T, err error, want int) {
	t.Helper()
	e, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error, so it would surface as a 500", err)
	}
	if got := e.GetStatus(); got != want {
		t.Errorf("status = %d, want %d (message: %s)", got, want, e.ErrorMessage)
	}
}
