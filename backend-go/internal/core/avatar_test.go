package core_test

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// pngFixture builds a distinct opaque PNG. Varying the seed changes the bytes,
// which changes the content-addressed key.
func pngFixture(t *testing.T, w, h, seed int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{
				R: uint8((x + seed) % 256),
				G: uint8((y * (seed + 1)) % 256),
				B: uint8(seed % 256),
				A: 0xff,
			})
		}
	}
	buf := new(bytes.Buffer)
	if err := png.Encode(buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// uploadAvatar posts a multipart body to the avatar route.
//
// partType, when empty, means the part carries no explicit Content-Type — which
// is what Go's multipart.CreateFormFile produces (application/octet-stream) and
// what many HTTP clients send. That is the harder case and so the default here:
// the route must accept it, because the declared type is not what decides the
// format.
func (h *harness) uploadAvatarAs(path, filename, partType string, data []byte, opts ...requestOption) response {
	h.t.Helper()

	body := new(bytes.Buffer)
	w := multipart.NewWriter(body)

	var part io.Writer
	var err error
	if partType == "" {
		part, err = w.CreateFormFile("file", filename)
	} else {
		hdr := make(textproto.MIMEHeader)
		hdr.Set("Content-Disposition", `form-data; name="file"; filename="`+filename+`"`)
		hdr.Set("Content-Type", partType)
		part, err = w.CreatePart(hdr)
	}
	if err != nil {
		h.t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		h.t.Fatalf("write form file: %v", err)
	}
	if err := w.Close(); err != nil {
		h.t.Fatalf("close multipart writer: %v", err)
	}

	return h.doRaw(http.MethodPut, path, body.Bytes(), w.FormDataContentType(), opts...)
}

// uploadAvatar uploads without a per-part content type.
func (h *harness) uploadAvatar(path, filename, _ string, data []byte, opts ...requestOption) response {
	h.t.Helper()
	return h.uploadAvatarAs(path, filename, "", data, opts...)
}

func avatarURLOf(t *testing.T, res response) string {
	t.Helper()
	raw, ok := res.data(t)["avatarUrl"]
	if !ok {
		t.Fatalf("response carries no avatarUrl field: %s", res.body)
	}
	if raw == nil {
		return ""
	}
	url, ok := raw.(string)
	if !ok {
		t.Fatalf("avatarUrl is %T, want a string: %s", raw, res.body)
	}
	return url
}

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

func TestUploadingAnAvatarStoresItAndPublishesTheURL(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("owner", "owner@example.com", "hunter2hunter2")

	before := h.do(http.MethodGet, "/users/me", nil, withBearer(token))
	if url := avatarURLOf(t, before); url != "" {
		t.Errorf("a new account already has an avatar: %q", url)
	}

	res := h.uploadAvatar("/users/me/avatar", "me.png", "image/png",
		pngFixture(t, 500, 300, 1), withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", res.status, res.body)
	}

	url := avatarURLOf(t, res)
	if url == "" {
		t.Fatal("upload succeeded but returned no avatarUrl")
	}
	if !strings.Contains(url, "avatars/") {
		t.Errorf("avatarUrl %q does not point at an avatar object", url)
	}

	// The object really exists under the key the URL names.
	mem, ok := h.blobs.(*blob.Memory)
	if !ok {
		t.Fatalf("expected the in-memory store, got %T", h.blobs)
	}
	if mem.Len() != 1 {
		t.Errorf("stored %d objects, want 1: %v", mem.Len(), mem.Keys())
	}
	key := mem.Keys()[0]
	if !strings.HasSuffix(url, key) {
		t.Errorf("avatarUrl %q does not end with the stored key %q", url, key)
	}
	obj, _ := mem.Get(key)
	if obj.ContentType != "image/jpeg" {
		t.Errorf("an opaque PNG was stored as %q, want image/jpeg", obj.ContentType)
	}

	// And it survives a fresh read of the account.
	after := h.do(http.MethodGet, "/users/me", nil, withBearer(token))
	if got := avatarURLOf(t, after); got != url {
		t.Errorf("/users/me reports %q, want %q", got, url)
	}
}

// An avatar is public, and the uid lookup is what a profile page resolves, so
// this is the payload that actually has to carry it.
func TestAvatarAppearsInThePublicUIDLookup(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("public", "public@example.com", "hunter2hunter2")

	me := h.do(http.MethodGet, "/users/me", nil, withBearer(token))
	uid, _ := me.data(t)["uid"].(float64)

	upload := h.uploadAvatar("/users/me/avatar", "a.png", "image/png",
		pngFixture(t, 400, 400, 2), withBearer(token))
	if upload.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", upload.status, upload.body)
	}
	want := avatarURLOf(t, upload)

	// Deliberately no credentials: this is what a visitor sees.
	pub := h.do(http.MethodGet, "/users/uid/"+strconv.FormatInt(int64(uid), 10), nil)
	if pub.status != http.StatusOK {
		t.Fatalf("public lookup = %d: %s", pub.status, pub.body)
	}
	if got := avatarURLOf(t, pub); got != want {
		t.Errorf("public avatarUrl = %q, want %q", got, want)
	}
	// The public payload must still not leak anything else.
	if strings.Contains(string(pub.body), "public@example.com") {
		t.Errorf("the public payload leaks the email address: %s", pub.body)
	}
}

