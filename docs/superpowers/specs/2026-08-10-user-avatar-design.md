# User Avatar — Design

Date: 2026-08-10
Status: accepted

Gives an account a picture, stored in S3-compatible object storage: MinIO in development,
Tencent COS in production. This is also the backend's first use of object storage, so it
introduces `internal/platform/blob` alongside the feature.

## 1. Two constraints that decided the design

Neither was a preference; both were established before writing code.

**The uploaded format is preserved, not normalised.** A PNG stays a lossless PNG, a JPEG stays
a JPEG, a GIF stays a GIF, and a WebP stays a WebP. Normalising to one format either discards
alpha or costs an order of magnitude in bytes for a photograph, and it surprises whoever chose
the file.

Two earlier drafts of this section were wrong and are corrected here. The first claimed WebP
output was impossible; the second kept the claim but as a cost argument based on a
lossless-only encoder. What is actually true:

`golang.org/x/image/webp` exports only `Decode` and `DecodeConfig`, and `x/image` can encode
nothing but BMP and TIFF, so **the standard library cannot write WebP**. `CGO_ENABLED=0` rules
out libwebp bindings. But several third-party **pure-Go** encoders exist, and three were
measured at this rendition, each round-tripped through `x/image/webp`:

| Encoder | Photo, lossy | Flat + alpha, lossless |
|---|---|---|
| `image/jpeg` q85 (baseline) | **13,838 B** | 11,165 B, alpha lost |
| `image/png` (baseline) | 132,690 B | **2,256 B** |
| `KarpelesLab/gowebp` v0.1.1 | 15,428 B | 1,620 B — **unreadable by `x/image/webp`** |
| `deepteams/webp` v1.2.7 | 14,972 B | **1,050 B** |
| `skrashevich/go-webp` v0.1.0 | 26,178 B | 28,806 B |

Three findings drove the decision. `gowebp` writes lossless output our own decoder rejects
with `webp: invalid format`, which disqualifies it: the service would be storing objects it
cannot validate. Lossy pure-Go WebP does **not** beat JPEG — `deepteams` is about 8% larger,
not the ~25% smaller that libwebp achieves — so there is no free win. And lossless WebP for a
transparent image is genuinely better than PNG, at 1,050 B against 2,256.

**Decision: `deepteams/webp` v1.2.7, used for encoding only.** `x/image/webp` remains the sole
decoder of uploaded bytes, so a hostile file never reaches the third-party codec; it is handed
only pixels this service has already decoded and validated. A `recover` around the encode call
turns a crash in a young codec into a rejected upload rather than a dropped connection, and a
test asserts that everything written is readable back by `x/image/webp` so a codec regression
fails the build instead of filling the bucket.

Within WebP, transparency selects the variant: lossless when the source has alpha, lossy when
it does not. Keeping a photographic WebP as WebP costs roughly 1.1 KB against JPEG, which is
accepted so that the rule is one sentence with no exceptions.

**Animation is not preserved.** An animated GIF keeps only its first frame, which is what
GitHub does with one. Preserving it would mean resizing every frame and serving a
multi-megabyte object on each page that renders the account.

**huma parses multipart natively** (`huma.MultipartFormFiles[T]`, per-operation
`MaxBodyBytes`), so no request parsing is hand-written.

**There is no `contentType` allow-list on the upload field**, although huma supports one and
it looks like a security control. Building it that way first, and testing it, showed why it
should not exist:

- The part's `Content-Type` is chosen by the client, so it never described the bytes anyway.
- It rejected correct uploads. Go's own `multipart.CreateFormFile` labels every part
  `application/octet-stream`, as do many HTTP libraries, so an allow-list of image types
  refuses them.
- The refusal was opaque. huma's per-field detail is discarded by the shared error envelope,
  so the caller received `{"errorCode":"ValidationError","errorMessage":"validation failed"}`
  with no indication of which field or why, instead of the pipeline's message naming the
  supported formats.

The accepted formats are documented on the field and enforced by decoding. A test pins that
the outcome is identical for an absent, generic, honest, wrong or nonsensical declared type.

## 2. Package boundaries

```
internal/platform/blob    Store interface, S3 implementation, in-memory fake. No domain knowledge.
internal/core/uploads     the image pipeline: decode -> validate -> crop -> resize -> encode -> digest
internal/core/users       avatar_key column, SetAvatar/SetAvatarPreset/ClearAvatar, avatarUrl
internal/core/httpapi     the /users/**/avatar surface and the preset listing
cmd/arkive seed-avatars   uploads the preset artwork into the bucket, once
```

`blob` belongs in `platform` because it knows about buckets and nothing about avatars, which
keeps the `core/* -> platform` dependency rule intact and leaves it reusable by the comment
and feedback images the architecture doc anticipates. `uploads` is the package name that
document already reserved.

The pipeline takes a `blob.Store`, so every test of it runs against an in-memory
implementation and the HTTP flow needs no container.

## 3. Storage and keys

`avatar_key text` nullable on `core.users`, holding a complete object key of one of two
shapes:

```
avatars/u/<uid>/<sha256-base64url of the encoded bytes><ext>   an upload
avatars/presets/<id>.png                                       a chosen preset
```

One column covers both, so choosing a preset and uploading a picture are the same code path
with the same URL scheme.

### 3.1 Why the key has both a uid and a digest

Each half does one job, and dropping either breaks something specific.

