package core_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/arkive-games/arkive/backend-go/internal/core/comments"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// markerTarget is the PBZ marker these tests comment on. Its shape is the whole
// requirement: the backend never resolves it against anything in test runs.
var markerTarget = map[string]any{"game": "pbz", "map": "XiGu", "marker": "accessory-7a2266d67a"}

func markerCommentPath(suffix string) string { return "/map-markers/comments" + suffix }

func (h *harness) mustCommentOnMarker(token string, body map[string]any) map[string]any {
	h.t.Helper()
	res := h.do(http.MethodPost, markerCommentPath(""), body, withBearer(token))
	if res.status != http.StatusOK {
		h.t.Fatalf("create marker comment = %d: %s", res.status, res.body)
	}
	return res.data(h.t)
}

func withTarget(body map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range markerTarget {
		out[k] = v
	}
	for k, v := range body {
		out[k] = v
	}
	return out
}

// ---------------------------------------------------------------------------
// Writing and reading
// ---------------------------------------------------------------------------

func TestMarkerCommentRoundTrip(t *testing.T) {
	h := newHarness(t)
	author := h.registerAndLogin("marker-author", "marker-author@example.com", "hunter2hunter2")
	reader := h.registerAndLogin("marker-reader", "marker-reader@example.com", "hunter2hunter2")

	created := h.mustCommentOnMarker(author, withTarget(map[string]any{"body": "The chest is behind the shrine."}))
	if created["body"] != "The chest is behind the shrine." {
		t.Errorf("body = %v", created["body"])
	}
	if created["game"] != "pbz" || created["map"] != "XiGu" || created["marker"] != "accessory-7a2266d67a" {
		t.Errorf("the returned comment lost its target: %v", created)
	}
	if created["parentId"] != nil {
		t.Errorf("a top-level comment carries a parent: %v", created["parentId"])
	}
	commentID, _ := created["id"].(string)
	if commentID == "" {
		t.Fatalf("no id in %v", created)
	}

	// Public: anonymous readers see it, and it is not marked as liked by them.
	query := "?game=pbz&map=XiGu&marker=accessory-7a2266d67a"
	res := h.do(http.MethodGet, markerCommentPath(query), nil)
	if res.status != http.StatusOK {
		t.Fatalf("anonymous list = %d: %s", res.status, res.body)
	}
	page := res.envelope(t)
	data, _ := page["data"].(map[string]any)
	if count, _ := data["count"].(float64); count != 1 {
		t.Fatalf("count = %v, want 1: %s", data["count"], res.body)
	}
	results, _ := data["results"].([]any)
	if len(results) != 1 {
		t.Fatalf("results = %d, want 1", len(results))
	}
	first, _ := results[0].(map[string]any)
	if first["liked"] != false {
		t.Errorf("an anonymous reader is shown as having liked it: %v", first["liked"])
	}

	// A like is an end state, and liking twice is the same as liking once.
	for i := 0; i < 2; i++ {
		res := h.do(http.MethodPut, markerCommentPath("/"+commentID+"/like"),
			map[string]any{"liked": true}, withBearer(reader))
		if res.status != http.StatusOK {
			t.Fatalf("like #%d = %d: %s", i+1, res.status, res.body)
		}
		if likes, _ := res.data(t)["likeCount"].(float64); likes != 1 {
			t.Errorf("after like #%d the count is %v, want 1", i+1, likes)
		}
	}
	res = h.do(http.MethodPut, markerCommentPath("/"+commentID+"/like"),
		map[string]any{"liked": false}, withBearer(reader))
	if likes, _ := res.data(t)["likeCount"].(float64); likes != 0 {
		t.Errorf("after unlike the count is %v, want 0", likes)
	}

	// A reply notifies the author and lands under the comment.
	reply := h.mustCommentOnMarker(reader, withTarget(map[string]any{
		"body": "Also two ore nodes nearby.", "parentId": commentID,
	}))
	if reply["parentId"] != commentID {
		t.Errorf("reply parentId = %v, want %s", reply["parentId"], commentID)
	}
	res = h.do(http.MethodGet, markerCommentPath("/"+commentID+"/replies"), nil)
	if res.status != http.StatusOK {
		t.Fatalf("replies = %d: %s", res.status, res.body)
	}

	// The author sees the reply in their inbox, addressed to the marker comment.
	inbox := h.do(http.MethodGet, "/notifications?kind=reply", nil, withBearer(author))
	if inbox.status != http.StatusOK {
		t.Fatalf("inbox = %d: %s", inbox.status, inbox.body)
	}
	inboxData, _ := inbox.data(t)["results"].([]any)
	if len(inboxData) != 1 {
		t.Fatalf("author's reply notifications = %d, want 1: %s", len(inboxData), inbox.body)
	}
	if got, _ := inboxData[0].(map[string]any)["markerCommentId"].(string); got != reply["id"] {
		t.Errorf("notification points at %q, want the reply %v", got, reply["id"])
	}
	// The row carries where the comment lives, so the inbox can link to the marker
	// without a request per row.
	row, _ := inboxData[0].(map[string]any)
	if row["markerGame"] != "pbz" || row["markerMap"] != "XiGu" || row["markerId"] != "accessory-7a2266d67a" {
		t.Errorf("notification does not locate its marker: game=%v map=%v marker=%v",
			row["markerGame"], row["markerMap"], row["markerId"])
	}

	// Editing is the author's; deleting is too, and it takes the reply with it.
	res = h.do(http.MethodPatch, markerCommentPath("/"+commentID), map[string]any{"body": "Edited."}, withBearer(reader))
	if res.status != http.StatusForbidden {
		t.Errorf("a stranger editing = %d, want 403", res.status)
	}
	res = h.do(http.MethodPatch, markerCommentPath("/"+commentID), map[string]any{"body": "Edited."}, withBearer(author))
	if res.status != http.StatusOK {
		t.Fatalf("author editing = %d: %s", res.status, res.body)
	}
	if res.data(t)["editedAt"] == nil {
		t.Errorf("an edit did not record editedAt")
	}
	if res := h.do(http.MethodDelete, markerCommentPath("/"+commentID), nil, withBearer(author)); res.status != http.StatusOK {
		t.Fatalf("author deleting = %d: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, markerCommentPath("/"+commentID+"/replies"), nil); res.status != http.StatusNotFound {
		t.Errorf("replies of a deleted comment = %d, want 404", res.status)
	}
}

func TestMarkerCommentRequiresAnAccount(t *testing.T) {
	h := newHarness(t)
	res := h.do(http.MethodPost, markerCommentPath(""), withTarget(map[string]any{"body": "Hi."}))
	if res.status != http.StatusUnauthorized {
		t.Fatalf("anonymous create = %d, want 401: %s", res.status, res.body)
	}
}

func TestMarkerCommentValidatesItsTarget(t *testing.T) {
	h := newHarness(t)
	author := h.registerAndLogin("target-author", "target-author@example.com", "hunter2hunter2")

	cases := []struct {
		name string
		body map[string]any
	}{
		{"unknown game", withTarget(map[string]any{"body": "x", "game": "not-a-game"})},
		{"map with a slash", withTarget(map[string]any{"body": "x", "map": "Xi/Gu"})},
		{"marker with a space", withTarget(map[string]any{"body": "x", "marker": "a marker"})},
		{"empty body", withTarget(map[string]any{"body": "   "})},
		{"body past the limit", withTarget(map[string]any{"body": string(make([]rune, comments.MaxBody+1))})},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := h.do(http.MethodPost, markerCommentPath(""), tc.body, withBearer(author))
			if res.status != http.StatusUnprocessableEntity {
				t.Fatalf("%s = %d, want 422: %s", tc.name, res.status, res.body)
			}
		})
	}
}

