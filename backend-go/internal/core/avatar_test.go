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

	"github.com/arkive-games/arkive/backend-go/internal/core/uploads"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// pngFixture builds a distinct opaque PNG. Varying the seed changes the bytes,
// which changes the digest in the key.
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

// uploadAvatarAs posts a multipart body to the avatar route.
//
// partType empty means the part carries no explicit Content-Type, which is what
// Go's multipart.CreateFormFile produces and what many HTTP clients send. That is
// the harder case and so the default here: the declared type is not what decides
// the format.
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

func (h *harness) uploadAvatar(path, filename, _ string, data []byte, opts ...requestOption) response {
	h.t.Helper()
	return h.uploadAvatarAs(path, filename, "", data, opts...)
}

// avatarURLOf reads the account's picture URL, which is never empty.
func avatarURLOf(t *testing.T, res response) string {
	t.Helper()
	raw, ok := res.data(t)["avatarUrl"]
	if !ok {
		t.Fatalf("response carries no avatarUrl field: %s", res.body)
	}
	url, ok := raw.(string)
	if !ok {
		t.Fatalf("avatarUrl is %T rather than a string, so a client would need a null check: %s",
			raw, res.body)
	}
	return url
}

// ownsUpload reports whether the URL points at the account's own upload rather
// than at a shared preset.
func ownsUpload(url string) bool {
	return strings.Contains(url, "/"+uploads.UploadPrefix)
}

func isPreset(url string) bool {
	return strings.Contains(url, "/"+uploads.PresetPrefix)
}

func memoryStore(t *testing.T, h *harness) *blob.Memory {
	t.Helper()
	mem, ok := h.blobs.(*blob.Memory)
	if !ok {
		t.Fatalf("expected the in-memory store, got %T", h.blobs)
	}
	return mem
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// Every account has a picture from the moment it exists, which is what lets the
// frontend render one field with no null check, no extension guessing and no 404
// to recover from.
func TestANewAccountAlreadyHasAPresetAvatar(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("fresh", "fresh@example.com", "hunter2hunter2")

	me := h.do(http.MethodGet, "/users/me", nil, withBearer(token))
	url := avatarURLOf(t, me)
	if url == "" {
		t.Fatal("a new account has no avatarUrl; the field must never be empty")
	}
	if !isPreset(url) {
		t.Errorf("avatarUrl %q is not a preset, but nothing has been uploaded", url)
	}
	// Nothing was written to storage to achieve that: the preset is derived from
	// the uid, so it costs no object and no column.
	if mem := memoryStore(t, h); mem.Len() != 0 {
		t.Errorf("a fresh account caused %d objects to be written: %v", mem.Len(), mem.Keys())
	}
}

func TestDefaultAvatarIsStableAcrossReads(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("stable", "stable@example.com", "hunter2hunter2")

	first := avatarURLOf(t, h.do(http.MethodGet, "/users/me", nil, withBearer(token)))
	second := avatarURLOf(t, h.do(http.MethodGet, "/users/me", nil, withBearer(token)))
	if first != second {
		t.Errorf("the default avatar changed between reads: %q then %q", first, second)
	}
}

func TestPresetsAreListedWithURLs(t *testing.T) {
	h := newHarness(t)

	// Public, because a picker has to render before anybody signs in.
	res := h.do(http.MethodGet, "/users/avatar-presets", nil)
	if res.status != http.StatusOK {
		t.Fatalf("list presets = %d: %s", res.status, res.body)
	}
	list, ok := res.data(t)["presets"].([]any)
	if !ok {
		t.Fatalf("presets is not a list: %s", res.body)
	}
	if len(list) != len(uploads.Presets) {
		t.Errorf("listed %d presets, want %d", len(list), len(uploads.Presets))
	}
	for _, raw := range list {
		entry, _ := raw.(map[string]any)
		id, _ := entry["id"].(string)
		url, _ := entry["url"].(string)
		if id == "" || url == "" {
			t.Errorf("preset entry is incomplete: %v", entry)
		}
		if !strings.Contains(url, uploads.PresetPrefix) {
			t.Errorf("preset %q has URL %q, which is not under the preset prefix", id, url)
		}
	}
}

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

func TestUploadingAnAvatarStoresItAndPublishesTheURL(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("owner", "owner@example.com", "hunter2hunter2")

	res := h.uploadAvatar("/users/me/avatar", "me.png", "image/png",
		pngFixture(t, 500, 300, 1), withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", res.status, res.body)
	}

	url := avatarURLOf(t, res)
	if !ownsUpload(url) {
		t.Errorf("avatarUrl %q does not point at the account's own upload", url)
	}

	mem := memoryStore(t, h)
	if mem.Len() != 1 {
		t.Errorf("stored %d objects, want 1: %v", mem.Len(), mem.Keys())
	}
	key := mem.Keys()[0]
	if !strings.HasSuffix(url, key) {
		t.Errorf("avatarUrl %q does not end with the stored key %q", url, key)
	}

	// The format follows the upload, so a PNG stays a PNG rather than becoming a
	// JPEG and losing its lossless encoding.
	obj, _ := mem.Get(key)
	if obj.ContentType != "image/png" {
		t.Errorf("an uploaded PNG was stored as %q, want image/png", obj.ContentType)
	}
	if !strings.HasSuffix(key, ".png") {
		t.Errorf("stored key %q does not end in .png", key)
	}

	if got := avatarURLOf(t, h.do(http.MethodGet, "/users/me", nil, withBearer(token))); got != url {
		t.Errorf("/users/me reports %q, want %q", got, url)
	}
}

// An avatar is public, and the uid lookup is what a profile page resolves.
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

	pub := h.do(http.MethodGet, "/users/uid/"+strconv.FormatInt(int64(uid), 10), nil)
	if pub.status != http.StatusOK {
		t.Fatalf("public lookup = %d: %s", pub.status, pub.body)
	}
	if got := avatarURLOf(t, pub); got != want {
		t.Errorf("public avatarUrl = %q, want %q", got, want)
	}
	if strings.Contains(string(pub.body), "public@example.com") {
		t.Errorf("the public payload leaks the email address: %s", pub.body)
	}
}

