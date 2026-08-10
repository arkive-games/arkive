# User Avatar — Design

Date: 2026-08-10
Status: accepted

Gives an account a picture, stored in S3-compatible object storage: MinIO in development,
Tencent COS in production. This is also the backend's first use of object storage, so it
introduces `internal/platform/blob` alongside the feature.

## 1. Two constraints that decided the design

Neither was a preference; both were established before writing code.

**Avatars cannot be WebP.** The Dockerfile builds with `CGO_ENABLED=0`, which rules out
every cgo encoder (libvips, `chai2010/webp`), and `golang.org/x/image/webp` is **decode
only** — `x/image` can encode BMP and TIFF and nothing else useful. The Python service wrote
WebP; this one cannot without changing the build.

Consequence: **accept** JPEG, PNG, GIF and WebP, all of which decode with the standard
library plus `x/image/webp`. **Emit** PNG when the source carries any transparency and JPEG
quality 85 when it does not. Always-JPEG would composite alpha onto a background, which is
visibly wrong on Arkive's dark theme; always-PNG costs roughly ten times the bytes for a
photograph.

**huma parses multipart natively** (`huma.MultipartFormFiles[T]`, per-operation
`MaxBodyBytes`), so no request parsing is hand-written. Its MIME validator trusts the
declared `Content-Type` before sniffing, so that check cannot be the real one — decoding is.

## 2. Package boundaries

```
internal/platform/blob    Store interface, S3 implementation, in-memory fake. No domain knowledge.
internal/core/uploads     the image pipeline: decode -> validate -> crop -> resize -> encode -> digest
internal/core/users       avatar_key column, SetAvatar/ClearAvatar, avatarUrl on the DTOs
internal/core/httpapi     PUT/DELETE /users/me/avatar, DELETE /users/{id}/avatar
```

`blob` belongs in `platform` because it knows about buckets and nothing about avatars, which
keeps the `core/* -> platform` dependency rule intact and leaves it reusable by the comment
and feedback images the architecture doc anticipates. `uploads` is the package name that
document already reserved.

The pipeline takes a `blob.Store`, so every test of it runs against an in-memory
implementation and the HTTP flow needs no container.

## 3. Storage and keys

`avatar_key text` nullable on `core.users`, holding the **complete** object key:

```
avatars/<sha256-base64url of the encoded bytes>.256.jpg
```

Content-addressed, so the URL is immutable and can be cached indefinitely behind a CDN, and
two accounts uploading the same file share one object without a dedup table.

The API returns `avatarUrl`, built from a configured public base, and never the raw key.
Moving buckets or putting a CDN in front is then a configuration change rather than a
frontend deploy.

One rendition, 256x256, centre-cropped to a square. A second size would be a schema change;
that is preferable to inventing a key convention for a variant nothing renders yet.

**Objects are never deleted.** Content addressing means two accounts can share one object, so
deleting on change could blank a different user's avatar. `DELETE` clears the column only.
Orphaned objects therefore accumulate; reclaiming them is a job that diffs the bucket against
the column, and it is out of scope here. This is a deliberate trade, not an oversight: the
alternative is reference counting, which is a table this feature does not otherwise need.

## 4. The pipeline, and what each step defends against

1. `MaxBodyBytes` of 8 MiB on the operation bounds the transfer.
2. `image.DecodeConfig` reads the dimensions **before** any pixel buffer is allocated, and
   the pipeline rejects anything above 50 million pixels. This is the step that matters: a
   10 KB PNG can decode to a gigabyte, so a body-size limit alone is not a defence against a
   decompression bomb.
3. Decode, reject images smaller than 32 px on either side.
4. Centre-crop to a square, resize to 256 with `x/image/draw` CatmullRom.
5. Encode by the alpha rule in §1, hash the encoded bytes, `Put`.

Re-encoding discards all metadata, so EXIF GPS coordinates from a phone photograph never
reach the bucket. That is a genuine privacy property and it falls out of the design rather
than needing separate code.

**Known limitation:** the standard library ignores the EXIF orientation tag, so a rotated
phone photograph lands rotated. Correcting it needs an EXIF dependency for one tag, and the
intended client flow is a crop UI whose canvas export carries no EXIF at all, so it is
documented rather than solved.

## 5. Rate limiting

Per **account**, not per IP. The route is authenticated, and IP keying would penalise
everyone behind one NAT while doing nothing about a single account uploading in a loop.

