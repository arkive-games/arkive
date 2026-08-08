package auth

import (
	"net"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiter throttles a route per client IP.
//
// State is per process, matching the slowapi limiter it replaces. When the
// service is later split into one process per module the effective allowance
// multiplies by the number of processes serving the route; that is acceptable
// for a registration gate whose real defence is the proof-of-work challenge,
// and the type can be swapped for a Redis-backed one without touching callers.
type RateLimiter struct {
	perMinute int
	burst     int
	ttl       time.Duration
	now       func() time.Time

	mu      sync.Mutex
	clients map[string]*client
}

type client struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewRateLimiter allows perMinute requests per IP per minute.
func NewRateLimiter(perMinute int) *RateLimiter {
	if perMinute < 1 {
		perMinute = 1
	}
	return &RateLimiter{
		perMinute: perMinute,
		burst:     perMinute,
		ttl:       10 * time.Minute,
		now:       time.Now,
		clients:   make(map[string]*client),
	}
}

// Allow reports whether a request from the given peer may proceed.
//
// It takes the addresses rather than an *http.Request so the limiter can be
// driven from huma's transport-agnostic context as easily as from net/http,
// and so the address-resolution rule can be tested directly.
func (l *RateLimiter) Allow(remoteAddr, forwardedFor string) bool {
	key := ClientIP(remoteAddr, forwardedFor)

	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	// Sweep idle clients on each admission so the map tracks active callers
	// rather than every address ever seen.
	for k, c := range l.clients {
		if now.Sub(c.lastSeen) > l.ttl {
			delete(l.clients, k)
		}
	}

	c, ok := l.clients[key]
	if !ok {
		c = &client{limiter: rate.NewLimiter(rate.Limit(float64(l.perMinute)/60.0), l.burst)}
		l.clients[key] = c
	}
	c.lastSeen = now

	return c.limiter.AllowN(now, 1)
}

// ClientIP resolves the caller's address.
//
// X-Forwarded-For is honoured only for its last hop, which is the address the
// immediately-upstream proxy observed. Trusting the leftmost entry, as is
// common, would let any client spoof its own identity by sending the header and
// bypass the limit entirely.
func ClientIP(remoteAddr, forwardedFor string) string {
	if forwardedFor != "" {
		parts := splitAndTrim(forwardedFor)
		if len(parts) > 0 {
			return parts[len(parts)-1]
		}
	}
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}

func splitAndTrim(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			part := trimSpace(s[start:i])
			if part != "" {
				out = append(out, part)
			}
			start = i + 1
		}
	}
	return out
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
