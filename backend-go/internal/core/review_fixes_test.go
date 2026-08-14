package core_test

import (
	"fmt"
	"net/http"
	"testing"
)

// The overflow this repo had already measured, fixed in the feed, and then reintroduced in
// three new packages that each wrote the arithmetic out again — clamping the offset after
// multiplying instead of the page before, which cannot catch the wrap it exists to catch.
//
// Every paginated route, so a fourth one added later is covered by the same list.
func TestHugePageNumbersDoNotBecomeServerErrors(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	uid := h.uidOf(token)
	h.mustCreatePost(token, simplePost())

	// Maximum int64, and the value that wraps most usefully against a 20-row page.
	for _, page := range []string{"9223372036854775807", "461168601842738790", "1000000000000"} {
		for _, path := range []string{
			"/forum/posts?page=%s",
			"/forum/posts?pageSize=20&page=%s",
			fmt.Sprintf("/users/%d/followers", uid) + "?page=%s",
			fmt.Sprintf("/users/%d/following", uid) + "?page=%s",
			"/notifications?page=%s",
		} {
			url := fmt.Sprintf(path, page)
			res := h.do(http.MethodGet, url, nil, withBearer(token))
			if res.status != http.StatusOK {
				t.Errorf("GET %s = %d, want 200 with an empty page: %s", url, res.status, res.body)
			}
			if list, _ := res.data(t)["results"].([]any); len(list) != 0 {
				t.Errorf("GET %s returned %d rows, want an empty page", url, len(list))
			}
		}
	}

	// The moderation queue too, which needs a moderator to reach at all.
	h.promoteToSiteAdmin(token)
	for _, path := range []string{"/forum/moderation/reports", "/forum/moderation/hidden"} {
		url := path + "?page=9223372036854775807"
		if res := h.do(http.MethodGet, url, nil, withBearer(token)); res.status != http.StatusOK {
			t.Errorf("GET %s = %d, want 200: %s", url, res.status, res.body)
		}
	}
}

// profileVisibility was settable, persisted, confirmed to the user — and read by nothing,
// so it promised a protection that did not exist. This is the route that has to honour it.
func TestProfileVisibilityGatesThePublicProfile(t *testing.T) {
	h := newHarness(t)
	aliceToken := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	followerToken := h.registerAndLogin("follower", "follower@example.com", "hunter2hunter2")
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")
	aliceUID := h.uidOf(aliceToken)

	if res := h.do(http.MethodPut, followPath(aliceUID), nil, withBearer(followerToken)); res.status != http.StatusOK {
		t.Fatalf("follow = %d: %s", res.status, res.body)
	}

	profile := fmt.Sprintf("/users/uid/%d", aliceUID)
	read := func(token string) int { return h.react(token, http.MethodGet, profile).status }

	for _, tc := range []struct {
		level                             string
		owner, follower, stranger, nobody int
	}{
		{"public", http.StatusOK, http.StatusOK, http.StatusOK, http.StatusOK},
		{"followers", http.StatusOK, http.StatusOK, http.StatusNotFound, http.StatusNotFound},
		{"private", http.StatusOK, http.StatusNotFound, http.StatusNotFound, http.StatusNotFound},
	} {
		if res := h.do(http.MethodPatch, "/privacy/me",
			map[string]any{"profileVisibility": tc.level}, withBearer(aliceToken)); res.status != http.StatusOK {
			t.Fatalf("set %s = %d: %s", tc.level, res.status, res.body)
		}
		if got := read(aliceToken); got != tc.owner {
			t.Errorf("%s: owner = %d, want %d", tc.level, got, tc.owner)
		}
		if got := read(followerToken); got != tc.follower {
			t.Errorf("%s: follower = %d, want %d", tc.level, got, tc.follower)
		}
		if got := read(strangerToken); got != tc.stranger {
			t.Errorf("%s: stranger = %d, want %d", tc.level, got, tc.stranger)
		}
		if got := read(""); got != tc.nobody {
			t.Errorf("%s: anonymous = %d, want %d", tc.level, got, tc.nobody)
		}
	}
}

// A hidden post still accepted comments, and each one notified the author of content
// nobody could see.
func TestHiddenPostsAcceptNoComments(t *testing.T) {
	h := newHarness(t)
	cast := setUpModeration(t, h)

	if res := h.do(http.MethodPut, fmt.Sprintf("/forum/posts/%d/hidden", cast.postNo),
		nil, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("hide = %d: %s", res.status, res.body)
	}

	comments := fmt.Sprintf("/forum/posts/%d/comments", cast.postNo)
	for name, token := range map[string]string{"stranger": cast.stranger, "author": cast.author} {
		res := h.do(http.MethodPost, comments, map[string]any{"body": "Still here?"}, withBearer(token))
		if res.status != http.StatusNotFound {
			t.Errorf("%s commenting on a hidden post = %d, want 404: %s", name, res.status, res.body)
		}
	}

	// And so the author's inbox stays empty, which is the consequence that made this
	// worth fixing rather than merely inconsistent.
	if rows := inbox(t, h, cast.author, ""); len(rows) != 0 {
		t.Errorf("the author of hidden content was notified about it: %v", kindsIn(rows))
	}

	// Restoring puts the thread back.
	if res := h.do(http.MethodDelete, fmt.Sprintf("/forum/posts/%d/hidden", cast.postNo),
		nil, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("restore = %d: %s", res.status, res.body)
	}
	if res := h.do(http.MethodPost, comments, map[string]any{"body": "Back."}, withBearer(cast.stranger)); res.status != http.StatusOK {
		t.Errorf("commenting after restore = %d, want 200: %s", res.status, res.body)
	}
}

// `%` and `_` are LIKE wildcards. Parameterised, so never injection — but a user typing `%`
// used to match every post, and `a_c` matched `abc`.
func TestSearchTreatsWildcardsAsText(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	h.mustCreatePost(token, map[string]any{"channel": "general", "title": "Plain", "body": "Nothing special."})
	h.mustCreatePost(token, map[string]any{"channel": "general", "title": "Discount", "body": "Save 50% today."})
	h.mustCreatePost(token, map[string]any{"channel": "general", "title": "Snake", "body": "a_c is a name."})

	// A lone wildcard matches the post that literally contains it, not everything.
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?q=50%25", nil)); len(got) != 1 || got[0] != "Discount" {
		t.Errorf("q=50%% = %v, want just the post containing it", got)
	}
	// The underscore is a literal, so it must not match `abc`.
	if got := feedTitles(t, h.do(http.MethodGet, "/forum/posts?q=a_c", nil)); len(got) != 1 || got[0] != "Snake" {
		t.Errorf("q=a_c = %v, want just the post containing it", got)
	}
	// A single character is refused: it matches most of the board and cannot use the index.
	if res := h.do(http.MethodGet, "/forum/posts?q=a", nil); res.status != http.StatusUnprocessableEntity {
		t.Errorf("a one-character search = %d, want 422: %s", res.status, res.body)
	}
}
