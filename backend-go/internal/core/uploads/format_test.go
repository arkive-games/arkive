package uploads

import (
	"bytes"
	"context"
	"image"
	"strings"
	"testing"

	"golang.org/x/image/webp"

	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

// webpFixture builds a real WebP file, so the WebP path is exercised with bytes
// rather than a stand-in.
//
// It is produced with the same encoder the pipeline writes with, which is
// acceptable only because every assertion here decodes the result with
// x/image/webp — a different implementation. If the two ever disagree these tests
// fail rather than passing on a private convention.
func webpFixture(t *testing.T, w, h int, transparent bool) []byte {
	t.Helper()

	var src image.Image
	if transparent {
		src = decode(t, transparentPNG(t, w, h))
	} else {
		src = decode(t, opaqueJPEG(t, w, h))
	}

	raw, err := encode(src, FormatWebP, transparent)
	if err != nil {
		t.Fatalf("build webp fixture: %v", err)
	}
	if _, err := webp.Decode(bytes.NewReader(raw)); err != nil {
		t.Fatalf("webp fixture is not readable by x/image/webp: %v", err)
	}
	return raw
}

// The WebP encoder is the one dependency from outside the standard library, and
// one of the candidates evaluated wrote lossless output that x/image/webp could
// not read at all. That decoder validates every upload, so anything this service
// writes must be readable by it — and a codec regression has to fail the build
// rather than quietly fill the bucket with objects the service cannot parse.
func TestEveryWebPWeWriteIsReadableByOurOwnDecoder(t *testing.T) {
	for _, tc := range []struct {
		name        string
		transparent bool
	}{
		{"lossy, from an opaque source", false},
		{"lossless, from a transparent source", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := blob.NewMemory()
			a := mustStore(t, store, webpFixture(t, 300, 300, tc.transparent))

			obj, ok := store.Get(a.Key)
			if !ok {
				t.Fatal("nothing was stored")
			}
			img, err := webp.Decode(bytes.NewReader(obj.Body))
			if err != nil {
				t.Fatalf("stored WebP is unreadable by x/image/webp: %v", err)
			}
			if b := img.Bounds(); b.Dx() != AvatarSize || b.Dy() != AvatarSize {
				t.Errorf("stored %dx%d, want a %d square", b.Dx(), b.Dy(), AvatarSize)
			}
			// Alpha must survive the lossless path. The lossy variant is expected
			// to discard it, which is exactly why the source's transparency
			// selects between them.
			if tc.transparent && !hasTransparency(img) {
				t.Error("a transparent WebP came back fully opaque, so alpha was lost")
			}
		})
	}
}

// Superseded objects are removed within the account's own prefix. This is what
// replaces a bucket-wide garbage collector: nothing is shared between accounts,
// so there is no reference counting and no grace period to get wrong.
func TestSupersededUploadsAreRemovedWithinTheAccountPrefix(t *testing.T) {
	store := blob.NewMemory()

	first := mustStore(t, store, opaquePNG(t, 400, 400))
	second := mustStore(t, store, opaqueJPEG(t, 400, 400))
	if first.Key == second.Key {
		t.Fatal("fixtures produced the same key, so the test would prove nothing")
	}
	if store.Len() != 2 {
		t.Fatalf("expected both objects before cleanup, got %d", store.Len())
	}

	if err := RemoveSupersededUploads(context.Background(), store, testUID, second.Key); err != nil {
		t.Fatalf("RemoveSupersededUploads: %v", err)
	}

	if _, ok := store.Get(second.Key); !ok {
		t.Error("the current avatar was deleted")
	}
	if _, ok := store.Get(first.Key); ok {
		t.Error("the superseded avatar was retained, so orphans would accumulate")
	}
}

// One account's cleanup must never reach another's objects. That is the property
// the per-account prefix exists to guarantee, and the reason this scheme needs no
// reference counting.
func TestCleanupIsConfinedToOneAccount(t *testing.T) {
	store := blob.NewMemory()
	const otherUID int64 = 10043

	mine := mustStore(t, store, opaquePNG(t, 400, 400))
	theirs, err := StoreAvatar(context.Background(), store, otherUID, bytes.NewReader(opaqueJPEG(t, 400, 400)))
	if err != nil {
		t.Fatalf("StoreAvatar for the other account: %v", err)
	}

	if err := RemoveAllUploads(context.Background(), store, testUID); err != nil {
		t.Fatalf("RemoveAllUploads: %v", err)
	}

	if _, ok := store.Get(mine.Key); ok {
		t.Error("my avatar survived a full cleanup of my own prefix")
	}
	if _, ok := store.Get(theirs.Key); !ok {
		t.Error("another account's avatar was deleted by my cleanup")
	}
}

// A preset id from a client is interpolated into an object key, so an unknown one
// has to be refused before it reaches storage.
func TestPresetValidationRejectsAnythingUnknown(t *testing.T) {
	if err := ValidatePreset(Presets[0]); err != nil {
		t.Errorf("a known preset was rejected: %v", err)
	}
	for _, bad := range []string{
		"",
		"nope",
		"../../etc/passwd",
		"male-tide-navigator.png",
		"avatars/presets/male-tide-navigator",
	} {
		if err := ValidatePreset(bad); err == nil {
			t.Errorf("ValidatePreset(%q) was accepted", bad)
		}
	}
}

// The default avatar is derived from the uid rather than stored, so every account
// has a stable and varied picture from the moment it exists, with no column and no
// write.
func TestDefaultPresetIsStableDerivedAndCoversTheSet(t *testing.T) {
	seen := map[string]int{}
	for uid := int64(10000); uid < 10000+int64(len(Presets))*3; uid++ {
		id := DefaultPresetFor(uid)
		if err := ValidatePreset(id); err != nil {
			t.Fatalf("uid %d derived the unknown preset %q", uid, id)
		}
		if again := DefaultPresetFor(uid); again != id {
			t.Errorf("uid %d derived %q then %q; it must be stable", uid, id, again)
		}
		seen[id]++
	}
	if len(seen) != len(Presets) {
		t.Errorf("only %d of %d presets are reachable as a default", len(seen), len(Presets))
	}
	if key := DefaultPresetKey(10000); !strings.HasPrefix(key, PresetPrefix) {
		t.Errorf("default preset key %q is not under the preset prefix", key)
	}
}