// An account that has uploaded nothing still resolves publicly, to its preset.
func TestPublicLookupOfAnAccountWithoutAnUploadReturnsAPreset(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("bare", "bare@example.com", "hunter2hunter2")
	uid, _ := h.do(http.MethodGet, "/users/me", nil, withBearer(token)).data(t)["uid"].(float64)

	pub := h.do(http.MethodGet, "/users/uid/"+strconv.FormatInt(int64(uid), 10), nil)
	if pub.status != http.StatusOK {
		t.Fatalf("public lookup = %d: %s", pub.status, pub.body)
	}
	if url := avatarURLOf(t, pub); !isPreset(url) {
		t.Errorf("public avatarUrl = %q, want a preset", url)
	}
}

// Replacing an avatar must not leave the old object behind. This is the property
// that makes a garbage collector unnecessary.
func TestReplacingAnAvatarDeletesTheSupersededObject(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("swapper", "swapper@example.com", "hunter2hunter2")

	first := h.uploadAvatar("/users/me/avatar", "1.png", "image/png",
		pngFixture(t, 400, 400, 3), withBearer(token))
	if first.status != http.StatusOK {
		t.Fatalf("first upload = %d: %s", first.status, first.body)
	}
	firstURL := avatarURLOf(t, first)

	second := h.uploadAvatar("/users/me/avatar", "2.png", "image/png",
		pngFixture(t, 400, 400, 4), withBearer(token))
	if second.status != http.StatusOK {
		t.Fatalf("second upload = %d: %s", second.status, second.body)
	}
	secondURL := avatarURLOf(t, second)

	if firstURL == secondURL {
		t.Fatal("a different picture produced the same URL")
	}
	mem := memoryStore(t, h)
	if mem.Len() != 1 {
		t.Errorf("store holds %d objects after a replacement, want 1: %v", mem.Len(), mem.Keys())
	}
	if !strings.HasSuffix(secondURL, mem.Keys()[0]) {
		t.Errorf("the retained object %q is not the current avatar %q", mem.Keys()[0], secondURL)
	}
}

