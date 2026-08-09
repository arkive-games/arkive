package auth

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// memoryReplayStore tracks spent solutions in this process only.
//
// Correct while one process serves the endpoint, but everything is forgotten on
// restart, which reopens the replay window for every challenge that has not yet
// expired. Acceptable as a development default; production supplies the Redis
// store instead.
type memoryReplayStore struct {
	mu    sync.Mutex
	spent map[string]time.Time
	now   func() time.Time
}

// NewMemoryReplayStore builds the in-process store.
func NewMemoryReplayStore() ReplayStore {
	return &memoryReplayStore{spent: make(map[string]time.Time), now: time.Now}
}

func (m *memoryReplayStore) Claim(_ context.Context, signature string, expires time.Time) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.now()
	// Entries are only useful until the challenge they describe expires, so
	// sweeping on write keeps the map bounded without a background goroutine.
	for k, exp := range m.spent {
		if now.After(exp) {
			delete(m.spent, k)
		}
	}

	if _, used := m.spent[signature]; used {
		return false, nil
	}
	m.spent[signature] = expires
	return true, nil
}

// redisReplayStore tracks spent solutions in Redis, so the record survives a
// restart and is shared by every process serving the endpoint.
type redisReplayStore struct {
	client redis.UniversalClient
	now    func() time.Time
}

// NewRedisReplayStore builds the Redis-backed store.
func NewRedisReplayStore(client redis.UniversalClient) ReplayStore {
	return &redisReplayStore{client: client, now: time.Now}
}

func (r *redisReplayStore) Claim(ctx context.Context, signature string, expires time.Time) (bool, error) {
	ttl := time.Until(expires)
	if r.now != nil {
		ttl = expires.Sub(r.now())
	}
	if ttl <= 0 {
		// Already expired; the caller's own expiry check should have rejected
		// it, so treat this as spent rather than storing a useless key.
		return false, nil
	}

	// SET NX is the whole mechanism: the first caller to claim a signature
	// creates the key, everyone after finds it present. The TTL matches the
	// challenge's own lifetime, so Redis reclaims the key exactly when the
	// solution stops being usable anyway.
	ok, err := r.client.SetArgs(ctx, replayKey(signature), "1", redis.SetArgs{
		Mode: "NX",
		TTL:  ttl,
	}).Result()
	if err == redis.Nil {
		// Key already existed: NX declined to set it.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("claim altcha solution: %w", err)
	}
	return ok == "OK", nil
}

func replayKey(signature string) string {
	return "altcha:spent:" + signature
}
