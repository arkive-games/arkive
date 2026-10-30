package comments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

// MarkerIndex answers whether a marker exists on a map.
//
// It is the third of three validation layers, and the only one that reads anything
// outside this database. The backend owns dynamic data and the pipeline owns game
// content (architecture design §1), so there is no marker table to join against and
// this is the one place the two meet: a small read of the game's own data artifact.
//
// The check is deliberately a courtesy and not an invariant. Its callers accept a
// submission when it cannot answer, because a backend that refuses a comment
// because a different repository is mid-deploy is worse than a rare row naming a
// marker that has since been renamed.
type MarkerIndex interface {
	// Exists reports whether the marker is in the map's data artifact.
	//
	// found is meaningful only when err is nil. An error means "could not
	// determine", never "does not exist".
	Exists(ctx context.Context, t Target) (found bool, err error)
}

// versionTTL bounds how long an artifact's version.json is trusted.
//
// Short, because the whole point of keying the cache by version is that a re-emit
// is noticed rather than served stale. The file itself is a few bytes.
const versionTTL = time.Minute

// maxArtifactBytes bounds one fetch. A markers file for the largest PBZ map is
// under 200 KB; this leaves room for an order of magnitude of growth and still
// refuses to buffer an arbitrarily large response into memory.
const maxArtifactBytes = 8 << 20

// HTTPMarkerIndex reads the data artifacts over HTTP.
type HTTPMarkerIndex struct {
	baseURLs map[string]string
	client   *http.Client
	logger   *slog.Logger

	// ttl is how long version.json is trusted. A field rather than the constant so
	// a test can lower it instead of sleeping a minute; production never sets it.
	ttl time.Duration

	mu    sync.Mutex
	games map[string]*gameIndex
}

// gameIndex caches one game's marker sets, keyed by the artifact's own version.
type gameIndex struct {
	version   string
	checkedAt time.Time

	// maps holds each fetched map's marker ids. A map that has been fetched in
	// the current version is never fetched again until the version changes.
	maps map[string]map[string]struct{}
}

// NewHTTPMarkerIndex builds the index. A nil logger logs to slog's default.
func NewHTTPMarkerIndex(baseURLs map[string]string, timeout time.Duration, logger *slog.Logger) *HTTPMarkerIndex {
	if logger == nil {
		logger = slog.Default()
	}
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &HTTPMarkerIndex{
		baseURLs: baseURLs,
		client:   &http.Client{Timeout: timeout},
		logger:   logger,
		ttl:      versionTTL,
		games:    map[string]*gameIndex{},
	}
}

// ErrNoArtifact reports that this deployment has no data host for the game, so
// existence cannot be checked. Callers treat it as "accept on format".
var ErrNoArtifact = errors.New("no data artifact configured for this game")

// errNotFound is an artifact file that does not exist. Unlike every other fetch
// failure it is a definite answer — the map is not in the artifact — so the caller
// can refuse the comment rather than falling back to format alone.
var errNotFound = errors.New("artifact file not found")

// Exists implements MarkerIndex.
func (m *HTTPMarkerIndex) Exists(ctx context.Context, t Target) (bool, error) {
	base, ok := m.baseURLs[t.GameKey]
	if !ok || base == "" {
		return false, ErrNoArtifact
	}

	g := m.game(t.GameKey)

	// The version check is an optimization and a correctness guard at once: it
	// stops a renamed or removed marker from being trusted forever.
	if err := m.refreshVersion(ctx, base, g); err != nil {
		return false, err
	}

	// Read under the lock: the fill below and refreshVersion both write g.maps, and
	// an unlocked read racing either is a fatal runtime error, not a recoverable
	// panic — it would take the whole process down, not one request.
	m.mu.Lock()
	set, ok := g.maps[t.MapID]
	m.mu.Unlock()
	if !ok {
		ids, err := m.fetchMap(ctx, base, t.MapID)
		if errors.Is(err, errNotFound) {
			// A definite answer, and the only fetch failure that is one: the artifact
			// has no such map, so it certainly has no such marker. Every other error
			// stays an error and the caller fails open.
			return false, nil
		}
		if err != nil {
			return false, err
		}
		m.mu.Lock()
		// Another request may have fetched the same map while this one waited;
		// either copy is the same version, so keeping the existing one is fine.
		if _, raced := g.maps[t.MapID]; !raced {
			g.maps[t.MapID] = ids
		}
		set = g.maps[t.MapID]
		m.mu.Unlock()
	}

	_, found := set[t.MarkerID]
	return found, nil
}