// Each account keeps its own copy under its own prefix. Cross-account
// deduplication is given up deliberately: sharing is exactly what would force
// reference counting before anything could be deleted.
func TestTwoAccountsUploadingTheSamePictureEachGetTheirOwnObject(t *testing.T) {
	h := newHarness(t)
	a := h.registerAndLogin("first", "first@example.com", "hunter2hunter2")
	b := h.registerAndLogin("second", "second@example.com", "hunter2hunter2")

	same := pngFixture(t, 400, 400, 5)
	resA := h.uploadAvatar("/users/me/avatar", "a.png", "image/png", same, withBearer(a))
	resB := h.uploadAvatar("/users/me/avatar", "b.png", "image/png", same, withBearer(b))
	if resA.status != http.StatusOK || resB.status != http.StatusOK {
		t.Fatalf("uploads = %d and %d", resA.status, resB.status)
	}

	if urlA, urlB := avatarURLOf(t, resA), avatarURLOf(t, resB); urlA == urlB {
		t.Error("two accounts share one object, so neither could delete it safely")
	}
	if mem := memoryStore(t, h); mem.Len() != 2 {
		t.Errorf("store holds %d objects, want one per account: %v", mem.Len(), mem.Keys())
	}
}

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
			// The bytes decide: a PNG is stored as a PNG whatever the client
			// claimed it was.
			if url := avatarURLOf(t, res); !strings.HasSuffix(url, ".png") {
				t.Errorf("stored URL %q is not a .png", url)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

func TestChoosingAPresetReplacesAnUploadAndDeletesIt(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("chooser", "chooser@example.com", "hunter2hunter2")

	if up := h.uploadAvatar("/users/me/avatar", "a.png", "image/png",
		pngFixture(t, 400, 400, 6), withBearer(token)); up.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", up.status, up.body)
	}

	preset := uploads.Presets[3]
	res := h.do(http.MethodPut, "/users/me/avatar/preset",
		map[string]any{"presetId": preset}, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("choose preset = %d: %s", res.status, res.body)
	}

	url := avatarURLOf(t, res)
	if !isPreset(url) || !strings.Contains(url, preset) {
		t.Errorf("avatarUrl = %q, want the chosen preset %q", url, preset)
	}
	// The upload it replaced is gone.
	if mem := memoryStore(t, h); mem.Len() != 0 {
		t.Errorf("store still holds %d uploaded objects: %v", mem.Len(), mem.Keys())
	}
}

// A preset id is interpolated into an object key, so an unknown one must be
// refused rather than reaching storage.
func TestChoosingAnUnknownPresetIsRejected(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("sneaky", "sneaky@example.com", "hunter2hunter2")

	for _, bad := range []string{"nope", "../../secret", "male-tide-navigator.png"} {
		res := h.do(http.MethodPut, "/users/me/avatar/preset",
			map[string]any{"presetId": bad}, withBearer(token))
		if res.status != http.StatusUnprocessableEntity {
			t.Errorf("preset %q = %d, want 422: %s", bad, res.status, res.body)
		}
	}
}

func TestChoosingAPresetRequiresAuthentication(t *testing.T) {
	h := newHarness(t)
	res := h.do(http.MethodPut, "/users/me/avatar/preset",
		map[string]any{"presetId": uploads.Presets[0]})
	if res.status != http.StatusUnauthorized {
		t.Errorf("anonymous preset choice = %d, want 401: %s", res.status, res.body)
	}
}

// ---------------------------------------------------------------------------
// Removal
// ---------------------------------------------------------------------------

func TestDeletingAnAvatarReturnsToTheDefaultAndRemovesTheObject(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("remover", "remover@example.com", "hunter2hunter2")

	if up := h.uploadAvatar("/users/me/avatar", "a.png", "image/png",
		pngFixture(t, 400, 400, 7), withBearer(token)); up.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", up.status, up.body)
	}

	del := h.do(http.MethodDelete, "/users/me/avatar", nil, withBearer(token))
	if del.status != http.StatusOK {
		t.Fatalf("delete = %d: %s", del.status, del.body)
	}
	if url := avatarURLOf(t, del); !isPreset(url) {
		t.Errorf("avatarUrl = %q after deletion, want the default preset", url)
	}
	if mem := memoryStore(t, h); mem.Len() != 0 {
		t.Errorf("store still holds %d objects after deletion: %v", mem.Len(), mem.Keys())
	}
}

func TestDeletingAnAvatarWhenThereIsNoneSucceeds(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("empty", "empty@example.com", "hunter2hunter2")

	res := h.do(http.MethodDelete, "/users/me/avatar", nil, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("delete with no avatar = %d, want 200: %s", res.status, res.body)
	}
	if url := avatarURLOf(t, res); !isPreset(url) {
		t.Errorf("avatarUrl = %q, want the default preset", url)
	}
}

// Deactivating an account keeps its pictures. Accounts are never deleted, so
// there is no moment at which a bucket prefix becomes garbage — and a
// reactivated account should look exactly as it did, avatar included.
func TestDeactivatingAnAccountKeepsItsAvatars(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")
	victimToken := h.registerAndLogin("victim", "victim@example.com", "hunter2hunter2")
	victimID := idOf(t, h, victimToken)

	if up := h.uploadAvatar("/users/me/avatar", "v.png", "image/png",
		pngFixture(t, 400, 400, 8), withBearer(victimToken)); up.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", up.status, up.body)
	}
	if mem := memoryStore(t, h); mem.Len() != 1 {
		t.Fatalf("expected one object before deactivation, got %d", mem.Len())
	}

	if res := h.do(http.MethodPost, "/users/"+victimID+"/deactivate", nil, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("deactivate = %d: %s", res.status, res.body)
	}

	// Nothing is destroyed, which is what makes reactivation a real restore
	// rather than a resurrection of an empty shell.
	if mem := memoryStore(t, h); mem.Len() != 1 {
		t.Errorf("deactivation removed avatars: %d objects remain (%v)", mem.Len(), mem.Keys())
	}
}

