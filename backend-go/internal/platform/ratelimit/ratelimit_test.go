package ratelimit

import (
	"context"
	"testing"
	"time"
)

func TestMemoryAllowsUpToTheLimitThenRefuses(t *testing.T) {
	limiter := NewMemory()
	rule := Rule{Limit: 3, Window: time.Hour}
	ctx := context.Background()

	for i := 1; i <= 3; i++ {
		d := limiter.Allow(ctx, "k", rule)
		if !d.Allowed {
			t.Fatalf("request %d should have been allowed", i)
		}
		if d.Remaining != 3-i {
			t.Errorf("request %d: remaining = %d, want %d", i, d.Remaining, 3-i)
		}
	}

	d := limiter.Allow(ctx, "k", rule)
	if d.Allowed {
		t.Fatal("the fourth request must be refused")
	}
	if d.RetryAfter <= 0 {
		t.Error("a refusal should say how long to wait")
	}
}

func TestMemoryKeepsKeysIndependent(t *testing.T) {
	limiter := NewMemory()
	rule := Rule{Limit: 1, Window: time.Hour}
	ctx := context.Background()

	// One caller exhausting their quota must not throttle everyone else, which
	// is the whole point of keying by IP and address.
	if !limiter.Allow(ctx, Key("forgot", "ip", "1.1.1.1"), rule).Allowed {
		t.Fatal("first key should be allowed")
	}
	if limiter.Allow(ctx, Key("forgot", "ip", "1.1.1.1"), rule).Allowed {
		t.Fatal("first key should now be exhausted")
	}
	if !limiter.Allow(ctx, Key("forgot", "ip", "2.2.2.2"), rule).Allowed {
		t.Fatal("a different key must have its own quota")
	}
}

func TestMemoryWindowExpires(t *testing.T) {
	limiter := NewMemory().(*memoryLimiter)
	rule := Rule{Limit: 1, Window: time.Minute}
	ctx := context.Background()

	now := time.Unix(1_700_000_000, 0)
	limiter.now = func() time.Time { return now }

	if !limiter.Allow(ctx, "k", rule).Allowed {
		t.Fatal("first request should be allowed")
	}
	if limiter.Allow(ctx, "k", rule).Allowed {
		t.Fatal("second request within the window should be refused")
	}

	now = now.Add(2 * time.Minute)
	if !limiter.Allow(ctx, "k", rule).Allowed {
		t.Fatal("the window should have reset")
	}
}

func TestMemorySweepsExpiredWindows(t *testing.T) {
	limiter := NewMemory().(*memoryLimiter)
	rule := Rule{Limit: 5, Window: time.Minute}
	ctx := context.Background()

	now := time.Unix(1_700_000_000, 0)
	limiter.now = func() time.Time { return now }

	for i := 0; i < 50; i++ {
		limiter.Allow(ctx, Key("forgot", "ip", string(rune('a'+i%26))+string(rune('0'+i/26))), rule)
	}
	if len(limiter.windows) == 0 {
		t.Fatal("expected windows to be tracked")
	}

	// Without a sweep the map would retain every key ever seen, which is an
	// unbounded leak on a public endpoint.
	now = now.Add(time.Hour)
	limiter.Allow(ctx, "fresh", rule)
	if len(limiter.windows) != 1 {
		t.Fatalf("expired windows should have been swept, %d remain", len(limiter.windows))
	}
}

func TestZeroLimitMeansUnlimited(t *testing.T) {
	limiter := NewMemory()
	rule := Rule{Limit: 0, Window: time.Hour}
	for i := 0; i < 100; i++ {
		if !limiter.Allow(context.Background(), "k", rule).Allowed {
			t.Fatal("a zero limit disables the rule rather than blocking everything")
		}
	}
}

func TestKeyNamespacing(t *testing.T) {
	// Dimensions must not collide: the same value as an IP and as an email has
	// to consume separate quotas.
	if Key("forgot", "ip", "a") == Key("forgot", "email", "a") {
		t.Fatal("dimensions must produce distinct keys")
	}
	if Key("forgot", "ip", "a") == Key("login", "ip", "a") {
		t.Fatal("scopes must produce distinct keys")
	}
}
