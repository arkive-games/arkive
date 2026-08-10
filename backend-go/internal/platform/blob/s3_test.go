package blob

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// The MinIO and COS configurations differ in exactly one setting, and getting it
// wrong surfaces as a DNS failure or a signature mismatch rather than anything
// naming the real cause. These tests assert what each configuration actually
// puts on the wire, which is verifiable without credentials for either service.

type captured struct {
	mu       sync.Mutex
	host     string
	uri      string
	path     string
	method   string
	body     string
	authz    string
	cacheHdr string
	typeHdr  string
	length   string
}

func (c *captured) snapshot() captured {
	c.mu.Lock()
	defer c.mu.Unlock()
	return captured{
		host: c.host, uri: c.uri, path: c.path, method: c.method, body: c.body,
		authz: c.authz, cacheHdr: c.cacheHdr, typeHdr: c.typeHdr, length: c.length,
	}
}

// newRecorder returns a store whose requests are captured instead of sent.
//
// Every connection is dialled to the stub regardless of the host the SDK chose,
// so a virtual-hosted request — whose host is bucket.<endpoint> and resolves
// nowhere on a test machine — still arrives and can be inspected.
//
// endpointHost, when given, replaces the stub's 127.0.0.1 with a DNS-style name.
// That is not cosmetic: **the SDK silently falls back to path-style addressing
// when the endpoint host is an IP address**, because no label can be prefixed
// onto one. A virtual-hosted configuration can therefore only be observed
// against a hostname — and, usefully, it means a MinIO deployment addressed by
// IP is path-style whether or not anyone asked for it.
func newRecorder(t *testing.T, cfg S3Config, endpointHost string) (*S3Store, *captured) {
	t.Helper()

	rec := &captured{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body []byte
		if r.Body != nil {
			body, _ = io.ReadAll(r.Body)
		}
		rec.mu.Lock()
		rec.host = r.Host
		rec.uri = r.URL.RequestURI()
		rec.path = r.URL.Path
		rec.method = r.Method
		rec.body = string(body)
		rec.authz = r.Header.Get("Authorization")
		rec.cacheHdr = r.Header.Get("Cache-Control")
		rec.typeHdr = r.Header.Get("Content-Type")
		rec.length = r.Header.Get("Content-Length")
		rec.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	target := strings.TrimPrefix(server.URL, "http://")
	cfg.HTTPClient = &http.Client{Transport: &http.Transport{
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, target)
		},
	}}
	if cfg.Endpoint == "" {
		if endpointHost == "" {
			cfg.Endpoint = server.URL
		} else {
			_, port, err := net.SplitHostPort(target)
			if err != nil {
				t.Fatalf("split stub address %q: %v", target, err)
			}
			cfg.Endpoint = "http://" + endpointHost + ":" + port
		}
	}

	store, err := NewS3(cfg)
	if err != nil {
		t.Fatalf("NewS3: %v", err)
	}
	return store, rec
}

