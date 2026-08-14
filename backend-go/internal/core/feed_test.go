package core_test

import (
	"fmt"
	"net/http"
	"testing"
)

func feedTitles(t *testing.T, res response) []string {
	t.Helper()
	list, _ := res.data(t)["results"].([]any)
	out := make([]string, 0, len(list))
	for _, item := range list {
		post, _ := item.(map[string]any)
		title, _ := post["title"].(string)
		out = append(out, title)
	}
	return out
}

func TestFeedSortOrders(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	oldest := h.mustCreatePost(authorToken, map[string]any{"channel": "general", "title": "Oldest", "body": "First."})
	middle := h.mustCreatePost(authorToken, map[string]any{"channel": "general", "title": "Middle", "body": "Second."})
	_ = h.mustCreatePost(authorToken, map[string]any{"channel": "general", "title": "Newest", "body": "Third."})

	// Give the oldest post the most likes, so "top" and "new" must disagree — a test
	// where they happen to coincide would prove nothing.
	for i, name := range []string{"a", "b", "c"} {
		token := h.registerAndLogin("liker"+name, "liker"+name+"@example.com", "hunter2hunter2")
		if res := h.react(token, http.MethodPut, fmt.Sprintf("/forum/posts/%d/like", oldest)); res.status != http.StatusOK {
			t.Fatalf("like %d = %d: %s", i, res.status, res.body)
		}
		if i == 0 {
			if res := h.react(token, http.MethodPut, fmt.Sprintf("/forum/posts/%d/like", middle)); res.status != http.StatusOK {
				t.Fatalf("like middle = %d: %s", res.status, res.body)
			}
		}
	}

	// Default and explicit "new" agree, newest first.
	for _, query := range []string{"", "?sort=new"} {
		if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts"+query, nil)); got[0] != "Newest" {
			t.Errorf("feed%q = %v, want Newest first", query, got)
		}
	}

	// "top" is likes alone, ignoring age: 3, 1, 0.
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?sort=top", nil)); len(got) != 3 || got[0] != "Oldest" || got[1] != "Middle" {
		t.Errorf("sort=top = %v, want Oldest, Middle, Newest", got)
	}

	// "hot" weighs engagement against age. All three posts are seconds old here, so
	// engagement dominates and the most-liked leads; the assertion is deliberately
	// only about the leader, because the decay term makes the tail time-dependent.
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?sort=hot", nil)); len(got) != 3 || got[0] != "Oldest" {
		t.Errorf("sort=hot = %v, want the most-engaged post first", got)
	}

	// An unknown order is refused rather than quietly treated as newest.
	if res := h.do(http.MethodGet, "/forum/posts?sort=sideways", nil); res.status != http.StatusUnprocessableEntity {
		t.Errorf("sort=sideways = %d, want 422: %s", res.status, res.body)
	}
}

func TestFeedSearch(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	h.mustCreatePost(token, map[string]any{"channel": "general", "title": "Where is the Chillet spawn", "body": "Looked everywhere."})
	h.mustCreatePost(token, map[string]any{"channel": "general", "title": "Breeding routes", "body": "A note about Chillet in the body."})
	h.mustCreatePost(token, map[string]any{"channel": "general", "title": "Unrelated", "body": "Nothing to see."})

	// Matches title and body alike.
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?q=chillet", nil)); len(got) != 2 {
		t.Errorf("q=chillet = %v, want the two Chillet posts", got)
	}
	// Case-insensitive, and a substring rather than a whole word.
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?q=CHILL", nil)); len(got) != 2 {
		t.Errorf("q=CHILL = %v, want the two Chillet posts", got)
	}
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?q=nothing+here+at+all", nil)); len(got) != 0 {
		t.Errorf("a search matching nothing = %v, want empty", got)
	}

	// The count is filtered too, or the pager offers pages the feed will not return.
	res := h.do(http.MethodGet, "/forum/posts?q=chillet", nil)
	if total, _ := res.data(t)["count"].(float64); total != 2 {
		t.Errorf("search count = %v, want 2", res.data(t)["count"])
	}

	// CJK, which is why this is a trigram index and not a tsvector column: the default
	// text-search configurations do not segment Chinese, so a tsvector would index the
	// whole sentence as one token and match nothing here.
	h.mustCreatePost(token, map[string]any{"channel": "general", "title": "帕鲁的繁殖路线", "body": "关于繁殖的笔记。"})
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?q=%E7%B9%81%E6%AE%96", nil)); len(got) != 1 {
		t.Errorf("a Chinese substring search = %v, want the Chinese post", got)
	}
}

