package core_test

import (
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

// These tests drive the avatar flow against a real S3-compatible server, which
// is the only way to exercise the parts a fake cannot be wrong about: request
// signing, bucket addressing, and whether a browser can actually fetch the
// object afterwards.
//
// The same test runs against either backend, because that is the point — MinIO
// in development and Tencent COS in production must be one code path.
//
//	# MinIO
//	docker run --rm -d -p 9000:9000 -e MINIO_ROOT_USER=minioadmin \
//	  -e MINIO_ROOT_PASSWORD=minioadmin minio/minio server /data
//	docker run --rm --network host --entrypoint sh minio/mc -c \
//	  "mc alias set l http://127.0.0.1:9000 minioadmin minioadmin && \
//	   mc mb --ignore-existing l/arkive-test && mc anonymous set download l/arkive-test"
//
//	ARKIVE_TEST_S3_ENDPOINT=http://127.0.0.1:9000 \
//	ARKIVE_TEST_S3_BUCKET=arkive-test \
//	ARKIVE_TEST_S3_ACCESS_KEY_ID=minioadmin \
//	ARKIVE_TEST_S3_SECRET_ACCESS_KEY=minioadmin \
//	ARKIVE_TEST_S3_PATH_STYLE=true \
//	ARKIVE_TEST_POSTGRES_URL=... go test ./internal/core/ -run Storage -v
//
//	# Tencent COS: same variables, with the region set and path style off.
//	ARKIVE_TEST_S3_ENDPOINT=https://cos.ap-guangzhou.myqcloud.com \
//	ARKIVE_TEST_S3_REGION=ap-guangzhou \
//	ARKIVE_TEST_S3_BUCKET=<name>-<appid> \
//	ARKIVE_TEST_S3_ACCESS_KEY_ID=<SecretId> \
//	ARKIVE_TEST_S3_SECRET_ACCESS_KEY=<SecretKey> \
//	ARKIVE_TEST_S3_PATH_STYLE=false ...
const (
	s3EndpointEnv  = "ARKIVE_TEST_S3_ENDPOINT"
	s3BucketEnv    = "ARKIVE_TEST_S3_BUCKET"
	s3KeyIDEnv     = "ARKIVE_TEST_S3_ACCESS_KEY_ID"
	s3SecretEnv    = "ARKIVE_TEST_S3_SECRET_ACCESS_KEY"
	s3RegionEnv    = "ARKIVE_TEST_S3_REGION"
	s3PathStyleEnv = "ARKIVE_TEST_S3_PATH_STYLE"
	s3PublicEnv    = "ARKIVE_TEST_S3_PUBLIC_BASE_URL"
)

func realStore(t *testing.T) *blob.S3Store {
	t.Helper()

	endpoint := os.Getenv(s3EndpointEnv)
	if endpoint == "" {
		t.Skipf("%s is not set; skipping object-storage tests", s3EndpointEnv)
	}
	bucket := os.Getenv(s3BucketEnv)
	if bucket == "" {
		t.Fatalf("%s is set but %s is not", s3EndpointEnv, s3BucketEnv)
	}

	pathStyle := true
	if v := os.Getenv(s3PathStyleEnv); v != "" {
		parsed, err := strconv.ParseBool(v)
		if err != nil {
			t.Fatalf("%s=%q is not a boolean", s3PathStyleEnv, v)
		}
		pathStyle = parsed
	}

	store, err := blob.NewS3(blob.S3Config{
		Endpoint:        endpoint,
		Region:          os.Getenv(s3RegionEnv),
		Bucket:          bucket,
		AccessKeyID:     os.Getenv(s3KeyIDEnv),
		SecretAccessKey: os.Getenv(s3SecretEnv),
		UsePathStyle:    pathStyle,
		PublicBaseURL:   os.Getenv(s3PublicEnv),
	})
	if err != nil {
		t.Fatalf("build store for %s: %v", endpoint, err)
	}
	t.Logf("object storage: endpoint=%s bucket=%s pathStyle=%v region=%q",
		endpoint, bucket, pathStyle, os.Getenv(s3RegionEnv))
	return store
}

// The end-to-end property that matters: an avatar uploaded through the API is
// afterwards fetchable by an anonymous browser at the URL the API published.
//
// Every step here is one a fake cannot verify — the object is really signed,
// really addressed correctly for this backend, really public, and really the
// bytes we encoded.
func TestStorageRoundTripThroughRealObjectStorage(t *testing.T) {
	store := realStore(t)
	h := newHarnessWith(t, nil, store)

	token := h.registerAndLogin("storage", "storage@example.com", "hunter2hunter2")
	source := pngFixture(t, 700, 400, 42)

	res := h.uploadAvatar("/users/me/avatar", "me.png", "image/png", source, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", res.status, res.body)
	}
	url := avatarURLOf(t, res)
	if url == "" {
		t.Fatal("upload published no URL")
	}
	t.Logf("published URL: %s", url)

	// Fetched with no credentials at all, which is how a browser will load it.
	client := &http.Client{Timeout: 30 * time.Second}
	get, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer get.Body.Close()

	if get.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(get.Body, 2048))
		t.Fatalf("anonymous GET %s = %d, want 200. The bucket most likely lacks a public "+
			"read policy.\nbody: %s", url, get.StatusCode, body)
	}

	body, err := io.ReadAll(get.Body)
	if err != nil {
		t.Fatalf("read object: %v", err)
	}
	if len(body) == 0 {
		t.Fatal("the fetched object is empty")
	}

	// The served bytes must be the normalised avatar, not the upload. This is what
	// makes the bucket safe to serve from: every object in it was produced by this
	// service, so a polyglot file cannot reach a browser.
	if string(body) == string(source) {
		t.Error("the original upload was served back; it should have been re-encoded")
	}
	// The format follows the upload, so a PNG is served as a PNG. The header has to
	// come from the object's stored metadata, since the key's extension is not
	// what a browser trusts.
	if ct := get.Header.Get("Content-Type"); ct != "image/png" {
		t.Errorf("served Content-Type = %q, want image/png for an uploaded PNG", ct)
	}
	// Content-addressed objects are immutable, so the caching header has to say
	// so or the CDN in front of the bucket buys nothing.
	if cc := get.Header.Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("served Cache-Control = %q, want it to mark the object immutable", cc)
	}
}

