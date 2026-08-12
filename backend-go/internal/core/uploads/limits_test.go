package uploads

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

// flatPNG builds a single-colour opaque PNG.
//
// Flat rather than the gradient fixtures elsewhere, because these tests probe the
// dimension limit: at 3000x3000 a gradient would exceed the byte limit and the
// upload would be refused for the wrong reason, testing nothing.
func flatPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	fill := color.NRGBA{R: 0x40, G: 0x70, B: 0xa0, A: 0xff}
	for y := range h {
		for x := range w {
			img.SetNRGBA(x, y, fill)
		}
	}
	buf := new(bytes.Buffer)
	if err := png.Encode(buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// The accepted envelope is GitHub's: smaller than 1 MB, under 3000x3000, with
// around 500x500 recommended. A limit is only meaningful at its edges, so both
// boundaries are pinned here rather than only the comfortable middle.
func TestDimensionBoundary(t *testing.T) {
	for _, tc := range []struct {
		name       string
		w, h       int
		wantStatus int // 0 means accepted
	}{
		{"one under the limit on both sides", MaxDimension - 1, MaxDimension - 1, 0},
		{"exactly the limit is still accepted", MaxDimension, MaxDimension, 0},
		{"one over on the width", MaxDimension + 1, 64, http.StatusUnprocessableEntity},
		{"one over on the height", 64, MaxDimension + 1, http.StatusUnprocessableEntity},
		{"the recommended size", RecommendedDimension, RecommendedDimension, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// A flat image so even the largest fixture stays well under the byte
			// limit, isolating the dimension check from the size check.
			raw := flatPNG(t, tc.w, tc.h)
			if len(raw) > MaxUploadBytes {
				t.Skipf("fixture is %d bytes, over the byte limit; cannot isolate the dimension check", len(raw))
			}

			_, err := StoreAvatar(context.Background(), blob.NewMemory(), testUID, bytes.NewReader(raw))
			if tc.wantStatus == 0 {
				if err != nil {
					t.Fatalf("%dx%d was rejected: %v", tc.w, tc.h, err)
				}
				return
			}
			if err == nil {
				t.Fatalf("%dx%d was accepted", tc.w, tc.h)
			}
			assertStatus(t, err, tc.wantStatus)
		})
	}
}

// The byte limit is what a user is most likely to hit, so its edge is pinned too.
func TestByteLimitBoundary(t *testing.T) {
	store := blob.NewMemory()

	atLimit := bytes.Repeat([]byte{0x89}, MaxUploadBytes)
	_, err := StoreAvatar(context.Background(), store, testUID, bytes.NewReader(atLimit))
	if err == nil {
		t.Fatal("junk bytes at exactly the limit were accepted as an image")
	}
	// Refused for not being an image, NOT for being too large: the size check
	// must not fire one byte early.
	assertStatus(t, err, http.StatusUnprocessableEntity)

	overLimit := bytes.Repeat([]byte{0x89}, MaxUploadBytes+1)
	_, err = StoreAvatar(context.Background(), store, testUID, bytes.NewReader(overLimit))
	if err == nil {
		t.Fatal("an oversized upload was accepted")
	}
	assertStatus(t, err, http.StatusRequestEntityTooLarge)
}
