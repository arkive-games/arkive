package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

// This payload was produced by the Python `altcha` package that currently
// gates registration: a challenge created with the key below, then solved.
// It pins the hashing and signing math to the reference implementation, so a
// refactor cannot quietly change what the server accepts.
const (
	referenceAltchaKey     = "test-altcha-key"
	referenceAltchaPayload = "eyJhbGdvcml0aG0iOiAiU0hBLTI1NiIsICJjaGFsbGVuZ2UiOiAiYTEyZmYzNWViZDI0OGM2YzI2ODMwZWU3Y2YxZmU5NDkxODE4YzViNDJjMDAwMWRmMGI3MGZjZDM5MDIzMjE4OCIsICJudW1iZXIiOiAzNywgInNhbHQiOiAiNzMyNmYwMDgxZjAzZjI1NWExNDQ4Y2MzP2V4cGlyZXM9MTk5OTk3MTIwMCIsICJzaWduYXR1cmUiOiAiZmU2YWI4ZmFlMzIzNjdjZmJkMzBjNmRhNWRiZDliN2YyY2QwZDY4OGNlNmFjZDFkYmM0NWEzOGRlNWIzMzhiMyJ9"
)

// referenceAltchaExpiry is the expiry baked into the payload's salt.
var referenceAltchaExpiry = time.Unix(1999971200, 0)

func fixedClock(at time.Time) func() time.Time {
	return func() time.Time { return at }
}

func TestVerifyAcceptsPythonGeneratedSolution(t *testing.T) {
	a := NewAltcha(referenceAltchaKey, 2000, 10*time.Minute, nil)
	setClock(a, referenceAltchaExpiry.Add(-time.Minute))

	if err := a.Verify(context.Background(), referenceAltchaPayload); err != nil {
		t.Fatalf("rejected a solution the Python service would accept: %v", err)
	}
}

func TestVerifyRejectsReplay(t *testing.T) {
	a := NewAltcha(referenceAltchaKey, 2000, 10*time.Minute, nil)
	setClock(a, referenceAltchaExpiry.Add(-time.Minute))

	if err := a.Verify(context.Background(), referenceAltchaPayload); err != nil {
		t.Fatalf("first use should succeed: %v", err)
	}
	err := a.Verify(context.Background(), referenceAltchaPayload)
	if !errors.Is(err, ErrAltcha) {
		t.Fatalf("want ErrAltcha on replay, got %v", err)
	}
	if !strings.Contains(err.Error(), "already used") {
		t.Errorf("replay should be reported as such, got %q", err)
	}
}

func TestVerifyRejectsExpiredChallenge(t *testing.T) {
	a := NewAltcha(referenceAltchaKey, 2000, 10*time.Minute, nil)
	setClock(a, referenceAltchaExpiry.Add(time.Second))

	err := a.Verify(context.Background(), referenceAltchaPayload)
	if !errors.Is(err, ErrAltcha) {
		t.Fatalf("want ErrAltcha, got %v", err)
	}
	if !strings.Contains(err.Error(), "expired") {
		t.Errorf("expiry should be reported as such, got %q", err)
	}
}

func TestVerifyRejectsWrongKey(t *testing.T) {
	a := NewAltcha("a different key", 2000, 10*time.Minute, nil)
	setClock(a, referenceAltchaExpiry.Add(-time.Minute))

	if err := a.Verify(context.Background(), referenceAltchaPayload); !errors.Is(err, ErrAltcha) {
		t.Fatalf("a payload signed with another key must be rejected, got %v", err)
	}
}

func TestCreateVerifyRoundTrip(t *testing.T) {
	a := NewAltcha("round-trip-key", 500, 10*time.Minute, nil)
	now := time.Unix(1_700_000_000, 0)
	setClock(a, now)

	challenge, err := a.Create()
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if challenge.Algorithm != "SHA-256" {
		t.Errorf("unexpected algorithm %q", challenge.Algorithm)
	}
	if !strings.Contains(challenge.Salt, "?expires=") {
		t.Fatalf("challenge salt must carry an expiry, got %q", challenge.Salt)
	}

	number, found := solve(challenge, 500)
	if !found {
		t.Fatal("could not solve our own challenge within maxNumber")
	}

	if err := a.Verify(context.Background(), encodeSolution(t, challenge, number)); err != nil {
		t.Fatalf("Verify rejected a correct solution: %v", err)
	}
}

func TestVerifyRejectsTamperedNumber(t *testing.T) {
	a := NewAltcha("tamper-key", 500, 10*time.Minute, nil)
	setClock(a, time.Unix(1_700_000_000, 0))

	challenge, err := a.Create()
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	number, found := solve(challenge, 500)
	if !found {
		t.Fatal("could not solve challenge")
	}

	// A wrong answer carrying a valid signature must still fail, otherwise the
	// proof-of-work is decorative.
	if err := a.Verify(context.Background(), encodeSolution(t, challenge, number+1)); !errors.Is(err, ErrAltcha) {
		t.Fatalf("tampered solution must be rejected, got %v", err)
	}
}