// The claim that no garbage collector is needed rests on a superseded object
// really being gone from the server, not merely dropped from a map in a fake.
// This is the test that establishes it against a real backend.
func TestStorageRemovesSupersededObjectsForReal(t *testing.T) {
	store := realStore(t)
	h := newHarnessWith(t, nil, store)

	token := h.registerAndLogin("sweeper", "sweeper@example.com", "hunter2hunter2")

	first := h.uploadAvatar("/users/me/avatar", "1.png", "image/png",
		pngFixture(t, 400, 400, 60), withBearer(token))
	if first.status != http.StatusOK {
		t.Fatalf("first upload = %d: %s", first.status, first.body)
	}
	firstURL := avatarURLOf(t, first)

	client := &http.Client{Timeout: 30 * time.Second}
	if code := statusOf(t, client, firstURL); code != http.StatusOK {
		t.Fatalf("the first avatar is not fetchable: %d", code)
	}

	second := h.uploadAvatar("/users/me/avatar", "2.png", "image/png",
		pngFixture(t, 400, 400, 61), withBearer(token))
	if second.status != http.StatusOK {
		t.Fatalf("second upload = %d: %s", second.status, second.body)
	}
	secondURL := avatarURLOf(t, second)
	if firstURL == secondURL {
		t.Fatal("fixtures produced the same URL")
	}

	if code := statusOf(t, client, secondURL); code != http.StatusOK {
		t.Errorf("the new avatar is not fetchable: %d", code)
	}
	if code := statusOf(t, client, firstURL); code == http.StatusOK {
		t.Errorf("the superseded object %s is still served, so orphans would accumulate", firstURL)
	}
}

// Each account owns its own prefix, so the same picture uploaded by two accounts
// is two objects. That is the trade that removes the need for reference counting:
// nothing is shared, so anything unreferenced can be deleted immediately.
func TestStorageKeepsAccountsInSeparatePrefixes(t *testing.T) {
	store := realStore(t)
	h := newHarnessWith(t, nil, store)

	a := h.registerAndLogin("prefix-a", "prefix-a@example.com", "hunter2hunter2")
	b := h.registerAndLogin("prefix-b", "prefix-b@example.com", "hunter2hunter2")
	same := pngFixture(t, 400, 400, 62)

	first := h.uploadAvatar("/users/me/avatar", "a.png", "image/png", same, withBearer(a))
	second := h.uploadAvatar("/users/me/avatar", "b.png", "image/png", same, withBearer(b))
	if first.status != http.StatusOK || second.status != http.StatusOK {
		t.Fatalf("uploads = %d and %d", first.status, second.status)
	}

	firstURL, secondURL := avatarURLOf(t, first), avatarURLOf(t, second)
	if firstURL == secondURL {
		t.Fatalf("both accounts point at one object: %s", firstURL)
	}

	// Both remain fetchable: one account replacing its avatar must never remove
	// the other's copy.
	client := &http.Client{Timeout: 30 * time.Second}
	for _, url := range []string{firstURL, secondURL} {
		if code := statusOf(t, client, url); code != http.StatusOK {
			t.Errorf("GET %s = %d, want 200", url, code)
		}
	}

	if replaced := h.uploadAvatar("/users/me/avatar", "a2.png", "image/png",
		pngFixture(t, 400, 400, 63), withBearer(a)); replaced.status != http.StatusOK {
		t.Fatalf("replacement upload = %d: %s", replaced.status, replaced.body)
	}
	if code := statusOf(t, client, secondURL); code != http.StatusOK {
		t.Errorf("the other account's avatar was removed by an unrelated replacement: %d", code)
	}
}

// statusOf fetches a URL anonymously and reports the status.
func statusOf(t *testing.T, client *http.Client, url string) int {
	t.Helper()
	res, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	return res.StatusCode
}

// Deleting is not part of the avatar flow, but the reclaim job will need it, so
// the operation is verified against a real server rather than assumed.
func TestStorageDeleteRemovesTheObject(t *testing.T) {
	store := realStore(t)
	h := newHarnessWith(t, nil, store)

	token := h.registerAndLogin("deleter", "deleter@example.com", "hunter2hunter2")
	res := h.uploadAvatar("/users/me/avatar", "a.png", "image/png",
		pngFixture(t, 400, 400, 44), withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("upload = %d: %s", res.status, res.body)
	}
	url := avatarURLOf(t, res)

	// Recover the key from the published URL: everything after the last
	// "avatars/" boundary belongs to the object.
	idx := strings.LastIndex(url, "avatars/")
	if idx < 0 {
		t.Fatalf("published URL %q contains no avatars/ segment", url)
	}
	key := url[idx:]

	if err := store.Delete(t.Context(), key); err != nil {
		t.Fatalf("Delete %q: %v", key, err)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	get, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer get.Body.Close()
	if get.StatusCode == http.StatusOK {
		t.Errorf("the object is still served after Delete: %s", url)
	}
}
