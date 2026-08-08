package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// ErrInvalidHash means a stored hash could not be parsed. It indicates
// corrupted data rather than a wrong password, and must never be reported to
// the client as a failed login.
var ErrInvalidHash = errors.New("unrecognised password hash format")

const argon2idScheme = "argon2id"

// Hasher hashes and verifies passwords.
//
// New hashes are always Argon2id. Verification additionally accepts bcrypt,
// because the Python service wrote bcrypt hashes for some accounts and users
// must not be locked out by the rewrite. A bcrypt hash that verifies is
// reported as needing a rehash, and the caller upgrades it in place on login.
type Hasher struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	saltLength  uint32
	keyLength   uint32

	// dummyHash is verified against when no user matches, so a login attempt
	// for an unknown address costs the same time as one for a known address.
	// Without it, response latency discloses which emails are registered.
	dummyHash string
}

// NewHasher builds a Hasher from configuration.
func NewHasher(cfg config.Auth) (*Hasher, error) {
	h := &Hasher{
		memory:      cfg.Argon2Memory,
		iterations:  cfg.Argon2Iterations,
		parallelism: cfg.Argon2Parallelism,
		saltLength:  cfg.Argon2SaltLength,
		keyLength:   cfg.Argon2KeyLength,
	}
	dummy, err := h.Hash("dummy-password-for-constant-time-login")
	if err != nil {
		return nil, err
	}
	h.dummyHash = dummy
	return h, nil
}

// Hash derives a new Argon2id hash in PHC string format, the same encoding
// pwdlib writes, so hashes stay readable by both services during cutover.
func (h *Hasher) Hash(password string) (string, error) {
	salt := make([]byte, h.saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	key := argon2.IDKey([]byte(password), salt, h.iterations, h.memory, h.parallelism, h.keyLength)

	return fmt.Sprintf(
		"$%s$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2idScheme, argon2.Version,
		h.memory, h.iterations, h.parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

// Verify checks a password against a stored hash.
//
// needsRehash reports that the hash is valid but not in the currently
// configured form — a bcrypt holdover, or Argon2id with weaker parameters than
// are now configured. The caller should re-hash and store on success.
func (h *Hasher) Verify(encoded, password string) (ok bool, needsRehash bool, err error) {
	switch {
	case strings.HasPrefix(encoded, "$"+argon2idScheme+"$"):
		return h.verifyArgon2id(encoded, password)
	case strings.HasPrefix(encoded, "$2a$"),
		strings.HasPrefix(encoded, "$2b$"),
		strings.HasPrefix(encoded, "$2y$"):
		err := bcrypt.CompareHashAndPassword([]byte(encoded), []byte(password))
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return false, false, nil
		}
		if err != nil {
			return false, false, fmt.Errorf("%w: %v", ErrInvalidHash, err)
		}
		// Verified against a legacy scheme: upgrade it.
		return true, true, nil
	default:
		return false, false, ErrInvalidHash
	}
}

func (h *Hasher) verifyArgon2id(encoded, password string) (bool, bool, error) {
	// Format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return false, false, ErrInvalidHash
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, false, ErrInvalidHash
	}
	if version != argon2.Version {
		return false, false, fmt.Errorf("%w: argon2 version %d", ErrInvalidHash, version)
	}

	var memory, iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return false, false, ErrInvalidHash
	}
	if parallelism == 0 {
		return false, false, ErrInvalidHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, false, ErrInvalidHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false, false, ErrInvalidHash
	}

	got := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return false, false, nil
	}

	outdated := memory != h.memory ||
		iterations != h.iterations ||
		parallelism != h.parallelism ||
		uint32(len(want)) != h.keyLength ||
		uint32(len(salt)) != h.saltLength
	return true, outdated, nil
}

// VerifyDummy burns roughly the same time as a real verification. Call it when
// no user matched, so that login timing does not reveal which accounts exist.
func (h *Hasher) VerifyDummy(password string) {
	_, _, _ = h.Verify(h.dummyHash, password)
}
