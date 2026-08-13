package core_test

import (
	"net/http"
	"strconv"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Account numbers
//
// These run against the same harness as integration_test.go, which drops and
// remigrates core before each test, so every case starts from an empty table and
// an untouched identity sequence.
// ---------------------------------------------------------------------------

// promoteToAdmin registers an account and claims the bootstrap administrator
// slot with it.
func promoteToAdmin(t *testing.T, h *harness, name, email string) string {
	t.Helper()
	token := h.registerAndLogin(name, email, "hunter2hunter2")
	if res := h.do(http.MethodPost, "/users/become-superuser", nil, withBearer(token)); res.status != http.StatusOK {
		t.Fatalf("promote = %d: %s", res.status, res.body)
	}
	return token
}

// uidOf reads an account's own numbers through /users/me.
func uidOf(t *testing.T, h *harness, token string) (uid int64, specialUID *int64) {
	t.Helper()
	res := h.do(http.MethodGet, "/users/me", nil, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("GET /users/me = %d: %s", res.status, res.body)
	}
	data := res.data(t)

	raw, ok := data["uid"].(float64)
	if !ok {
		t.Fatalf("/users/me carries no uid: %s", res.body)
	}
	if special, ok := data["specialUid"].(float64); ok {
		s := int64(special)
		specialUID = &s
	}
	return int64(raw), specialUID
}

// idOf reads an account's uuid, which the administrative routes are keyed by.
func idOf(t *testing.T, h *harness, token string) string {
	t.Helper()
	res := h.do(http.MethodGet, "/users/me", nil, withBearer(token))
	id, _ := res.data(t)["id"].(string)
	if id == "" {
		t.Fatalf("could not read the account id: %s", res.body)
	}
	return id
}

// The floor is the whole point of the scheme: numbers below 10000 are reserved
// for vanity aliases, so no real account may occupy one. On a fresh schema the
// first account should be exactly 10000, which also proves the migration's
// closing setval handled the empty-table case rather than skipping a number.
func TestFirstAccountIsNumberedTenThousand(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("first", "first@example.com", "hunter2hunter2")

	uid, special := uidOf(t, h, token)
	if uid != 10000 {
		t.Errorf("first account uid = %d, want 10000", uid)
	}
	if special != nil {
		t.Errorf("a new account should hold no special uid, got %d", *special)
	}
}

// A uid is a permanent public identifier. Accounts are never deleted, so a uid
// can never come back into circulation — and deactivation must not free it
// either, or the guarantee would hold only until an administrator used the one
// endpoint that retires an account.
func TestUIDIsNotReusedAfterTheAccountIsDeactivated(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")

	retiredToken := h.registerAndLogin("retired", "retired@example.com", "hunter2hunter2")
	retiredUID, _ := uidOf(t, h, retiredToken)
	retiredID := idOf(t, h, retiredToken)

	if res := h.do(http.MethodPost, "/users/"+retiredID+"/deactivate", nil, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("deactivate = %d: %s", res.status, res.body)
	}

	nextToken := h.registerAndLogin("next", "next@example.com", "hunter2hunter2")
	nextUID, _ := uidOf(t, h, nextToken)

	if nextUID == retiredUID {
		t.Fatalf("uid %d was reissued after its holder was deactivated", retiredUID)
	}
	if nextUID < retiredUID {
		t.Errorf("uid went backwards: %d was issued after %d", nextUID, retiredUID)
	}

	// The row still exists, but a deactivated account is not public.
	if res := h.do(http.MethodGet, "/users/uid/"+strconv.FormatInt(retiredUID, 10), nil); res.status != http.StatusNotFound {
		t.Errorf("public lookup of a deactivated account = %d, want 404", res.status)
	}
}

// The pair of numbers exists so that one account answers to both. A permalink
// uses the uid; the vanity number is a convenience that must resolve to the same
// account.
func TestPublicLookupResolvesByEitherNumber(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")

	targetToken := h.registerAndLogin("target", "target@example.com", "hunter2hunter2")
	targetUID, _ := uidOf(t, h, targetToken)
	targetID := idOf(t, h, targetToken)

	assign := h.do(http.MethodPatch, "/users/"+targetID, map[string]any{"specialUid": 42}, withBearer(adminToken))
	if assign.status != http.StatusOK {
		t.Fatalf("assign special uid = %d: %s", assign.status, assign.body)
	}
	if got, _ := assign.data(t)["specialUid"].(float64); int(got) != 42 {
		t.Errorf("specialUid = %v after assignment, want 42", assign.data(t)["specialUid"])
	}

	byReal := h.do(http.MethodGet, "/users/uid/"+strconv.FormatInt(targetUID, 10), nil)
	if byReal.status != http.StatusOK {
		t.Fatalf("lookup by real uid = %d: %s", byReal.status, byReal.body)
	}
	bySpecial := h.do(http.MethodGet, "/users/uid/42", nil)
	if bySpecial.status != http.StatusOK {
		t.Fatalf("lookup by special uid = %d: %s", bySpecial.status, bySpecial.body)
	}

	realName, _ := byReal.data(t)["name"].(string)
	specialName, _ := bySpecial.data(t)["name"].(string)
	if realName != "target" || specialName != "target" {
		t.Errorf("the two numbers resolved to %q and %q, want both %q", realName, specialName, "target")
	}
	if uid, _ := bySpecial.data(t)["uid"].(float64); int64(uid) != targetUID {
		t.Errorf("lookup by special uid reported uid %v, want %d", bySpecial.data(t)["uid"], targetUID)
	}
}

// The public projection is a separate type precisely so it cannot carry these
// fields. This asserts the consequence rather than the type.
func TestPublicLookupExposesNoPrivateFields(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("subject", "subject@example.com", "hunter2hunter2")
	uid, _ := uidOf(t, h, token)

	res := h.do(http.MethodGet, "/users/uid/"+strconv.FormatInt(uid, 10), nil)
	if res.status != http.StatusOK {
		t.Fatalf("public lookup = %d: %s", res.status, res.body)
	}

	data := res.data(t)
	for _, field := range []string{"email", "isSuperuser", "isActive", "isVerified", "hashedPassword", "id"} {
		if _, present := data[field]; present {
			t.Errorf("the public payload exposes %q: %s", field, res.body)
		}
	}
	if strings.Contains(string(res.body), "subject@example.com") {
		t.Errorf("the public payload leaks the email address: %s", res.body)
	}
	if strings.Contains(strings.ToLower(string(res.body)), "argon2") {
		t.Errorf("the public payload leaks password material: %s", res.body)
	}
}

// A vanity number is an administrative grant. Anyone able to award themselves
// one could impersonate the site's own staff numbering.
func TestUserCannotAssignThemselvesASpecialUID(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("climber", "climber@example.com", "hunter2hunter2")

	res := h.do(http.MethodPatch, "/users/me", map[string]any{"specialUid": 1}, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("self update = %d: %s", res.status, res.body)
	}
	if special, present := res.data(t)["specialUid"]; present && special != nil {
		t.Errorf("a user granted themselves special uid %v through /users/me", special)
	}

	if _, special := uidOf(t, h, token); special != nil {
		t.Errorf("special uid %d survived a self-service update", *special)
	}
	if res := h.do(http.MethodGet, "/users/uid/1", nil); res.status != http.StatusNotFound {
		t.Errorf("special uid 1 resolves, so the self-grant took effect: %d", res.status)
	}
}

// Two administrators can reach for the same number; the loser needs a clear
// conflict rather than a 500 or a silent overwrite.
func TestSpecialUIDCannotBeHeldByTwoAccounts(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")

	firstToken := h.registerAndLogin("first", "first@example.com", "hunter2hunter2")
	secondToken := h.registerAndLogin("second", "second@example.com", "hunter2hunter2")
	firstID := idOf(t, h, firstToken)
	secondID := idOf(t, h, secondToken)

	if res := h.do(http.MethodPatch, "/users/"+firstID, map[string]any{"specialUid": 7}, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("first assignment = %d: %s", res.status, res.body)
	}

	clash := h.do(http.MethodPatch, "/users/"+secondID, map[string]any{"specialUid": 7}, withBearer(adminToken))
	if clash.status != http.StatusConflict {
		t.Fatalf("second assignment = %d, want 409: %s", clash.status, clash.body)
	}
	if code := clash.errorCode(t); code != "UserSpecialUidTakenError" {
		t.Errorf("errorCode = %q, want UserSpecialUidTakenError", code)
	}

	// A Postgres unique violation carries the whole offending row in its Detail
	// field, password hash included. The conflict message is hand-written so
	// none of that reaches the client.
	body := strings.ToLower(string(clash.body))
	for _, leak := range []string{"argon2", "hashed_password", "second@example.com"} {
		if strings.Contains(body, leak) {
			t.Errorf("the conflict response leaks %q: %s", leak, clash.body)
		}
	}
}

// Revocation is the difference between a vanity pool and a permanent brand: the
// number has to come back for somebody else.
func TestRevokingASpecialUIDFreesItForAnotherAccount(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")

	oldToken := h.registerAndLogin("old", "old@example.com", "hunter2hunter2")
	newToken := h.registerAndLogin("new", "new@example.com", "hunter2hunter2")
	oldID := idOf(t, h, oldToken)
	newID := idOf(t, h, newToken)

	if res := h.do(http.MethodPatch, "/users/"+oldID, map[string]any{"specialUid": 99}, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("assign = %d: %s", res.status, res.body)
	}

	// An explicit null is the revoke, as distinct from omitting the field.
	revoke := h.do(http.MethodPatch, "/users/"+oldID, map[string]any{"specialUid": nil}, withBearer(adminToken))
	if revoke.status != http.StatusOK {
		t.Fatalf("revoke = %d: %s", revoke.status, revoke.body)
	}
	if special := revoke.data(t)["specialUid"]; special != nil {
		t.Errorf("specialUid = %v after revocation, want null", special)
	}
	if res := h.do(http.MethodGet, "/users/uid/99", nil); res.status != http.StatusNotFound {
		t.Errorf("99 still resolves after revocation: %d", res.status)
	}

	reassign := h.do(http.MethodPatch, "/users/"+newID, map[string]any{"specialUid": 99}, withBearer(adminToken))
	if reassign.status != http.StatusOK {
		t.Fatalf("reassign a revoked number = %d, want 200: %s", reassign.status, reassign.body)
	}
	res := h.do(http.MethodGet, "/users/uid/99", nil)
	if res.status != http.StatusOK {
		t.Fatalf("lookup after reassignment = %d: %s", res.status, res.body)
	}
	if name, _ := res.data(t)["name"].(string); name != "new" {
		t.Errorf("99 resolves to %q, want %q", name, "new")
	}

	// The former holder keeps its permanent number throughout.
	if uid, special := uidOf(t, h, oldToken); special != nil || uid < 10000 {
		t.Errorf("the former holder's numbers are wrong: uid=%d special=%v", uid, special)
	}
}

// Omitting the field must not be read as "clear it", or every unrelated
// administrative edit would silently strip the account's vanity number.
func TestOmittingSpecialUIDLeavesItUnchanged(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")

	token := h.registerAndLogin("keeper", "keeper@example.com", "hunter2hunter2")
	id := idOf(t, h, token)

	if res := h.do(http.MethodPatch, "/users/"+id, map[string]any{"specialUid": 123}, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("assign = %d: %s", res.status, res.body)
	}

	// An edit that says nothing about the number at all.
	other := h.do(http.MethodPatch, "/users/"+id, map[string]any{"isVerified": true}, withBearer(adminToken))
	if other.status != http.StatusOK {
		t.Fatalf("unrelated update = %d: %s", other.status, other.body)
	}
	if got, _ := other.data(t)["specialUid"].(float64); int(got) != 123 {
		t.Errorf("specialUid = %v after an unrelated edit, want 123", other.data(t)["specialUid"])
	}
	if res := h.do(http.MethodGet, "/users/uid/123", nil); res.status != http.StatusOK {
		t.Errorf("123 stopped resolving after an unrelated edit: %d", res.status)
	}
}

// The vanity range is 0-9999; 10000 and above belong to real accounts, so
// granting one as an alias would collide with the permanent numbering.
func TestSpecialUIDOutsideTheVanityRangeIsRejected(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")

	token := h.registerAndLogin("subject", "subject@example.com", "hunter2hunter2")
	id := idOf(t, h, token)

	for _, bad := range []int{10000, 10001, -1, 99999} {
		res := h.do(http.MethodPatch, "/users/"+id, map[string]any{"specialUid": bad}, withBearer(adminToken))
		if res.status != http.StatusUnprocessableEntity {
			t.Errorf("specialUid %d = %d, want 422: %s", bad, res.status, res.body)
		}
	}

	// 0 and 9999 are the inclusive bounds and must be accepted.
	for _, ok := range []int{0, 9999} {
		res := h.do(http.MethodPatch, "/users/"+id, map[string]any{"specialUid": ok}, withBearer(adminToken))
		if res.status != http.StatusOK {
			t.Errorf("specialUid %d = %d, want 200: %s", ok, res.status, res.body)
		}
	}
}

// A deactivated account must not be publicly resolvable, and must not be
// distinguishable from a number nobody holds.
func TestPublicLookupHidesDeactivatedAccounts(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")

	token := h.registerAndLogin("leaver", "leaver@example.com", "hunter2hunter2")
	uid, _ := uidOf(t, h, token)
	id := idOf(t, h, token)

	if res := h.do(http.MethodGet, "/users/uid/"+strconv.FormatInt(uid, 10), nil); res.status != http.StatusOK {
		t.Fatalf("lookup while active = %d: %s", res.status, res.body)
	}

	if res := h.do(http.MethodPatch, "/users/"+id, map[string]any{"isActive": false}, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("deactivate = %d: %s", res.status, res.body)
	}

	deactivated := h.do(http.MethodGet, "/users/uid/"+strconv.FormatInt(uid, 10), nil)
	if deactivated.status != http.StatusNotFound {
		t.Fatalf("lookup after deactivation = %d, want 404: %s", deactivated.status, deactivated.body)
	}

	// Indistinguishable from a number that was never issued: same status, same
	// code, same message.
	never := h.do(http.MethodGet, "/users/uid/987654", nil)
	if never.status != deactivated.status || never.errorCode(t) != deactivated.errorCode(t) {
		t.Errorf("a deactivated account is distinguishable from an unissued number: %d/%s vs %d/%s",
			deactivated.status, deactivated.errorCode(t), never.status, never.errorCode(t))
	}
	if string(never.body) != string(deactivated.body) {
		t.Errorf("response bodies differ:\n deactivated: %s\n unissued:    %s", deactivated.body, never.body)
	}
}

// The uid is assigned by the database and writable by nobody. Whether the
// request is refused or the field ignored, the number must not move.
func TestNobodyCanChooseTheirOwnUID(t *testing.T) {
	h := newHarness(t)
	adminToken := promoteToAdmin(t, h, "admin", "admin@example.com")

	token := h.registerAndLogin("subject", "subject@example.com", "hunter2hunter2")
	before, _ := uidOf(t, h, token)
	id := idOf(t, h, token)

	// Through the self-service route, the administrative route, and at
	// registration.
	h.do(http.MethodPatch, "/users/me", map[string]any{"uid": 12}, withBearer(token))
	h.do(http.MethodPatch, "/users/"+id, map[string]any{"uid": 12}, withBearer(adminToken))
	h.do(http.MethodPost, "/auth/register?altcha="+h.solveAltcha(), map[string]any{
		"name": "chooser", "email": "chooser@example.com", "password": "hunter2hunter2", "uid": 5,
	})

	if after, _ := uidOf(t, h, token); after != before {
		t.Errorf("uid changed from %d to %d", before, after)
	}
	if res := h.do(http.MethodGet, "/users/uid/12", nil); res.status != http.StatusNotFound {
		t.Errorf("uid 12 resolves, so a caller placed an account below the floor: %d", res.status)
	}
	if res := h.do(http.MethodGet, "/users/uid/5", nil); res.status != http.StatusNotFound {
		t.Errorf("uid 5 resolves, so registration accepted a caller-supplied uid: %d", res.status)
	}
}

// Numbers are handed out in ascending order, and a rejected registration still
// consumes one — a gap is the mechanism by which nothing is reused.
func TestUIDsAreIssuedInAscendingOrder(t *testing.T) {
	h := newHarness(t)

	var previous int64
	for i, name := range []string{"a", "b", "c"} {
		token := h.registerAndLogin(name, name+"@example.com", "hunter2hunter2")
		uid, _ := uidOf(t, h, token)
		if uid < 10000 {
			t.Fatalf("%s got uid %d, below the 10000 floor", name, uid)
		}
		if i > 0 && uid <= previous {
			t.Errorf("%s got uid %d, which does not follow %d", name, uid, previous)
		}
		previous = uid
	}
}