func TestAdministratorCanTakeDownAnAvatarAndAUserCannotTouchAnother(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")
	victimToken := h.registerAndLogin("victim", "victim@example.com", "hunter2hunter2")
	victimID := idOf(t, h, victimToken)

	if up := h.uploadAvatar("/users/me/avatar", "v.png", "image/png",
		pngFixture(t, 400, 400, 9), withBearer(victimToken)); up.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", up.status, up.body)
	}

	if res := h.do(http.MethodDelete, "/users/"+victimID+"/avatar", nil, withBearer(victimToken)); res.status != http.StatusForbidden {
		t.Errorf("non-administrator takedown = %d, want 403: %s", res.status, res.body)
	}
	if url := avatarURLOf(t, h.do(http.MethodGet, "/users/me", nil, withBearer(victimToken))); !ownsUpload(url) {
		t.Fatal("the avatar was removed by a caller who should have been refused")
	}

	if res := h.do(http.MethodDelete, "/users/"+victimID+"/avatar", nil, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("administrator takedown = %d: %s", res.status, res.body)
	}
	if url := avatarURLOf(t, h.do(http.MethodGet, "/users/me", nil, withBearer(victimToken))); ownsUpload(url) {
		t.Errorf("avatar %q survived an administrative takedown", url)
	}
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

func TestAvatarUploadRequiresAuthentication(t *testing.T) {
	h := newHarness(t)
	res := h.uploadAvatar("/users/me/avatar", "a.png", "image/png", pngFixture(t, 400, 400, 10))
	if res.status != http.StatusUnauthorized {
		t.Errorf("anonymous upload = %d, want 401: %s", res.status, res.body)
	}
}

// The declared Content-Type is attacker-controlled, so a file that claims to be a
// PNG and is not must still be refused. This is what stops arbitrary bytes being
// served from the avatar bucket.
func TestAFileThatMerelyClaimsToBeAnImageIsRejected(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("liar", "liar@example.com", "hunter2hunter2")

	res := h.uploadAvatar("/users/me/avatar", "payload.png", "image/png",
		[]byte("<?php echo 'not an image'; ?>"), withBearer(token))
	if res.status != http.StatusUnprocessableEntity {
		t.Errorf("upload of non-image bytes = %d, want 422: %s", res.status, res.body)
	}
	if mem := memoryStore(t, h); mem.Len() != 0 {
		t.Errorf("rejected upload still stored %d objects: %v", mem.Len(), mem.Keys())
	}
}

func TestAnUndersizedImageIsRejected(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("tiny", "tiny@example.com", "hunter2hunter2")

	res := h.uploadAvatar("/users/me/avatar", "tiny.png", "image/png",
		pngFixture(t, 8, 8, 11), withBearer(token))
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
		pngFixture(t, 400, 400, 12), withBearer(token)); first.status != http.StatusOK {
		t.Fatalf("first upload = %d: %s", first.status, first.body)
	}
	second := h.uploadAvatar("/users/me/avatar", "2.png", "image/png",
		pngFixture(t, 400, 400, 13), withBearer(token))
	if second.status != http.StatusTooManyRequests {
		t.Fatalf("second upload = %d, want 429: %s", second.status, second.body)
	}

	// Per account, not per address: keying on the address would have throttled
	// this unrelated user as well.
	if res := h.uploadAvatar("/users/me/avatar", "3.png", "image/png",
		pngFixture(t, 400, 400, 14), withBearer(other)); res.status != http.StatusOK {
		t.Errorf("a second account's upload = %d, want 200: %s", res.status, res.body)
	}
}

// Storage that cannot be used must fail the upload clearly without taking the
// rest of the account API down with it.
func TestUploadWithUnusableStorageIsAServiceError(t *testing.T) {
	broken := blob.NewMemory()
	broken.FailPut = blob.ErrNotConfigured
	h := newHarnessWith(t, nil, broken)

	token := h.registerAndLogin("nostore", "nostore@example.com", "hunter2hunter2")
	res := h.uploadAvatar("/users/me/avatar", "a.png", "image/png",
		pngFixture(t, 400, 400, 15), withBearer(token))
	if res.status != http.StatusServiceUnavailable {
		t.Errorf("upload with unusable storage = %d, want 503: %s", res.status, res.body)
	}
	if me := h.do(http.MethodGet, "/users/me", nil, withBearer(token)); me.status != http.StatusOK {
		t.Errorf("/users/me = %d with storage down, want 200", me.status)
	}
}
