package core_test

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"testing"
	"time"

	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

const markerImageQuery = "?game=palworld&map=MainWorld&marker=chest-1"

func markerImageUpload(t *testing.T, h *harness, token, path, text string, files ...[]byte) response {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if text != "" {
		if err := w.WriteField("body", text); err != nil {
			t.Fatal(err)
		}
	}
	field := "file"
	if text != "" {
		field = "files"
	}
	for _, data := range files {
		part, err := w.CreateFormFile(field, "image.png")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return h.doRaw(http.MethodPost, path, buf.Bytes(), w.FormDataContentType(), withBearer(token))
}

func TestMarkerImagesPersistAndRequireScopedReview(t *testing.T) {
	store := blob.NewMemory()
	h := newHarnessWith(t, nil, store)
	author := h.registerAndLogin("image-author", "image-author@example.com", "hunter2hunter2")
	reader := h.registerAndLogin("image-reader", "image-reader@example.com", "hunter2hunter2")
	admin := h.registerAndLogin("image-admin", "image-admin@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(admin)
	mod := h.registerAndLogin("image-mod", "image-mod@example.com", "hunter2hunter2")
	h.grantRole(admin, "palworld", h.uidOf(mod), "game_moderator")
	otherMod := h.registerAndLogin("other-mod", "other-mod@example.com", "hunter2hunter2")
	h.grantRole(admin, "pbz", h.uidOf(otherMod), "game_moderator")

	upload := markerImageUpload(t, h, author, "/map-markers/images"+markerImageQuery, "", pngOf(t, 128, 64))
	if upload.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", upload.status, upload.body)
	}
	image := upload.data(t)
	if image["status"] != "pending" {
		t.Fatalf("status = %v", image["status"])
	}
	id := image["id"].(string)
	url := image["url"]
	keys, err := store.List(context.Background(), "markers/")
	if err != nil || len(keys) != 1 {
		t.Fatalf("stored objects = %v, %v", keys, err)
	}
	for _, options := range [][]requestOption{nil, {withBearer(reader)}, {withBearer(otherMod)}} {
		res := h.do(http.MethodGet, "/map-markers/images"+markerImageQuery, nil, options...)
		if res.status != 200 || res.data(t)["count"] != float64(0) {
			t.Fatalf("unapproved image leaked: %d %s", res.status, res.body)
		}
	}
	// This is a new HTTP read, not the upload response: the pending row survives
	// a reload and is visible to its author and the correct game's staff only.
	for _, token := range []string{author, mod} {
		res := h.do(http.MethodGet, "/map-markers/images"+markerImageQuery, nil, withBearer(token))
		if res.status != 200 || res.data(t)["count"] != float64(1) {
			t.Fatalf("owner/staff read = %d %s", res.status, res.body)
		}
	}
	for _, token := range []string{author, reader, otherMod} {
		res := h.do(http.MethodPut, "/map-markers/images/"+id+"/review", map[string]any{"publish": true}, withBearer(token))
		if res.status != http.StatusForbidden {
			t.Fatalf("unauthorized review = %d: %s", res.status, res.body)
		}
	}
	for _, token := range []string{mod, admin} {
		queue := h.do(http.MethodGet, "/map-markers/moderation/images", nil, withBearer(token))
		if queue.status != 200 || queue.data(t)["count"] != float64(1) {
			t.Fatalf("review queue = %d %s", queue.status, queue.body)
		}
	}
	otherQueue := h.do(http.MethodGet, "/map-markers/moderation/images", nil, withBearer(otherMod))
	if otherQueue.status != 200 || otherQueue.data(t)["count"] != float64(0) {
		t.Fatalf("wrong-game queue leaked: %d %s", otherQueue.status, otherQueue.body)
	}
	approved := h.do(http.MethodPut, "/map-markers/images/"+id+"/review", map[string]any{"publish": true}, withBearer(mod))
	if approved.status != 200 {
		t.Fatalf("approve = %d: %s", approved.status, approved.body)
	}
	public := h.do(http.MethodGet, "/map-markers/images"+markerImageQuery, nil)
	if public.data(t)["count"] != float64(1) {
		t.Fatalf("approved image missing: %s", public.body)
	}
	rows := public.data(t)["results"].([]any)
	if rows[0].(map[string]any)["url"] != url {
		t.Fatal("stored URL changed on read")
	}
	h.do(http.MethodPut, "/map-markers/images/"+id+"/review", map[string]any{"publish": false}, withBearer(mod))
	public = h.do(http.MethodGet, "/map-markers/images"+markerImageQuery, nil)
	if public.data(t)["count"] != float64(0) {
		t.Fatal("withdrawn image remains public")
	}
}

func TestMarkerCommentAttachmentsCommitTogetherAndFollowCommentVisibility(t *testing.T) {
	store := blob.NewMemory()
	h := newHarnessWith(t, nil, store)
	author := h.registerAndLogin("attachment-author", "attachment-author@example.com", "hunter2hunter2")
	admin := h.registerAndLogin("attachment-admin", "attachment-admin@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(admin)
	path := "/map-markers/comments/with-images" + markerImageQuery
	res := markerImageUpload(t, h, author, path, "Entrance behind the cliff.", pngOf(t, 128, 64), pngOf(t, 64, 128))
	if res.status != http.StatusOK {
		t.Fatalf("comment with images = %d: %s", res.status, res.body)
	}
	data := res.data(t)
	commentID := data["comment"].(map[string]any)["id"].(string)
	images := data["images"].([]any)
	if len(images) != 2 {
		t.Fatalf("attachments = %d", len(images))
	}
	for _, item := range images {
		image := item.(map[string]any)
		if image["commentId"] != commentID {
			t.Fatalf("attachment lost owner: %v", image)
		}
		review := h.do(http.MethodPut, "/map-markers/images/"+image["id"].(string)+"/review", map[string]any{"publish": true}, withBearer(admin))
		if review.status != 200 {
			t.Fatalf("review = %d: %s", review.status, review.body)
		}
	}
	// Deleting the comment withdraws all of its images, including approved ones.
	h.do(http.MethodDelete, "/map-markers/comments/"+commentID, nil, withBearer(author))
	res = h.do(http.MethodGet, "/map-markers/images"+markerImageQuery, nil)
	if res.data(t)["count"] != float64(0) {
		t.Fatalf("deleted comment's images leaked: %s", res.body)
	}

	before, _ := store.List(context.Background(), "markers/")
	res = markerImageUpload(t, h, author, path, "Do not publish half a comment.", pngOf(t, 128, 64), []byte("invalid image"))
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("bad image = %d: %s", res.status, res.body)
	}
	after, _ := store.List(context.Background(), "markers/")
	if len(after) != len(before) {
		t.Fatalf("failed upload left orphan objects: %d -> %d", len(before), len(after))
	}
	res = h.do(http.MethodGet, "/map-markers/comments"+markerImageQuery, nil)
	if res.data(t)["count"] != float64(0) {
		t.Fatalf("failed upload published text: %s", res.body)
	}
	res = markerImageUpload(t, h, author, path, "Too many images.", pngOf(t, 64, 64), pngOf(t, 64, 64), pngOf(t, 64, 64), pngOf(t, 64, 64))
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("four images = %d: %s", res.status, res.body)
	}
}

