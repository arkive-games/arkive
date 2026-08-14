package core_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// promoteToSiteAdmin makes the caller the site administrator. It only works while
// no administrator exists, so it must be the first thing a test does.
func (h *harness) promoteToSiteAdmin(token string) {
	h.t.Helper()
	if res := h.do(http.MethodPost, "/users/become-superuser", nil, withBearer(token)); res.status != http.StatusOK {
		h.t.Fatalf("become-superuser = %d: %s", res.status, res.body)
	}
}

// uidOf reads the public account number from /users/me.
func (h *harness) uidOf(token string) int64 {
	h.t.Helper()
	res := h.do(http.MethodGet, "/users/me", nil, withBearer(token))
	if res.status != http.StatusOK {
		h.t.Fatalf("users/me = %d: %s", res.status, res.body)
	}
	uid, ok := res.data(h.t)["uid"].(float64)
	if !ok {
		h.t.Fatalf("users/me carries no uid: %s", res.body)
	}
	return int64(uid)
}

func (h *harness) grantRole(token, game string, uid int64, role string) response {
	h.t.Helper()
	return h.do(http.MethodPut, fmt.Sprintf("/roles/games/%s/%d", game, uid),
		map[string]any{"role": role}, withBearer(token))
}

func (h *harness) revokeRole(token, game string, uid int64, role string) response {
	h.t.Helper()
	return h.do(http.MethodDelete, fmt.Sprintf("/roles/games/%s/%d?role=%s", game, uid, role),
		nil, withBearer(token))
}