func TestReplacingAnAvatarPointsAtTheNewObject(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("swapper", "swapper@example.com", "hunter2hunter2")

	first := h.uploadAvatar("/users/me/avatar", "1.png", "image/png",
		pngFixture(t, 400, 400, 3), withBearer(token))
	firstURL := avatarURLOf(t, first)

	second := h.uploadAvatar("/users/me/avatar", "2.png", "image/png",
		pngFixture(t, 400, 400, 4), withBearer(token))
	if second.status != http.StatusOK {
		t.Fatalf("second upload = %d: %s", second.status, second.body)
	}
	secondURL := avatarURLOf(t, second)

	if firstURL == secondURL {
		t.Error("a different picture produced the same URL")
	}
	// The superseded object is intentionally retained: keys are shared by
	// content, so removing it could blank another account's avatar.
	mem := h.blobs.(*blob.Memory)
	if mem.Len() != 2 {
		t.Errorf("store holds %d objects, want both retained", mem.Len())
	}
}

// Content addressing means two accounts with the same picture cost one object.
func TestTwoAccountsUploadingTheSamePictureShareOneObject(t *testing.T) {
	h := newHarness(t)
	a := h.registerAndLogin("first", "first@example.com", "hunter2hunter2")
	b := h.registerAndLogin("second", "second@example.com", "hunter2hunter2")

	same := pngFixture(t, 400, 400, 5)
	resA := h.uploadAvatar("/users/me/avatar", "a.png", "image/png", same, withBearer(a))
	resB := h.uploadAvatar("/users/me/avatar", "b.png", "image/png", same, withBearer(b))

	if resA.status != http.StatusOK || resB.status != http.StatusOK {
		t.Fatalf("uploads = %d and %d", resA.status, resB.status)
	}
	if urlA, urlB := avatarURLOf(t, resA), avatarURLOf(t, resB); urlA != urlB {
		t.Errorf("identical pictures produced %q and %q", urlA, urlB)
	}
	if mem := h.blobs.(*blob.Memory); mem.Len() != 1 {
		t.Errorf("store holds %d objects for one picture: %v", mem.Len(), mem.Keys())
	}
}

// ---------------------------------------------------------------------------
// Removal
// ---------------------------------------------------------------------------

func TestDeletingAnAvatarClearsTheAccountButKeepsTheObject(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("remover", "remover@example.com", "hunter2hunter2")

	up := h.uploadAvatar("/users/me/avatar", "a.png", "image/png",
		pngFixture(t, 400, 400, 6), withBearer(token))
	if up.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", up.status, up.body)
	}

	del := h.do(http.MethodDelete, "/users/me/avatar", nil, withBearer(token))
	if del.status != http.StatusOK {
		t.Fatalf("delete = %d: %s", del.status, del.body)
	}
	if url := avatarURLOf(t, del); url != "" {
		t.Errorf("avatarUrl = %q after deletion, want null", url)
	}
	if url := avatarURLOf(t, h.do(http.MethodGet, "/users/me", nil, withBearer(token))); url != "" {
		t.Errorf("/users/me still reports %q", url)
	}
	// Retained on purpose; see the design's note on shared objects.
	if mem := h.blobs.(*blob.Memory); mem.Len() != 1 {
		t.Errorf("store holds %d objects, want the object retained", mem.Len())
	}
}

func TestDeletingAnAvatarWhenThereIsNoneSucceeds(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("empty", "empty@example.com", "hunter2hunter2")

	res := h.do(http.MethodDelete, "/users/me/avatar", nil, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("delete with no avatar = %d, want 200: %s", res.status, res.body)
	}
}

func TestAdministratorCanTakeDownAnAvatarAndAUserCannotTouchAnother(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")
	victimToken := h.registerAndLogin("victim", "victim@example.com", "hunter2hunter2")
	victimID := idOf(t, h, victimToken)

	if up := h.uploadAvatar("/users/me/avatar", "v.png", "image/png",
		pngFixture(t, 400, 400, 7), withBearer(victimToken)); up.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", up.status, up.body)
	}

	// An ordinary user must not be able to strip somebody else's picture.
	if res := h.do(http.MethodDelete, "/users/"+victimID+"/avatar", nil, withBearer(victimToken)); res.status != http.StatusForbidden {
		t.Errorf("non-administrator takedown = %d, want 403: %s", res.status, res.body)
	}
	if url := avatarURLOf(t, h.do(http.MethodGet, "/users/me", nil, withBearer(victimToken))); url == "" {
		t.Fatal("the avatar was removed by a caller who should have been refused")
	}

	if res := h.do(http.MethodDelete, "/users/"+victimID+"/avatar", nil, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("administrator takedown = %d: %s", res.status, res.body)
	}
	if url := avatarURLOf(t, h.do(http.MethodGet, "/users/me", nil, withBearer(victimToken))); url != "" {
		t.Errorf("avatar %q survived an administrative takedown", url)
	}
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

