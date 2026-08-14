package core_test

import (
	"fmt"
	"net/http"
	"testing"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (h *harness) react(token, method, path string) response {
	h.t.Helper()
	if token == "" {
		return h.do(method, path, nil)
	}
	return h.do(method, path, nil, withBearer(token))
}

// postCounts reads the engagement fields off a post payload.
func postCounts(t *testing.T, data map[string]any) (likes, bookmarks int64, liked, bookmarked bool) {
	t.Helper()
	l, _ := data["likeCount"].(float64)
	b, _ := data["bookmarkCount"].(float64)
	liked, _ = data["liked"].(bool)
	bookmarked, _ = data["bookmarked"].(bool)
	return int64(l), int64(b), liked, bookmarked
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestLikingAPostIsIdempotentAndCounted(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(authorToken, simplePost())
	path := fmt.Sprintf("/forum/posts/%d/like", postNo)

	readerToken := h.registerAndLogin("reader", "reader@example.com", "hunter2hunter2")

	res := h.react(readerToken, http.MethodPut, path)
	if res.status != http.StatusOK {
		t.Fatalf("like = %d: %s", res.status, res.body)
	}
	likes, _, liked, _ := postCounts(t, res.data(t))
	if likes != 1 || !liked {
		t.Errorf("after liking: likeCount=%d liked=%v, want 1 and true", likes, liked)
	}

	// Liking twice is the same as liking once: the client stated an end state.
	res = h.react(readerToken, http.MethodPut, path)
	if res.status != http.StatusOK {
		t.Fatalf("re-like = %d: %s", res.status, res.body)
	}
	if likes, _, _, _ := postCounts(t, res.data(t)); likes != 1 {
		t.Errorf("likeCount after re-like = %d, want 1", likes)
	}

	// A second account adds a second like.
	otherToken := h.registerAndLogin("other", "other@example.com", "hunter2hunter2")
	res = h.react(otherToken, http.MethodPut, path)
	if likes, _, _, _ := postCounts(t, res.data(t)); likes != 2 {
		t.Errorf("likeCount with two likers = %d, want 2", likes)
	}

	// Unliking is idempotent too, and only removes the caller's own like.
	for range 2 {
		res = h.react(readerToken, http.MethodDelete, path)
		if res.status != http.StatusOK {
			t.Fatalf("unlike = %d: %s", res.status, res.body)
		}
	}
	likes, _, liked, _ = postCounts(t, res.data(t))
	if likes != 1 || liked {
		t.Errorf("after unliking: likeCount=%d liked=%v, want 1 and false", likes, liked)
	}

	// Liking your own post is allowed: the count is public either way, and refusing
	// it would be a rule with nothing behind it.
	if res := h.react(authorToken, http.MethodPut, path); res.status != http.StatusOK {
		t.Errorf("author liking own post = %d, want 200: %s", res.status, res.body)
	}
}

func TestBookmarksAreCountedAndSeparateFromLikes(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(authorToken, simplePost())

	readerToken := h.registerAndLogin("reader", "reader@example.com", "hunter2hunter2")
	res := h.react(readerToken, http.MethodPut, fmt.Sprintf("/forum/posts/%d/bookmark", postNo))
	if res.status != http.StatusOK {
		t.Fatalf("bookmark = %d: %s", res.status, res.body)
	}

	likes, bookmarks, liked, bookmarked := postCounts(t, res.data(t))
	if bookmarks != 1 || !bookmarked {
		t.Errorf("after bookmarking: bookmarkCount=%d bookmarked=%v, want 1 and true", bookmarks, bookmarked)
	}
	// The two reactions are independent tables and must not bleed into each other.
	if likes != 0 || liked {
		t.Errorf("bookmarking changed the like state: likeCount=%d liked=%v", likes, liked)
	}

	res = h.react(readerToken, http.MethodDelete, fmt.Sprintf("/forum/posts/%d/bookmark", postNo))
	if _, bookmarks, _, bookmarked = postCounts(t, res.data(t)); bookmarks != 0 || bookmarked {
		t.Errorf("after unbookmarking: bookmarkCount=%d bookmarked=%v, want 0 and false", bookmarks, bookmarked)
	}
}

// The feed and a single post both carry the reader's own state. Anonymous readers
// see the counts with both flags false rather than absent, so a client needs no
// branch between signed-in and signed-out responses.
func TestReactionStateIsPerViewer(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(authorToken, simplePost())

	readerToken := h.registerAndLogin("reader", "reader@example.com", "hunter2hunter2")
	if res := h.react(readerToken, http.MethodPut, fmt.Sprintf("/forum/posts/%d/like", postNo)); res.status != http.StatusOK {
		t.Fatalf("like = %d: %s", res.status, res.body)
	}

	single := fmt.Sprintf("/forum/posts/%d", postNo)

	// The liker sees their own like.
	res := h.react(readerToken, http.MethodGet, single)
	if likes, _, liked, _ := postCounts(t, res.data(t)); likes != 1 || !liked {
		t.Errorf("liker's view: likeCount=%d liked=%v, want 1 and true", likes, liked)
	}

	// Somebody else sees the count but not a like of their own.
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")
	res = h.react(strangerToken, http.MethodGet, single)
	if likes, _, liked, _ := postCounts(t, res.data(t)); likes != 1 || liked {
		t.Errorf("stranger's view: likeCount=%d liked=%v, want 1 and false", likes, liked)
	}

	// And an anonymous reader sees the same, with the flag present and false.
	res = h.react("", http.MethodGet, single)
	if res.status != http.StatusOK {
		t.Fatalf("anonymous read = %d: %s", res.status, res.body)
	}
	data := res.data(t)
	if _, ok := data["liked"]; !ok {
		t.Errorf("anonymous response omits `liked` entirely: %s", res.body)
	}
	if likes, _, liked, _ := postCounts(t, data); likes != 1 || liked {
		t.Errorf("anonymous view: likeCount=%d liked=%v, want 1 and false", likes, liked)
	}

	// The same must hold on the feed, which is a different query.
	res = h.react(readerToken, http.MethodGet, "/forum/posts")
	list, _ := res.data(t)["results"].([]any)
	if len(list) == 0 {
		t.Fatalf("feed is empty: %s", res.body)
	}
	first, _ := list[0].(map[string]any)
	if likes, _, liked, _ := postCounts(t, first); likes != 1 || !liked {
		t.Errorf("feed row for the liker: likeCount=%d liked=%v, want 1 and true", likes, liked)
	}

	res = h.react("", http.MethodGet, "/forum/posts")
	list, _ = res.data(t)["results"].([]any)
	first, _ = list[0].(map[string]any)
	if likes, _, liked, _ := postCounts(t, first); likes != 1 || liked {
		t.Errorf("anonymous feed row: likeCount=%d liked=%v, want 1 and false", likes, liked)
	}
}

func TestCommentLikesAreCounted(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(authorToken, simplePost())

	res := h.do(http.MethodPost, fmt.Sprintf("/forum/posts/%d/comments", postNo),
		map[string]any{"body": "A comment."}, withBearer(authorToken))
	if res.status != http.StatusOK {
		t.Fatalf("comment = %d: %s", res.status, res.body)
	}
	commentID, _ := res.data(t)["id"].(string)
	if commentID == "" {
		t.Fatalf("comment carries no id: %s", res.body)
	}
	path := "/forum/comments/" + commentID + "/like"

	readerToken := h.registerAndLogin("reader", "reader@example.com", "hunter2hunter2")
	res = h.react(readerToken, http.MethodPut, path)
	if res.status != http.StatusOK {
		t.Fatalf("like comment = %d: %s", res.status, res.body)
	}
	data := res.data(t)
	if likes, _ := data["likeCount"].(float64); likes != 1 {
		t.Errorf("comment likeCount = %v, want 1", data["likeCount"])
	}
	if liked, _ := data["liked"].(bool); !liked {
		t.Errorf("comment liked = %v, want true", data["liked"])
	}

	// The thread listing carries the same state, per viewer.
	res = h.react(readerToken, http.MethodGet, fmt.Sprintf("/forum/posts/%d/comments", postNo))
	list, _ := res.data(t)["results"].([]any)
	if len(list) != 1 {
		t.Fatalf("thread = %v, want one comment", list)
	}
	first, _ := list[0].(map[string]any)
	if likes, _ := first["likeCount"].(float64); likes != 1 {
		t.Errorf("listed comment likeCount = %v, want 1", first["likeCount"])
	}
	if liked, _ := first["liked"].(bool); !liked {
		t.Errorf("listed comment liked = %v for the liker, want true", first["liked"])
	}

	res = h.react("", http.MethodGet, fmt.Sprintf("/forum/posts/%d/comments", postNo))
	list, _ = res.data(t)["results"].([]any)
	first, _ = list[0].(map[string]any)
	if liked, _ := first["liked"].(bool); liked {
		t.Errorf("listed comment liked = %v anonymously, want false", first["liked"])
	}

	res = h.react(readerToken, http.MethodDelete, path)
	if likes, _ := res.data(t)["likeCount"].(float64); likes != 0 {
		t.Errorf("comment likeCount after unlike = %v, want 0", res.data(t)["likeCount"])
	}
}

func TestReactionsRequireSignInAndARealTarget(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(authorToken, simplePost())

	for _, path := range []string{
		fmt.Sprintf("/forum/posts/%d/like", postNo),
		fmt.Sprintf("/forum/posts/%d/bookmark", postNo),
	} {
		for _, method := range []string{http.MethodPut, http.MethodDelete} {
			if res := h.react("", method, path); res.status != http.StatusUnauthorized {
				t.Errorf("anonymous %s %s = %d, want 401: %s", method, path, res.status, res.body)
			}
		}
	}

	// A post that does not exist is a 404, not a silently created reaction.
	if res := h.react(authorToken, http.MethodPut, "/forum/posts/999999/like"); res.status != http.StatusNotFound {
		t.Errorf("liking a missing post = %d, want 404: %s", res.status, res.body)
	}
	missing := "/forum/comments/00000000-0000-0000-0000-000000000000/like"
	if res := h.react(authorToken, http.MethodPut, missing); res.status != http.StatusNotFound {
		t.Errorf("liking a missing comment = %d, want 404: %s", res.status, res.body)
	}
}

// Deleting a post must take its reactions with it. The foreign keys do this, and the
// reason the tables are not polymorphic is that a polymorphic target could not carry
// them — a like would outlive its post and inflate every later count.
func TestDeletingAPostRemovesItsReactions(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(authorToken, simplePost())

	readerToken := h.registerAndLogin("reader", "reader@example.com", "hunter2hunter2")
	for _, kind := range []string{"like", "bookmark"} {
		if res := h.react(readerToken, http.MethodPut, fmt.Sprintf("/forum/posts/%d/%s", postNo, kind)); res.status != http.StatusOK {
			t.Fatalf("%s = %d: %s", kind, res.status, res.body)
		}
	}

	if res := h.react(authorToken, http.MethodDelete, fmt.Sprintf("/forum/posts/%d", postNo)); res.status != http.StatusOK {
		t.Fatalf("delete post = %d: %s", res.status, res.body)
	}

	// The post is gone, so the reactions have nothing to hang from. A fresh post
	// reusing nothing should start at zero — if the cascade had not fired, the
	// orphaned rows would still be counted against their old id.
	next := h.mustCreatePost(authorToken, simplePost())
	res := h.react(readerToken, http.MethodGet, fmt.Sprintf("/forum/posts/%d", next))
	if likes, bookmarks, _, _ := postCounts(t, res.data(t)); likes != 0 || bookmarks != 0 {
		t.Errorf("a new post starts at likeCount=%d bookmarkCount=%d, want 0 and 0", likes, bookmarks)
	}
}