func TestMarkerCommentRejectsNestedReplies(t *testing.T) {
	h := newHarness(t)
	author := h.registerAndLogin("nest-author", "nest-author@example.com", "hunter2hunter2")

	root := h.mustCommentOnMarker(author, withTarget(map[string]any{"body": "Root."}))
	rootID, _ := root["id"].(string)
	reply := h.mustCommentOnMarker(author, withTarget(map[string]any{"body": "Reply.", "parentId": rootID}))
	replyID, _ := reply["id"].(string)

	res := h.do(http.MethodPost, markerCommentPath(""),
		withTarget(map[string]any{"body": "Reply to a reply.", "parentId": replyID}), withBearer(author))
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("a reply to a reply = %d, want 422: %s", res.status, res.body)
	}

	// A reply cannot be moved to another marker by naming a different one.
	res = h.do(http.MethodPost, markerCommentPath(""), map[string]any{
		"game": "pbz", "map": "XiGu", "marker": "accessory-20c5225971",
		"body": "Elsewhere.", "parentId": rootID,
	}, withBearer(author))
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("a reply filed under another marker = %d, want 422: %s", res.status, res.body)
	}
}

func TestMarkerCommentSortsPopular(t *testing.T) {
	h := newHarness(t)
	author := h.registerAndLogin("sort-author", "sort-author@example.com", "hunter2hunter2")
	voter := h.registerAndLogin("sort-voter", "sort-voter@example.com", "hunter2hunter2")

	first := h.mustCommentOnMarker(author, withTarget(map[string]any{"body": "First."}))
	h.mustCommentOnMarker(author, withTarget(map[string]any{"body": "Second."}))
	firstID, _ := first["id"].(string)
	if res := h.do(http.MethodPut, markerCommentPath("/"+firstID+"/like"),
		map[string]any{"liked": true}, withBearer(voter)); res.status != http.StatusOK {
		t.Fatalf("like = %d: %s", res.status, res.body)
	}

	res := h.do(http.MethodGet, markerCommentPath("?game=pbz&map=XiGu&marker=accessory-7a2266d67a&sort=popular"), nil)
	if res.status != http.StatusOK {
		t.Fatalf("popular = %d: %s", res.status, res.body)
	}
	data, _ := res.data(t), res
	results, _ := data["results"].([]any)
	if len(results) != 2 {
		t.Fatalf("results = %d, want 2", len(results))
	}
	top, _ := results[0].(map[string]any)
	if top["id"] != firstID {
		t.Errorf("popular put %v first, want the liked comment %s", top["id"], firstID)
	}
}

