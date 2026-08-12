package core_test

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// createPost publishes a post and returns the response.
func (h *harness) createPost(token string, body map[string]any) response {
	h.t.Helper()
	return h.do(http.MethodPost, "/forum/posts", body, withBearer(token))
}

// mustCreatePost publishes a post and returns its number.
func (h *harness) mustCreatePost(token string, body map[string]any) int64 {
	h.t.Helper()
	res := h.createPost(token, body)
	if res.status != http.StatusOK {
		h.t.Fatalf("create post = %d: %s", res.status, res.body)
	}
	no, ok := res.data(h.t)["postNo"].(float64)
	if !ok {
		h.t.Fatalf("response carries no postNo: %s", res.body)
	}
	return int64(no)
}

func simplePost() map[string]any {
	return map[string]any{"channel": "general", "title": "A title", "body": "A body"}
}

// mustComment adds a comment or reply and returns the decoded payload.
func (h *harness) mustComment(token string, postNo int64, body string, parentID any) map[string]any {
	h.t.Helper()
	payload := map[string]any{"body": body}
	if parentID != nil {
		payload["parentId"] = parentID
	}
	res := h.do(http.MethodPost, "/forum/posts/"+strconv.FormatInt(postNo, 10)+"/comments",
		payload, withBearer(token))
	if res.status != http.StatusOK {
		h.t.Fatalf("create comment = %d: %s", res.status, res.body)
	}
	return res.data(h.t)
}

func (h *harness) comments(postNo int64) []any {
	h.t.Helper()
	res := h.do(http.MethodGet, "/forum/posts/"+strconv.FormatInt(postNo, 10)+"/comments", nil)
	if res.status != http.StatusOK {
		h.t.Fatalf("list comments = %d: %s", res.status, res.body)
	}
	list, _ := res.data(h.t)["results"].([]any)
	return list
}

