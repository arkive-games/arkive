package core_test

import (
	"fmt"
	"net/http"
	"testing"
)

func inbox(t *testing.T, h *harness, token string, query string) []map[string]any {
	t.Helper()
	res := h.do(http.MethodGet, "/notifications"+query, nil, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("inbox = %d: %s", res.status, res.body)
	}
	list, _ := res.data(t)["results"].([]any)
	out := make([]map[string]any, 0, len(list))
	for _, item := range list {
		row, _ := item.(map[string]any)
		out = append(out, row)
	}
	return out
}

func kindsIn(rows []map[string]any) []string {
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		kind, _ := row["kind"].(string)
		out = append(out, kind)
	}
	return out
}

func TestNotificationsForRepliesLikesAndFollows(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	otherToken := h.registerAndLogin("other", "other@example.com", "hunter2hunter2")
	authorUID := h.uidOf(authorToken)

	postNo := h.mustCreatePost(authorToken, simplePost())

	// A comment on someone's post notifies the post's author.
	res := h.do(http.MethodPost, fmt.Sprintf("/forum/posts/%d/comments", postNo),
		map[string]any{"body": "A comment."}, withBearer(otherToken))
	if res.status != http.StatusOK {
		t.Fatalf("comment = %d: %s", res.status, res.body)
	}
	commentID, _ := res.data(t)["id"].(string)

	// A like notifies too, and only on the way up.
	if res := h.react(otherToken, http.MethodPut, fmt.Sprintf("/forum/posts/%d/like", postNo)); res.status != http.StatusOK {
		t.Fatalf("like = %d: %s", res.status, res.body)
	}
	if res := h.react(otherToken, http.MethodDelete, fmt.Sprintf("/forum/posts/%d/like", postNo)); res.status != http.StatusOK {
		t.Fatalf("unlike = %d: %s", res.status, res.body)
	}

	// And a follow.
	if res := h.do(http.MethodPut, followPath(authorUID), nil, withBearer(otherToken)); res.status != http.StatusOK {
		t.Fatalf("follow = %d: %s", res.status, res.body)
	}

	rows := inbox(t, h, authorToken, "")
	kinds := kindsIn(rows)
	if len(rows) != 3 {
		t.Fatalf("inbox = %v, want reply, post_like and follow", kinds)
	}
	// Newest first.
	want := map[string]bool{"reply": true, "post_like": true, "follow": true}
	for _, kind := range kinds {
		if !want[kind] {
			t.Errorf("unexpected kind %q in %v", kind, kinds)
		}
		delete(want, kind)
	}
	if len(want) != 0 {
		t.Errorf("missing kinds %v; got %v", want, kinds)
	}

	// The reply carries both references, so a client can link to the comment in place.
	for _, row := range rows {
		if row["kind"] == "reply" {
			if row["postNo"] == nil || row["commentId"] == nil {
				t.Errorf("reply notification lacks its references: %v", row)
			}
			if row["actorUid"] == nil {
				t.Errorf("reply notification lacks its actor: %v", row)
			}
		}
		// Nothing stores a rendered message; body is for system notices only.
		if row["kind"] != "system" && row["body"] != nil {
			t.Errorf("a %v notification carries a rendered body: %v", row["kind"], row)
		}
	}

	// A comment like notifies the comment's author.
	if res := h.react(authorToken, http.MethodPut, "/forum/comments/"+commentID+"/like"); res.status != http.StatusOK {
		t.Fatalf("like comment = %d: %s", res.status, res.body)
	}
	if kinds := kindsIn(inbox(t, h, otherToken, "")); len(kinds) != 1 || kinds[0] != "comment_like" {
		t.Errorf("the commenter's inbox = %v, want one comment_like", kinds)
	}
}

