package gmzz_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/arkive-games/arkive/backend-go/internal/core"
	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/gmzz"
	"github.com/arkive-games/arkive/backend-go/internal/module"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
	"github.com/arkive-games/arkive/backend-go/internal/platform/db"
)

// Database-backed, like core's suite: set ARKIVE_TEST_POSTGRES_URL to a
// throwaway database. These tests drop the core and gmzz schemas.
const dsnEnv = "ARKIVE_TEST_POSTGRES_URL"

const base = "/api/v1/gmzz"

type harness struct {
	t      *testing.T
	router chi.Router
	pool   *pgxpool.Pool
	tokens *auth.Tokens
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	dsn := os.Getenv(dsnEnv)
	if dsn == "" {
		t.Skipf("%s is not set; skipping database-backed tests", dsnEnv)
	}
	cfg := config.Config{
		Debug:    true,
		Server:   config.Server{APIPrefix: "/api/v1"},
		Postgres: config.Postgres{URL: dsn, MaxConns: 10},
		Auth: config.Auth{
			JWTSecret:     "integration-test-secret",
			JWTAudience:   "arkive:auth",
			TokenLifetime: time.Hour,
			CookieName:    "arkive_auth",
		},
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, cfg.Postgres)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	var accounts int
	_ = pool.QueryRow(ctx, `SELECT CASE WHEN to_regclass('core.users') IS NULL THEN 0 ELSE 1 END`).Scan(&accounts)
	if accounts == 1 {
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM core.users`).Scan(&accounts); err != nil {
			t.Fatalf("count accounts: %v", err)
		}
		if accounts > 50 {
			t.Fatalf("refusing to run: core.users holds %d accounts, which looks like real data", accounts)
		}
	}
	for _, schema := range []string{"gmzz", "core"} {
		if _, err := pool.Exec(ctx, "DROP SCHEMA IF EXISTS "+schema+" CASCADE"); err != nil {
			t.Fatalf("reset %s: %v", schema, err)
		}
	}

	// Dropped again afterwards: core's suite shares the database and asserts that
	// nothing but core holds a goose version table, which ours would be.
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), "DROP SCHEMA IF EXISTS gmzz CASCADE")
	})

	coreMod, gmzzMod := core.New(), gmzz.New()
	for _, m := range []module.Module{coreMod, gmzzMod} {
		if err := db.Migrate(ctx, pool, m.Schema(), m.Migrations()); err != nil {
			t.Fatalf("migrate %s: %v", m.Name(), err)
		}
	}

	api.InstallErrorModel()
	deps := module.Deps{Config: cfg, Pool: pool, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	router := chi.NewRouter()
	var mountErr error
	router.Route("/api/v1/gmzz", func(sub chi.Router) { mountErr = gmzzMod.Mount(sub, deps) })
	if mountErr != nil {
		t.Fatalf("mount: %v", mountErr)
	}
	return &harness{t: t, router: router, pool: pool, tokens: auth.NewTokens(cfg.Auth)}
}

// user creates an account directly and returns a bearer token for it. The
// sign-in flow is core's to test; here only the identity it yields matters.
func (h *harness) user(name string) string {
	h.t.Helper()
	id := uuid.New()
	hash := "argon2-placeholder-" + name
	if _, err := coredb.New(h.pool).CreateUser(context.Background(), coredb.CreateUserParams{
		ID: id, Name: name, Email: name + "@example.test", HashedPassword: hash, IsActive: true, IsVerified: true,
	}); err != nil {
		h.t.Fatalf("create user: %v", err)
	}
	token, _, err := h.tokens.IssueAccess(id, h.tokens.SessionFingerprint(hash))
	if err != nil {
		h.t.Fatalf("issue token: %v", err)
	}
	return token
}

type reply struct {
	status int
	body   map[string]any
}

func (r reply) data() map[string]any {
	d, _ := r.body["data"].(map[string]any)
	return d
}

func (r reply) code() string {
	c, _ := r.body["errorCode"].(string)
	return c
}

func (h *harness) do(method, path, token string, body any) reply {
	h.t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			h.t.Fatalf("marshal: %v", err)
		}
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, base+path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	out := reply{status: rec.Code}
	_ = json.Unmarshal(rec.Body.Bytes(), &out.body)
	return out
}

func sampleData() map[string]any {
	return map[string]any{
		"schemaVersion": 1,
		"character":     map[string]any{"roleLevel": 70, "divinityLevel": 2, "professionId": 3},
		"futureSection": map[string]any{"kept": true},
	}
}

func (h *harness) create(token, name string) map[string]any {
	h.t.Helper()
	r := h.do(http.MethodPost, "/characters", token, map[string]any{
		"name": name, "server": "S1", "uid": "123456", "data": sampleData(),
	})
	if r.status != http.StatusCreated {
		h.t.Fatalf("create %s: %d %v", name, r.status, r.body)
	}
	return r.data()
}

func TestCreateReadAndShareByLink(t *testing.T) {
	h := newHarness(t)
	alice, bob := h.user("alice"), h.user("bob")

	c := h.create(alice, "  Klein  ")
	id := c["id"].(string)
	if len(id) != 10 || c["name"] != "Klein" || c["visibility"] != "link" || c["editable"] != true {
		t.Fatalf("unexpected created character: %v", c)
	}
	if c["revision"].(float64) != 1 || c["schemaVersion"].(float64) != 1 {
		t.Fatalf("revision/schemaVersion: %v", c)
	}

	// Unknown sections round-trip untouched: the frontend owns the document.
	own := h.do(http.MethodGet, "/characters/"+id, alice, nil).data()
	if own["data"].(map[string]any)["futureSection"].(map[string]any)["kept"] != true {
		t.Fatalf("unknown section lost: %v", own["data"])
	}
	if own["uid"] != "123456" {
		t.Fatalf("owner should see uid: %v", own)
	}

	for _, token := range []string{"", bob} {
		r := h.do(http.MethodGet, "/characters/"+id, token, nil)
		if r.status != http.StatusOK || r.data()["editable"] != false {
			t.Fatalf("link read by %q: %d %v", token, r.status, r.body)
		}
		if _, present := r.data()["uid"]; present {
			t.Fatalf("uid leaked to a non-owner: %v", r.data())
		}
	}

	// Showing the uid is the owner's choice.
	if r := h.do(http.MethodPatch, "/characters/"+id, alice, map[string]any{"revision": 1, "showUid": true}); r.status != http.StatusOK {
		t.Fatalf("show uid: %d %v", r.status, r.body)
	}
	if r := h.do(http.MethodGet, "/characters/"+id, "", nil); r.data()["uid"] != "123456" {
		t.Fatalf("uid should now be shown: %v", r.data())
	}
}

func TestPrivateIsNotFoundForOthers(t *testing.T) {
	h := newHarness(t)
	alice, bob := h.user("alice"), h.user("bob")
	id := h.create(alice, "Klein")["id"].(string)

	if r := h.do(http.MethodPatch, "/characters/"+id, alice, map[string]any{"revision": 1, "visibility": "private"}); r.status != http.StatusOK {
		t.Fatalf("make private: %d %v", r.status, r.body)
	}
	if r := h.do(http.MethodGet, "/characters/"+id, alice, nil); r.status != http.StatusOK {
		t.Fatalf("owner read of private: %d", r.status)
	}
	missing := h.do(http.MethodGet, "/characters/ZZZZZZZZZZ", bob, nil)
	for _, token := range []string{"", bob} {
		r := h.do(http.MethodGet, "/characters/"+id, token, nil)
		if r.status != http.StatusNotFound || r.code() != missing.code() {
			t.Fatalf("private read by %q: %d %v (missing gives %d %v)", token, r.status, r.body, missing.status, missing.body)
		}
	}
	if r := h.do(http.MethodPost, "/characters/"+id+"/copy", bob, nil); r.status != http.StatusNotFound {
		t.Fatalf("copy of another's private: %d", r.status)
	}
	if r := h.do(http.MethodPatch, "/characters/"+id, bob, map[string]any{"revision": 2, "name": "x"}); r.status != http.StatusNotFound {
		t.Fatalf("patch by non-owner: %d", r.status)
	}
	if r := h.do(http.MethodDelete, "/characters/"+id, bob, nil); r.status != http.StatusNotFound {
		t.Fatalf("delete by non-owner: %d", r.status)
	}
}

func TestRevisionConflict(t *testing.T) {
	h := newHarness(t)
	alice := h.user("alice")
	id := h.create(alice, "Klein")["id"].(string)

	data := sampleData()
	data["schemaVersion"] = 2
	r := h.do(http.MethodPatch, "/characters/"+id, alice, map[string]any{"revision": 1, "data": data})
	if r.status != http.StatusOK || r.data()["revision"].(float64) != 2 || r.data()["schemaVersion"].(float64) != 2 {
		t.Fatalf("first write: %d %v", r.status, r.body)
	}
	stale := h.do(http.MethodPatch, "/characters/"+id, alice, map[string]any{"revision": 1, "name": "Late"})
	if stale.status != http.StatusConflict || stale.code() != "CharacterRevisionConflictError" {
		t.Fatalf("stale write: %d %v", stale.status, stale.body)
	}
	if got := h.do(http.MethodGet, "/characters/"+id, alice, nil).data()["name"]; got != "Klein" {
		t.Fatalf("stale write applied: %v", got)
	}
}

func TestConcurrentWritesOneWins(t *testing.T) {
	h := newHarness(t)
	alice := h.user("alice")
	id := h.create(alice, "Klein")["id"].(string)

	var wg sync.WaitGroup
	statuses := make([]int, 8)
	for i := range statuses {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			statuses[i] = h.do(http.MethodPatch, "/characters/"+id, alice, map[string]any{"revision": 1, "name": fmt.Sprintf("n%d", i)}).status
		}(i)
	}
	wg.Wait()
	ok := 0
	for _, s := range statuses {
		switch s {
		case http.StatusOK:
			ok++
		case http.StatusConflict:
		default:
			t.Fatalf("unexpected status %d", s)
		}
	}
	if ok != 1 {
		t.Fatalf("%d writes against one revision succeeded, want 1 (%v)", ok, statuses)
	}
}

func TestLimitOfTenHoldsUnderConcurrency(t *testing.T) {
	h := newHarness(t)
	alice := h.user("alice")

	var wg sync.WaitGroup
	statuses := make([]int, 14)
	for i := range statuses {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			statuses[i] = h.do(http.MethodPost, "/characters", alice, map[string]any{"name": fmt.Sprintf("c%d", i), "data": sampleData()}).status
		}(i)
	}
	wg.Wait()
	created := 0
	for _, s := range statuses {
		if s == http.StatusCreated {
			created++
		} else if s != http.StatusConflict {
			t.Fatalf("unexpected status %d", s)
		}
	}
	if created != 10 {
		t.Fatalf("created %d, want 10", created)
	}
	list := h.do(http.MethodGet, "/characters", alice, nil)
	results, _ := list.body["data"].([]any)
	if len(results) != 10 {
		t.Fatalf("listed %d, want 10", len(results))
	}
	if _, hasData := results[0].(map[string]any)["data"]; hasData {
		t.Fatalf("list should carry metadata only")
	}
	first := results[0].(map[string]any)["id"].(string)
	if r := h.do(http.MethodPost, "/characters/"+first+"/copy", alice, nil); r.status != http.StatusConflict || r.code() != "CharacterLimitReachedError" {
		t.Fatalf("copy at the limit: %d %v", r.status, r.body)
	}
}

func TestCopyAndDelete(t *testing.T) {
	h := newHarness(t)
	alice, bob := h.user("alice"), h.user("bob")
	id := h.create(alice, "Klein")["id"].(string)

	if r := h.do(http.MethodPost, "/characters/"+id+"/copy", "", nil); r.status != http.StatusUnauthorized {
		t.Fatalf("anonymous copy: %d", r.status)
	}

	mine := h.do(http.MethodPost, "/characters/"+id+"/copy", alice, map[string]any{"name": "Klein 2"})
	if mine.status != http.StatusCreated || mine.data()["name"] != "Klein 2" || mine.data()["uid"] != "123456" || mine.data()["id"] == id {
		t.Fatalf("own copy: %d %v", mine.status, mine.body)
	}

	theirs := h.do(http.MethodPost, "/characters/"+id+"/copy", bob, nil)
	d := theirs.data()
	if theirs.status != http.StatusCreated || d["editable"] != true || d["name"] != "Klein" || d["server"] != "S1" {
		t.Fatalf("copy of another's: %d %v", theirs.status, theirs.body)
	}
	if _, present := d["uid"]; present {
		t.Fatalf("another player's uid was copied: %v", d)
	}
	if d["data"].(map[string]any)["futureSection"] == nil {
		t.Fatalf("copy lost the document: %v", d["data"])
	}

	if r := h.do(http.MethodDelete, "/characters/"+id, alice, nil); r.status != http.StatusOK {
		t.Fatalf("delete: %d %v", r.status, r.body)
	}
	if r := h.do(http.MethodGet, "/characters/"+id, alice, nil); r.status != http.StatusNotFound {
		t.Fatalf("read after delete: %d", r.status)
	}
	if r := h.do(http.MethodGet, "/characters/"+d["id"].(string), bob, nil); r.status != http.StatusOK {
		t.Fatalf("the copy should outlive its source: %d", r.status)
	}
}

func TestReorder(t *testing.T) {
	h := newHarness(t)
	alice, bob := h.user("alice"), h.user("bob")
	a := h.create(alice, "A")["id"].(string)
	b := h.create(alice, "B")["id"].(string)
	c := h.create(alice, "C")["id"].(string)
	foreign := h.create(bob, "X")["id"].(string)

	for _, bad := range [][]string{{a, b}, {a, b, b}, {a, b, foreign}, {a, b, c, foreign}} {
		if r := h.do(http.MethodPut, "/characters/order", alice, map[string]any{"ids": bad}); r.status != http.StatusUnprocessableEntity {
			t.Fatalf("order %v: %d %v", bad, r.status, r.body)
		}
	}
	if r := h.do(http.MethodPut, "/characters/order", alice, map[string]any{"ids": []string{c, a, b}}); r.status != http.StatusOK {
		t.Fatalf("order: %d %v", r.status, r.body)
	}
	results := h.do(http.MethodGet, "/characters", alice, nil).body["data"].([]any)
	var names []string
	for _, r := range results {
		names = append(names, r.(map[string]any)["name"].(string))
	}
	if strings.Join(names, "") != "CAB" {
		t.Fatalf("order after reorder: %v", names)
	}
}

func TestValidation(t *testing.T) {
	h := newHarness(t)
	alice := h.user("alice")

	cases := map[string]map[string]any{
		"no schemaVersion":         {"name": "x", "data": map[string]any{"character": map[string]any{}}},
		"fractional schemaVersion": {"name": "x", "data": map[string]any{"schemaVersion": 1.5}},
		"zero schemaVersion":       {"name": "x", "data": map[string]any{"schemaVersion": 0}},
		"blank name":               {"name": "   ", "data": sampleData()},
		"long name":                {"name": strings.Repeat("名", 33), "data": sampleData()},
		"long server":              {"name": "x", "server": strings.Repeat("s", 33), "data": sampleData()},
		"bad visibility":           {"name": "x", "visibility": "public", "data": sampleData()},
	}
	for label, body := range cases {
		if r := h.do(http.MethodPost, "/characters", alice, body); r.status != http.StatusUnprocessableEntity {
			t.Errorf("%s: %d %v", label, r.status, r.body)
		}
	}

	big := sampleData()
	big["padding"] = strings.Repeat("x", 70*1024)
	if r := h.do(http.MethodPost, "/characters", alice, map[string]any{"name": "x", "data": big}); r.status != http.StatusRequestEntityTooLarge {
		t.Errorf("oversized data: %d %v", r.status, r.body)
	}

	if r := h.do(http.MethodGet, "/characters", "", nil); r.status != http.StatusUnauthorized {
		t.Errorf("anonymous list: %d", r.status)
	}

	// A 32-character CJK name is within the limit even though it is 96 bytes.
	if r := h.do(http.MethodPost, "/characters", alice, map[string]any{"name": strings.Repeat("名", 32), "server": "", "data": sampleData()}); r.status != http.StatusCreated {
		t.Errorf("32 CJK characters: %d %v", r.status, r.body)
	} else if _, present := r.data()["server"]; present {
		t.Errorf("blank server should be stored as absent: %v", r.data())
	}
}