func TestMarkerImageUploadRequiresAccountStorageAndValidImage(t *testing.T) {
	h := newHarnessWith(t, nil, blob.NewMemory())
	author := h.registerAndLogin("validate-image", "validate-image@example.com", "hunter2hunter2")
	for _, test := range []struct {
		token  string
		file   []byte
		status int
	}{
		{"", pngOf(t, 64, 64), http.StatusUnauthorized},
		{author, []byte("not an image"), http.StatusUnprocessableEntity},
		{author, make([]byte, (4<<20)+1), http.StatusRequestEntityTooLarge},
	} {
		res := markerImageUpload(t, h, test.token, "/map-markers/images"+markerImageQuery, "", test.file)
		if res.status != test.status {
			t.Fatalf("upload = %d, want %d: %s", res.status, test.status, res.body)
		}
	}
}

func TestMarkerCommunityAcceptsExistingCrossGameIdentifiers(t *testing.T) {
	h := newHarnessWith(t, nil, blob.NewMemory())
	author := h.registerAndLogin("cross-game-author", "cross-game-author@example.com", "hunter2hunter2")
	for _, target := range []map[string]any{
		{"game": "aion2", "map": "World_L_B", "marker": "World_L_B-battlefield-5001", "body": "AION2 location."},
		{"game": "palworld", "map": "MainWorld", "marker": "MainWorld-BluePlatypus_Fire-1", "body": "Palworld location."},
		{"game": "vrising", "map": "Vardoran", "marker": "boss-char-bandit-frostarrow-vblood-a19c46dc2625", "body": "V Rising location."},
	} {
		res := h.do(http.MethodPost, "/map-markers/comments", target, withBearer(author))
		if res.status != http.StatusOK {
			t.Fatalf("existing %v identifier rejected: %d %s", target["game"], res.status, res.body)
		}
	}
}

func TestMarkerCommentImagesDoNotWaitForTheirOwnTransactionConnection(t *testing.T) {
	h := newHarnessWith(t, func(cfg *config.Config) { cfg.Postgres.MaxConns = 1 }, blob.NewMemory())
	author := h.registerAndLogin("single-connection", "single-connection@example.com", "hunter2hunter2")
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if err := w.WriteField("body", "Works on a one-connection pool."); err != nil {
		t.Fatal(err)
	}
	part, err := w.CreateFormFile("files", "image.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(pngOf(t, 64, 64)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	res := h.doRaw(http.MethodPost, "/map-markers/comments/with-images"+markerImageQuery, buf.Bytes(), w.FormDataContentType(), withBearer(author), func(r *http.Request) { *r = *r.WithContext(ctx) })
	if res.status != http.StatusOK {
		t.Fatalf("single-connection upload = %d: %s", res.status, res.body)
	}
}