// game returns the cache record for a game, creating it on first use.
func (m *HTTPMarkerIndex) game(key string) *gameIndex {
	m.mu.Lock()
	defer m.mu.Unlock()
	if g, ok := m.games[key]; ok {
		return g
	}
	g := &gameIndex{maps: map[string]map[string]struct{}{}}
	m.games[key] = g
	return g
}

// refreshVersion re-reads version.json when the cached copy is old enough.
//
// A changed version drops every marker set, because a set built for the previous
// export can name markers the new one removed. Nothing is fetched here, so a routine
// request pays for one small JSON document a minute at most.
func (m *HTTPMarkerIndex) refreshVersion(ctx context.Context, base string, g *gameIndex) error {
	m.mu.Lock()
	fresh := !g.checkedAt.IsZero() && time.Since(g.checkedAt) < m.ttl
	m.mu.Unlock()
	if fresh {
		return nil
	}

	var doc struct {
		Version string `json:"version"`
	}
	if err := m.getJSON(ctx, base+"/version.json", &doc); err != nil {
		return fmt.Errorf("read data version: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if doc.Version != g.version {
		g.version = doc.Version
		g.maps = map[string]map[string]struct{}{}
	}
	g.checkedAt = time.Now()
	return nil
}

// fetchMap reads one map's marker file and reduces it to the ids.
func (m *HTTPMarkerIndex) fetchMap(ctx context.Context, base, mapID string) (map[string]struct{}, error) {
	var doc struct {
		Markers []struct {
			ID string `json:"id"`
		} `json:"markers"`
	}
	// mapID is already shape-checked by the caller; escaping it here is defence in
	// depth against a future caller that forgets.
	url := base + "/markers/" + escapeSegment(mapID) + ".json"
	if err := m.getJSON(ctx, url, &doc); err != nil {
		return nil, fmt.Errorf("read markers for map %q: %w", mapID, err)
	}
	set := make(map[string]struct{}, len(doc.Markers))
	for _, marker := range doc.Markers {
		set[marker.ID] = struct{}{}
	}
	return set, nil
}

// getJSON fetches and decodes one document.
func (m *HTTPMarkerIndex) getJSON(ctx context.Context, url string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	// The artifact host serves a versioned, immutable set of files; asking for the
	// latest copy matters more than saving bytes, because the point of the cache is
	// to notice a change.
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		// A missing file is an answer, not a failure: the map does not exist in this
		// artifact. It is distinguished from every other non-200 so the caller can
		// refuse the comment instead of failing open on an unknown map.
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return errNotFound
	}
	if resp.StatusCode != http.StatusOK {
		// Drain a little so the connection can be reused, then report the status.
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("%s: %s", url, resp.Status)
	}
	body := io.LimitReader(resp.Body, maxArtifactBytes)
	if err := json.NewDecoder(body).Decode(dst); err != nil {
		return fmt.Errorf("%s: decode: %w", url, err)
	}
	return nil
}

// escapeSegment percent-escapes one path segment.
//
// url.PathEscape leaves some characters legal that a proxy may read specially, so
// the segment is restricted to what the map-id pattern already allows and anything
// else is escaped.
func escapeSegment(s string) string {
	escaped := strings.Builder{}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			escaped.WriteRune(r)
		default:
			escaped.WriteString(fmt.Sprintf("%%%02X", r))
		}
	}
	return escaped.String()
}

// VersionTTLForTest is the production cache's version-check interval, exported so a
// test can reason about it. Production code never reads it.
const VersionTTLForTest = versionTTL

// SetVersionTTLForTest lowers the version-check interval so a test can observe a
// re-emit without sleeping a minute. It exists for tests only and is never called
// from production code.
func (m *HTTPMarkerIndex) SetVersionTTLForTest(d time.Duration) { m.ttl = d }
