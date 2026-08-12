package auth

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

func testTokens(t *testing.T, at time.Time) *Tokens {
	t.Helper()
	tk := NewTokens(config.Auth{
		JWTSecret:           "test-secret",
		JWTAudience:         audienceAccess,
		TokenLifetime:       14 * 24 * time.Hour,
		ResetTokenLifetime:  time.Hour,
		VerifyTokenLifetime: 24 * time.Hour,
	})
	tk.now = func() time.Time { return at }
	return tk
}

func TestAccessTokenRoundTrip(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	tk := testTokens(t, now)
	id := uuid.New()

	raw, expires, err := tk.IssueAccess(id, "hash-v1")
	if err != nil {
		t.Fatalf("IssueAccess: %v", err)
	}
	if want := now.Add(14 * 24 * time.Hour); !expires.Equal(want) {
		t.Errorf("expiry = %v, want %v", expires, want)
	}

	got, fgpt, err := tk.ParseAccess(raw)
	if err != nil {
		t.Fatalf("ParseAccess: %v", err)
	}
	if got != id {
		t.Errorf("subject = %v, want %v", got, id)
	}
	if !tk.MatchesFingerprint(fgpt, "hash-v1") {
		t.Error("fingerprint does not match the hash the token was issued against")
	}
}

// A session must stop resolving once the password changes, which is the whole
// point of binding the token to the hash: a stolen cookie otherwise stayed
// valid for the full fourteen-day lifetime after the victim reset it.
func TestAccessTokenStopsMatchingAfterAPasswordChange(t *testing.T) {
	tk := testTokens(t, time.Unix(1_700_000_000, 0))
	raw, _, err := tk.IssueAccess(uuid.New(), "hash-v1")
	if err != nil {
		t.Fatalf("IssueAccess: %v", err)
	}

	_, fgpt, err := tk.ParseAccess(raw)
	if err != nil {
		t.Fatalf("ParseAccess: %v", err)
	}
	if tk.MatchesFingerprint(fgpt, "hash-v2") {
		t.Error("a token issued against the old hash still matches the new one")
	}
}

func TestAccessTokenExpires(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	tk := testTokens(t, now)

	raw, _, err := tk.IssueAccess(uuid.New(), "hash")
	if err != nil {
		t.Fatalf("IssueAccess: %v", err)
	}

	tk.now = func() time.Time { return now.Add(15 * 24 * time.Hour) }
	if _, _, err := tk.ParseAccess(raw); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("an expired token must be rejected, got %v", err)
	}
}

// Tokens minted for one purpose must not be usable for another. Without the
// audience check a password-reset link would double as a session token.
func TestTokensAreNotInterchangeableAcrossPurposes(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	tk := testTokens(t, now)
	id := uuid.New()

	access, _, err := tk.IssueAccess(id, "hash")
	if err != nil {
		t.Fatalf("IssueAccess: %v", err)
	}
	reset, err := tk.IssueReset(id, "$argon2id$fake")
	if err != nil {
		t.Fatalf("IssueReset: %v", err)
	}
	verify, err := tk.IssueVerify(id, "user@example.com")
	if err != nil {
		t.Fatalf("IssueVerify: %v", err)
	}

	if _, _, err := tk.ParseAccess(reset); !errors.Is(err, ErrInvalidToken) {
		t.Error("a reset token must not authenticate a session")
	}
	if _, _, err := tk.ParseAccess(verify); !errors.Is(err, ErrInvalidToken) {
		t.Error("a verification token must not authenticate a session")
	}
	if _, _, err := tk.ParseReset(access); !errors.Is(err, ErrInvalidToken) {
		t.Error("a session token must not authorise a password reset")
	}
	if _, _, err := tk.ParseVerify(access); !errors.Is(err, ErrInvalidToken) {
		t.Error("a session token must not verify an email address")
	}
}

