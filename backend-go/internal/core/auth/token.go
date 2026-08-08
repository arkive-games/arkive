package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// Token audiences. The access audience is retained verbatim from
// fastapi-users so access tokens issued by the Python service keep working
// across cutover and nobody is logged out. Reset and verify tokens are
// short-lived, so their formats are not held compatible.
const (
	audienceAccess = "fastapi-users:auth"
	audienceReset  = "fastapi-users:reset"
	audienceVerify = "fastapi-users:verify"
)

// ErrInvalidToken covers every rejection reason. The cause is deliberately not
// distinguished on the wire: telling a caller whether a token was expired,
// forged or aimed at the wrong audience only helps an attacker.
var ErrInvalidToken = errors.New("invalid token")

// Tokens issues and validates the service's JWTs.
type Tokens struct {
	secret         []byte
	accessAudience string

	accessTTL time.Duration
	resetTTL  time.Duration
	verifyTTL time.Duration

	// now is injectable so expiry behaviour is testable without sleeping.
	now func() time.Time
}

// NewTokens builds a token issuer from configuration.
func NewTokens(cfg config.Auth) *Tokens {
	audience := cfg.JWTAudience
	if audience == "" {
		audience = audienceAccess
	}
	return &Tokens{
		secret:         []byte(cfg.JWTSecret),
		accessAudience: audience,
		accessTTL:      cfg.TokenLifetime,
		resetTTL:       cfg.ResetTokenLifetime,
		verifyTTL:      cfg.VerifyTokenLifetime,
		now:            time.Now,
	}
}

// IssueAccess mints a session token and reports when it expires.
func (t *Tokens) IssueAccess(userID uuid.UUID) (string, time.Time, error) {
	expires := t.now().Add(t.accessTTL)
	token, err := t.sign(jwt.MapClaims{
		"sub": userID.String(),
		"aud": []string{t.accessAudience},
		"exp": expires.Unix(),
		"iat": t.now().Unix(),
	})
	return token, expires, err
}

// ParseAccess validates a session token and returns its subject.
func (t *Tokens) ParseAccess(raw string) (uuid.UUID, error) {
	claims, err := t.parse(raw, t.accessAudience)
	if err != nil {
		return uuid.Nil, err
	}
	return subject(claims)
}

// IssueReset mints a password-reset token bound to the user's current
// password hash, so the link stops working the moment the password changes —
// including as a result of the reset itself. That makes the token single-use
// without any server-side state.
func (t *Tokens) IssueReset(userID uuid.UUID, currentHash string) (string, error) {
	return t.sign(jwt.MapClaims{
		"sub":  userID.String(),
		"aud":  []string{audienceReset},
		"exp":  t.now().Add(t.resetTTL).Unix(),
		"iat":  t.now().Unix(),
		"fgpt": fingerprint(currentHash),
	})
}

// ParseReset validates a reset token against the user's current password hash.
func (t *Tokens) ParseReset(raw string) (uuid.UUID, string, error) {
	claims, err := t.parse(raw, audienceReset)
	if err != nil {
		return uuid.Nil, "", err
	}
	id, err := subject(claims)
	if err != nil {
		return uuid.Nil, "", err
	}
	fgpt, _ := claims["fgpt"].(string)
	if fgpt == "" {
		return uuid.Nil, "", ErrInvalidToken
	}
	return id, fgpt, nil
}

// IssueVerify mints an email-verification token bound to the address being
// verified, so changing the address invalidates a pending link.
func (t *Tokens) IssueVerify(userID uuid.UUID, email string) (string, error) {
	return t.sign(jwt.MapClaims{
		"sub":   userID.String(),
		"aud":   []string{audienceVerify},
		"exp":   t.now().Add(t.verifyTTL).Unix(),
		"iat":   t.now().Unix(),
		"email": email,
	})
}

// ParseVerify validates a verification token and returns its subject and the
// address it was issued for.
func (t *Tokens) ParseVerify(raw string) (uuid.UUID, string, error) {
	claims, err := t.parse(raw, audienceVerify)
	if err != nil {
		return uuid.Nil, "", err
	}
	id, err := subject(claims)
	if err != nil {
		return uuid.Nil, "", err
	}
	email, _ := claims["email"].(string)
	if email == "" {
		return uuid.Nil, "", ErrInvalidToken
	}
	return id, email, nil
}

// MatchesFingerprint reports whether a reset token's fingerprint still matches
// the user's stored hash.
func (t *Tokens) MatchesFingerprint(fgpt, currentHash string) bool {
	return fgpt == fingerprint(currentHash)
}

// AccessTTL exposes the session lifetime, so the cookie max-age cannot drift
// out of step with the token it carries.
func (t *Tokens) AccessTTL() time.Duration { return t.accessTTL }

func (t *Tokens) sign(claims jwt.MapClaims) (string, error) {
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(t.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

func (t *Tokens) parse(raw, audience string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(
		raw,
		func(*jwt.Token) (any, error) { return t.secret, nil },
		// Pinning the algorithm rejects the "alg": "none" and
		// HMAC-verified-with-a-public-key families of forgery outright.
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithAudience(audience),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(t.now),
	)
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

func subject(claims jwt.MapClaims) (uuid.UUID, error) {
	sub, _ := claims["sub"].(string)
	id, err := uuid.Parse(sub)
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	return id, nil
}

// fingerprint reduces a password hash to a short opaque value. The hash itself
// is never placed in a token, since tokens travel in URLs and mail clients.
func fingerprint(hash string) string {
	sum := sha256.Sum256([]byte(hash))
	return hex.EncodeToString(sum[:])
}