**The digest makes the object immutable**, so its URL carries
`Cache-Control: public, max-age=31536000, immutable` and a CDN never has to revalidate. A
bare `avatars/u/<uid>` would be a stable URL with mutable content: it could not be cached for
long without serving a stale picture, and cache-busting it would need a version token, which
would have to come from the API response anyway.

**The per-account prefix makes orphans impossible.** Everything under `avatars/u/<uid>/`
belongs to exactly one account, so a superseded avatar is removed by deleting the rest of
that prefix, immediately, in the same request. There is nothing shared to reference-count, no
bucket-wide sweep, no grace period and no scheduled job. Deleting an account deletes its
prefix.

The cost is that two accounts uploading the same picture now store it twice. That was the
price of removing the reclaim problem entirely: cross-account sharing is precisely what would
have forced reference counting before anything could be deleted safely.

### 3.2 Caching depends on the key, not the bucket

`blob.PutOptions.Mutable` exists for this. Digest-named objects are immutable and cached for
a year; a preset key is fixed, so it is stored with `max-age=86400` instead. Marking a
mutable key `immutable` would be a year-long bug that no deploy could clear.

### 3.3 avatarUrl is never empty

The API returns a URL for every account. If it has neither uploaded nor chosen anything, the
URL is a preset derived from `uid % 10` — stable per account, needing no column, no migration
and no stored object.

Returning a URL was reconsidered, since a derivable one would let the field be dropped
entirely. It does not survive contact with the other decisions: the extension varies because
the format follows the upload, existence has to be known to avoid a broken image, and a
mutable key would need a cache-busting token. Each of those wants a per-account datum, and
one composed URL is the smallest thing that satisfies all three. It also keeps bucket layout,
extension rules, default selection and cache-busting out of every frontend.

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

One behaviour of the SDK is worth recording, because it was discovered by a test failing and
it makes the setting less dangerous than it looks: **the SDK falls back to path-style
addressing whenever the endpoint host is an IP address**, since no bucket label can be
prefixed onto one. A MinIO deployment reached by IP is therefore path-style whether or not
anyone configured it, and a virtual-hosted configuration can only be observed against a
hostname — which is why the addressing tests use DNS-style endpoints rather than the
`httptest` server's `127.0.0.1`.

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
| `PUT /users/me/avatar/preset` | user | `{presetId}`; choose one of the shared presets |
| `DELETE /users/me/avatar` | user | returns to the uid-derived default preset |
| `DELETE /users/{id}/avatar` | admin | moderation removal |
| `GET /users/avatar-presets` | public | preset ids and URLs, so a picker renders anywhere |

`avatarUrl` is added to both `UserRead` and `UserPublic`, and is **never empty** (§3.3).
`UserPublic` gaining it is the point of the feature: an avatar is public, and the uid lookup is
what a profile page resolves.

The presets are the ten images the frontend already had, but they lived in the meta app's
`public/` folder and so could not render from aion2, palworld or vrising. `arkive seed-avatars
<dir>` uploads them into the bucket once, which makes them app-independent and puts them on the
same URL scheme as uploads. A preset id from a client is matched against a known list before it
is ever interpolated into a key.

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
- The same variables pointed at a real COS bucket run the identical suite there.

### 8.1 What was actually verified, and what was not

**MinIO — fully exercised.** The suite ran against MinIO in a container: an avatar uploaded
through the API, the published URL fetched anonymously over HTTP returning 200 with
`Content-Type: image/jpeg` and `Cache-Control: public, max-age=31536000, immutable`, the
served bytes confirmed to differ from the upload (proving re-encoding), two accounts sharing
one object for one picture, and `Delete` removing it. MinIO's own `mc` independently listed
the objects with those headers.

**Tencent COS — not exercised with a live write.** No Tencent credentials exist on the
development machine, so this must not be claimed. What was verified against the real service,
without credentials:

- `cos.ap-guangzhou.myqcloud.com` answers over TLS, and the virtual-hosted host
  `<bucket>.cos.ap-guangzhou.myqcloud.com` resolves and is served rather than failing DNS.
- A `PutObject` built by this client against real COS, with deliberately fake credentials,
  came back as a **structured S3 error the SDK parsed** — `NoSuchBucket: The specified bucket
  does not exist.` That establishes the endpoint form, the addressing and that COS
  understands the request this client sends. It does **not** establish that a valid key would
  be accepted.
- The request the client puts on the wire for a COS-shaped configuration was captured and
  asserted: host `<bucket>.cos.<region>...`, path `/avatars/...`, SigV4 `AWS4-HMAC-SHA256`
  with the region in the credential scope.

Closing the remaining gap needs one run with real credentials, which the header comment of
`internal/core/avatar_storage_test.go` gives verbatim. The code path is shared, so nothing
COS-specific is untested beyond the credentials themselves.

## 9. Out of scope

Multiple renditions; EXIF orientation; client-side cropping UI; comment and feedback images
(the `blob` and `uploads` packages are shaped for them, but no route is added); presigned
uploads; animated avatars.

Reclaiming orphaned objects is no longer out of scope — it is no longer a problem. The
per-account prefix means a superseded avatar is deleted in the same request that replaces it,
so there is nothing to schedule (§3.1).

One known wart: the preset artwork is 200x200 PNG at roughly 60 KB each, heavier than the
~19 KB the pipeline produces, because a photographic illustration is a poor fit for PNG. They
are served to every account that has chosen nothing, so re-encoding them is worth doing — but
it is a change to the seed step alone and needs no design.

No app changelog entry: this is backend platform work with no user-visible surface until the
frontend renders an avatar.