func TestFeaturingIsEditorialAndGameScoped(t *testing.T) {
	h := newHarness(t)
	siteToken := h.registerAndLogin("site", "site@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(siteToken)

	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	palPost := h.mustCreatePost(authorToken, map[string]any{
		"channel": "games", "title": "About Palworld", "body": "Body.", "gameIds": []string{"palworld"},
	})
	generalPost := h.mustCreatePost(authorToken, map[string]any{
		"channel": "general", "title": "About nothing", "body": "Body.",
	})

	palAdminToken := h.registerAndLogin("paladmin", "paladmin@example.com", "hunter2hunter2")
	palAdminUID := h.uidOf(palAdminToken)
	if res := h.grantRole(siteToken, "palworld", palAdminUID, "game_admin"); res.status != http.StatusOK {
		t.Fatalf("seed game admin = %d: %s", res.status, res.body)
	}

	feature := func(token string, postNo int64, method string) response {
		return h.react(token, method, fmt.Sprintf("/forum/posts/%d/featured", postNo))
	}

	// The author cannot feature their own post: an editorial shelf that anyone can put
	// themselves on is not one.
	if res := feature(authorToken, palPost, http.MethodPut); res.status != http.StatusForbidden {
		t.Errorf("author featuring own post = %d, want 403: %s", res.status, res.body)
	}

	// The game's administrator can, for a post tagged with their game.
	res := feature(palAdminToken, palPost, http.MethodPut)
	if res.status != http.StatusOK {
		t.Fatalf("game admin featuring = %d: %s", res.status, res.body)
	}
	if res.data(t)["featuredAt"] == nil {
		t.Errorf("featuredAt is null after featuring: %s", res.body)
	}

	// But not for a post tagged with no game — that belongs to nobody in particular.
	if res := feature(palAdminToken, generalPost, http.MethodPut); res.status != http.StatusForbidden {
		t.Errorf("game admin featuring an untagged post = %d, want 403: %s", res.status, res.body)
	}
	// The site administrator can.
	if res := feature(siteToken, generalPost, http.MethodPut); res.status != http.StatusOK {
		t.Errorf("site admin featuring an untagged post = %d, want 200: %s", res.status, res.body)
	}

	// The filter is three-state: only featured, only unfeatured, or both.
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?featured=true", nil)); len(got) != 2 {
		t.Errorf("featured=true = %v, want both featured posts", got)
	}
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?featured=false", nil)); len(got) != 0 {
		t.Errorf("featured=false = %v, want none", got)
	}
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts", nil)); len(got) != 2 {
		t.Errorf("unfiltered = %v, want both posts", got)
	}

	// Unfeaturing clears both columns, which the together-constraint requires.
	res = feature(palAdminToken, palPost, http.MethodDelete)
	if res.status != http.StatusOK {
		t.Fatalf("unfeature = %d: %s", res.status, res.body)
	}
	if res.data(t)["featuredAt"] != nil {
		t.Errorf("featuredAt survives unfeaturing: %s", res.body)
	}
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?featured=false", nil)); len(got) != 1 {
		t.Errorf("featured=false after unfeaturing = %v, want the one unfeatured post", got)
	}

	if res := feature("", palPost, http.MethodPut); res.status != http.StatusUnauthorized {
		t.Errorf("anonymous featuring = %d, want 401: %s", res.status, res.body)
	}
}

