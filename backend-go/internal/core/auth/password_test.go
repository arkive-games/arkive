package auth

import (
	"errors"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// These hashes were produced by the Python service's own password library
// (pwdlib, as used by fastapi-users) for the password below. They are the
// cutover contract: if Go stops accepting them, every existing account is
// locked out, so this is asserted rather than assumed.
const (
	referencePassword    = "correct horse battery staple"
	referenceArgon2Hash  = "$argon2id$v=19$m=65536,t=3,p=4$Yb14BwVDBYN/eltiuTSmow$a7OXXQ7bs4L1tc8RyaIY0HTnwK+DHDo5QRJwe0o6lYY"
	referenceBcryptHash  = "$2b$12$l4Aj8NOlKPXlMu6d3GI0euhK/lY9lEJ.STmADOiW.LD.CpWyzEtOO"
	weakerArgon2Password = "another password"
)

func testHasher(t *testing.T) *Hasher {
	t.Helper()
	cfg := config.Auth{
		Argon2Memory:      65536,
		Argon2Iterations:  3,
		Argon2Parallelism: 4,
		Argon2SaltLength:  16,
		Argon2KeyLength:   32,
	}
	h, err := NewHasher(cfg)
	if err != nil {
		t.Fatalf("NewHasher: %v", err)
	}
	return h
}

func TestVerifyAcceptsPythonArgon2Hash(t *testing.T) {
	h := testHasher(t)

	ok, needsRehash, err := h.Verify(referenceArgon2Hash, referencePassword)
	if err != nil {
		t.Fatalf("Verify returned error: %v", err)
	}
	if !ok {
		t.Fatal("Verify rejected a hash produced by pwdlib; cutover would lock out every existing account")
	}
	if needsRehash {
		t.Error("pwdlib's default parameters match ours, so no rehash should be requested")
	}
}

func TestVerifyRejectsWrongPasswordAgainstPythonHash(t *testing.T) {
	h := testHasher(t)

	ok, _, err := h.Verify(referenceArgon2Hash, "not the password")
	if err != nil {
		t.Fatalf("Verify returned error: %v", err)
	}
	if ok {
		t.Fatal("Verify accepted the wrong password")
	}
}

func TestVerifyAcceptsBcryptAndRequestsRehash(t *testing.T) {
	h := testHasher(t)

	ok, needsRehash, err := h.Verify(referenceBcryptHash, referencePassword)
	if err != nil {
		t.Fatalf("Verify returned error: %v", err)
	}
	if !ok {
		t.Fatal("Verify rejected a bcrypt hash produced by pwdlib")
	}
	if !needsRehash {
		t.Error("a legacy bcrypt hash must be flagged for upgrade to argon2id")
	}
}

func TestVerifyRejectsWrongPasswordAgainstBcrypt(t *testing.T) {
	h := testHasher(t)

	ok, _, err := h.Verify(referenceBcryptHash, "not the password")
	if err != nil {
		t.Fatalf("Verify returned error: %v", err)
	}
	if ok {
		t.Fatal("Verify accepted the wrong password against a bcrypt hash")
	}
}

func TestHashRoundTrip(t *testing.T) {
	h := testHasher(t)

	encoded, err := h.Hash("s3cret")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if !strings.HasPrefix(encoded, "$argon2id$v=19$m=65536,t=3,p=4$") {
		t.Fatalf("unexpected hash encoding: %s", encoded)
	}

	ok, needsRehash, err := h.Verify(encoded, "s3cret")
	if err != nil || !ok {
		t.Fatalf("round trip failed: ok=%v err=%v", ok, err)
	}
	if needsRehash {
		t.Error("a freshly written hash must not need a rehash")
	}
}

func TestHashIsSaltedPerCall(t *testing.T) {
	h := testHasher(t)

	first, err := h.Hash("same password")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	second, err := h.Hash("same password")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if first == second {
		t.Fatal("identical passwords produced identical hashes; the salt is not random")
	}
}

func TestVerifyFlagsWeakerParametersForRehash(t *testing.T) {
	weak, err := NewHasher(config.Auth{
		Argon2Memory:      8192,
		Argon2Iterations:  1,
		Argon2Parallelism: 1,
		Argon2SaltLength:  16,
		Argon2KeyLength:   32,
	})
	if err != nil {
		t.Fatalf("NewHasher: %v", err)
	}
	encoded, err := weak.Hash(weakerArgon2Password)
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	strong := testHasher(t)
	ok, needsRehash, err := strong.Verify(encoded, weakerArgon2Password)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !ok {
		t.Fatal("a hash written with weaker parameters must still verify")
	}
	if !needsRehash {
		t.Error("a hash written with weaker parameters must be flagged for upgrade")
	}
}

func TestVerifyRejectsMalformedHashes(t *testing.T) {
	h := testHasher(t)

	cases := map[string]string{
		"empty":              "",
		"unknown scheme":     "$scrypt$v=19$m=1$abc$def",
		"truncated argon2":   "$argon2id$v=19$m=65536,t=3,p=4$Yb14BwVDBYN/eltiuTSmow",
		"bad base64 salt":    "$argon2id$v=19$m=65536,t=3,p=4$!!!!$a7OXXQ7bs4L1tc8RyaIY0HTnwK+DHDo5QRJwe0o6lYY",
		"unsupported v":      "$argon2id$v=16$m=65536,t=3,p=4$Yb14BwVDBYN/eltiuTSmow$a7OXXQ7bs4L1tc8RyaIY0HTnwK+DHDo5QRJwe0o6lYY",
		"zero parallelism":   "$argon2id$v=19$m=65536,t=3,p=0$Yb14BwVDBYN/eltiuTSmow$a7OXXQ7bs4L1tc8RyaIY0HTnwK+DHDo5QRJwe0o6lYY",
		"not a hash at all":  "hunter2",
		"plausible but junk": "$argon2id$",
	}

	for name, encoded := range cases {
		t.Run(name, func(t *testing.T) {
			ok, _, err := h.Verify(encoded, referencePassword)
			if ok {
				t.Fatal("a malformed hash must never verify")
			}
			if !errors.Is(err, ErrInvalidHash) {
				t.Fatalf("want ErrInvalidHash, got %v", err)
			}
		})
	}
}

// A corrupt stored hash must surface as an error rather than as "wrong
// password", so the two are never conflated in the login path.
func TestVerifyDistinguishesBadHashFromBadPassword(t *testing.T) {
	h := testHasher(t)

	ok, _, err := h.Verify(referenceArgon2Hash, "wrong")
	if ok || err != nil {
		t.Fatalf("wrong password should be (false, nil), got (%v, %v)", ok, err)
	}

	ok, _, err = h.Verify("garbage", "wrong")
	if ok || err == nil {
		t.Fatalf("corrupt hash should be (false, error), got (%v, %v)", ok, err)
	}
}

func TestVerifyDummyDoesNotPanic(t *testing.T) {
	h := testHasher(t)
	h.VerifyDummy("anything") // must be safe to call on the unknown-user path
}

func TestBcryptVectorIsWellFormed(t *testing.T) {
	// Guards the test data itself: if the constant is ever edited, this fails
	// before the behavioural tests give a confusing result.
	if err := bcrypt.CompareHashAndPassword([]byte(referenceBcryptHash), []byte(referencePassword)); err != nil {
		t.Fatalf("reference bcrypt vector is not valid: %v", err)
	}
}