func TestAvatarUploadRequiresAuthentication(t *testing.T) {
	h := newHarness(t)
	res := h.uploadAvatar("/users/me/avatar", "a.png", "image/png", pngFixture(t, 400, 400, 8))
	if res.status != http.StatusUnauthorized {
		t.Errorf("anonymous upload = %d, want 401: %s", res.status, res.body)
	}
}

// The declared Content-Type is attacker-controlled, so a file that claims to be
// a PNG and is not must still be refused. This is the check that stops arbitrary
// bytes being served from the avatar bucket.
func TestAFileThatMerelyClaimsToBeAnImageIsRejected(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("liar", "liar@example.com", "hunter2hunter2")

	res := h.uploadAvatar("/users/me/avatar", "payload.png", "image/png",
		[]byte("<?php echo 'not an image'; ?>"), withBearer(token))
	if res.status != http.StatusUnprocessableEntity {
		t.Errorf("upload of non-image bytes = %d, want 422: %s", res.status, res.body)
	}
	if mem := h.blobs.(*blob.Memory); mem.Len() != 0 {
		t.Errorf("rejected upload still stored %d objects: %v", mem.Len(), mem.Keys())
	}
}

func TestAnUndersizedImageIsRejected(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("tiny", "tiny@example.com", "hunter2hunter2")

	res := h.uploadAvatar("/users/me/avatar", "tiny.png", "image/png",
		pngFixture(t, 8, 8, 9), withBearer(token))
	if res.status != http.StatusUnprocessableEntity {
		t.Errorf("upload of an 8x8 image = %d, want 422: %s", res.status, res.body)
	}
}

func TestAvatarUploadsAreRateLimitedPerAccount(t *testing.T) {
	h := newHarnessWith(t, func(c *config.Config) {
		c.S3.AvatarUploadsPerMinute = 1
	}, nil)

	token := h.registerAndLogin("eager", "eager@example.com", "hunter2hunter2")
	other := h.registerAndLogin("calm", "calm@example.com", "hunter2hunter2")

	if first := h.uploadAvatar("/users/me/avatar", "1.png", "image/png",
		pngFixture(t, 400, 400, 10), withBearer(token)); first.status != http.StatusOK {
		t.Fatalf("first upload = %d: %s", first.status, first.body)
	}

	second := h.uploadAvatar("/users/me/avatar", "2.png", "image/png",
		pngFixture(t, 400, 400, 11), withBearer(token))
	if second.status != http.StatusTooManyRequests {
		t.Fatalf("second upload = %d, want 429: %s", second.status, second.body)
	}

	// The limit is per account, so a different user is unaffected. Keying on the
	// address instead would have throttled this one too.
	if res := h.uploadAvatar("/users/me/avatar", "3.png", "image/png",
		pngFixture(t, 400, 400, 12), withBearer(other)); res.status != http.StatusOK {
		t.Errorf("a second account's upload = %d, want 200: %s", res.status, res.body)
	}
}

// Storage that cannot be used must fail the upload clearly rather than appear to
// work, and must not take the rest of the account API down with it.
func TestUploadWithUnusableStorageIsAServiceError(t *testing.T) {
	broken := blob.NewMemory()
	broken.FailPut = blob.ErrNotConfigured
	h := newHarnessWith(t, nil, broken)
	token := h.registerAndLogin("nostore", "nostore@example.com", "hunter2hunter2")

	res := h.uploadAvatar("/users/me/avatar", "a.png", "image/png",
		pngFixture(t, 400, 400, 13), withBearer(token))
	if res.status != http.StatusServiceUnavailable {
		t.Errorf("upload with unusable storage = %d, want 503: %s", res.status, res.body)
	}
	// Reads still work; only uploads are affected.
	if me := h.do(http.MethodGet, "/users/me", nil, withBearer(token)); me.status != http.StatusOK {
		t.Errorf("/users/me = %d with storage down, want 200", me.status)
	}
}

// Clients disagree about whether to label a multipart part, and the route must
// not care: the bytes decide the format. This pins that, because the natural
// implementation — a contentType allow-list on the form field — silently refuses
// the first two of these while looking like a security measure.
func TestUploadAcceptsAnyDeclaredPartContentType(t *testing.T) {
	for _, tc := range []struct {
		name     string
		partType string
	}{
		{"no part content type, as Go's CreateFormFile sends", ""},
		{"a generic type, as many HTTP clients send", "application/octet-stream"},
		{"an honest type, as a browser sends", "image/png"},
		{"a wrong type, which must not change the outcome", "image/jpeg"},
		{"a nonsense type", "text/plain"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t)
			token := h.registerAndLogin("u", "u@example.com", "hunter2hunter2")

			res := h.uploadAvatarAs("/users/me/avatar", "a.png", tc.partType,
				pngFixture(t, 400, 400, 20), withBearer(token))
			if res.status != http.StatusOK {
				t.Fatalf("upload with part type %q = %d, want 200: %s", tc.partType, res.status, res.body)
			}
			if url := avatarURLOf(t, res); url == "" {
				t.Error("upload succeeded but published no URL")
			}
		})
	}
}