// ---------------------------------------------------------------------------
// "Posts I liked" and "posts I saved"
// ---------------------------------------------------------------------------

func TestReactionFeedsAreScopedToTheReader(t *testing.T) {
	h := newHarness(t)
	alice := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	bob := h.registerAndLogin("bob", "bob@example.com", "hunter2hunter2")

	first := h.mustCreatePost(alice, map[string]any{"channel": "general", "title": "First", "body": "One."})
	second := h.mustCreatePost(alice, map[string]any{"channel": "general", "title": "Second", "body": "Two."})

	// Alice likes one and saves the other; Bob likes the one she saved, so a
	// filter that ignored who was asking would return both to each of them.
	react := func(token string, no int64, what string) {
		t.Helper()
		res := h.do(http.MethodPut, fmt.Sprintf("/forum/posts/%d/%s", no, what), nil, withBearer(token))
		if res.status != http.StatusOK {
			t.Fatalf("%s post %d = %d: %s", what, no, res.status, res.body)
		}
	}
	react(alice, first, "like")
	react(alice, second, "bookmark")
	react(bob, second, "like")

	for _, tc := range []struct {
		name  string
		token string
		query string
		want  []string
	}{
		{"alice likes", alice, "liked=true", []string{"First"}},
		{"alice bookmarks", alice, "bookmarked=true", []string{"Second"}},
		{"bob likes", bob, "liked=true", []string{"Second"}},
		{"bob bookmarks", bob, "bookmarked=true", []string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := h.do(http.MethodGet, "/forum/posts?"+tc.query, nil, withBearer(tc.token))
			if res.status != http.StatusOK {
				t.Fatalf("= %d: %s", res.status, res.body)
			}
			got := feedTitles(t, res)
			if len(got) != len(tc.want) {
				t.Fatalf("= %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("= %v, want %v", got, tc.want)
				}
			}
			// The count drives the pager, and it comes from a second query whose
			// predicates must match the first. A mismatch offers pages that are empty.
			if count, _ := res.data(t)["count"].(float64); int(count) != len(tc.want) {
				t.Errorf("count = %v, want %d", count, len(tc.want))
			}
		})
	}
}

// The trap an id-shaped filter would have set: left nil by a signed-out caller it
// reads as "no filter", so asking for the posts you liked while signed out would
// have answered with the whole forum rather than with nothing.
func TestReaderScopedFeedsAreEmptyWhenSignedOut(t *testing.T) {
	h := newHarness(t)
	author := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	no := h.mustCreatePost(author, map[string]any{"channel": "general", "title": "Visible", "body": "Body."})
	if res := h.do(http.MethodPut, fmt.Sprintf("/forum/posts/%d/like", no), nil, withBearer(author)); res.status != http.StatusOK {
		t.Fatalf("like = %d: %s", res.status, res.body)
	}

	// The post is visible anonymously, so an empty result below is the filter
	// working rather than an empty forum — without this the test could pass for
	// entirely the wrong reason.
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts", nil)); len(got) == 0 {
		t.Fatal("the unfiltered anonymous feed is empty; this test would prove nothing")
	}

	for _, query := range []string{"liked=true", "bookmarked=true", "following=true"} {
		t.Run(query, func(t *testing.T) {
			res := h.do(http.MethodGet, "/forum/posts?"+query, nil)
			if res.status != http.StatusOK {
				t.Fatalf("= %d, want 200: %s", res.status, res.body)
			}
			if got := feedTitles(t, res); len(got) != 0 {
				t.Errorf("anonymous %s returned %v, want nothing", query, got)
			}
			if count, _ := res.data(t)["count"].(float64); count != 0 {
				t.Errorf("anonymous %s count = %v, want 0", query, count)
			}
		})
	}
}