// MinIO is reached at a bare host with no wildcard DNS beneath it, so the bucket
// has to travel in the path.
func TestPathStylePutsTheBucketInThePath(t *testing.T) {
	store, rec := newRecorder(t, S3Config{
		Bucket:          "arkive",
		Region:          "us-east-1",
		AccessKeyID:     "minioadmin",
		SecretAccessKey: "minioadmin",
		UsePathStyle:    true,
	}, "minio.internal.test")

	if err := store.Put(context.Background(), "avatars/abc.256.jpg",
		strings.NewReader("bytes"), 5, PutOptions{ContentType: "image/jpeg"}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	got := rec.snapshot()
	if got.path != "/arkive/avatars/abc.256.jpg" {
		t.Errorf("request path = %q, want the bucket in the path", got.path)
	}
	if strings.HasPrefix(got.host, "arkive.") {
		t.Errorf("host = %q, want the bucket absent from the host under path style", got.host)
	}
}

// Tencent COS addresses buckets as bucket.cos.<region>.myqcloud.com, so the same
// code with path style off must move the bucket into the host.
func TestVirtualHostedPutsTheBucketInTheHost(t *testing.T) {
	store, rec := newRecorder(t, S3Config{
		Bucket:          "arkive-1250000000",
		Region:          "ap-guangzhou",
		AccessKeyID:     "AKIDxxxxxxxx",
		SecretAccessKey: "secret",
		UsePathStyle:    false,
	}, "cos.ap-guangzhou.myqcloud.test")

	if err := store.Put(context.Background(), "avatars/abc.256.jpg",
		strings.NewReader("bytes"), 5, PutOptions{ContentType: "image/jpeg"}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	got := rec.snapshot()
	if !strings.HasPrefix(got.host, "arkive-1250000000.") {
		t.Errorf("host = %q, want it to start with the bucket name", got.host)
	}
	if got.path != "/avatars/abc.256.jpg" {
		t.Errorf("request path = %q, want the key alone with no bucket prefix", got.path)
	}
}

// The object metadata is what makes a content-addressed URL cacheable forever,
// and an explicit length is what stops the SDK falling back to chunked encoding
// that some S3-compatible servers reject.
func TestPutSendsImmutableCachingAndAnExplicitLength(t *testing.T) {
	store, rec := newRecorder(t, S3Config{
		Bucket: "arkive", AccessKeyID: "k", SecretAccessKey: "s", UsePathStyle: true,
	}, "")

	body := "some jpeg bytes"
	if err := store.Put(context.Background(), "avatars/x.256.jpg",
		strings.NewReader(body), int64(len(body)), PutOptions{ContentType: "image/jpeg"}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	got := rec.snapshot()
	if got.method != http.MethodPut {
		t.Errorf("method = %q, want PUT", got.method)
	}
	if got.typeHdr != "image/jpeg" {
		t.Errorf("Content-Type = %q, want image/jpeg", got.typeHdr)
	}
	if !strings.Contains(got.cacheHdr, "immutable") {
		t.Errorf("Cache-Control = %q, want it to mark the object immutable", got.cacheHdr)
	}
	if got.length != "15" {
		t.Errorf("Content-Length = %q, want 15 sent explicitly", got.length)
	}
	if got.body != body {
		t.Errorf("body = %q, want %q", got.body, body)
	}
	// SigV4 must be used, and the credential scope carries the region even
	// though MinIO ignores it.
	if !strings.Contains(got.authz, "AWS4-HMAC-SHA256") {
		t.Errorf("Authorization = %q, want a SigV4 signature", got.authz)
	}
}

// The region is part of the SigV4 credential scope, so it cannot be left empty
// even against a server that ignores it.
func TestRegionDefaultsSoSigningWorksWithoutOne(t *testing.T) {
	store, rec := newRecorder(t, S3Config{
		Bucket: "arkive", AccessKeyID: "k", SecretAccessKey: "s", UsePathStyle: true,
	}, "")
	if err := store.Put(context.Background(), "k", strings.NewReader("x"), 1, PutOptions{ContentType: "image/jpeg"}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if authz := rec.snapshot().authz; !strings.Contains(authz, "/us-east-1/s3/aws4_request") {
		t.Errorf("credential scope = %q, want the default region us-east-1", authz)
	}
}

func TestPublicURL(t *testing.T) {
	for _, tc := range []struct {
		name string
		cfg  S3Config
		want string
	}{
		{
			name: "explicit base wins, which is how a CDN is put in front",
			cfg:  S3Config{Endpoint: "http://localhost:9000", Bucket: "arkive", PublicBaseURL: "https://cdn.arkive.test"},
			want: "https://cdn.arkive.test/avatars/a.256.jpg",
		},
		{
			name: "a trailing slash on the base does not double up",
			cfg:  S3Config{Endpoint: "http://localhost:9000", Bucket: "arkive", PublicBaseURL: "https://cdn.arkive.test/"},
			want: "https://cdn.arkive.test/avatars/a.256.jpg",
		},
		{
			name: "path style falls back to endpoint/bucket",
			cfg:  S3Config{Endpoint: "http://localhost:9000", Bucket: "arkive", UsePathStyle: true},
			want: "http://localhost:9000/arkive/avatars/a.256.jpg",
		},
		{
			name: "virtual hosted falls back to bucket.endpoint, as COS serves it",
			cfg:  S3Config{Endpoint: "https://cos.ap-guangzhou.myqcloud.com", Bucket: "arkive-1250000000"},
			want: "https://arkive-1250000000.cos.ap-guangzhou.myqcloud.com/avatars/a.256.jpg",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := tc.cfg
			cfg.AccessKeyID, cfg.SecretAccessKey = "k", "s"
			store, err := NewS3(cfg)
			if err != nil {
				t.Fatalf("NewS3: %v", err)
			}
			if got := store.PublicURL("avatars/a.256.jpg"); got != tc.want {
				t.Errorf("PublicURL = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestNewS3RefusesIncompleteConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name string
		cfg  S3Config
	}{
		{"no endpoint", S3Config{Bucket: "arkive"}},
		{"no bucket", S3Config{Endpoint: "http://localhost:9000"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NewS3(tc.cfg); err == nil {
				t.Fatal("expected an error, got nil")
			}
		})
	}
}

// Caching correctness is a property of the key, not of the bucket. A digest-named
// object can be cached for a year; a fixed key such as a preset cannot, or
// replacing the artwork behind it would be invisible for a year with no deploy
// able to clear it.
func TestCacheControlFollowsWhetherTheKeyCanChange(t *testing.T) {
	for _, tc := range []struct {
		name        string
		mutable     bool
		wantContain string
		wantAbsent  string
	}{
		{"digest-named object is immutable for a year", false, "max-age=31536000", "max-age=86400"},
		{"fixed key gets a day and must not claim immutability", true, "max-age=86400", "immutable"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store, rec := newRecorder(t, S3Config{
				Bucket: "arkive", AccessKeyID: "k", SecretAccessKey: "s", UsePathStyle: true,
			}, "")

			opts := PutOptions{ContentType: "image/png", Mutable: tc.mutable}
			if err := store.Put(context.Background(), "avatars/x.png",
				strings.NewReader("bytes"), 5, opts); err != nil {
				t.Fatalf("Put: %v", err)
			}

			got := rec.snapshot().cacheHdr
			if !strings.Contains(got, tc.wantContain) {
				t.Errorf("Cache-Control = %q, want it to contain %q", got, tc.wantContain)
			}
			if strings.Contains(got, tc.wantAbsent) {
				t.Errorf("Cache-Control = %q, must not contain %q", got, tc.wantAbsent)
			}
		})
	}
}
