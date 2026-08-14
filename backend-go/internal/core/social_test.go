package core_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func followPath(uid int64) string { return fmt.Sprintf("/users/%d/follow", uid) }

func followCounts(t *testing.T, data map[string]any) (followers, following int64, isFollowing bool) {
	t.Helper()
	f, _ := data["followerCount"].(float64)
	g, _ := data["followingCount"].(float64)
	isFollowing, _ = data["following"].(bool)
	return int64(f), int64(g), isFollowing
}

func TestFollowingIsDirectionalAndIdempotent(t *testing.T) {
	h := newHarness(t)
	aliceToken := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	bobToken := h.registerAndLogin("bob", "bob@example.com", "hunter2hunter2")
	aliceUID := h.uidOf(aliceToken)
	bobUID := h.uidOf(bobToken)

	res := h.do(http.MethodPut, followPath(bobUID), nil, withBearer(aliceToken))
	if res.status != http.StatusOK {
		t.Fatalf("follow = %d: %s", res.status, res.body)
	}
	followers, following, isFollowing := followCounts(t, res.data(t))
	if followers != 1 || following != 0 || !isFollowing {
		t.Errorf("bob after alice follows: followers=%d following=%d following=%v, want 1, 0, true",
			followers, following, isFollowing)
	}

	// Following is one-directional: bob does not follow alice back automatically.
	res = h.do(http.MethodGet, followPath(aliceUID), nil, withBearer(bobToken))
	if followers, following, isFollowing = followCounts(t, res.data(t)); followers != 0 || following != 1 || isFollowing {
		t.Errorf("alice's tally: followers=%d following=%d following=%v, want 0, 1, false",
			followers, following, isFollowing)
	}

	// Twice is once.
	res = h.do(http.MethodPut, followPath(bobUID), nil, withBearer(aliceToken))
	if followers, _, _ = followCounts(t, res.data(t)); followers != 1 {
		t.Errorf("followerCount after re-follow = %d, want 1", followers)
	}

	// And unfollowing twice is also once.
	for range 2 {
		res = h.do(http.MethodDelete, followPath(bobUID), nil, withBearer(aliceToken))
		if res.status != http.StatusOK {
			t.Fatalf("unfollow = %d: %s", res.status, res.body)
		}
	}
	if followers, _, isFollowing = followCounts(t, res.data(t)); followers != 0 || isFollowing {
		t.Errorf("after unfollowing: followers=%d following=%v, want 0 and false", followers, isFollowing)
	}
}

func TestFollowingYourselfIsRefused(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("solo", "solo@example.com", "hunter2hunter2")
	uid := h.uidOf(token)

	// Refused by the service so the message is useful, and impossible in the schema
	// so no other path can create one.
	if res := h.do(http.MethodPut, followPath(uid), nil, withBearer(token)); res.status != http.StatusUnprocessableEntity {
		t.Errorf("following yourself = %d, want 422: %s", res.status, res.body)
	}
}

func TestFollowRequiresSignInAndARealAccount(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	uid := h.uidOf(token)

	for _, method := range []string{http.MethodPut, http.MethodDelete} {
		if res := h.do(method, followPath(uid), nil); res.status != http.StatusUnauthorized {
			t.Errorf("anonymous %s = %d, want 401: %s", method, res.status, res.body)
		}
	}
	if res := h.do(http.MethodPut, followPath(999999), nil, withBearer(token)); res.status != http.StatusNotFound {
		t.Errorf("following an unknown uid = %d, want 404: %s", res.status, res.body)
	}

	// Reading a tally is public.
	if res := h.do(http.MethodGet, followPath(uid), nil); res.status != http.StatusOK {
		t.Errorf("anonymous tally read = %d, want 200: %s", res.status, res.body)
	}
}