// ---------------------------------------------------------------------------
// Reporting and moderation
// ---------------------------------------------------------------------------

func TestMarkerCommentReportReachesTheForumQueue(t *testing.T) {
	h := newHarness(t)
	site := h.registerAndLogin("mc-site", "mc-site@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(site)
	moderator := h.registerAndLogin("mc-mod", "mc-mod@example.com", "hunter2hunter2")
	if res := h.grantRole(site, "pbz", h.uidOf(moderator), "game_moderator"); res.status != http.StatusOK {
		t.Fatalf("seed pbz moderator = %d: %s", res.status, res.body)
	}
	author := h.registerAndLogin("mc-author", "mc-author@example.com", "hunter2hunter2")
	reporter := h.registerAndLogin("mc-reporter", "mc-reporter@example.com", "hunter2hunter2")

	comment := h.mustCommentOnMarker(author, withTarget(map[string]any{"body": "Buy gold cheap."}))
	id, _ := comment["id"].(string)

	res := h.do(http.MethodPost, markerCommentPath("/"+id+"/report"),
		map[string]any{"reason": "spam", "detail": "Advert."}, withBearer(reporter))
	if res.status != http.StatusOK {
		t.Fatalf("report = %d: %s", res.status, res.body)
	}
	// Reporting twice updates the row rather than filing a second.
	res = h.do(http.MethodPost, markerCommentPath("/"+id+"/report"),
		map[string]any{"reason": "spam"}, withBearer(reporter))
	if res.status != http.StatusOK {
		t.Fatalf("second report = %d: %s", res.status, res.body)
	}

	// The pbz moderator sees it in the queue they already watch for the forum,
	// scoped to their game and not to palworld's.
	res = h.do(http.MethodGet, "/forum/moderation/reports", nil, withBearer(moderator))
	if res.status != http.StatusOK {
		t.Fatalf("queue = %d: %s", res.status, res.body)
	}
	queue, _ := res.data(t)["results"].([]any)
	if len(queue) != 1 {
		t.Fatalf("queue holds %d reports, want 1: %s", len(queue), res.body)
	}
	entry, _ := queue[0].(map[string]any)
	if got, _ := entry["markerCommentId"].(string); got != id {
		t.Errorf("queue entry points at %v, want the marker comment %s", entry["markerCommentId"], id)
	}

	// Hiding is reversible, attributed, and hides it from every reader.
	if res := h.do(http.MethodPut, markerCommentPath("/"+id+"/hidden"),
		map[string]any{"reason": "advertising"}, withBearer(moderator)); res.status != http.StatusOK {
		t.Fatalf("hide = %d: %s", res.status, res.body)
	}
	res = h.do(http.MethodGet, markerCommentPath("?game=pbz&map=XiGu&marker=accessory-7a2266d67a"), nil)
	if count, _ := res.data(t)["count"].(float64); count != 0 {
		t.Errorf("a hidden comment is still listed: %s", res.body)
	}
	if res := h.do(http.MethodGet, markerCommentPath("/"+id+"/replies"), nil); res.status != http.StatusNotFound {
		t.Errorf("replies of a hidden comment = %d, want 404", res.status)
	}

	res = h.do(http.MethodGet, "/map-markers/moderation/hidden-comments", nil, withBearer(moderator))
	if res.status != http.StatusOK {
		t.Fatalf("hidden list = %d: %s", res.status, res.body)
	}
	if count, _ := res.data(t)["count"].(float64); count != 1 {
		t.Errorf("hidden list holds %v, want 1: %s", res.data(t)["count"], res.body)
	}

	if res := h.do(http.MethodDelete, markerCommentPath("/"+id+"/hidden"), nil, withBearer(moderator)); res.status != http.StatusOK {
		t.Fatalf("unhide = %d: %s", res.status, res.body)
	}
	res = h.do(http.MethodGet, markerCommentPath("?game=pbz&map=XiGu&marker=accessory-7a2266d67a"), nil)
	if count, _ := res.data(t)["count"].(float64); count != 1 {
		t.Errorf("a restored comment is not listed: %s", res.body)
	}

	// A moderator of another game may neither hide it nor see it in their queue.
	other := h.registerAndLogin("mc-other", "mc-other@example.com", "hunter2hunter2")
	if res := h.grantRole(site, "palworld", h.uidOf(other), "game_moderator"); res.status != http.StatusOK {
		t.Fatalf("seed palworld moderator = %d: %s", res.status, res.body)
	}
	if res := h.do(http.MethodPut, markerCommentPath("/"+id+"/hidden"), nil, withBearer(other)); res.status != http.StatusForbidden {
		t.Errorf("a palworld moderator hiding a pbz comment = %d, want 403", res.status)
	}
	res = h.do(http.MethodGet, "/forum/moderation/reports", nil, withBearer(other))
	if res.status != http.StatusOK {
		t.Fatalf("palworld queue = %d: %s", res.status, res.body)
	}
	if queue, _ := res.data(t)["results"].([]any); len(queue) != 0 {
		t.Errorf("the pbz report appears in palworld's queue: %s", res.body)
	}
}

// ---------------------------------------------------------------------------
// The marker index
// ---------------------------------------------------------------------------

// fakeArtifact serves a game's data artifact over HTTP: version.json and one map's
// markers file. It is what the index reads, so it is the third validation layer's
// only input.
type fakeArtifact struct {
	// mu guards the two fields below, so a test can swap the artifact's version
	// while the index is reading it without the fake itself being the race.
	mu      sync.Mutex
	version string
	markers map[string][]string // map id -> marker ids
}

// publish replaces the artifact as a re-emit would.
func (f *fakeArtifact) publish(version string, markers map[string][]string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.version = version
	f.markers = markers
}

func (f *fakeArtifact) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/version.json", func(w http.ResponseWriter, _ *http.Request) {
		f.mu.Lock()
		version := f.version
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"version":%q}`, version)
	})
	mux.HandleFunc("/markers/", func(w http.ResponseWriter, r *http.Request) {
		mapID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/markers/"), ".json")
		f.mu.Lock()
		ids, ok := f.markers[mapID]
		f.mu.Unlock()
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"markers":[`)
		for i, id := range ids {
			if i > 0 {
				fmt.Fprint(w, ",")
			}
			fmt.Fprintf(w, `{"id":%q}`, id)
		}
		fmt.Fprint(w, `]}`)
	})
	return mux
}