func (h *harness) staffOf(game string) []any {
	h.t.Helper()
	res := h.do(http.MethodGet, "/roles/games/"+game, nil)
	if res.status != http.StatusOK {
		h.t.Fatalf("list staff = %d: %s", res.status, res.body)
	}
	list, _ := res.data(h.t)["results"].([]any)
	return list
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestGameStaffIsPublicAndStartsEmpty(t *testing.T) {
	h := newHarness(t)

	// Public: the cabin names its staff without the reader signing in. That is the
	// whole point of the endpoint — the page previously showed two hardcoded people.
	if got := h.staffOf("palworld"); len(got) != 0 {
		t.Errorf("staff of a fresh game = %v, want none", got)
	}

	// An unknown game is a wrong URL, not an empty list: the path parameter is
	// enumerated, unlike the feed's gameId filter.
	if res := h.do(http.MethodGet, "/roles/games/not-a-game", nil); res.status != http.StatusUnprocessableEntity {
		t.Errorf("unknown game = %d, want 422: %s", res.status, res.body)
	}
}

func TestSiteAdminAppointsGameStaff(t *testing.T) {
	h := newHarness(t)
	adminToken := h.registerAndLogin("admin", "admin@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(adminToken)

	keeperToken := h.registerAndLogin("keeper", "keeper@example.com", "hunter2hunter2")
	keeperUID := h.uidOf(keeperToken)

	if res := h.grantRole(adminToken, "palworld", keeperUID, "game_admin"); res.status != http.StatusOK {
		t.Fatalf("grant = %d: %s", res.status, res.body)
	}

	staff := h.staffOf("palworld")
	if len(staff) != 1 {
		t.Fatalf("staff = %v, want one entry", staff)
	}
	grant, _ := staff[0].(map[string]any)
	if grant["role"] != "game_admin" || grant["game"] != "palworld" {
		t.Errorf("grant = %v, want palworld game_admin", grant)
	}
	// The holder is the public view: a staff list must not leak an address.
	holder, _ := grant["user"].(map[string]any)
	if holder["name"] != "keeper" {
		t.Errorf("holder = %v, want the display name", holder)
	}
	if res := h.do(http.MethodGet, "/roles/games/palworld", nil); strings.Contains(string(res.body), "keeper@example.com") {
		t.Errorf("the staff list leaks an email: %s", res.body)
	}

	// Granting twice is not a conflict: the caller asked for an end state.
	if res := h.grantRole(adminToken, "palworld", keeperUID, "game_admin"); res.status != http.StatusOK {
		t.Errorf("re-grant = %d, want 200: %s", res.status, res.body)
	}
	if staff := h.staffOf("palworld"); len(staff) != 1 {
		t.Errorf("staff after re-grant = %v, want still one entry", staff)
	}

	// A grant is scoped to its game and does not leak into another.
	if staff := h.staffOf("aion2"); len(staff) != 0 {
		t.Errorf("staff of aion2 = %v, want none", staff)
	}

	// Revoking twice also succeeds, for the same reason.
	if res := h.revokeRole(adminToken, "palworld", keeperUID, "game_admin"); res.status != http.StatusOK {
		t.Fatalf("revoke = %d: %s", res.status, res.body)
	}
	if res := h.revokeRole(adminToken, "palworld", keeperUID, "game_admin"); res.status != http.StatusOK {
		t.Errorf("re-revoke = %d, want 200: %s", res.status, res.body)
	}
	if staff := h.staffOf("palworld"); len(staff) != 0 {
		t.Errorf("staff after revoke = %v, want none", staff)
	}
}

// A game administrator runs their own game and nothing else. The two limits that
// matter are that they cannot promote a peer, and cannot reach into another game.
func TestGameAdminAppointsModeratorsForOwnGameOnly(t *testing.T) {
	h := newHarness(t)
	siteToken := h.registerAndLogin("site", "site@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(siteToken)

	palAdminToken := h.registerAndLogin("paladmin", "paladmin@example.com", "hunter2hunter2")
	palAdminUID := h.uidOf(palAdminToken)
	if res := h.grantRole(siteToken, "palworld", palAdminUID, "game_admin"); res.status != http.StatusOK {
		t.Fatalf("seed game admin = %d: %s", res.status, res.body)
	}

	helperToken := h.registerAndLogin("helper", "helper@example.com", "hunter2hunter2")
	helperUID := h.uidOf(helperToken)

	// Allowed: a moderator for the game they administer.
	if res := h.grantRole(palAdminToken, "palworld", helperUID, "game_moderator"); res.status != http.StatusOK {
		t.Errorf("game admin granting a moderator = %d, want 200: %s", res.status, res.body)
	}

	// Refused: promoting a peer. One compromised administrator must not become two.
	if res := h.grantRole(palAdminToken, "palworld", helperUID, "game_admin"); res.status != http.StatusForbidden {
		t.Errorf("game admin granting an admin = %d, want 403: %s", res.status, res.body)
	}

	// Refused: another game entirely.
	if res := h.grantRole(palAdminToken, "aion2", helperUID, "game_moderator"); res.status != http.StatusForbidden {
		t.Errorf("game admin reaching into another game = %d, want 403: %s", res.status, res.body)
	}

	// Refused: a moderator appoints nobody, not even in their own game.
	if res := h.grantRole(helperToken, "palworld", palAdminUID, "game_moderator"); res.status != http.StatusForbidden {
		t.Errorf("moderator granting = %d, want 403: %s", res.status, res.body)
	}

	// Refused: an ordinary account.
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")
	if res := h.grantRole(strangerToken, "palworld", helperUID, "game_moderator"); res.status != http.StatusForbidden {
		t.Errorf("stranger granting = %d, want 403: %s", res.status, res.body)
	}

	// And anonymous callers are refused before any of that is considered.
	res := h.do(http.MethodPut, fmt.Sprintf("/roles/games/palworld/%d", helperUID),
		map[string]any{"role": "game_moderator"})
	if res.status != http.StatusUnauthorized {
		t.Errorf("anonymous granting = %d, want 401: %s", res.status, res.body)
	}
}

func TestGrantingRejectsUnknownSubjects(t *testing.T) {
	h := newHarness(t)
	adminToken := h.registerAndLogin("admin", "admin@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(adminToken)

	// A uid nobody holds. 404 rather than 422: the request was well formed, the
	// account simply does not exist.
	if res := h.grantRole(adminToken, "palworld", 999999, "game_admin"); res.status != http.StatusNotFound {
		t.Errorf("grant to an unknown uid = %d, want 404: %s", res.status, res.body)
	}

	keeperToken := h.registerAndLogin("keeper", "keeper@example.com", "hunter2hunter2")
	keeperUID := h.uidOf(keeperToken)

	// An unknown game, and an unknown role: both refused by the enums before the
	// service is reached.
	if res := h.grantRole(adminToken, "not-a-game", keeperUID, "game_admin"); res.status != http.StatusUnprocessableEntity {
		t.Errorf("grant in an unknown game = %d, want 422: %s", res.status, res.body)
	}
	if res := h.grantRole(adminToken, "palworld", keeperUID, "site_admin"); res.status != http.StatusUnprocessableEntity {
		t.Errorf("granting site_admin as a game role = %d, want 422: %s", res.status, res.body)
	}
}

func TestOwnRolesListsEveryGrant(t *testing.T) {
	h := newHarness(t)
	adminToken := h.registerAndLogin("admin", "admin@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(adminToken)

	keeperToken := h.registerAndLogin("keeper", "keeper@example.com", "hunter2hunter2")
	keeperUID := h.uidOf(keeperToken)
	for _, seed := range []struct{ game, role string }{
		{"palworld", "game_admin"},
		{"aion2", "game_moderator"},
	} {
		if res := h.grantRole(adminToken, seed.game, keeperUID, seed.role); res.status != http.StatusOK {
			t.Fatalf("seed %v = %d: %s", seed, res.status, res.body)
		}
	}

	res := h.do(http.MethodGet, "/roles/me", nil, withBearer(keeperToken))
	if res.status != http.StatusOK {
		t.Fatalf("own roles = %d: %s", res.status, res.body)
	}
	list, _ := res.data(t)["results"].([]any)
	if len(list) != 2 {
		t.Errorf("own roles = %v, want two entries", list)
	}

	// The site administrator holds no *grants*: site-wide administration is the
	// account's own flag, not a row here. Reporting it as a grant would give two
	// sources of truth for the same fact.
	res = h.do(http.MethodGet, "/roles/me", nil, withBearer(adminToken))
	if res.status != http.StatusOK {
		t.Fatalf("admin own roles = %d: %s", res.status, res.body)
	}
	if list, _ := res.data(t)["results"].([]any); len(list) != 0 {
		t.Errorf("site admin grants = %v, want none", list)
	}

	if res := h.do(http.MethodGet, "/roles/me", nil); res.status != http.StatusUnauthorized {
		t.Errorf("anonymous own roles = %d, want 401: %s", res.status, res.body)
	}
}

// The official channel was the one rule canPostToChannel enforced, and replacing it
// with the roles service must not have widened it. A game administrator is not a
// platform spokesperson.
func TestOfficialChannelStaysSiteAdminOnly(t *testing.T) {
	h := newHarness(t)
	siteToken := h.registerAndLogin("site", "site@example.com", "hunter2hunter2")
	h.promoteToSiteAdmin(siteToken)

	official := map[string]any{"channel": "official", "title": "Notice", "body": "A notice."}

	if res := h.createPost(siteToken, official); res.status != http.StatusOK {
		t.Errorf("site admin posting official = %d, want 200: %s", res.status, res.body)
	}

	palAdminToken := h.registerAndLogin("paladmin", "paladmin@example.com", "hunter2hunter2")
	palAdminUID := h.uidOf(palAdminToken)
	if res := h.grantRole(siteToken, "palworld", palAdminUID, "game_admin"); res.status != http.StatusOK {
		t.Fatalf("seed game admin = %d: %s", res.status, res.body)
	}
	if res := h.createPost(palAdminToken, official); res.status != http.StatusForbidden {
		t.Errorf("game admin posting official = %d, want 403: %s", res.status, res.body)
	}

	// And an ordinary account still cannot, while the open channels still work for it.
	strangerToken := h.registerAndLogin("stranger", "stranger@example.com", "hunter2hunter2")
	if res := h.createPost(strangerToken, official); res.status != http.StatusForbidden {
		t.Errorf("stranger posting official = %d, want 403: %s", res.status, res.body)
	}
	if res := h.createPost(strangerToken, simplePost()); res.status != http.StatusOK {
		t.Errorf("stranger posting general = %d, want 200: %s", res.status, res.body)
	}
}
