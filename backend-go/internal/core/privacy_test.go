package core_test

import (
	"fmt"
	"net/http"
	"testing"
)

func TestPrivacyDefaultsToPublic(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")

	// No row exists yet, so every setting reads public without anything being inserted
	// at registration.
	res := h.do(http.MethodGet, "/privacy/me", nil, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("read privacy = %d: %s", res.status, res.body)
	}
	data := res.data(t)
	for _, key := range []string{"profileVisibility", "postsVisibility", "activityVisibility"} {
		if data[key] != "public" {
			t.Errorf("%s = %v on a fresh account, want public", key, data[key])
		}
	}

	if res := h.do(http.MethodGet, "/privacy/me", nil); res.status != http.StatusUnauthorized {
		t.Errorf("anonymous read = %d, want 401: %s", res.status, res.body)
	}
}

func TestPrivacyChangesArePartial(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")

	res := h.do(http.MethodPatch, "/privacy/me", map[string]any{"activityVisibility": "private"}, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("set privacy = %d: %s", res.status, res.body)
	}
	data := res.data(t)
	if data["activityVisibility"] != "private" {
		t.Errorf("activityVisibility = %v, want private", data["activityVisibility"])
	}
	// The other two are untouched: an absent field is left alone, not reset.
	if data["profileVisibility"] != "public" || data["postsVisibility"] != "public" {
		t.Errorf("a partial change reset the other settings: %v", data)
	}

	// A second change keeps the first, which is the upsert doing its job.
	res = h.do(http.MethodPatch, "/privacy/me", map[string]any{"postsVisibility": "followers"}, withBearer(token))
	data = res.data(t)
	if data["activityVisibility"] != "private" || data["postsVisibility"] != "followers" {
		t.Errorf("the second change lost the first: %v", data)
	}

	if res := h.do(http.MethodPatch, "/privacy/me", map[string]any{"postsVisibility": "nobody"}, withBearer(token)); res.status != http.StatusUnprocessableEntity {
		t.Errorf("an unknown level = %d, want 422: %s", res.status, res.body)
	}
}

// The three levels, against the four kinds of reader that matter: the owner, a
// follower, a stranger, and nobody at all.
func TestActivityVisibilityGatesTheFollowLists(t *testing.T) {
	h := newHarness(t)
	aliceToken := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	followerToken := h.registerAndLogin("follower", "follower@example.com", "hunter2hunter2")
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")
	aliceUID := h.uidOf(aliceToken)

	if res := h.do(http.MethodPut, followPath(aliceUID), nil, withBearer(followerToken)); res.status != http.StatusOK {
		t.Fatalf("follow = %d: %s", res.status, res.body)
	}

	lists := []string{
		fmt.Sprintf("/users/%d/followers", aliceUID),
		fmt.Sprintf("/users/%d/following", aliceUID),
	}
	read := func(token, path string) int {
		return h.react(token, http.MethodGet, path).status
	}

	for _, tc := range []struct {
		level                             string
		owner, follower, stranger, nobody int
	}{
		{"public", http.StatusOK, http.StatusOK, http.StatusOK, http.StatusOK},
		{"followers", http.StatusOK, http.StatusOK, http.StatusNotFound, http.StatusNotFound},
		{"private", http.StatusOK, http.StatusNotFound, http.StatusNotFound, http.StatusNotFound},
	} {
		if res := h.do(http.MethodPatch, "/privacy/me", map[string]any{"activityVisibility": tc.level}, withBearer(aliceToken)); res.status != http.StatusOK {
			t.Fatalf("set %s = %d: %s", tc.level, res.status, res.body)
		}
		for _, path := range lists {
			// The owner always sees their own, at every level: a setting is a choice
			// about other people.
			if got := read(aliceToken, path); got != tc.owner {
				t.Errorf("%s, owner reading %s = %d, want %d", tc.level, path, got, tc.owner)
			}
			if got := read(followerToken, path); got != tc.follower {
				t.Errorf("%s, follower reading %s = %d, want %d", tc.level, path, got, tc.follower)
			}
			if got := read(strangerToken, path); got != tc.stranger {
				t.Errorf("%s, stranger reading %s = %d, want %d", tc.level, path, got, tc.stranger)
			}
			// Withheld answers 404 rather than 403: a 403 would confirm the account
			// exists and is withholding, which is itself a disclosure.
			if got := read("", path); got != tc.nobody {
				t.Errorf("%s, anonymous reading %s = %d, want %d", tc.level, path, got, tc.nobody)
			}
		}
	}
}

// postsVisibility governs the profile listing, and deliberately not publication. This is
// the distinction most likely to be implemented as a content takedown by mistake.
func TestPostsVisibilityHidesTheProfileListingNotThePost(t *testing.T) {
	h := newHarness(t)
	aliceToken := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")
	aliceUID := h.uidOf(aliceToken)

	postNo := h.mustCreatePost(aliceToken, map[string]any{
		"channel": "general", "title": "Alice's post", "body": "Body.",
	})

	if res := h.do(http.MethodPatch, "/privacy/me", map[string]any{"postsVisibility": "private"}, withBearer(aliceToken)); res.status != http.StatusOK {
		t.Fatalf("set private = %d: %s", res.status, res.body)
	}

	byAuthor := fmt.Sprintf("/forum/posts?authorUid=%d", aliceUID)

	// The profile listing is withheld from a stranger.
	if got := h.react(strangerToken, http.MethodGet, byAuthor).status; got != http.StatusNotFound {
		t.Errorf("stranger reading the author feed = %d, want 404", got)
	}
	// And still available to the owner.
	if got := h.react(aliceToken, http.MethodGet, byAuthor).status; got != http.StatusOK {
		t.Errorf("owner reading their own author feed = %d, want 200", got)
	}

	// But the post itself is still published: in the global feed, and at its permalink.
	res := h.react(strangerToken, http.MethodGet, "/forum/posts")
	if list, _ := res.data(t)["results"].([]any); len(list) != 1 {
		t.Errorf("global feed = %v, want the post still present", list)
	}
	if got := h.react(strangerToken, http.MethodGet, fmt.Sprintf("/forum/posts/%d", postNo)).status; got != http.StatusOK {
		t.Errorf("permalink = %d, want 200 — privacy is not a takedown", got)
	}
}