// TestMarkerExistenceIsCheckedButNeverBlocks covers the third validation layer
// end to end: a marker the artifact does not know is refused, a known one is
// accepted, and an index that cannot answer — the artifact host is down — accepts
// on format rather than blaming the writer for a deploy somewhere else.
func TestMarkerExistenceIsCheckedButNeverBlocks(t *testing.T) {
	artifact := &fakeArtifact{
		version: "v1",
		markers: map[string][]string{
			"XiGu": {"accessory-7a2266d67a", "accessory-20c5225971"},
		},
	}
	server := httptest.NewServer(artifact.handler())
	defer server.Close()

	h := newHarnessWith(t, func(cfg *config.Config) {
		cfg.Data.BaseURLs = map[string]string{"pbz": server.URL}
		cfg.Data.Timeout = 2 * time.Second
	}, nil)
	author := h.registerAndLogin("index-author", "index-author@example.com", "hunter2hunter2")

	res := h.do(http.MethodPost, markerCommentPath(""),
		withTarget(map[string]any{"body": "Under a real marker."}), withBearer(author))
	if res.status != http.StatusOK {
		t.Fatalf("known marker = %d, want 200: %s", res.status, res.body)
	}

	res = h.do(http.MethodPost, markerCommentPath(""), map[string]any{
		"game": "pbz", "map": "XiGu", "marker": "accessory-ffffffffff", "body": "Under nothing.",
	}, withBearer(author))
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("unknown marker = %d, want 422: %s", res.status, res.body)
	}

	// A map the artifact does not carry is refused the same way, which is what
	// catches a mistyped map before it becomes a thread nobody can find.
	res = h.do(http.MethodPost, markerCommentPath(""), map[string]any{
		"game": "pbz", "map": "Nowhere", "marker": "accessory-7a2266d67a", "body": "Under nothing.",
	}, withBearer(author))
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("unknown map = %d, want 422: %s", res.status, res.body)
	}

	// The artifact goes away mid-run. Comments are accepted on format, because a
	// backend that refuses them while another repository redeploys is worse than a
	// rare row naming a marker that has since been renamed.
	server.Close()
	res = h.do(http.MethodPost, markerCommentPath(""), map[string]any{
		"game": "pbz", "map": "XiGu", "marker": "accessory-7a2266d67a", "body": "Artifact is down.",
	}, withBearer(author))
	if res.status != http.StatusOK {
		t.Fatalf("unreachable artifact = %d, want 200: %s", res.status, res.body)
	}
}

