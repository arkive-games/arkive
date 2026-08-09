// Package ratelimit throttles abusable endpoints.
//
// Two implementations behind one interface: Redis when it is available, so
// counters survive restarts and hold across processes once the service is split
// per game, and an in-process fallback so a Redis outage degrades the limits
// rather than taking sign-in and password reset down with it.
package ratelimit

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// Decision is the outcome of one admission check.
type Decision struct {
	Allowed bool
	// Remaining is how many further requests the window permits.
	Remaining int
	// RetryAfter is how long until the window resets. Zero when allowed.
	RetryAfter time.Duration
}

// Rule is a quota: Limit requests per Window.
type Rule struct {
	Limit  int
	Window time.Duration
}

// Limiter admits or rejects an action for a key.
type Limiter interface {
	// Allow consumes one unit against key. The key should already be
	// namespaced by caller and dimension, e.g. "forgot:ip:1.2.3.4".
	Allow(ctx context.Context, key string, rule Rule) Decision
}

// Key builds a namespaced counter key.
//
// Callers pass a dimension ("ip", "email") and a value, so one endpoint can be
// limited along several axes without the keys colliding.
func Key(scope, dimension, value string) string {
	return fmt.Sprintf("rl:%s:%s:%s", scope, dimension, value)
}

// -----------------------------------------------------------------------
// In-process
// -----------------------------------------------------------------------

type memoryLimiter struct {
	mu      sync.Mutex
	windows map[string]*window
	now     func() time.Time
}

type window struct {
	count   int
	resetAt time.Time
}

// NewMemory builds an in-process limiter. Used directly in tests, and as the
// fallback when Redis is unreachable.
func NewMemory() Limiter {
	return &memoryLimiter{windows: make(map[string]*window), now: time.Now}
}

func (m *memoryLimiter) Allow(_ context.Context, key string, rule Rule) Decision {
	if rule.Limit <= 0 {
		return Decision{Allowed: true, Remaining: 0}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.now()

	// Sweep expired windows on write so the map tracks active keys rather than
	// every key ever seen. Cheap at this scale and avoids a background sweeper.
	for k, w := range m.windows {
		if now.After(w.resetAt) {
			delete(m.windows, k)
		}
	}

	w, ok := m.windows[key]
	if !ok || now.After(w.resetAt) {
		w = &window{resetAt: now.Add(rule.Window)}
		m.windows[key] = w
	}

	if w.count >= rule.Limit {
		return Decision{Allowed: false, Remaining: 0, RetryAfter: w.resetAt.Sub(now)}
	}
	w.count++
	return Decision{Allowed: true, Remaining: rule.Limit - w.count}
}
