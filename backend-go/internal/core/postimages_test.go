package core_test

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"

	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
	"testing"
)

// pngOf builds a solid PNG of the given size. Real bytes rather than a fixture, so the
// pipeline actually decodes, scales and re-encodes what the test claims it does.
func pngOf(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := range height {
		for x := range width {
			img.Set(x, y, color.NRGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode fixture png: %v", err)
	}
	return buf.Bytes()
}

func attachImage(t *testing.T, h *harness, token string, postNo int64, position int, body []byte) response {
	t.Helper()
	return h.uploadFileAs(fmt.Sprintf("/forum/posts/%d/images/%d", postNo, position),
		"shot.png", "", body, withBearer(token))
}

func TestAttachingAndReadingBackPostImages(t *testing.T) {
	h := newHarnessWith(t, nil, blob.NewMemory())
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(token, simplePost())

	res := attachImage(t, h, token, postNo, 0, pngOf(t, 800, 600))
	if res.status != http.StatusOK {
		t.Fatalf("attach = %d: %s", res.status, res.body)
	}
	data := res.data(t)
	if data["position"] != float64(0) {
		t.Errorf("position = %v, want 0", data["position"])
	}
	// Within the bound, so the size is preserved rather than scaled.
	if data["width"] != float64(800) || data["height"] != float64(600) {
		t.Errorf("stored size = %vx%v, want 800x600", data["width"], data["height"])
	}
	url, _ := data["url"].(string)
	if url == "" {
		t.Errorf("no url returned: %s", res.body)
	}

	// The post carries it, in order, on both the single read and the feed.
	single := h.do(http.MethodGet, fmt.Sprintf("/forum/posts/%d", postNo), nil)
	images, _ := single.data(t)["images"].([]any)
	if len(images) != 1 {
		t.Fatalf("post images = %v, want one", images)
	}

	if res := attachImage(t, h, token, postNo, 1, pngOf(t, 400, 400)); res.status != http.StatusOK {
		t.Fatalf("attach second = %d: %s", res.status, res.body)
	}
	feed := h.do(http.MethodGet, "/forum/posts", nil)
	list, _ := feed.data(t)["results"].([]any)
	first, _ := list[0].(map[string]any)
	images, _ = first["images"].([]any)
	if len(images) != 2 {
		t.Fatalf("feed row images = %v, want two", images)
	}
	// Ordered by position, not by insertion time.
	one, _ := images[0].(map[string]any)
	two, _ := images[1].(map[string]any)
	if one["position"] != float64(0) || two["position"] != float64(1) {
		t.Errorf("images out of order: %v then %v", one["position"], two["position"])
	}

	// A post with no images reports an empty array rather than null, so a client can
	// iterate without a guard.
	other := h.mustCreatePost(token, simplePost())
	res = h.do(http.MethodGet, fmt.Sprintf("/forum/posts/%d", other), nil)
	if raw, present := res.data(t)["images"]; !present || raw == nil {
		t.Errorf("a post with no images reports %v, want []", raw)
	}
}

func TestPostImagesAreScaledAndReEncoded(t *testing.T) {
	h := newHarnessWith(t, nil, blob.NewMemory())
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(token, simplePost())

	// Wider than the bound: scaled down, aspect ratio kept, and not cropped to a square —
	// a screenshot cropped square is a screenshot ruined.
	res := attachImage(t, h, token, postNo, 0, pngOf(t, 2600, 1300))
	if res.status != http.StatusOK {
		t.Fatalf("attach = %d: %s", res.status, res.body)
	}
	data := res.data(t)
	width, _ := data["width"].(float64)
	height, _ := data["height"].(float64)
	if width != 2048 {
		t.Errorf("width = %v, want the longest edge bounded to 2048", width)
	}
	if height != 1024 {
		t.Errorf("height = %v, want the aspect ratio preserved (1024)", height)
	}
}

func TestPostImageRejections(t *testing.T) {
	h := newHarnessWith(t, nil, blob.NewMemory())
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	other := h.registerAndLogin("other", "other@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(token, simplePost())

	// Not an image at all: the bytes are decoded, so a declared content type cannot help.
	if res := attachImage(t, h, token, postNo, 0, []byte("this is not a png")); res.status != http.StatusUnprocessableEntity {
		t.Errorf("attaching a non-image = %d, want 422: %s", res.status, res.body)
	}

	// Too small to be worth storing.
	if res := attachImage(t, h, token, postNo, 0, pngOf(t, 16, 16)); res.status != http.StatusUnprocessableEntity {
		t.Errorf("attaching a tiny image = %d, want 422: %s", res.status, res.body)
	}

	// Someone else's post. An image under another author's name would be a way to put
	// content there.
	if res := attachImage(t, h, other, postNo, 0, pngOf(t, 400, 400)); res.status != http.StatusForbidden {
		t.Errorf("attaching to another author's post = %d, want 403: %s", res.status, res.body)
	}

	// Anonymous.
	res := h.uploadFileAs(fmt.Sprintf("/forum/posts/%d/images/0", postNo), "shot.png", "", pngOf(t, 400, 400))
	if res.status != http.StatusUnauthorized {
		t.Errorf("anonymous attach = %d, want 401: %s", res.status, res.body)
	}

	// A position outside the grid is refused by the path constraint.
	if res := attachImage(t, h, token, postNo, 9, pngOf(t, 400, 400)); res.status != http.StatusUnprocessableEntity {
		t.Errorf("position 9 = %d, want 422: %s", res.status, res.body)
	}
}

func TestDetachingAndReplacingPostImages(t *testing.T) {
	h := newHarnessWith(t, nil, blob.NewMemory())
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(token, simplePost())

	if res := attachImage(t, h, token, postNo, 0, pngOf(t, 400, 400)); res.status != http.StatusOK {
		t.Fatalf("attach = %d: %s", res.status, res.body)
	}

	// Re-attaching the same slot replaces rather than failing, so correcting one image
	// needs no detach first.
	res := attachImage(t, h, token, postNo, 0, pngOf(t, 600, 300))
	if res.status != http.StatusOK {
		t.Fatalf("replace = %d: %s", res.status, res.body)
	}
	if res.data(t)["width"] != float64(600) {
		t.Errorf("replacement not stored: %s", res.body)
	}
	single := h.do(http.MethodGet, fmt.Sprintf("/forum/posts/%d", postNo), nil)
	if images, _ := single.data(t)["images"].([]any); len(images) != 1 {
		t.Errorf("after replacing, images = %v, want one", images)
	}

	detach := fmt.Sprintf("/forum/posts/%d/images/0", postNo)

	// Someone else cannot detach.
	otherToken := h.registerAndLogin("other", "other@example.com", "hunter2hunter2")
	if res := h.do(http.MethodDelete, detach, nil, withBearer(otherToken)); res.status != http.StatusForbidden {
		t.Errorf("another account detaching = %d, want 403: %s", res.status, res.body)
	}

	// Detaching twice succeeds: the caller asked for an end state.
	for range 2 {
		if res := h.do(http.MethodDelete, detach, nil, withBearer(token)); res.status != http.StatusOK {
			t.Fatalf("detach = %d: %s", res.status, res.body)
		}
	}
	single = h.do(http.MethodGet, fmt.Sprintf("/forum/posts/%d", postNo), nil)
	if images, _ := single.data(t)["images"].([]any); len(images) != 0 {
		t.Errorf("after detaching, images = %v, want none", images)
	}
}