`auth.RateLimiter` currently derives its key internally from the request addresses. It gains
`AllowKey(key string) bool`, and `Allow` becomes a caller of it — existing behaviour
unchanged, and the avatar route keys on the account uuid. New setting
`AVATAR_UPLOADS_PER_MINUTE`, default 5.

## 6. Configuration

| Variable | MinIO (dev) | Tencent COS (prod) |
|---|---|---|
| `S3_ENDPOINT` | `http://localhost:9000` | `https://cos.ap-guangzhou.myqcloud.com` |
| `S3_REGION` | `us-east-1` | `ap-guangzhou` |
| `S3_BUCKET` | `arkive` | `arkive-1250000000` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | MinIO root creds | COS SecretId / SecretKey |
| `S3_USE_PATH_STYLE` | `true` | `false` |
| `S3_PUBLIC_BASE_URL` | `http://localhost:9000/arkive` | CDN or bucket domain |

`S3_USE_PATH_STYLE` is the setting that separates the two backends: MinIO on a host name
without wildcard DNS needs path-style addressing (`endpoint/bucket/key`), while COS uses
virtual-hosted addressing (`bucket.cos.region.myqcloud.com/key`). Getting it wrong produces
a DNS failure or a signature mismatch rather than a clear error, so §8 tests the addressing
each configuration actually puts on the wire.

The client is a hand-built `aws.Config` with `BaseEndpoint` and static credentials,
deliberately **not** `aws-sdk-go-v2/config`: the default loader pulls in IMDS, SSO and EC2
endpoint resolution that a static-credential non-AWS deployment never uses.

Outside `DEBUG` the service refuses to start with empty S3 settings, matching how
`JWT_SECRET_KEY` is treated. In `DEBUG` it defaults to the compose MinIO and tolerates it
being unreachable, failing at request time with a clear error — so a developer working on
something else is not forced to run MinIO.

`docker-compose.yml` gains MinIO and an `mc` init container, because MinIO neither creates
the bucket nor serves anonymous reads without an explicit policy.

## 7. HTTP surface

| Route | Auth | Result |
|---|---|---|
| `PUT /users/me/avatar` | user | multipart `file`; returns the updated `UserRead` |
| `DELETE /users/me/avatar` | user | clears the column |
| `DELETE /users/{id}/avatar` | admin | moderation removal |

`avatarUrl` is added to both `UserRead` and `UserPublic`, nullable. `UserPublic` gaining it is
the point of the feature: an avatar is public, and the uid lookup is what a profile page
resolves.

## 8. Tests

The split is deliberate: the pipeline is pure and gets exhaustive fast tests, while the parts
that can only be wrong against a real server get tests that talk to one.

**Always run, no container:**

- Pipeline units against the in-memory store: decompression bomb rejected before allocation,
  transparency produces PNG, opaque produces JPEG, animated GIF takes the first frame,
  non-image bytes rejected, a truthful-looking but false `Content-Type` still rejected,
  identical inputs yield identical keys, metadata stripped, undersized rejected.
- The full HTTP flow with the fake store injected through a module option, mirroring the
  existing `WithMailer`.
- **Addressing tests against a recording stub.** The S3 client is pointed at a local HTTP
  server that captures the request line and `Host` header. This asserts that a path-style
  configuration puts the bucket in the path and a virtual-hosted configuration puts it in the
  host — the single most likely way the COS and MinIO configurations differ in production,
  verified without credentials for either.

**Gated on a real server:**

- `ARKIVE_TEST_S3_*` runs the same end-to-end suite against MinIO in a container, exercising
  the aws-sdk wiring, the public URL shape and anonymous readability. Without it the SDK
  integration is never executed and a fake would only prove the fake works.
- The same variables pointed at a real COS bucket run the identical suite there. Tencent
  credentials are not available on the development machine, so this spec cannot claim COS has
  been exercised with a live write; what is verified without credentials is the addressing
  and URL construction above, plus a reachability probe confirming a COS-shaped endpoint
  answers with a COS S3 error document rather than a DNS or TLS failure.

## 9. Out of scope

Reclaiming orphaned objects; multiple renditions; EXIF orientation; client-side cropping UI;
comment and feedback images (the `blob` and `uploads` packages are shaped for them, but no
route is added); presigned uploads.

No app changelog entry: this is backend platform work with no user-visible surface until the
frontend renders an avatar.
