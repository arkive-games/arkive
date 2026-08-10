package blob

import (
	"context"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
)

// Memory is an in-process Store for tests.
//
// It exists so the image pipeline and the HTTP flow above it can be tested
// exhaustively without a container. The parts that only a real server can get
// wrong — request addressing, signing, anonymous readability — are covered
// separately against MinIO and a recording stub, because a fake would otherwise
// only prove the fake works.
type Memory struct {
	mu      sync.Mutex
	objects map[string]Object

	// FailPut, when set, is returned by Put. Storage failing mid-upload is a
	// path the service has to handle, and it cannot be provoked otherwise.
	FailPut error
}

// Object is a stored object's bytes and metadata.
type Object struct {
	Body        []byte
	ContentType string
	Mutable     bool
}

// NewMemory builds an empty store.
func NewMemory() *Memory {
	return &Memory{objects: make(map[string]Object)}
}

// Put records an object.
func (m *Memory) Put(_ context.Context, key string, body io.Reader, size int64, opts PutOptions) error {
	if m.FailPut != nil {
		return m.FailPut
	}
	raw, err := io.ReadAll(body)
	if err != nil {
		return fmt.Errorf("read body for %q: %w", key, err)
	}
	// The real client sends ContentLength explicitly, so a caller that computes
	// it wrongly would corrupt the upload against a real server while passing
	// against a fake that ignored it.
	if size != int64(len(raw)) {
		return fmt.Errorf("put %q: declared size %d but body is %d bytes", key, size, len(raw))
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = Object{Body: raw, ContentType: opts.ContentType, Mutable: opts.Mutable}
	return nil
}

// Delete removes an object.
func (m *Memory) Delete(_ context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, key)
	return nil
}

// List returns the stored keys under a prefix, sorted so tests are deterministic.
func (m *Memory) List(_ context.Context, prefix string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []string
	for k := range m.objects {
		if strings.HasPrefix(k, prefix) {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out, nil
}

// PublicURL renders a stable fake URL.
func (m *Memory) PublicURL(key string) string {
	return "https://blob.test/" + key
}

// Get returns a stored object, for assertions.
func (m *Memory) Get(key string) (Object, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.objects[key]
	return o, ok
}

// Len reports how many objects are stored, which is how a test observes that
// identical uploads deduplicated.
func (m *Memory) Len() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.objects)
}

// Keys lists stored keys.
func (m *Memory) Keys() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]string, 0, len(m.objects))
	for k := range m.objects {
		out = append(out, k)
	}
	return out
}

var _ Store = (*Memory)(nil)
var _ Store = (*S3Store)(nil)