func TestFollowerAndFollowingListsArePublic(t *testing.T) {
	h := newHarness(t)
	aliceToken := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	bobToken := h.registerAndLogin("bob", "bob@example.com", "hunter2hunter2")
	caroToken := h.registerAndLogin("caro", "caro@example.com", "hunter2hunter2")
	bobUID := h.uidOf(bobToken)
	aliceUID := h.uidOf(aliceToken)

	for _, token := range []string{aliceToken, caroToken} {
		if res := h.do(http.MethodPut, followPath(bobUID), nil, withBearer(token)); res.status != http.StatusOK {
			t.Fatalf("follow = %d: %s", res.status, res.body)
		}
	}

	res := h.do(http.MethodGet, fmt.Sprintf("/users/%d/followers", bobUID), nil)
	if res.status != http.StatusOK {
		t.Fatalf("followers = %d: %s", res.status, res.body)
	}
	list, _ := res.data(t)["results"].([]any)
	if len(list) != 2 {
		t.Errorf("bob's followers = %v, want two", list)
	}
	// The list is public views only, so it must not carry an address.
	if body := string(res.body); strings.Contains(body, "alice@example.com") {
		t.Errorf("the follower list leaks an email: %s", body)
	}

	res = h.do(http.MethodGet, fmt.Sprintf("/users/%d/following", aliceUID), nil)
	list, _ = res.data(t)["results"].([]any)
	if len(list) != 1 {
		t.Errorf("alice's following = %v, want one", list)
	}
	first, _ := list[0].(map[string]any)
	person, _ := first["user"].(map[string]any)
	if person["name"] != "bob" {
		t.Errorf("alice follows %v, want bob", person)
	}
}

// The "following only" feed is the reason the graph exists. Without a signed-in
// reader it must answer empty rather than widening to everything.
func TestFollowingOnlyFeed(t *testing.T) {
	h := newHarness(t)
	aliceToken := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	bobToken := h.registerAndLogin("bob", "bob@example.com", "hunter2hunter2")
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")
	bobUID := h.uidOf(bobToken)

	h.mustCreatePost(bobToken, map[string]any{"channel": "general", "title": "By bob", "body": "Bob wrote this."})
	h.mustCreatePost(strangerToken, map[string]any{"channel": "general", "title": "By stranger", "body": "A stranger wrote this."})

	// Unfiltered, alice sees both.
	res := h.do(http.MethodGet, "/forum/posts", nil, withBearer(aliceToken))
	if list, _ := res.data(t)["results"].([]any); len(list) != 2 {
		t.Fatalf("unfiltered feed = %d posts, want 2: %s", len(list), res.body)
	}

	// Following nobody, the filtered feed is empty rather than everything.
	res = h.do(http.MethodGet, "/forum/posts?following=true", nil, withBearer(aliceToken))
	if list, _ := res.data(t)["results"].([]any); len(list) != 0 {
		t.Errorf("following-only feed with no follows = %v, want empty", list)
	}

	if res := h.do(http.MethodPut, followPath(bobUID), nil, withBearer(aliceToken)); res.status != http.StatusOK {
		t.Fatalf("follow = %d: %s", res.status, res.body)
	}

	res = h.do(http.MethodGet, "/forum/posts?following=true", nil, withBearer(aliceToken))
	list, _ := res.data(t)["results"].([]any)
	if len(list) != 1 {
		t.Fatalf("following-only feed = %v, want one post", list)
	}
	post, _ := list[0].(map[string]any)
	if post["title"] != "By bob" {
		t.Errorf("following-only feed returned %v, want bob's post", post["title"])
	}
	// The total must be filtered too, or the pager offers pages that do not exist.
	if total, _ := res.data(t)["count"].(float64); total != 1 {
		t.Errorf("following-only count = %v, want 1", res.data(t)["count"])
	}

	// Anonymously, the filter cannot mean anything, so it must not quietly widen.
	res = h.do(http.MethodGet, "/forum/posts?following=true", nil)
	if list, _ := res.data(t)["results"].([]any); len(list) != 0 {
		t.Errorf("anonymous following-only feed = %v, want empty", list)
	}
}