// Acting on your own content notifies nobody. The schema enforces it, so no code path can
// produce an inbox full of your own likes.
func TestNoSelfNotifications(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("solo", "solo@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(token, simplePost())

	if res := h.react(token, http.MethodPut, fmt.Sprintf("/forum/posts/%d/like", postNo)); res.status != http.StatusOK {
		t.Fatalf("liking own post = %d: %s", res.status, res.body)
	}
	res := h.do(http.MethodPost, fmt.Sprintf("/forum/posts/%d/comments", postNo),
		map[string]any{"body": "Talking to myself."}, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("commenting on own post = %d: %s", res.status, res.body)
	}

	if rows := inbox(t, h, token, ""); len(rows) != 0 {
		t.Errorf("own-action inbox = %v, want empty", kindsIn(rows))
	}
}

func TestMentionsNotifyTheNamedAccount(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	targetToken := h.registerAndLogin("target", "target@example.com", "hunter2hunter2")

	h.mustCreatePost(authorToken, map[string]any{
		"channel": "general", "title": "Hello",
		// An unknown name is ignored rather than failing the post, and an email address
		// must not read as a mention of the part after the @.
		"body": "Hey @target, and @nobody-at-all, mail me at someone@example.com",
	})

	if kinds := kindsIn(inbox(t, h, targetToken, "")); len(kinds) != 1 || kinds[0] != "mention" {
		t.Errorf("mentioned account's inbox = %v, want one mention", kinds)
	}

	// Naming the same person twice in one body notifies once.
	h.mustCreatePost(authorToken, map[string]any{
		"channel": "general", "title": "Again", "body": "@target and @target once more",
	})
	if rows := inbox(t, h, targetToken, ""); len(rows) != 2 {
		t.Errorf("after a doubled mention the inbox has %d rows, want 2", len(rows))
	}

	// A mention in a comment works the same way, alongside the reply notification.
	postNo := h.mustCreatePost(targetToken, simplePost())
	res := h.do(http.MethodPost, fmt.Sprintf("/forum/posts/%d/comments", postNo),
		map[string]any{"body": "cc @target"}, withBearer(authorToken))
	if res.status != http.StatusOK {
		t.Fatalf("comment = %d: %s", res.status, res.body)
	}
	rows := inbox(t, h, targetToken, "")
	var replies, mentions int
	for _, kind := range kindsIn(rows) {
		switch kind {
		case "reply":
			replies++
		case "mention":
			mentions++
		}
	}
	if replies != 1 || mentions != 3 {
		t.Errorf("inbox = %v, want 1 reply and 3 mentions", kindsIn(rows))
	}
}

func TestReadStateAndTheBadge(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	otherToken := h.registerAndLogin("other", "other@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(authorToken, simplePost())

	for _, body := range []string{"One.", "Two."} {
		if res := h.do(http.MethodPost, fmt.Sprintf("/forum/posts/%d/comments", postNo),
			map[string]any{"body": body}, withBearer(otherToken)); res.status != http.StatusOK {
			t.Fatalf("comment = %d: %s", res.status, res.body)
		}
	}

	unread := func(token string) int64 {
		res := h.do(http.MethodGet, "/notifications/unread", nil, withBearer(token))
		if res.status != http.StatusOK {
			t.Fatalf("unread = %d: %s", res.status, res.body)
		}
		count, _ := res.data(t)["unread"].(float64)
		return int64(count)
	}

	if got := unread(authorToken); got != 2 {
		t.Fatalf("unread = %d, want 2", got)
	}

	rows := inbox(t, h, authorToken, "?unread=true")
	if len(rows) != 2 {
		t.Fatalf("unread inbox = %d rows, want 2", len(rows))
	}
	first, _ := rows[0]["id"].(string)

	if res := h.do(http.MethodPost, "/notifications/"+first+"/read", nil, withBearer(authorToken)); res.status != http.StatusOK {
		t.Fatalf("mark read = %d: %s", res.status, res.body)
	}
	if got := unread(authorToken); got != 1 {
		t.Errorf("unread after marking one = %d, want 1", got)
	}
	if rows := inbox(t, h, authorToken, "?unread=true"); len(rows) != 1 {
		t.Errorf("unread inbox = %d rows, want 1", len(rows))
	}
	// The read one is still in the full inbox, with a timestamp.
	for _, row := range inbox(t, h, authorToken, "") {
		if row["id"] == first && row["readAt"] == nil {
			t.Errorf("a marked notification has no readAt: %v", row)
		}
	}

	// One account cannot mark another's as read by guessing the id: the write is scoped
	// by recipient, and the attempt reveals nothing.
	if res := h.do(http.MethodPost, "/notifications/"+first+"/read", nil, withBearer(otherToken)); res.status != http.StatusOK {
		t.Errorf("marking someone else's = %d, want a silent 200: %s", res.status, res.body)
	}

	if res := h.do(http.MethodPost, "/notifications/read", nil, withBearer(authorToken)); res.status != http.StatusOK {
		t.Fatalf("mark all read = %d: %s", res.status, res.body)
	}
	if got := unread(authorToken); got != 0 {
		t.Errorf("unread after marking all = %d, want 0", got)
	}

	if res := h.do(http.MethodGet, "/notifications", nil); res.status != http.StatusUnauthorized {
		t.Errorf("anonymous inbox = %d, want 401: %s", res.status, res.body)
	}
}

// A kind turned off produces no row at all, rather than a hidden one — so turning it back
// on does not reveal what was missed while it was off.
func TestPreferencesSuppressNotifications(t *testing.T) {
	h := newHarness(t)
	authorToken := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	otherToken := h.registerAndLogin("other", "other@example.com", "hunter2hunter2")
	postNo := h.mustCreatePost(authorToken, simplePost())

	res := h.do(http.MethodGet, "/notifications/preferences", nil, withBearer(authorToken))
	if res.status != http.StatusOK {
		t.Fatalf("read preferences = %d: %s", res.status, res.body)
	}
	for _, key := range []string{"reply", "mention", "postLike", "commentLike", "follow", "system"} {
		if on, _ := res.data(t)[key].(bool); !on {
			t.Errorf("%s defaults to %v, want true", key, res.data(t)[key])
		}
	}

	res = h.do(http.MethodPatch, "/notifications/preferences", map[string]any{"postLike": false}, withBearer(authorToken))
	if res.status != http.StatusOK {
		t.Fatalf("set preferences = %d: %s", res.status, res.body)
	}
	if on, _ := res.data(t)["postLike"].(bool); on {
		t.Errorf("postLike = true after turning it off")
	}
	// Partial: the others are untouched.
	if on, _ := res.data(t)["reply"].(bool); !on {
		t.Errorf("turning off postLike also turned off reply")
	}

	if res := h.react(otherToken, http.MethodPut, fmt.Sprintf("/forum/posts/%d/like", postNo)); res.status != http.StatusOK {
		t.Fatalf("like = %d: %s", res.status, res.body)
	}
	if rows := inbox(t, h, authorToken, ""); len(rows) != 0 {
		t.Errorf("inbox with post likes off = %v, want empty", kindsIn(rows))
	}

	// A kind still on still arrives.
	if res := h.do(http.MethodPost, fmt.Sprintf("/forum/posts/%d/comments", postNo),
		map[string]any{"body": "A comment."}, withBearer(otherToken)); res.status != http.StatusOK {
		t.Fatalf("comment = %d: %s", res.status, res.body)
	}
	if kinds := kindsIn(inbox(t, h, authorToken, "")); len(kinds) != 1 || kinds[0] != "reply" {
		t.Errorf("inbox = %v, want just the reply", kinds)
	}

	// Turning it back on does not resurrect the suppressed like.
	if res := h.do(http.MethodPatch, "/notifications/preferences", map[string]any{"postLike": true}, withBearer(authorToken)); res.status != http.StatusOK {
		t.Fatalf("re-enable = %d: %s", res.status, res.body)
	}
	if kinds := kindsIn(inbox(t, h, authorToken, "")); len(kinds) != 1 {
		t.Errorf("inbox after re-enabling = %v, want still just the reply", kinds)
	}
}