// TestMarkerIndexCachesByVersion covers the property the cache exists for: a re-emit
// is noticed rather than served stale, and a second comment on the same map does not
// refetch it.
func TestMarkerIndexCachesByVersion(t *testing.T) {
	artifact := &fakeArtifact{
		version: "v1",
		markers: map[string][]string{"XiGu": {"accessory-7a2266d67a"}},
	}
	server := httptest.NewServer(artifact.handler())
	defer server.Close()

	index := comments.NewHTTPMarkerIndex(map[string]string{"pbz": server.URL}, 2*time.Second, nil)
	index.SetVersionTTLForTest(10 * time.Millisecond)
	target := comments.Target{GameKey: "pbz", MapID: "XiGu", MarkerID: "accessory-7a2266d67a"}

	if found, err := index.Exists(context.Background(), target); err != nil || !found {
		t.Fatalf("first read = %v, %v", found, err)
	}

	// A new marker in a new artifact version is visible without a restart, and the
	// old one is gone.
	artifact.publish("v2", map[string][]string{"XiGu": {"accessory-20c5225971"}})
	time.Sleep(20 * time.Millisecond)

	if found, err := index.Exists(context.Background(), target); err != nil || found {
		t.Fatalf("a marker from the previous version still resolves: %v, %v", found, err)
	}
	if found, err := index.Exists(context.Background(), comments.Target{
		GameKey: "pbz", MapID: "XiGu", MarkerID: "accessory-20c5225971",
	}); err != nil || !found {
		t.Fatalf("a marker added in the new version does not resolve: %v, %v", found, err)
	}
}

