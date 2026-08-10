package blob

import (
	"context"
	"errors"
	"net"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aws/smithy-go"
)

// Tencent COS credentials are not available on the development machine, so the
// credentialed round trip in internal/core/avatar_storage_test.go cannot be run
// here. This test covers what can still be established against the real service
// without any secret, which is more than it sounds:
//
//   - the endpoint form is right, so DNS resolves and TLS completes;
//   - virtual-hosted addressing produces a host COS actually serves, rather than
//     one that resolves nowhere — the single most likely misconfiguration, and
//     the one that distinguishes COS from MinIO;
//   - COS understands the request this client sends, because it replies with a
//     structured S3 error document that the SDK can parse, rather than closing
//     the connection or answering with something else entirely.
//
// What it deliberately does not claim: that a real key would be accepted. Only a
// credentialed write proves that, and the command to run it is documented in
// avatar_storage_test.go.
//
// Opt-in, because it needs the internet:
//
//	ARKIVE_TEST_COS_LIVE=1 go test ./internal/platform/blob/ -run COS -v
func TestLiveCOSUnderstandsThisClient(t *testing.T) {
	if os.Getenv("ARKIVE_TEST_COS_LIVE") == "" {
		t.Skip("ARKIVE_TEST_COS_LIVE is not set; skipping the live Tencent COS probe")
	}

	const (
		endpoint = "https://cos.ap-guangzhou.myqcloud.com"
		region   = "ap-guangzhou"
		// A syntactically valid but certainly unowned bucket: <name>-<appid>.
		bucket = "arkive-avatar-probe-1250000000"
	)

	store, err := NewS3(S3Config{
		Endpoint: endpoint,
		Region:   region,
		Bucket:   bucket,
		// Shaped like a real SecretId, and deliberately not one.
		AccessKeyID:     "AKIDprobe0000000000000000000000000000",
		SecretAccessKey: "probe-secret-not-a-real-key",
		// The production setting: COS addresses buckets in the host.
		UsePathStyle: false,
	})
	if err != nil {
		t.Fatalf("NewS3 for COS: %v", err)
	}

	// The URL a browser would be given must name the bucket as a host label.
	url := store.PublicURL("avatars/probe.256.jpg")
	wantHost := "https://" + bucket + ".cos.ap-guangzhou.myqcloud.com/"
	if !strings.HasPrefix(url, wantHost) {
		t.Errorf("PublicURL = %q, want it to start with %q", url, wantHost)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err = store.Put(ctx, "avatars/probe.256.jpg", strings.NewReader("probe"), 5, PutOptions{ContentType: "image/jpeg"})
	if err == nil {
		t.Fatal("writing to an unowned bucket with a fake key succeeded, which cannot be right")
	}

	// A DNS or TLS failure would mean the endpoint or the addressing is wrong,
	// which is the failure this test exists to catch.
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		t.Fatalf("the COS host did not resolve, so the endpoint or addressing is wrong: %v", dnsErr)
	}

	// Reaching an S3 error means COS parsed the request and answered in the
	// dialect the SDK speaks.
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("COS did not return a structured S3 error, so the request was not understood: %v", err)
	}

	t.Logf("live COS answered: code=%q message=%q", apiErr.ErrorCode(), apiErr.ErrorMessage())

	// Any of these means the request was well-formed and rejected on identity or
	// ownership, which is the expected outcome for a fake key.
	switch apiErr.ErrorCode() {
	case "InvalidAccessKeyId", "AccessDenied", "SignatureDoesNotMatch", "NoSuchBucket":
	default:
		t.Errorf("unexpected COS error code %q; expected an identity or ownership refusal",
			apiErr.ErrorCode())
	}
}