func TestVerifyRejectsMalformedPayloads(t *testing.T) {
	a := NewAltcha(referenceAltchaKey, 2000, 10*time.Minute, nil)
	setClock(a, referenceAltchaExpiry.Add(-time.Minute))

	cases := map[string]string{
		"empty":          "",
		"not base64":     "!!!not base64!!!",
		"not json":       base64.StdEncoding.EncodeToString([]byte("hello")),
		"wrong algo":     base64.StdEncoding.EncodeToString([]byte(`{"algorithm":"MD5","challenge":"x","number":1,"salt":"y","signature":"z"}`)),
		"negative n":     base64.StdEncoding.EncodeToString([]byte(`{"algorithm":"SHA-256","challenge":"x","number":-1,"salt":"y","signature":"z"}`)),
		"missing fields": base64.StdEncoding.EncodeToString([]byte(`{}`)),
	}

	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			if err := a.Verify(context.Background(), payload); !errors.Is(err, ErrAltcha) {
				t.Fatalf("want ErrAltcha, got %v", err)
			}
		})
	}
}

func TestVerifyRejectsSaltWithoutExpiry(t *testing.T) {
	a := NewAltcha("no-expiry-key", 100, 10*time.Minute, nil)
	setClock(a, time.Unix(1_700_000_000, 0))

	// Hand-build a correctly signed challenge whose salt carries no expiry:
	// the signature is valid, so only the expiry check can reject it.
	salt := "deadbeef"
	number := int64(7)
	ch := hashChallenge(salt, number)
	payload := encodeRaw(t, solution{
		Algorithm: "SHA-256",
		Challenge: ch,
		Number:    number,
		Salt:      salt,
		Signature: a.sign(ch),
	})

	if err := a.Verify(context.Background(), payload); !errors.Is(err, ErrAltcha) {
		t.Fatalf("a challenge that never expires must be rejected, got %v", err)
	}
}

// The replay set must not grow without bound. Entries are swept on the next
// successful verification, so this drives two challenges through: the second
// one, issued after the first has expired, should evict the first.
func TestSpentEntriesAreSweptAfterExpiry(t *testing.T) {
	const maxNumber = 200
	a := NewAltcha("sweep-key", maxNumber, 10*time.Minute, nil)

	start := time.Unix(1_700_000_000, 0)
	setClock(a, start)
	first := solveFresh(t, a, maxNumber)
	if err := a.Verify(context.Background(), first); err != nil {
		t.Fatalf("first challenge should verify: %v", err)
	}
	if len(spentEntries(a)) != 1 {
		t.Fatalf("want 1 spent entry, got %d", len(spentEntries(a)))
	}

	setClock(a, start.Add(time.Hour)) // past the first challenge's expiry
	second := solveFresh(t, a, maxNumber)
	if err := a.Verify(context.Background(), second); err != nil {
		t.Fatalf("second challenge should verify: %v", err)
	}
	if len(spentEntries(a)) != 1 {
		t.Fatalf("the expired entry should have been swept, leaving 1; got %d", len(spentEntries(a)))
	}
}

// solveFresh issues a challenge from a and returns an encoded correct solution.
func solveFresh(t *testing.T, a *Altcha, max int64) string {
	t.Helper()
	c, err := a.Create()
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	n, found := solve(c, max)
	if !found {
		t.Fatal("could not solve freshly created challenge")
	}
	return encodeSolution(t, c, n)
}

func solve(c Challenge, max int64) (int64, bool) {
	for n := int64(0); n <= max; n++ {
		if hashChallenge(c.Salt, n) == c.Challenge {
			return n, true
		}
	}
	return 0, false
}

func encodeSolution(t *testing.T, c Challenge, number int64) string {
	t.Helper()
	return encodeRaw(t, solution{
		Algorithm: c.Algorithm,
		Challenge: c.Challenge,
		Number:    number,
		Salt:      c.Salt,
		Signature: c.Signature,
	})
}

func encodeRaw(t *testing.T, s solution) string {
	t.Helper()
	raw, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("marshal solution: %v", err)
	}
	return base64.StdEncoding.EncodeToString(raw)
}

// setClock advances both the issuer and its in-process replay store, which keep
// separate clocks now that the store is pluggable.
func setClock(a *Altcha, at time.Time) {
	clock := fixedClock(at)
	a.now = clock
	if store, ok := a.store.(*memoryReplayStore); ok {
		store.now = clock
	}
}

func spentEntries(a *Altcha) map[string]time.Time {
	store, ok := a.store.(*memoryReplayStore)
	if !ok {
		return nil
	}
	return store.spent
}