func TestResetTokenDiesWithThePasswordItWasIssuedAgainst(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	tk := testTokens(t, now)
	id := uuid.New()

	const oldHash = "$argon2id$v=19$m=65536,t=3,p=4$old"
	raw, err := tk.IssueReset(id, oldHash)
	if err != nil {
		t.Fatalf("IssueReset: %v", err)
	}

	gotID, fgpt, err := tk.ParseReset(raw)
	if err != nil {
		t.Fatalf("ParseReset: %v", err)
	}
	if gotID != id {
		t.Errorf("subject = %v, want %v", gotID, id)
	}
	if !tk.MatchesFingerprint(fgpt, oldHash) {
		t.Fatal("fingerprint should match the hash the token was issued against")
	}
	// After the reset lands, the stored hash changes, so the same link must
	// stop working — this is what makes it single-use with no server state.
	if tk.MatchesFingerprint(fgpt, "$argon2id$v=19$m=65536,t=3,p=4$new") {
		t.Fatal("fingerprint must not match after the password changed")
	}
}

func TestResetTokenDoesNotLeakThePasswordHash(t *testing.T) {
	tk := testTokens(t, time.Unix(1_700_000_000, 0))
	const hash = "$argon2id$v=19$m=65536,t=3,p=4$Yb14BwVDBYN/eltiuTSmow$a7OXXQ"

	raw, err := tk.IssueReset(uuid.New(), hash)
	if err != nil {
		t.Fatalf("IssueReset: %v", err)
	}
	// Reset tokens travel in URLs and mail clients; the hash itself must never
	// ride along.
	if strings.Contains(raw, "Yb14BwVDBYN") {
		t.Fatal("reset token embeds the password hash")
	}
}

func TestVerifyTokenCarriesTheAddress(t *testing.T) {
	tk := testTokens(t, time.Unix(1_700_000_000, 0))
	id := uuid.New()

	raw, err := tk.IssueVerify(id, "user@example.com")
	if err != nil {
		t.Fatalf("IssueVerify: %v", err)
	}
	gotID, email, err := tk.ParseVerify(raw)
	if err != nil {
		t.Fatalf("ParseVerify: %v", err)
	}
	if gotID != id || email != "user@example.com" {
		t.Fatalf("got (%v, %q), want (%v, %q)", gotID, email, id, "user@example.com")
	}
}

func TestParseRejectsForgedAndUnsignedTokens(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	tk := testTokens(t, now)
	id := uuid.New()

	// Signed with a different secret.
	other := testTokens(t, now)
	other.secret = []byte("another-secret")
	forged, _, err := other.IssueAccess(id, "hash")
	if err != nil {
		t.Fatalf("IssueAccess: %v", err)
	}
	if _, _, err := tk.ParseAccess(forged); !errors.Is(err, ErrInvalidToken) {
		t.Error("a token signed with another secret must be rejected")
	}

	// "alg": "none" — the classic JWT downgrade. WithValidMethods must refuse
	// it regardless of the claim contents.
	unsigned, err := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
		"sub": id.String(),
		"aud": []string{audienceAccess},
		"exp": now.Add(time.Hour).Unix(),
	}).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("build unsigned token: %v", err)
	}
	if _, _, err := tk.ParseAccess(unsigned); !errors.Is(err, ErrInvalidToken) {
		t.Error(`a token with "alg":"none" must be rejected`)
	}

	for name, raw := range map[string]string{
		"empty":     "",
		"garbage":   "not.a.token",
		"truncated": strings.SplitN(forged, ".", 2)[0],
	} {
		t.Run(name, func(t *testing.T) {
			if _, _, err := tk.ParseAccess(raw); !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("want ErrInvalidToken, got %v", err)
			}
		})
	}
}

// A token with no exp claim would never expire; huma's parser must require one.
func TestParseRejectsTokenWithoutExpiry(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	tk := testTokens(t, now)

	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": uuid.New().String(),
		"aud": []string{audienceAccess},
	}).SignedString(tk.secret)
	if err != nil {
		t.Fatalf("build token: %v", err)
	}
	if _, _, err := tk.ParseAccess(raw); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("a token without an expiry must be rejected, got %v", err)
	}
}

func TestParseRejectsNonUUIDSubject(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	tk := testTokens(t, now)

	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "not-a-uuid",
		"aud": []string{audienceAccess},
		"exp": now.Add(time.Hour).Unix(),
	}).SignedString(tk.secret)
	if err != nil {
		t.Fatalf("build token: %v", err)
	}
	if _, _, err := tk.ParseAccess(raw); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("want ErrInvalidToken, got %v", err)
	}
}
