package ratelimit

import (
	"context"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

// redisLimiter counts in Redis with a fixed window.
//
// A fixed window rather than a sliding log: the endpoints being protected are
// low-volume, and the burst a fixed window allows at a boundary (up to 2× the
// limit across two adjacent windows) is irrelevant when the limit is "5 password
// resets an hour". A sliding log would cost a sorted set per key for no
// meaningful gain.
type redisLimiter struct {
	client   redis.UniversalClient
	fallback Limiter
	logger   *slog.Logger
	timeout  time.Duration
}

// NewRedis builds a Redis-backed limiter that degrades to fallback when Redis
// cannot be reached.
func NewRedis(client redis.UniversalClient, fallback Limiter, logger *slog.Logger) Limiter {
	if fallback == nil {
		fallback = NewMemory()
	}
	return &redisLimiter{
		client:   client,
		fallback: fallback,
		logger:   logger,
		// Short: a limiter must never become the slowest part of a request.
		timeout: 250 * time.Millisecond,
	}
}

// incrementAndExpire sets the TTL only when the counter is newly created, so a
// steady stream of requests cannot keep pushing the window's end further out and
// hold a caller throttled forever.
var incrementAndExpire = redis.NewScript(`
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {current, redis.call('PTTL', KEYS[1])}
`)

func (r *redisLimiter) Allow(ctx context.Context, key string, rule Rule) Decision {
	if rule.Limit <= 0 {
		return Decision{Allowed: true}
	}

	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	res, err := incrementAndExpire.Run(ctx, r.client, []string{key}, rule.Window.Milliseconds()).Slice()
	if err != nil {
		// Degrade rather than fail closed. Failing closed on a Redis blip would
		// stop every password reset and sign-in, which is a bigger outage than
		// the abuse the limiter prevents.
		r.logger.WarnContext(ctx, "rate limiter falling back to in-process counters",
			slog.String("key", key), slog.Any("error", err))
		return r.fallback.Allow(ctx, key, rule)
	}

	count, _ := res[0].(int64)
	ttlMs, _ := res[1].(int64)

	retryAfter := time.Duration(ttlMs) * time.Millisecond
	if ttlMs < 0 {
		retryAfter = rule.Window
	}

	if int(count) > rule.Limit {
		return Decision{Allowed: false, RetryAfter: retryAfter}
	}
	return Decision{Allowed: true, Remaining: rule.Limit - int(count)}
}
