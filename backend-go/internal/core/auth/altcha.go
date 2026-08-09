package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ErrAltcha means a proof-of-work solution was missing, malformed, forged,
// expired or already spent.
var ErrAltcha = errors.New("altcha challenge failed")

const altchaAlgorithm = "SHA-256"

// Challenge is the proof-of-work puzzle handed to the client.
type Challenge struct {
	Algorithm string `json:"algorithm" doc:"Hash algorithm used to solve the challenge" example:"SHA-256"`
	Challenge string `json:"challenge" doc:"Hex digest the client must reproduce"`
	MaxNumber int64  `json:"maxNumber" doc:"Upper bound of the search space"`
	Salt      string `json:"salt" doc:"Opaque salt, carrying the challenge expiry"`
	Signature string `json:"signature" doc:"HMAC binding the challenge to this server"`
}

// solution is what the client posts back, base64-encoded.
type solution struct {
	Algorithm string `json:"algorithm"`
	Challenge string `json:"challenge"`
	Number    int64  `json:"number"`
	Salt      string `json:"salt"`
	Signature string `json:"signature"`
}

// Altcha issues and verifies proof-of-work challenges that gate registration.
//
// The protocol is implemented directly rather than pulled from a dependency:
// it is about sixty lines, fully specified, and implementing it is what lets
// the tests assert byte-compatibility with the payloads the Python service
// accepted.
type Altcha struct {
	hmacKey   []byte
	maxNumber int64
	ttl       time.Duration
	now       func() time.Time

	// store records solutions already redeemed. The Python service had no
	// such check and issued challenges with no expiry, so a single solved
	// challenge could be replayed indefinitely to register any number of
	// accounts — which is precisely what the gate exists to prevent.
	//
	// Backed by Redis in production so the record survives a restart and holds
	// across processes. The in-process implementation loses every unspent
	// solution when the service restarts, which reopens the replay window for
	// the remaining lifetime of each challenge.
	store ReplayStore
}

// ReplayStore records which solutions have already been redeemed.
type ReplayStore interface {
	// Claim marks signature as spent, returning false if it already was.
	// The record may be dropped once expiry passes.
	Claim(ctx context.Context, signature string, expires time.Time) (bool, error)
}

// NewAltcha builds a challenge issuer. ttl bounds how long a challenge stays
// solvable, and therefore how long the replay record must be retained.
//
// A nil store falls back to in-process tracking, which is correct for a single
// process but forgets everything on restart.
func NewAltcha(hmacKey string, maxNumber int64, ttl time.Duration, store ReplayStore) *Altcha {
	if maxNumber <= 0 {
		maxNumber = 50000
	}
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	if store == nil {
		store = NewMemoryReplayStore()
	}
	return &Altcha{
		hmacKey:   []byte(hmacKey),
		maxNumber: maxNumber,
		ttl:       ttl,
		now:       time.Now,
		store:     store,
	}
}

// Create issues a fresh challenge.
func (a *Altcha) Create() (Challenge, error) {
	saltBytes := make([]byte, 12)
	if _, err := rand.Read(saltBytes); err != nil {
		return Challenge{}, fmt.Errorf("generate altcha salt: %w", err)
	}

	secret, err := rand.Int(rand.Reader, big.NewInt(a.maxNumber+1))
	if err != nil {
		return Challenge{}, fmt.Errorf("generate altcha secret: %w", err)
	}

	// The expiry rides inside the salt, so it is covered by the signature and
	// cannot be edited by the client.
	expires := a.now().Add(a.ttl).Unix()
	salt := fmt.Sprintf("%s?expires=%d", hex.EncodeToString(saltBytes), expires)

	challenge := hashChallenge(salt, secret.Int64())
	return Challenge{
		Algorithm: altchaAlgorithm,
		Challenge: challenge,
		MaxNumber: a.maxNumber,
		Salt:      salt,
		Signature: a.sign(challenge),
	}, nil
}

// Verify checks a base64-encoded solution and marks it spent.
func (a *Altcha) Verify(ctx context.Context, payload string) error {
	if payload == "" {
		return fmt.Errorf("%w: no solution supplied", ErrAltcha)
	}

	raw, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return fmt.Errorf("%w: solution is not valid base64", ErrAltcha)
	}

	var s solution
	if err := json.Unmarshal(raw, &s); err != nil {
		return fmt.Errorf("%w: solution is not valid JSON", ErrAltcha)
	}
	if s.Algorithm != altchaAlgorithm {
		return fmt.Errorf("%w: unsupported algorithm %q", ErrAltcha, s.Algorithm)
	}
	if s.Number < 0 {
		return fmt.Errorf("%w: negative solution", ErrAltcha)
	}

	// Check the signature before anything derived from the salt, so an
	// attacker cannot influence parsing with an unsigned payload.
	if subtle.ConstantTimeCompare([]byte(a.sign(s.Challenge)), []byte(s.Signature)) != 1 {
		return fmt.Errorf("%w: signature mismatch", ErrAltcha)
	}
	if subtle.ConstantTimeCompare([]byte(hashChallenge(s.Salt, s.Number)), []byte(s.Challenge)) != 1 {
		return fmt.Errorf("%w: solution does not satisfy the challenge", ErrAltcha)
	}

	expires, err := expiryFromSalt(s.Salt)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrAltcha, err)
	}
	now := a.now()
	if now.After(expires) {
		return fmt.Errorf("%w: challenge expired", ErrAltcha)
	}

	fresh, err := a.store.Claim(ctx, s.Signature, expires)
	if err != nil {
		// A store that cannot answer must not admit the solution: replay
		// protection failing open is the same as having none.
		return fmt.Errorf("%w: could not check replay protection: %v", ErrAltcha, err)
	}
	if !fresh {
		return fmt.Errorf("%w: challenge already used", ErrAltcha)
	}
	return nil
}

func (a *Altcha) sign(challenge string) string {
	mac := hmac.New(sha256.New, a.hmacKey)
	mac.Write([]byte(challenge))
	return hex.EncodeToString(mac.Sum(nil))
}

func hashChallenge(salt string, number int64) string {
	sum := sha256.Sum256([]byte(salt + strconv.FormatInt(number, 10)))
	return hex.EncodeToString(sum[:])
}

func expiryFromSalt(salt string) (time.Time, error) {
	_, query, found := strings.Cut(salt, "?")
	if !found {
		return time.Time{}, errors.New("salt carries no expiry")
	}
	values, err := url.ParseQuery(query)
	if err != nil {
		return time.Time{}, errors.New("salt carries a malformed expiry")
	}
	raw := values.Get("expires")
	if raw == "" {
		return time.Time{}, errors.New("salt carries no expiry")
	}
	unix, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return time.Time{}, errors.New("salt carries a malformed expiry")
	}
	return time.Unix(unix, 0), nil
}