// TestMarkerIndexWithoutAnArtifact covers the deployment with no data host: an
// explicit "cannot answer", never a false "does not exist".
func TestMarkerIndexWithoutAnArtifact(t *testing.T) {
	index := comments.NewHTTPMarkerIndex(map[string]string{}, time.Second, nil)
	if _, err := index.Exists(context.Background(), comments.Target{GameKey: "pbz", MapID: "XiGu", MarkerID: "x"}); err != comments.ErrNoArtifact {
		t.Fatalf("no artifact = %v, want ErrNoArtifact", err)
	}
}

// TestMarkerIndexIsSafeUnderConcurrentUse is the regression for an unlocked read of
// the per-map cache. Under -race it fails on the old code; without -race the same
// race was a fatal "concurrent map read and map write" that no recover can catch, so
// two people commenting while the artifact was re-emitted could stop the backend.
func TestMarkerIndexIsSafeUnderConcurrentUse(t *testing.T) {
	artifact := &fakeArtifact{
		version: "v1",
		markers: map[string][]string{"XiGu": {"a-1"}, "LuJiaCun": {"b-1"}},
	}
	server := httptest.NewServer(artifact.handler())
	defer server.Close()

	index := comments.NewHTTPMarkerIndex(map[string]string{"pbz": server.URL}, 2*time.Second, nil)
	// Every call re-reads version.json, so the cache is invalidated as often as possible.
	index.SetVersionTTLForTest(0)

	var wg sync.WaitGroup
	for worker := 0; worker < 16; worker++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < 40; i++ {
				mapID, marker := "XiGu", "a-1"
				if (worker+i)%2 == 1 {
					mapID, marker = "LuJiaCun", "b-1"
				}
				if _, err := index.Exists(context.Background(), comments.Target{GameKey: "pbz", MapID: mapID, MarkerID: marker}); err != nil {
					t.Errorf("exists: %v", err)
					return
				}
			}
		}(worker)
	}
	for i := 0; i < 40; i++ {
		artifact.publish(fmt.Sprintf("v%d", i+2), map[string][]string{"XiGu": {"a-1"}, "LuJiaCun": {"b-1"}})
	}
	wg.Wait()
}

