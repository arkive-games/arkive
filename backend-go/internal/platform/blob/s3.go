package blob

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Config describes one S3-compatible endpoint.
//
// The same struct serves MinIO and Tencent COS; UsePathStyle is what separates
// them. See NewS3.
type S3Config struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string

	// UsePathStyle puts the bucket in the request path (endpoint/bucket/key)
	// instead of the host (bucket.endpoint/key).
	//
	// MinIO needs it: it is typically reached at a bare host or IP with no
	// wildcard DNS beneath it, so a virtual-hosted request resolves nowhere.
	// Tencent COS needs it off, addressing buckets as
	// bucket.cos.<region>.myqcloud.com. Setting it wrongly fails as a DNS error
	// or a signature mismatch rather than anything that names the real problem,
	// which is why the addressing each configuration puts on the wire is tested
	// directly.
	UsePathStyle bool

	// PublicBaseURL prefixes object keys to form the URL browsers fetch. It is
	// separate from Endpoint because reads usually go through a CDN or a bucket
	// domain rather than the endpoint the service writes to.
	PublicBaseURL string

	// HTTPClient overrides the transport. Production leaves it nil; the
	// addressing tests set it so they can capture the request the SDK actually
	// produces for a virtual-hosted configuration, whose Host does not resolve
	// on a test machine.
	HTTPClient *http.Client
}

// S3Store is a Store backed by any S3-compatible service.
type S3Store struct {
	client        *s3.Client
	bucket        string
	publicBaseURL string
}

// NewS3 builds a store from static credentials.
//
// The aws.Config is assembled by hand rather than through
// aws-sdk-go-v2/config.LoadDefaultConfig: the default loader resolves IMDS, SSO
// profiles and EC2 endpoints, none of which exist for a static-credential
// deployment against MinIO or COS, and each is a network timeout waiting to
// happen at startup.
func NewS3(cfg S3Config) (*S3Store, error) {
	if cfg.Endpoint == "" || cfg.Bucket == "" {
		return nil, fmt.Errorf("%w: endpoint and bucket are required", ErrNotConfigured)
	}
	if _, err := url.Parse(cfg.Endpoint); err != nil {
		return nil, fmt.Errorf("s3 endpoint is not a valid URL: %w", err)
	}

	region := cfg.Region
	if region == "" {
		// SigV4 requires a region in the credential scope even where the server
		// ignores it, as MinIO does. Defaulting keeps a working dev setup from
		// needing a value that means nothing to it.
		region = "us-east-1"
	}

	awsCfg := aws.Config{
		Region: region,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID, cfg.SecretAccessKey, ""),
	}
	if cfg.HTTPClient != nil {
		awsCfg.HTTPClient = cfg.HTTPClient
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = cfg.UsePathStyle
	})

	base := cfg.PublicBaseURL
	if base == "" {
		// Fall back to addressing the endpoint the same way writes do, so a
		// minimal configuration still yields fetchable URLs.
		if cfg.UsePathStyle {
			base = strings.TrimSuffix(cfg.Endpoint, "/") + "/" + cfg.Bucket
		} else {
			base = insertBucketHost(cfg.Endpoint, cfg.Bucket)
		}
	}

	return &S3Store{
		client:        client,
		bucket:        cfg.Bucket,
		publicBaseURL: strings.TrimSuffix(base, "/"),
	}, nil
}

// Put writes an object.
func (s *S3Store) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	// ContentLength is set explicitly because the SDK would otherwise buffer the
	// whole body to discover it, or fall back to chunked encoding that some
	// S3-compatible servers reject.
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentLength: aws.Int64(size),
		ContentType:   aws.String(contentType),
		// Objects are content-addressed and therefore immutable, so they can be
		// cached for as long as any cache is willing to keep them.
		CacheControl: aws.String("public, max-age=31536000, immutable"),
	})
	if err != nil {
		return fmt.Errorf("put object %q: %w", key, err)
	}
	return nil
}

// Delete removes an object.
func (s *S3Store) Delete(ctx context.Context, key string) error {
	if _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}); err != nil {
		return fmt.Errorf("delete object %q: %w", key, err)
	}
	return nil
}

// PublicURL renders the address a browser fetches the object from.
func (s *S3Store) PublicURL(key string) string {
	return s.publicBaseURL + "/" + key
}

// insertBucketHost turns https://cos.ap-guangzhou.myqcloud.com into
// https://bucket.cos.ap-guangzhou.myqcloud.com, which is how a virtual-hosted
// service addresses a bucket.
func insertBucketHost(endpoint, bucket string) string {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return strings.TrimSuffix(endpoint, "/") + "/" + bucket
	}
	u.Host = bucket + "." + u.Host
	return strings.TrimSuffix(u.String(), "/")
}