func floorOf(t *testing.T, comment map[string]any) int64 {
	t.Helper()
	raw, ok := comment["commentNo"]
	if !ok || raw == nil {
		t.Fatalf("comment carries no floor number: %v", comment)
	}
	return int64(raw.(float64))
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

func TestPostingAndReadingBackAPost(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	res := h.createPost(token, map[string]any{
		"channel": "games",
		"title":   "  Where is the Chillet spawn?  ",
		"body":    "I have looked **everywhere**.",
		"topic":   "question",
		"gameIds": []string{"palworld", "palworld", " "},
		"tags":    []string{"spawn", "help", "spawn"},
	})
	if res.status != http.StatusOK {
		t.Fatalf("create = %d: %s", res.status, res.body)
	}
	data := res.data(t)

	// Numbers start somewhere sensible and are the public identity.
	if no, _ := data["postNo"].(float64); no < 1 {
		t.Errorf("postNo = %v, want a positive number", data["postNo"])
	}
	// Whitespace is trimmed, and the duplicate game and tag collapse: a caller
	// sending ["a","a",""] means one entry, not three.
	if title, _ := data["title"].(string); title != "Where is the Chillet spawn?" {
		t.Errorf("title = %q, want it trimmed", title)
	}
	games, _ := data["gameIds"].([]any)
	if len(games) != 1 || games[0] != "palworld" {
		t.Errorf("gameIds = %v, want one entry", games)
	}
	if tags, _ := data["tags"].([]any); len(tags) != 2 {
		t.Errorf("tags = %v, want two entries", tags)
	}
	// The body is stored exactly as written; markdown is the client's problem.
	if body, _ := data["body"].(string); body != "I have looked **everywhere**." {
		t.Errorf("body = %q, want it stored verbatim", body)
	}
	if data["editedAt"] != nil {
		t.Errorf("editedAt = %v on a new post, want null", data["editedAt"])
	}

	// The author is the public view, so a post never carries an email address.
	author, _ := data["author"].(map[string]any)
	if author["name"] != "author" {
		t.Errorf("author = %v, want the display name", author)
	}
	if strings.Contains(string(res.body), "author@example.com") {
		t.Errorf("a post leaks the author's email: %s", res.body)
	}
	if author["avatarUrl"] == nil || author["uid"] == nil {
		t.Errorf("author lacks uid or avatarUrl: %v", author)
	}
}

func TestPostIsReadableAnonymouslyButWritingIsNot(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	no := h.mustCreatePost(token, simplePost())

	if res := h.do(http.MethodGet, "/forum/posts/"+strconv.FormatInt(no, 10), nil); res.status != http.StatusOK {
		t.Errorf("anonymous read = %d, want 200: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, "/forum/posts", nil); res.status != http.StatusOK {
		t.Errorf("anonymous list = %d, want 200: %s", res.status, res.body)
	}
	if res := h.do(http.MethodPost, "/forum/posts", simplePost()); res.status != http.StatusUnauthorized {
		t.Errorf("anonymous post = %d, want 401: %s", res.status, res.body)
	}
}

// The official channel is administrators only. The rule is a hardcoded stand-in
// for a permission system, so it is pinned here to notice if it changes.
func TestOnlyAdministratorsPostToTheOfficialChannel(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")
	userToken := h.registerAndLogin("regular", "regular@example.com", "hunter2hunter2")

	official := map[string]any{"channel": "official", "title": "Notice", "body": "Read this."}

	if res := h.createPost(userToken, official); res.status != http.StatusForbidden {
		t.Errorf("regular user posting to official = %d, want 403: %s", res.status, res.body)
	}
	if res := h.createPost(adminToken, official); res.status != http.StatusOK {
		t.Errorf("administrator posting to official = %d, want 200: %s", res.status, res.body)
	}
	// The other channels stay open.
	for _, channel := range []string{"general", "games"} {
		body := simplePost()
		body["channel"] = channel
		if res := h.createPost(userToken, body); res.status != http.StatusOK {
			t.Errorf("regular user posting to %s = %d, want 200: %s", channel, res.status, res.body)
		}
	}
}

func TestEditingAPostRecordsThatItWasEdited(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	no := h.mustCreatePost(token, map[string]any{
		"channel": "general", "title": "First", "body": "Original", "topic": "guide",
	})

	res := h.do(http.MethodPatch, "/forum/posts/"+strconv.FormatInt(no, 10),
		map[string]any{"title": "Second"}, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("edit = %d: %s", res.status, res.body)
	}
	data := res.data(t)
	if data["title"] != "Second" {
		t.Errorf("title = %v, want the new one", data["title"])
	}
	if data["body"] != "Original" {
		t.Errorf("body = %v; an absent field must be left alone", data["body"])
	}
	if data["topic"] != "guide" {
		t.Errorf("topic = %v; an absent field must be left alone", data["topic"])
	}
	if data["editedAt"] == nil {
		t.Error("editedAt is still null after an edit")
	}

	// An explicit null clears the topic, which an absent field cannot express.
	cleared := h.do(http.MethodPatch, "/forum/posts/"+strconv.FormatInt(no, 10),
		map[string]any{"topic": nil}, withBearer(token))
	if cleared.status != http.StatusOK {
		t.Fatalf("clear topic = %d: %s", cleared.status, cleared.body)
	}
	if topic := cleared.data(t)["topic"]; topic != nil {
		t.Errorf("topic = %v after an explicit null, want null", topic)
	}
}

// A caller who is neither author nor administrator gets 403, not 404: the post is
// public, so pretending it does not exist would only confuse them.
func TestOnlyTheAuthorOrAnAdministratorMayChangeAPost(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")

	no := h.mustCreatePost(authorToken, simplePost())
	path := "/forum/posts/" + strconv.FormatInt(no, 10)

	if res := h.do(http.MethodPatch, path, map[string]any{"title": "Hijacked"}, withBearer(strangerToken)); res.status != http.StatusForbidden {
		t.Errorf("stranger edit = %d, want 403: %s", res.status, res.body)
	}
	if res := h.do(http.MethodDelete, path, nil, withBearer(strangerToken)); res.status != http.StatusForbidden {
		t.Errorf("stranger delete = %d, want 403: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, path, nil); res.status != http.StatusOK {
		t.Fatal("the post was changed by someone who should have been refused")
	}
	// An administrator may remove anything.
	if res := h.do(http.MethodDelete, path, nil, withBearer(adminToken)); res.status != http.StatusOK {
		t.Errorf("administrator delete = %d, want 200: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, path, nil); res.status != http.StatusNotFound {
		t.Errorf("get after delete = %d, want 404", res.status)
	}
}

func TestFeedFiltersAndPaginates(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	for i := range 7 {
		body := simplePost()
		body["title"] = fmt.Sprintf("post %d", i)
		body["channel"] = "games"
		body["gameIds"] = []string{"palworld"}
		body["tags"] = []string{"spawn"}
		h.mustCreatePost(token, body)
	}
	other := simplePost()
	other["title"] = "unrelated"
	other["gameIds"] = []string{"aion2"}
	h.mustCreatePost(token, other)

	page := func(query string) (int, int64) {
		res := h.do(http.MethodGet, "/forum/posts"+query, nil)
		if res.status != http.StatusOK {
			t.Fatalf("list%s = %d: %s", query, res.status, res.body)
		}
		data := res.data(t)
		results, _ := data["results"].([]any)
		count, _ := data["count"].(float64)
		return len(results), int64(count)
	}

	if n, total := page("?gameId=palworld"); n != 7 || total != 7 {
		t.Errorf("gameId filter returned %d of %d, want 7 of 7", n, total)
	}
	if n, _ := page("?tag=spawn"); n != 7 {
		t.Errorf("tag filter returned %d, want 7", n)
	}
	if n, _ := page("?channel=games"); n != 7 {
		t.Errorf("channel filter returned %d, want 7", n)
	}
	if _, total := page(""); total != 8 {
		t.Errorf("unfiltered count = %d, want 8", total)
	}
	// Paging: five then three, and the count is the total rather than the page.
	if n, total := page("?pageSize=5&page=1"); n != 5 || total != 8 {
		t.Errorf("page 1 returned %d of %d, want 5 of 8", n, total)
	}
	if n, _ := page("?pageSize=5&page=2"); n != 3 {
		t.Errorf("page 2 returned %d, want 3", n)
	}
	if n, _ := page("?pageSize=5&page=3"); n != 0 {
		t.Errorf("page 3 returned %d, want 0", n)
	}
}

func TestPostValidationRejections(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	for _, tc := range []struct {
		name string
		body map[string]any
	}{
		{"no title", map[string]any{"channel": "general", "title": "  ", "body": "x"}},
		{"no body", map[string]any{"channel": "general", "title": "t", "body": "   "}},
		{"unknown channel", map[string]any{"channel": "nope", "title": "t", "body": "b"}},
		{"unknown topic", map[string]any{"channel": "general", "title": "t", "body": "b", "topic": "rant"}},
		{"too many games", map[string]any{"channel": "general", "title": "t", "body": "b",
			"gameIds": []string{"a", "b", "c", "d", "e", "f"}}},
		{"too many tags", map[string]any{"channel": "general", "title": "t", "body": "b",
			"tags": []string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"}}},
		{"title too long", map[string]any{"channel": "general", "body": "b",
			"title": strings.Repeat("x", 201)}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := h.createPost(token, tc.body)
			if res.status != http.StatusUnprocessableEntity {
				t.Errorf("= %d, want 422: %s", res.status, res.body)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Comments and floor numbers
// ---------------------------------------------------------------------------

func TestFloorNumbersStartAtOneAndSurviveDeletion(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	no := h.mustCreatePost(token, simplePost())

	var lastID string
	for i := 1; i <= 20; i++ {
		c := h.mustComment(token, no, fmt.Sprintf("comment %d", i), nil)
		if got := floorOf(t, c); got != int64(i) {
			t.Fatalf("comment %d got floor %d", i, got)
		}
		lastID, _ = c["id"].(string)
	}

	// Exactly the case that rules out max(comment_no)+1: delete the highest
	// floor, and the next comment must not take its number.
	if res := h.do(http.MethodDelete, "/forum/comments/"+lastID, nil, withBearer(token)); res.status != http.StatusOK {
		t.Fatalf("delete floor 20 = %d: %s", res.status, res.body)
	}
	next := h.mustComment(token, no, "after the deletion", nil)
	if got := floorOf(t, next); got != 21 {
		t.Errorf("floor after deleting 20 = %d, want 21", got)
	}
}

// Floor numbers are per thread, so a second post starts again at 1.
func TestFloorNumbersAreScopedToTheirThread(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	first := h.mustCreatePost(token, simplePost())
	second := h.mustCreatePost(token, simplePost())

	h.mustComment(token, first, "a", nil)
	h.mustComment(token, first, "b", nil)
	c := h.mustComment(token, second, "first here", nil)

	if got := floorOf(t, c); got != 1 {
		t.Errorf("first comment on a second thread got floor %d, want 1", got)
	}
}

func TestRepliesAreNotNumberedAndCannotNestFurther(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	no := h.mustCreatePost(token, simplePost())

	floor := h.mustComment(token, no, "a comment", nil)
	floorID, _ := floor["id"].(string)

	reply := h.mustComment(token, no, "a reply", floorID)
	if reply["commentNo"] != nil {
		t.Errorf("a reply was numbered %v; only top-level comments carry a floor", reply["commentNo"])
	}
	if reply["parentId"] != floorID {
		t.Errorf("parentId = %v, want the comment it replies to", reply["parentId"])
	}

	// The schema's composite key refuses a third level; the service reports it as
	// a validation error rather than letting a foreign-key violation escape.
	replyID, _ := reply["id"].(string)
	res := h.do(http.MethodPost, "/forum/posts/"+strconv.FormatInt(no, 10)+"/comments",
		map[string]any{"body": "third level", "parentId": replyID}, withBearer(token))
	if res.status != http.StatusUnprocessableEntity {
		t.Errorf("reply to a reply = %d, want 422: %s", res.status, res.body)
	}

	// A comment taking the next floor is unaffected by the reply in between.
	second := h.mustComment(token, no, "another comment", nil)
	if got := floorOf(t, second); got != 2 {
		t.Errorf("second floor = %d, want 2: a reply must not consume a floor number", got)
	}
}

func TestCommentsComeBackWithRepliesAfterTheirParent(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	no := h.mustCreatePost(token, simplePost())

	one := h.mustComment(token, no, "floor one", nil)
	oneID, _ := one["id"].(string)
	h.mustComment(token, no, "floor two", nil)
	h.mustComment(token, no, "reply to one", oneID)

	list := h.comments(no)
	if len(list) != 3 {
		t.Fatalf("thread returned %d comments, want 3", len(list))
	}
	bodies := make([]string, 0, len(list))
	for _, raw := range list {
		c, _ := raw.(map[string]any)
		body, _ := c["body"].(string)
		bodies = append(bodies, body)
	}
	want := []string{"floor one", "reply to one", "floor two"}
	for i := range want {
		if bodies[i] != want[i] {
			t.Errorf("comment %d = %q, want %q (order: %v)", i, bodies[i], want[i], bodies)
		}
	}
}

func TestDeletingAThingDeletesWhatHangsOffIt(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	// Deleting a comment takes its replies with it.
	no := h.mustCreatePost(token, simplePost())
	floor := h.mustComment(token, no, "floor", nil)
	floorID, _ := floor["id"].(string)
	h.mustComment(token, no, "reply", floorID)
	if len(h.comments(no)) != 2 {
		t.Fatal("expected a comment and its reply")
	}
	if res := h.do(http.MethodDelete, "/forum/comments/"+floorID, nil, withBearer(token)); res.status != http.StatusOK {
		t.Fatalf("delete comment = %d: %s", res.status, res.body)
	}
	if got := h.comments(no); len(got) != 0 {
		t.Errorf("thread still holds %d comments; the reply should have gone too", len(got))
	}

	// Deleting a post takes its whole thread.
	other := h.mustCreatePost(token, simplePost())
	h.mustComment(token, other, "doomed", nil)
	if res := h.do(http.MethodDelete, "/forum/posts/"+strconv.FormatInt(other, 10), nil, withBearer(token)); res.status != http.StatusOK {
		t.Fatalf("delete post = %d: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, "/forum/posts/"+strconv.FormatInt(other, 10)+"/comments", nil); res.status != http.StatusNotFound {
		t.Errorf("comments of a deleted post = %d, want 404", res.status)
	}
}

func TestCommentCountReflectsRepliesToo(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	no := h.mustCreatePost(token, simplePost())

	floor := h.mustComment(token, no, "floor", nil)
	floorID, _ := floor["id"].(string)
	h.mustComment(token, no, "reply", floorID)

	res := h.do(http.MethodGet, "/forum/posts/"+strconv.FormatInt(no, 10), nil)
	if count, _ := res.data(t)["commentCount"].(float64); int(count) != 2 {
		t.Errorf("commentCount = %v, want 2 with the reply included", res.data(t)["commentCount"])
	}

	list := h.do(http.MethodGet, "/forum/posts", nil)
	results, _ := list.data(t)["results"].([]any)
	first, _ := results[0].(map[string]any)
	if count, _ := first["commentCount"].(float64); int(count) != 2 {
		t.Errorf("feed commentCount = %v, want 2", first["commentCount"])
	}
}

func TestCommentingOnAMissingPostIsNotFound(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	res := h.do(http.MethodPost, "/forum/posts/999999/comments",
		map[string]any{"body": "into the void"}, withBearer(token))
	if res.status != http.StatusNotFound {
		t.Errorf("comment on a missing post = %d, want 404: %s", res.status, res.body)
	}
}

// A reply must name a comment on the same post, or a thread could be used to
// smuggle replies onto another one.
func TestReplyingAcrossPostsIsRefused(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")

	first := h.mustCreatePost(token, simplePost())
	second := h.mustCreatePost(token, simplePost())
	comment := h.mustComment(token, first, "over here", nil)
	commentID, _ := comment["id"].(string)

	res := h.do(http.MethodPost, "/forum/posts/"+strconv.FormatInt(second, 10)+"/comments",
		map[string]any{"body": "wrong thread", "parentId": commentID}, withBearer(token))
	if res.status != http.StatusUnprocessableEntity {
		t.Errorf("cross-post reply = %d, want 422: %s", res.status, res.body)
	}
}

func TestOnlyTheAuthorOrAnAdministratorMayChangeAComment(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")

	no := h.mustCreatePost(authorToken, simplePost())
	comment := h.mustComment(authorToken, no, "mine", nil)
	id, _ := comment["id"].(string)

	if res := h.do(http.MethodPatch, "/forum/comments/"+id, map[string]any{"body": "hijacked"}, withBearer(strangerToken)); res.status != http.StatusForbidden {
		t.Errorf("stranger edit = %d, want 403: %s", res.status, res.body)
	}
	edit := h.do(http.MethodPatch, "/forum/comments/"+id, map[string]any{"body": "revised"}, withBearer(authorToken))
	if edit.status != http.StatusOK {
		t.Fatalf("author edit = %d: %s", edit.status, edit.body)
	}
	if edit.data(t)["editedAt"] == nil {
		t.Error("editedAt is still null after editing a comment")
	}
	if res := h.do(http.MethodDelete, "/forum/comments/"+id, nil, withBearer(adminToken)); res.status != http.StatusOK {
		t.Errorf("administrator delete = %d, want 200: %s", res.status, res.body)
	}
}

// Writing is limited per account, not per address: the caller is signed in, so
// keying on the address would throttle everyone behind one NAT while doing
// nothing about a single account in a loop.
func TestForumWritesAreRateLimitedPerAccount(t *testing.T) {
	h := newHarnessWith(t, func(c *config.Config) {
		c.Auth.ForumPostsPerMinute = 1
		c.Auth.ForumCommentsPerMinute = 1
	}, nil)

	token := h.registerAndLogin("eager", "eager@example.com", "hunter2hunter2")
	other := h.registerAndLogin("calm", "calm@example.com", "hunter2hunter2")

	no := h.mustCreatePost(token, simplePost())
	if res := h.createPost(token, simplePost()); res.status != http.StatusTooManyRequests {
		t.Fatalf("second post = %d, want 429: %s", res.status, res.body)
	}
	// A different account is unaffected.
	if res := h.createPost(other, simplePost()); res.status != http.StatusOK {
		t.Errorf("another account's post = %d, want 200: %s", res.status, res.body)
	}

	// Comments are limited separately from posts, so exhausting one does not
	// silence the other.
	h.mustComment(token, no, "first", nil)
	second := h.do(http.MethodPost, "/forum/posts/"+strconv.FormatInt(no, 10)+"/comments",
		map[string]any{"body": "second"}, withBearer(token))
	if second.status != http.StatusTooManyRequests {
		t.Errorf("second comment = %d, want 429: %s", second.status, second.body)
	}
}
