package core_test

import (
	"fmt"
	"net/http"
	"testing"
)

// moderationSetup builds the cast every moderation test needs: a site administrator, a
// Palworld moderator, an author, and one Palworld post.
type moderationCast struct {
	site      string
	moderator string
	author    string
	stranger  string
	postNo    int64
}

func setUpModeration(t *testing.T, h *harness) moderationCast {
	t.Helper()
	site := h.registerAndLogin("site", "site@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(site)

	moderator := h.registerAndLogin("mod", "mod@example.com", "hunter2hunter2")
	if res := h.grantRole(site, "palworld", h.uidOf(moderator), "game_moderator"); res.status != http.StatusOK {
		t.Fatalf("seed moderator = %d: %s", res.status, res.body)
	}

	author := h.registerAndLogin("author", "author@example.com", "hunter2hunter2")
	stranger := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")

	postNo := h.mustCreatePost(author, map[string]any{
		"channel": "games", "title": "Reportable", "body": "Body.", "gameIds": []string{"palworld"},
	})
	return moderationCast{site: site, moderator: moderator, author: author, stranger: stranger, postNo: postNo}
}

func TestHidingRemovesContentFromEveryReader(t *testing.T) {
	h := newHarness(t)
	cast := setUpModeration(t, h)
	hidden := fmt.Sprintf("/forum/posts/%d/hidden", cast.postNo)
	single := fmt.Sprintf("/forum/posts/%d", cast.postNo)

	if res := h.do(http.MethodPut, hidden, map[string]any{"reason": "spam"}, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("hide = %d: %s", res.status, res.body)
	}

	// Gone from the feed, and gone from the count with it — a total that still included
	// it would offer a page the feed will not return.
	res := h.do(http.MethodGet, "/forum/posts", nil)
	if list, _ := res.data(t)["results"].([]any); len(list) != 0 {
		t.Errorf("feed after hiding = %v, want empty", list)
	}
	if total, _ := res.data(t)["count"].(float64); total != 0 {
		t.Errorf("count after hiding = %v, want 0", res.data(t)["count"])
	}

	// 404 for a stranger, and for the author too: a distinct "hidden" status would tell
	// a spammer which of their posts were caught.
	for name, token := range map[string]string{"stranger": cast.stranger, "author": cast.author, "anonymous": ""} {
		if res := h.react(token, http.MethodGet, single); res.status != http.StatusNotFound {
			t.Errorf("%s reading a hidden post = %d, want 404: %s", name, res.status, res.body)
		}
	}

	// The author cannot edit or delete it either — a moderator restores it first.
	if res := h.do(http.MethodPatch, single, map[string]any{"title": "Sneaky edit"}, withBearer(cast.author)); res.status != http.StatusNotFound {
		t.Errorf("author editing a hidden post = %d, want 404: %s", res.status, res.body)
	}

	// Nor can anyone react to it.
	if res := h.react(cast.stranger, http.MethodPut, single+"/like"); res.status != http.StatusNotFound {
		t.Errorf("liking a hidden post = %d, want 404: %s", res.status, res.body)
	}

	// The moderator can see it in the queue, which is the point of hiding rather than
	// deleting.
	res = h.do(http.MethodGet, "/forum/moderation/hidden", nil, withBearer(cast.moderator))
	if res.status != http.StatusOK {
		t.Fatalf("hidden queue = %d: %s", res.status, res.body)
	}
	list, _ := res.data(t)["results"].([]any)
	if len(list) != 1 {
		t.Fatalf("hidden queue = %v, want one post", list)
	}
	if row, _ := list[0].(map[string]any); row["reason"] != "spam" {
		t.Errorf("hidden row = %v, want the reason recorded", row)
	}

	// Restoring brings it back everywhere.
	if res := h.do(http.MethodDelete, hidden, nil, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("restore = %d: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, single, nil); res.status != http.StatusOK {
		t.Errorf("reading a restored post = %d, want 200: %s", res.status, res.body)
	}
	res = h.do(http.MethodGet, "/forum/moderation/hidden", nil, withBearer(cast.moderator))
	if list, _ := res.data(t)["results"].([]any); len(list) != 0 {
		t.Errorf("hidden queue after restoring = %v, want empty", list)
	}
}

func TestHidingIsScopedToGamesYouModerate(t *testing.T) {
	h := newHarness(t)
	cast := setUpModeration(t, h)

	aionPost := h.mustCreatePost(cast.author, map[string]any{
		"channel": "games", "title": "About AION2", "body": "Body.", "gameIds": []string{"aion2"},
	})
	generalPost := h.mustCreatePost(cast.author, map[string]any{
		"channel": "general", "title": "About nothing", "body": "Body.",
	})

	hide := func(token string, postNo int64) response {
		return h.do(http.MethodPut, fmt.Sprintf("/forum/posts/%d/hidden", postNo), nil, withBearer(token))
	}

	// A Palworld moderator reaches Palworld content and nothing else.
	if res := hide(cast.moderator, aionPost); res.status != http.StatusForbidden {
		t.Errorf("palworld moderator hiding an aion2 post = %d, want 403: %s", res.status, res.body)
	}
	if res := hide(cast.moderator, generalPost); res.status != http.StatusForbidden {
		t.Errorf("palworld moderator hiding an untagged post = %d, want 403: %s", res.status, res.body)
	}
	if res := hide(cast.site, generalPost); res.status != http.StatusOK {
		t.Errorf("site admin hiding an untagged post = %d, want 200: %s", res.status, res.body)
	}

	// An ordinary account moderates nothing, and cannot see the queue at all.
	if res := hide(cast.stranger, cast.postNo); res.status != http.StatusForbidden {
		t.Errorf("stranger hiding = %d, want 403: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, "/forum/moderation/reports", nil, withBearer(cast.stranger)); res.status != http.StatusForbidden {
		t.Errorf("stranger reading the queue = %d, want 403: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, "/forum/moderation/reports", nil); res.status != http.StatusUnauthorized {
		t.Errorf("anonymous queue = %d, want 401: %s", res.status, res.body)
	}
}

func TestReportingAndResolving(t *testing.T) {
	h := newHarness(t)
	cast := setUpModeration(t, h)

	report := func(token string, body map[string]any) response {
		return h.do(http.MethodPost, "/forum/reports", body, withBearer(token))
	}

	res := report(cast.stranger, map[string]any{"postNo": cast.postNo, "reason": "spam", "detail": "Looks like an advert."})
	if res.status != http.StatusOK {
		t.Fatalf("report = %d: %s", res.status, res.body)
	}
	if state, _ := res.data(t)["state"].(string); state != "open" {
		t.Errorf("a new report is %q, want open", state)
	}
	// The queue answers the content, not the complainant, so the reporter is absent.
	if _, present := res.data(t)["reporter"]; present {
		t.Errorf("a report exposes its reporter: %s", res.body)
	}

	// Reporting the same thing twice updates rather than duplicating.
	if res := report(cast.stranger, map[string]any{"postNo": cast.postNo, "reason": "abuse"}); res.status != http.StatusOK {
		t.Fatalf("re-report = %d: %s", res.status, res.body)
	}
	res = h.do(http.MethodGet, "/forum/moderation/reports", nil, withBearer(cast.moderator))
	list, _ := res.data(t)["results"].([]any)
	if len(list) != 1 {
		t.Fatalf("queue after re-reporting = %v, want one report", list)
	}
	first, _ := list[0].(map[string]any)
	if first["reason"] != "abuse" {
		t.Errorf("re-reporting did not update the reason: %v", first)
	}
	reportID, _ := first["id"].(string)

	// Neither target, and both targets, are refused rather than guessed at.
	if res := report(cast.stranger, map[string]any{"reason": "spam"}); res.status != http.StatusUnprocessableEntity {
		t.Errorf("a report naming no target = %d, want 422: %s", res.status, res.body)
	}
	if res := report(cast.stranger, map[string]any{"postNo": 999999, "reason": "spam"}); res.status != http.StatusNotFound {
		t.Errorf("reporting a missing post = %d, want 404: %s", res.status, res.body)
	}

	resolve := fmt.Sprintf("/forum/reports/%s/resolution", reportID)

	// A stranger cannot answer a report.
	if res := h.do(http.MethodPost, resolve, map[string]any{"state": "rejected"}, withBearer(cast.stranger)); res.status != http.StatusForbidden {
		t.Errorf("stranger resolving = %d, want 403: %s", res.status, res.body)
	}

	// The moderator can, and upholding does not hide anything by itself.
	if res := h.do(http.MethodPost, resolve, map[string]any{"state": "upheld"}, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("resolve = %d: %s", res.status, res.body)
	}
	if res := h.do(http.MethodGet, fmt.Sprintf("/forum/posts/%d", cast.postNo), nil); res.status != http.StatusOK {
		t.Errorf("upholding a report hid the post on its own = %d, want 200", res.status)
	}

	// It leaves the queue, and cannot be answered twice.
	res = h.do(http.MethodGet, "/forum/moderation/reports", nil, withBearer(cast.moderator))
	if list, _ := res.data(t)["results"].([]any); len(list) != 0 {
		t.Errorf("queue after resolving = %v, want empty", list)
	}
	if res := h.do(http.MethodPost, resolve, map[string]any{"state": "rejected"}, withBearer(cast.moderator)); res.status != http.StatusUnprocessableEntity {
		t.Errorf("answering twice = %d, want 422: %s", res.status, res.body)
	}

	// A fresh complaint about content that was let stand reopens it: that is new
	// information, not a duplicate.
	if res := report(cast.stranger, map[string]any{"postNo": cast.postNo, "reason": "illegal"}); res.status != http.StatusOK {
		t.Fatalf("re-report after resolution = %d: %s", res.status, res.body)
	}
	res = h.do(http.MethodGet, "/forum/moderation/reports", nil, withBearer(cast.moderator))
	if list, _ := res.data(t)["results"].([]any); len(list) != 1 {
		t.Errorf("queue after reopening = %v, want one report", list)
	}
}

func TestHidingAComment(t *testing.T) {
	h := newHarness(t)
	cast := setUpModeration(t, h)

	res := h.do(http.MethodPost, fmt.Sprintf("/forum/posts/%d/comments", cast.postNo),
		map[string]any{"body": "A comment."}, withBearer(cast.stranger))
	if res.status != http.StatusOK {
		t.Fatalf("comment = %d: %s", res.status, res.body)
	}
	commentID, _ := res.data(t)["id"].(string)

	thread := fmt.Sprintf("/forum/posts/%d/comments", cast.postNo)
	if list, _ := h.do(http.MethodGet, thread, nil).data(t)["results"].([]any); len(list) != 1 {
		t.Fatalf("thread = %v, want one comment", list)
	}

	if res := h.do(http.MethodPut, "/forum/comments/"+commentID+"/hidden", nil, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("hide comment = %d: %s", res.status, res.body)
	}

	// Gone from the thread, and out of the post's comment count with it.
	if list, _ := h.do(http.MethodGet, thread, nil).data(t)["results"].([]any); len(list) != 0 {
		t.Errorf("thread after hiding = %v, want empty", list)
	}
	res = h.do(http.MethodGet, fmt.Sprintf("/forum/posts/%d", cast.postNo), nil)
	if count, _ := res.data(t)["commentCount"].(float64); count != 0 {
		t.Errorf("commentCount after hiding = %v, want 0", res.data(t)["commentCount"])
	}

	if res := h.do(http.MethodDelete, "/forum/comments/"+commentID+"/hidden", nil, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("restore comment = %d: %s", res.status, res.body)
	}
	if list, _ := h.do(http.MethodGet, thread, nil).data(t)["results"].([]any); len(list) != 1 {
		t.Errorf("thread after restoring = %v, want the comment back", list)
	}
}

// Hiding a comment shipped covering the thread listing and the comment count and nothing
// else, so a hidden comment could still be liked, edited, deleted and replied to. The post
// side had all of those; the comment side had none, and the tests mirrored the asymmetry.
func TestHiddenCommentsAreInertEverywhere(t *testing.T) {
	h := newHarness(t)
	cast := setUpModeration(t, h)

	comment := func(token, body string, parentID *string) response {
		payload := map[string]any{"body": body}
		if parentID != nil {
			payload["parentId"] = *parentID
		}
		return h.do(http.MethodPost, fmt.Sprintf("/forum/posts/%d/comments", cast.postNo),
			payload, withBearer(token))
	}

	res := comment(cast.stranger, "The original.", nil)
	if res.status != http.StatusOK {
		t.Fatalf("comment = %d: %s", res.status, res.body)
	}
	commentID, _ := res.data(t)["id"].(string)

	if res := h.do(http.MethodPut, "/forum/comments/"+commentID+"/hidden", nil, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("hide comment = %d: %s", res.status, res.body)
	}

	// Liking it.
	if res := h.react(cast.author, http.MethodPut, "/forum/comments/"+commentID+"/like"); res.status != http.StatusNotFound {
		t.Errorf("liking a hidden comment = %d, want 404: %s", res.status, res.body)
	}
	// Editing and deleting it, by its own author.
	if res := h.do(http.MethodPatch, "/forum/comments/"+commentID,
		map[string]any{"body": "Sneaky edit."}, withBearer(cast.stranger)); res.status != http.StatusNotFound {
		t.Errorf("editing a hidden comment = %d, want 404: %s", res.status, res.body)
	}
	if res := h.do(http.MethodDelete, "/forum/comments/"+commentID, nil, withBearer(cast.stranger)); res.status != http.StatusNotFound {
		t.Errorf("deleting a hidden comment = %d, want 404: %s", res.status, res.body)
	}
	// And replying to it — otherwise a thread grows under content nobody can see.
	if res := comment(cast.author, "Replying to something invisible.", &commentID); res.status != http.StatusNotFound {
		t.Errorf("replying to a hidden comment = %d, want 404: %s", res.status, res.body)
	}

	// Restoring puts all of it back.
	if res := h.do(http.MethodDelete, "/forum/comments/"+commentID+"/hidden", nil, withBearer(cast.moderator)); res.status != http.StatusOK {
		t.Fatalf("restore = %d: %s", res.status, res.body)
	}
	if res := h.react(cast.author, http.MethodPut, "/forum/comments/"+commentID+"/like"); res.status != http.StatusOK {
		t.Errorf("liking a restored comment = %d, want 200: %s", res.status, res.body)
	}
	if res := comment(cast.author, "Now visible.", &commentID); res.status != http.StatusOK {
		t.Errorf("replying to a restored comment = %d, want 200: %s", res.status, res.body)
	}
}