// TestMarkerCommentReportsAreResolvedByTheirGame pins that a marker-comment report is
// answerable by the moderators who can see it. It was visible in a pbz moderator's
// queue yet refused on resolve, because the scope check knew only posts and forum
// comments, so only a site administrator could ever clear one.
func TestMarkerCommentReportsAreResolvedByTheirGame(t *testing.T) {
	h := newHarness(t)
	site := h.registerAndLogin("rr-site", "rr-site@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(site)
	pbzMod := h.registerAndLogin("rr-pbz", "rr-pbz@example.com", "hunter2hunter2")
	if res := h.grantRole(site, "pbz", h.uidOf(pbzMod), "game_moderator"); res.status != http.StatusOK {
		t.Fatalf("seed pbz moderator = %d: %s", res.status, res.body)
	}
	aionMod := h.registerAndLogin("rr-aion", "rr-aion@example.com", "hunter2hunter2")
	if res := h.grantRole(site, "aion2", h.uidOf(aionMod), "game_moderator"); res.status != http.StatusOK {
		t.Fatalf("seed aion2 moderator = %d: %s", res.status, res.body)
	}
	author := h.registerAndLogin("rr-author", "rr-author@example.com", "hunter2hunter2")
	reporter := h.registerAndLogin("rr-reporter", "rr-reporter@example.com", "hunter2hunter2")

	comment := h.mustCommentOnMarker(author, withTarget(map[string]any{"body": "Spam."}))
	id, _ := comment["id"].(string)
	if res := h.do(http.MethodPost, markerCommentPath("/"+id+"/report"),
		map[string]any{"reason": "spam"}, withBearer(reporter)); res.status != http.StatusOK {
		t.Fatalf("report = %d: %s", res.status, res.body)
	}

	res := h.do(http.MethodGet, "/forum/moderation/reports", nil, withBearer(pbzMod))
	queue, _ := res.data(t)["results"].([]any)
	if len(queue) != 1 {
		t.Fatalf("pbz queue holds %d, want 1: %s", len(queue), res.body)
	}
	reportID, _ := queue[0].(map[string]any)["id"].(string)
	resolve := "/forum/reports/" + reportID + "/resolution"

	if res := h.do(http.MethodPost, resolve, map[string]any{"state": "upheld"}, withBearer(aionMod)); res.status != http.StatusForbidden {
		t.Errorf("aion2 moderator resolving a pbz report = %d, want 403: %s", res.status, res.body)
	}
	if res := h.do(http.MethodPost, resolve, map[string]any{"state": "upheld"}, withBearer(pbzMod)); res.status != http.StatusOK {
		t.Fatalf("pbz moderator resolving a pbz report = %d, want 200: %s", res.status, res.body)
	}
}

// TestReportingAHiddenCommentRevealsNothing pins that a report is an acknowledgement.
// It used to return the comment, so anyone holding a hidden comment's id could read
// what a moderator had withheld by reporting it.
func TestReportingAHiddenCommentRevealsNothing(t *testing.T) {
	h := newHarness(t)
	site := h.registerAndLogin("hr-site", "hr-site@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(site)
	author := h.registerAndLogin("hr-author", "hr-author@example.com", "hunter2hunter2")
	reader := h.registerAndLogin("hr-reader", "hr-reader@example.com", "hunter2hunter2")

	comment := h.mustCommentOnMarker(author, withTarget(map[string]any{"body": "Withheld text."}))
	id, _ := comment["id"].(string)
	if res := h.do(http.MethodPut, markerCommentPath("/"+id+"/hidden"), nil, withBearer(site)); res.status != http.StatusOK {
		t.Fatalf("hide = %d: %s", res.status, res.body)
	}

	res := h.do(http.MethodPost, markerCommentPath("/"+id+"/report"), map[string]any{"reason": "abuse"}, withBearer(reader))
	if res.status != http.StatusOK {
		t.Fatalf("report on a hidden comment = %d, want 200 (it still lands): %s", res.status, res.body)
	}
	if strings.Contains(string(res.body), "Withheld text.") || strings.Contains(string(res.body), "hr-author") {
		t.Errorf("reporting a hidden comment revealed it: %s", res.body)
	}
}
