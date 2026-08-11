package core_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/arkive-games/arkive/backend-go/internal/core"
	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/module"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
	"github.com/arkive-games/arkive/backend-go/internal/platform/db"
)

// These tests run against a real PostgreSQL instance, because the queries are
// generated against a real schema and a fake would only prove the fake works.
// Set ARKIVE_TEST_POSTGRES_URL to enable them, for example:
//
//	docker run --rm -d -p 15499:5432 -e POSTGRES_PASSWORD=pass postgres:18
//	ARKIVE_TEST_POSTGRES_URL='postgres://postgres:pass@localhost:15499/postgres?sslmode=disable' go test ./...
const dsnEnv = "ARKIVE_TEST_POSTGRES_URL"

const apiPrefix = "/api/v1"

// captureMailer records the tokens a flow issues instead of sending mail, so
// the reset and verification journeys can be driven end to end.
type captureMailer struct {
	mu      sync.Mutex
	resets  map[string]string
	verifie map[string]string
}

func newCaptureMailer() *captureMailer {
	return &captureMailer{resets: map[string]string{}, verifie: map[string]string{}}
}

func (m *captureMailer) SendPasswordReset(_ context.Context, email, _, token string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resets[email] = token
	return nil
}

func (m *captureMailer) SendVerification(_ context.Context, email, _, token string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.verifie[email] = token
	return nil
}

func (m *captureMailer) reset(email string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.resets[email]
}

func (m *captureMailer) verification(email string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.verifie[email]
}

type harness struct {
	t      *testing.T
	router chi.Router
	mailer *captureMailer
	pool   *pgxpool.Pool
	mod    *core.Module

	// blobs is the object storage the module was mounted with. Avatar tests
	// assert against it; every other test simply ignores it.
	blobs blob.Store
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	return newHarnessWith(t, nil, nil)
}

// newHarnessWithMailer substitutes the mail transport, e.g. one that always
// fails. Options are applied after the defaults, and WithMailer simply assigns,
// so the later one wins over the capture mailer.
func newHarnessWithMailer(t *testing.T, override auth.Mailer) *harness {
	return newHarnessWith(t, nil, nil, core.WithMailer(override))
}

// newHarnessWith builds a harness with configuration or storage overridden.
//
// tweak runs after the defaults are assembled, so a test can lower a limit it
// wants to reach; store replaces the in-memory object storage, which is how the
// MinIO-backed test reuses this whole suite against a real server. extra is
// variadic so a caller can add a module option without every existing call site
// growing an argument.
func newHarnessWith(t *testing.T, tweak func(*config.Config), store blob.Store, extra ...core.Option) *harness {
	t.Helper()

	dsn := os.Getenv(dsnEnv)
	if dsn == "" {
		t.Skipf("%s is not set; skipping database-backed tests", dsnEnv)
	}

	cfg := config.Config{
		Debug:    true,
		Server:   config.Server{APIPrefix: apiPrefix},
		Postgres: config.Postgres{URL: dsn, MaxConns: 5},
		Auth: config.Auth{
			JWTSecret:           "integration-test-secret",
			JWTAudience:         "arkive:auth",
			TokenLifetime:       time.Hour,
			ResetTokenLifetime:  time.Hour,
			VerifyTokenLifetime: time.Hour,
			CookieName:          "arkive_auth",
			CookiePath:          "/",
			CookieSecure:        false,
			CookieSameSite:      "lax",
			AltchaHMACKey:       "integration-test-altcha-key",
			// Kept small so the tests can brute-force a solution quickly.
			AltchaMaxNumber:   200,
			RegisterPerMinute: 1000,
			// Deliberately weak: these tests hash many passwords, and the
			// parameters are exercised properly by the unit tests.
			Argon2Memory:      8192,
			Argon2Iterations:  1,
			Argon2Parallelism: 1,
			Argon2SaltLength:  16,
			Argon2KeyLength:   32,
		},
		S3: config.S3{
			Bucket: "arkive-test",
			// High enough that the ordinary tests never trip it; the test that
			// exercises throttling lowers it deliberately.
			AvatarUploadsPerMinute: 1000,
		},
	}
	if tweak != nil {
		tweak(&cfg)
	}

	ctx := context.Background()
	pool, err := db.Open(ctx, cfg.Postgres)
	if err != nil {
		t.Fatalf("connect to test database: %v", err)
	}
	t.Cleanup(pool.Close)

	// These tests destroy the schema, and the DSN comes from the environment,
	// so a mistyped variable could point them at a database holding real
	// accounts — imported production data lives on a neighbouring port. Refuse
	// rather than trust the operator to have read the comment above.
	guardAgainstRealData(t, ctx, pool)

	// Each run starts from an empty schema so tests never inherit rows from a
	// previous run.
	if _, err := pool.Exec(ctx, "DROP SCHEMA IF EXISTS core CASCADE"); err != nil {
		t.Fatalf("reset schema: %v", err)
	}

	mailer := newCaptureMailer()
	if store == nil {
		store = blob.NewMemory()
	}
	opts := append([]core.Option{core.WithMailer(mailer), core.WithBlobStore(store)}, extra...)
	mod := core.New(opts...)

	if err := db.Migrate(ctx, pool, mod.Schema(), mod.Migrations()); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	api.InstallErrorModel()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	router := chi.NewRouter()
	var mountErr error
	router.Route(apiPrefix, func(root chi.Router) {
		root.Route("/"+mod.Name(), func(sub chi.Router) {
			mountErr = mod.Mount(sub, module.Deps{Config: cfg, Pool: pool, Logger: logger})
		})
	})
	if mountErr != nil {
		t.Fatalf("mount core module: %v", mountErr)
	}

	return &harness{t: t, router: router, mailer: mailer, pool: pool, mod: mod, blobs: store}
}

// maxPreexistingAccounts is the largest core.users population these tests will
// destroy. A handful of rows is a leftover run; thousands is somebody's data.
const maxPreexistingAccounts = 50

func guardAgainstRealData(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()

	// Existence and population are two queries on purpose: Postgres plans a
	// subquery regardless of which CASE branch would select it, so folding
	// these together errors out on a database where the table is absent.
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('core.users') IS NOT NULL`).Scan(&exists); err != nil {
		t.Fatalf("inspect target database before wiping it: %v", err)
	}
	if !exists {
		return
	}

	var accounts int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM core.users`).Scan(&accounts); err != nil {
		t.Fatalf("count existing accounts before wiping them: %v", err)
	}
	if accounts > maxPreexistingAccounts {
		t.Fatalf("refusing to run: core.users already holds %d accounts, which looks like real data.\n"+
			"These tests DROP SCHEMA core. Point %s at a throwaway database.", accounts, dsnEnv)
	}
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

type response struct {
	status int
	body   []byte
	header http.Header
}

func (r response) envelope(t *testing.T) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(r.body, &out); err != nil {
		t.Fatalf("response is not JSON (%d): %s", r.status, r.body)
	}
	return out
}

func (r response) errorCode(t *testing.T) string {
	t.Helper()
	code, _ := r.envelope(t)["errorCode"].(string)
	return code
}

func (r response) data(t *testing.T) map[string]any {
	t.Helper()
	data, ok := r.envelope(t)["data"].(map[string]any)
	if !ok {
		t.Fatalf("response carries no data object (%d): %s", r.status, r.body)
	}
	return data
}

type requestOption func(*http.Request)

func withBearer(token string) requestOption {
	return func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+token) }
}

func withCookie(c *http.Cookie) requestOption {
	return func(r *http.Request) { r.AddCookie(c) }
}

func (h *harness) do(method, path string, body any, opts ...requestOption) response {
	h.t.Helper()

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			h.t.Fatalf("marshal request body: %v", err)
		}
		reader = bytes.NewReader(raw)
	}

	req := httptest.NewRequest(method, apiPrefix+"/core"+path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, opt := range opts {
		opt(req)
	}

	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return response{status: rec.Code, body: rec.Body.Bytes(), header: rec.Result().Header}
}

// doRaw sends a body verbatim under a caller-chosen content type, which is what
// a multipart upload needs; do marshals JSON and cannot express one.
func (h *harness) doRaw(method, path string, body []byte, contentType string, opts ...requestOption) response {
	h.t.Helper()

	req := httptest.NewRequest(method, apiPrefix+"/core"+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", contentType)
	for _, opt := range opts {
		opt(req)
	}

	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return response{status: rec.Code, body: rec.Body.Bytes(), header: rec.Result().Header}
}

// solveAltcha fetches a challenge and brute-forces it, exactly as a browser
// client does.
func (h *harness) solveAltcha() string {
	h.t.Helper()

	res := h.do(http.MethodGet, "/auth/altcha", nil)
	if res.status != http.StatusOK {
		h.t.Fatalf("GET /auth/altcha = %d: %s", res.status, res.body)
	}
	challenge := res.data(h.t)

	salt, _ := challenge["salt"].(string)
	want, _ := challenge["challenge"].(string)
	signature, _ := challenge["signature"].(string)
	algorithm, _ := challenge["algorithm"].(string)
	maxNumber, _ := challenge["maxNumber"].(float64)

	for n := 0; n <= int(maxNumber); n++ {
		sum := sha256.Sum256([]byte(salt + strconv.Itoa(n)))
		if hex.EncodeToString(sum[:]) == want {
			payload, err := json.Marshal(map[string]any{
				"algorithm": algorithm,
				"challenge": want,
				"number":    n,
				"salt":      salt,
				"signature": signature,
			})
			if err != nil {
				h.t.Fatalf("marshal altcha solution: %v", err)
			}
			return base64.StdEncoding.EncodeToString(payload)
		}
	}
	h.t.Fatal("could not solve the altcha challenge within maxNumber")
	return ""
}

// forgotPassword requests a reset, solving the proof-of-work gate first.
func (h *harness) forgotPassword(email string) response {
	h.t.Helper()
	return h.do(http.MethodPost, "/auth/forgot-password?altcha="+h.solveAltcha(),
		map[string]string{"email": email})
}

// register creates an account through the public endpoint.
func (h *harness) register(name, email, password string) response {
	h.t.Helper()
	return h.do(http.MethodPost, "/auth/register?altcha="+h.solveAltcha(), map[string]string{
		"name": name, "email": email, "password": password,
	})
}

// login returns a bearer token.
func (h *harness) login(email, password string) string {
	h.t.Helper()
	res := h.do(http.MethodPost, "/auth/jwt/login", map[string]string{
		"email": email, "password": password,
	})
	if res.status != http.StatusOK {
		h.t.Fatalf("login failed (%d): %s", res.status, res.body)
	}
	var body struct {
		AccessToken string `json:"accessToken"`
	}
	if err := json.Unmarshal(res.body, &body); err != nil {
		h.t.Fatalf("decode token response: %v", err)
	}
	return body.AccessToken
}

// registerAndLogin is the common setup for tests that need an authenticated caller.
func (h *harness) registerAndLogin(name, email, password string) string {
	h.t.Helper()
	if res := h.register(name, email, password); res.status != http.StatusCreated {
		h.t.Fatalf("register failed (%d): %s", res.status, res.body)
	}
	return h.login(email, password)
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

func TestRegisterRequiresAnAltchaSolution(t *testing.T) {
	h := newHarness(t)

	res := h.do(http.MethodPost, "/auth/register", map[string]string{
		"name": "nobody", "email": "nobody@example.com", "password": "hunter2hunter2",
	})
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", res.status, res.body)
	}
}

func TestRegisterRejectsAForgedAltchaSolution(t *testing.T) {
	h := newHarness(t)

	forged := base64.StdEncoding.EncodeToString([]byte(
		`{"algorithm":"SHA-256","challenge":"aa","number":1,"salt":"bb?expires=99999999999","signature":"cc"}`))
	res := h.do(http.MethodPost, "/auth/register?altcha="+forged, map[string]string{
		"name": "nobody", "email": "nobody@example.com", "password": "hunter2hunter2",
	})
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", res.status, res.body)
	}
	if got := res.errorCode(t); got != "AltchaChallengeError" {
		t.Errorf("errorCode = %q, want AltchaChallengeError", got)
	}
}

func TestAltchaSolutionCannotBeReplayed(t *testing.T) {
	h := newHarness(t)

	solution := h.solveAltcha()
	first := h.do(http.MethodPost, "/auth/register?altcha="+solution, map[string]string{
		"name": "first", "email": "first@example.com", "password": "hunter2hunter2",
	})
	if first.status != http.StatusCreated {
		t.Fatalf("first registration failed (%d): %s", first.status, first.body)
	}

	// The same proof of work must not mint a second account, or the gate is
	// worth one puzzle for unlimited registrations.
	second := h.do(http.MethodPost, "/auth/register?altcha="+solution, map[string]string{
		"name": "second", "email": "second@example.com", "password": "hunter2hunter2",
	})
	if second.status != http.StatusUnprocessableEntity {
		t.Fatalf("replayed solution accepted (%d): %s", second.status, second.body)
	}
}

func TestRegisterNeverReturnsThePasswordHash(t *testing.T) {
	h := newHarness(t)

	res := h.register("alice", "alice@example.com", "hunter2hunter2")
	if res.status != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", res.status, res.body)
	}
	if bytes.Contains(bytes.ToLower(res.body), []byte("password")) {
		t.Fatalf("registration response mentions a password field: %s", res.body)
	}

	data := res.data(t)
	for _, field := range []string{"id", "name", "email", "isActive", "isSuperuser", "isVerified"} {
		if _, ok := data[field]; !ok {
			t.Errorf("response is missing %q", field)
		}
	}
	if data["isSuperuser"] != false || data["isVerified"] != false {
		t.Error("a new account must be neither an administrator nor verified")
	}
}

func TestRegisterRejectsDuplicateName(t *testing.T) {
	h := newHarness(t)

	if res := h.register("alice", "alice@example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}
	res := h.register("alice", "other@example.com", "hunter2hunter2")
	if res.status != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", res.status, res.body)
	}
	if got := res.errorCode(t); got != "UserAlreadyExistsError" {
		t.Errorf("errorCode = %q, want UserAlreadyExistsError", got)
	}
}

// The Python schema stored emails case-sensitively and looked them up with
// ILIKE, so "A@x.com" and "a@x.com" could both exist while both matching one
// login. Storing lowercased makes the unique constraint mean what it says.
func TestRegisterRejectsDuplicateEmailRegardlessOfCase(t *testing.T) {
	h := newHarness(t)

	if res := h.register("alice", "alice@example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}
	res := h.register("bob", "ALICE@Example.COM", "hunter2hunter2")
	if res.status != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", res.status, res.body)
	}
	if got := res.errorCode(t); got != "UserEmailAlreadyExistsError" {
		t.Errorf("errorCode = %q, want UserEmailAlreadyExistsError", got)
	}
}

func TestRegisterEnforcesThePasswordPolicy(t *testing.T) {
	h := newHarness(t)

	res := h.do(http.MethodPost, "/auth/register?altcha="+h.solveAltcha(), map[string]string{
		"name": "shorty", "email": "shorty@example.com", "password": "short",
	})
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", res.status, res.body)
	}
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

func TestLoginRejectsWrongPasswordAndUnknownAddressIdentically(t *testing.T) {
	h := newHarness(t)

	if res := h.register("alice", "alice@example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}

	wrongPassword := h.do(http.MethodPost, "/auth/jwt/login", map[string]string{
		"email": "alice@example.com", "password": "not the password",
	})
	unknownUser := h.do(http.MethodPost, "/auth/jwt/login", map[string]string{
		"email": "nobody@example.com", "password": "not the password",
	})

	if wrongPassword.status != http.StatusUnauthorized || unknownUser.status != http.StatusUnauthorized {
		t.Fatalf("statuses = %d and %d, want 401 for both", wrongPassword.status, unknownUser.status)
	}
	// Distinguishable responses would turn the login form into an account
	// enumeration oracle.
	if wrongPassword.errorCode(t) != unknownUser.errorCode(t) {
		t.Errorf("responses differ: %q vs %q", wrongPassword.errorCode(t), unknownUser.errorCode(t))
	}
}

func TestLoginIsCaseInsensitiveOnEmail(t *testing.T) {
	h := newHarness(t)

	if res := h.register("alice", "Alice@Example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}
	if token := h.login("alice@example.com", "hunter2hunter2"); token == "" {
		t.Fatal("expected a token")
	}
}

func TestCurrentUserRequiresAuthentication(t *testing.T) {
	h := newHarness(t)

	res := h.do(http.MethodGet, "/users/me", nil)
	if res.status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401: %s", res.status, res.body)
	}
	if got := res.errorCode(t); got != "UnauthorizedError" {
		t.Errorf("errorCode = %q, want UnauthorizedError", got)
	}
}

func TestBearerTokenAuthenticates(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")

	res := h.do(http.MethodGet, "/users/me", nil, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", res.status, res.body)
	}
	if got := res.data(t)["email"]; got != "alice@example.com" {
		t.Errorf("email = %v, want alice@example.com", got)
	}
}

func TestGarbageBearerTokenIsAnonymousNotAnError(t *testing.T) {
	h := newHarness(t)

	res := h.do(http.MethodGet, "/users/me", nil, withBearer("not-a-real-token"))
	if res.status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401: %s", res.status, res.body)
	}
}

func TestCookieLoginIssuesAnHttpOnlyCookieThatAuthenticates(t *testing.T) {
	h := newHarness(t)

	if res := h.register("alice", "alice@example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}

	res := h.do(http.MethodPost, "/auth/cookie/login", map[string]string{
		"email": "alice@example.com", "password": "hunter2hunter2",
	})
	if res.status != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", res.status, res.body)
	}

	cookies := (&http.Response{Header: res.header}).Cookies()
	if len(cookies) != 1 {
		t.Fatalf("want exactly one cookie, got %d", len(cookies))
	}
	session := cookies[0]
	if !session.HttpOnly {
		t.Error("the session cookie is the credential and must be HttpOnly")
	}
	if session.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite = %v, want Lax", session.SameSite)
	}
	if session.Value == "" {
		t.Fatal("the session cookie carries no token")
	}

	me := h.do(http.MethodGet, "/users/me", nil, withCookie(session))
	if me.status != http.StatusOK {
		t.Fatalf("cookie did not authenticate (%d): %s", me.status, me.body)
	}
}

func TestCookieLogoutClearsTheCookie(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")

	res := h.do(http.MethodPost, "/auth/cookie/logout", nil, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", res.status, res.body)
	}
	cookies := (&http.Response{Header: res.header}).Cookies()
	if len(cookies) != 1 || cookies[0].MaxAge >= 0 {
		t.Fatalf("logout must expire the cookie, got %+v", cookies)
	}
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

// A user editing their own profile must not be able to grant themselves the
// administrator role by adding a field to the request body.
func TestUserCannotPromoteThemselvesViaProfileUpdate(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")

	res := h.do(http.MethodPatch, "/users/me", map[string]any{
		"name": "alice renamed", "isSuperuser": true, "isVerified": true,
	}, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", res.status, res.body)
	}

	data := res.data(t)
	if data["name"] != "alice renamed" {
		t.Errorf("name = %v, want the update to have applied", data["name"])
	}
	if data["isSuperuser"] == true {
		t.Fatal("privilege escalation: isSuperuser was honoured on /users/me")
	}
	if data["isVerified"] == true {
		t.Fatal("privilege escalation: isVerified was honoured on /users/me")
	}
}

func TestChangingEmailWithdrawsVerification(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")

	// Verify the original address through the real flow.
	if res := h.do(http.MethodPost, "/auth/request-verify-token", map[string]string{
		"email": "alice@example.com",
	}, withBearer(token)); res.status != http.StatusAccepted {
		t.Fatalf("request-verify-token = %d: %s", res.status, res.body)
	}
	verifyToken := h.mailer.verification("alice@example.com")
	if verifyToken == "" {
		t.Fatal("no verification token was issued")
	}
	if res := h.do(http.MethodPost, "/auth/verify", map[string]string{"token": verifyToken}); res.status != http.StatusOK {
		t.Fatalf("verify = %d: %s", res.status, res.body)
	}

	// Changing the address must withdraw that verification, or an unproven
	// address inherits the previous one's status.
	res := h.do(http.MethodPatch, "/users/me", map[string]any{"email": "alice2@example.com"}, withBearer(token))
	if res.status != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", res.status, res.body)
	}
	data := res.data(t)
	if data["email"] != "alice2@example.com" {
		t.Errorf("email = %v, want alice2@example.com", data["email"])
	}
	if data["isVerified"] != false {
		t.Fatal("changing the email address must clear the verified flag")
	}
}

func TestSearchRequiresAnAdministrator(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")

	anon := h.do(http.MethodGet, "/users/search", nil)
	if anon.status != http.StatusUnauthorized {
		t.Errorf("anonymous search = %d, want 401", anon.status)
	}

	res := h.do(http.MethodGet, "/users/search", nil, withBearer(token))
	if res.status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403: %s", res.status, res.body)
	}
	if got := res.errorCode(t); got != "PermissionError" {
		t.Errorf("errorCode = %q, want PermissionError", got)
	}
}

// The Python endpoint was guarded by get_current_superuser and then refused if
// any superuser existed, so it could never succeed. Requiring only an
// authenticated caller restores the bootstrap it was meant to be.
func TestBecomeSuperuserPromotesOnlyTheFirstClaimant(t *testing.T) {
	h := newHarness(t)
	aliceToken := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")
	bobToken := h.registerAndLogin("bob", "bob@example.com", "hunter2hunter2")

	first := h.do(http.MethodPost, "/users/become-superuser", nil, withBearer(aliceToken))
	if first.status != http.StatusOK {
		t.Fatalf("first claim = %d, want 200: %s", first.status, first.body)
	}
	if first.data(t)["isSuperuser"] != true {
		t.Fatal("the first claimant should have been promoted")
	}

	second := h.do(http.MethodPost, "/users/become-superuser", nil, withBearer(bobToken))
	if second.status != http.StatusForbidden {
		t.Fatalf("second claim = %d, want 403: %s", second.status, second.body)
	}
}

func TestAdministratorCanSearchGetUpdateAndDelete(t *testing.T) {
	h := newHarness(t)
	adminToken := h.registerAndLogin("admin", "admin@example.com", "hunter2hunter2")
	if res := h.do(http.MethodPost, "/users/become-superuser", nil, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("promote = %d: %s", res.status, res.body)
	}
	victimToken := h.registerAndLogin("victim", "victim@example.com", "hunter2hunter2")

	me := h.do(http.MethodGet, "/users/me", nil, withBearer(victimToken))
	victimID, _ := me.data(t)["id"].(string)
	if victimID == "" {
		t.Fatal("could not determine the target account id")
	}

	search := h.do(http.MethodGet, "/users/search?name=vic", nil, withBearer(adminToken))
	if search.status != http.StatusOK {
		t.Fatalf("search = %d: %s", search.status, search.body)
	}
	data := search.data(t)
	if count, _ := data["count"].(float64); count != 1 {
		t.Errorf("count = %v, want 1: %s", data["count"], search.body)
	}

	get := h.do(http.MethodGet, "/users/"+victimID, nil, withBearer(adminToken))
	if get.status != http.StatusOK {
		t.Fatalf("get = %d: %s", get.status, get.body)
	}

	// Unlike /users/me, this route honours the privileged flags.
	patch := h.do(http.MethodPatch, "/users/"+victimID, map[string]any{"isVerified": true}, withBearer(adminToken))
	if patch.status != http.StatusOK {
		t.Fatalf("patch = %d: %s", patch.status, patch.body)
	}
	if patch.data(t)["isVerified"] != true {
		t.Error("an administrator should be able to set isVerified")
	}

	del := h.do(http.MethodDelete, "/users/"+victimID, nil, withBearer(adminToken))
	if del.status != http.StatusOK {
		t.Fatalf("delete = %d: %s", del.status, del.body)
	}
	if again := h.do(http.MethodGet, "/users/"+victimID, nil, withBearer(adminToken)); again.status != http.StatusNotFound {
		t.Errorf("get after delete = %d, want 404", again.status)
	}
}

func TestSearchDoesNotLeakPasswordHashes(t *testing.T) {
	h := newHarness(t)
	adminToken := h.registerAndLogin("admin", "admin@example.com", "hunter2hunter2")
	if res := h.do(http.MethodPost, "/users/become-superuser", nil, withBearer(adminToken)); res.status != http.StatusOK {
		t.Fatalf("promote = %d: %s", res.status, res.body)
	}

	res := h.do(http.MethodGet, "/users/search", nil, withBearer(adminToken))
	if res.status != http.StatusOK {
		t.Fatalf("search = %d: %s", res.status, res.body)
	}
	if strings.Contains(string(res.body), "argon2") || strings.Contains(strings.ToLower(string(res.body)), "hashed") {
		t.Fatalf("search response leaks password material: %s", res.body)
	}
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

func TestForgotPasswordDoesNotDiscloseWhetherAnAccountExists(t *testing.T) {
	h := newHarness(t)
	if res := h.register("alice", "alice@example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}

	known := h.forgotPassword("alice@example.com")
	unknown := h.forgotPassword("nobody@example.com")

	if known.status != http.StatusAccepted || unknown.status != http.StatusAccepted {
		t.Fatalf("statuses = %d and %d, want 202 for both", known.status, unknown.status)
	}
	if !bytes.Equal(known.body, unknown.body) {
		t.Errorf("responses differ:\n known:   %s\n unknown: %s", known.body, unknown.body)
	}
	if h.mailer.reset("nobody@example.com") != "" {
		t.Error("a token was issued for an address that is not registered")
	}
}

func TestPasswordResetLinkWorksOnceAndInvalidatesTheOldPassword(t *testing.T) {
	h := newHarness(t)
	if res := h.register("alice", "alice@example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}

	if res := h.forgotPassword("alice@example.com"); res.status != http.StatusAccepted {
		t.Fatalf("forgot-password = %d: %s", res.status, res.body)
	}
	token := h.mailer.reset("alice@example.com")
	if token == "" {
		t.Fatal("no reset token was issued")
	}

	if res := h.do(http.MethodPost, "/auth/reset-password", map[string]string{
		"token": token, "password": "brand new password",
	}); res.status != http.StatusOK {
		t.Fatalf("reset = %d: %s", res.status, res.body)
	}

	// The new password works and the old one does not.
	if got := h.login("alice@example.com", "brand new password"); got == "" {
		t.Fatal("the new password does not work")
	}
	stale := h.do(http.MethodPost, "/auth/jwt/login", map[string]string{
		"email": "alice@example.com", "password": "hunter2hunter2",
	})
	if stale.status != http.StatusUnauthorized {
		t.Errorf("the old password still works (%d)", stale.status)
	}

	// The link is bound to the password it was issued against, so replaying it
	// must fail now that the password has changed.
	replay := h.do(http.MethodPost, "/auth/reset-password", map[string]string{
		"token": token, "password": "a third password",
	})
	if replay.status != http.StatusUnauthorized {
		t.Fatalf("reset link was reusable (%d): %s", replay.status, replay.body)
	}
}

func TestVerificationTokenCannotVerifyADifferentAddress(t *testing.T) {
	h := newHarness(t)
	token := h.registerAndLogin("alice", "alice@example.com", "hunter2hunter2")

	if res := h.do(http.MethodPost, "/auth/request-verify-token", map[string]string{
		"email": "alice@example.com",
	}); res.status != http.StatusAccepted {
		t.Fatalf("request-verify-token = %d: %s", res.status, res.body)
	}
	verifyToken := h.mailer.verification("alice@example.com")
	if verifyToken == "" {
		t.Fatal("no verification token was issued")
	}

	// Move the address before redeeming the link.
	if res := h.do(http.MethodPatch, "/users/me", map[string]any{
		"email": "moved@example.com",
	}, withBearer(token)); res.status != http.StatusOK {
		t.Fatalf("email change = %d: %s", res.status, res.body)
	}

	res := h.do(http.MethodPost, "/auth/verify", map[string]string{"token": verifyToken})
	if res.status != http.StatusUnauthorized {
		t.Fatalf("a link for a previous address verified the new one (%d): %s", res.status, res.body)
	}
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

// A down migration that is a stub is worse than none: it makes a rollback look
// available when it would silently leave the schema behind.
func TestMigrationsRollBackCleanly(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	if err := db.MigrateDown(ctx, h.pool, h.mod.Schema(), h.mod.Migrations(), 0); err != nil {
		t.Fatalf("roll back: %v", err)
	}

	var exists bool
	if err := h.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'core' AND table_name = 'users'
		)`).Scan(&exists); err != nil {
		t.Fatalf("inspect schema: %v", err)
	}
	if exists {
		t.Fatal("core.users survived a full rollback")
	}

	// And the stream must be replayable afterwards.
	if err := db.Migrate(ctx, h.pool, h.mod.Schema(), h.mod.Migrations()); err != nil {
		t.Fatalf("re-apply: %v", err)
	}
}

func TestModuleOwnsOnlyItsOwnSchema(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	// The isolation the whole topology rests on: the core stream must create
	// nothing outside its own schema, or splitting the service later stops
	// being a deployment change.
	rows, err := h.pool.Query(ctx, `
		SELECT table_schema, table_name FROM information_schema.tables
		WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'core')
		  AND table_name IN ('users', 'goose_db_version')`)
	if err != nil {
		t.Fatalf("inspect schemas: %v", err)
	}
	defer rows.Close()

	var strays []string
	for rows.Next() {
		var schema, table string
		if err := rows.Scan(&schema, &table); err != nil {
			t.Fatalf("scan: %v", err)
		}
		strays = append(strays, fmt.Sprintf("%s.%s", schema, table))
	}
	if len(strays) > 0 {
		t.Fatalf("core migrations created objects outside their schema: %v", strays)
	}
}

// ---------------------------------------------------------------------------
// Reset-request abuse controls
// ---------------------------------------------------------------------------

func TestForgotPasswordRequiresAnAltchaSolution(t *testing.T) {
	h := newHarness(t)

	// Without the gate a single request mails a real person on demand.
	res := h.do(http.MethodPost, "/auth/forgot-password", map[string]string{
		"email": "alice@example.com",
	})
	if res.status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", res.status, res.body)
	}
}

func TestForgotPasswordIsLimitedPerAddress(t *testing.T) {
	h := newHarness(t)
	if res := h.register("alice", "alice@example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}

	// The default allowance is 3 per address per hour. Each attempt solves a
	// fresh challenge, so this is not the replay check doing the work.
	for i := 1; i <= 3; i++ {
		if res := h.forgotPassword("alice@example.com"); res.status != http.StatusAccepted {
			t.Fatalf("request %d = %d, want 202: %s", i, res.status, res.body)
		}
	}

	res := h.forgotPassword("alice@example.com")
	if res.status != http.StatusTooManyRequests {
		t.Fatalf("the fourth request must be refused, got %d: %s", res.status, res.body)
	}
	if got := res.errorCode(t); got != "RateLimitExceededError" {
		t.Errorf("errorCode = %q, want RateLimitExceededError", got)
	}
}

// The per-address limit must not become an account-enumeration oracle: an
// address that exists and one that does not have to behave identically.
func TestForgotPasswordLimitAppliesToUnknownAddressesToo(t *testing.T) {
	h := newHarness(t)

	for i := 1; i <= 3; i++ {
		if res := h.forgotPassword("nobody@example.com"); res.status != http.StatusAccepted {
			t.Fatalf("request %d = %d, want 202: %s", i, res.status, res.body)
		}
	}
	res := h.forgotPassword("nobody@example.com")
	if res.status != http.StatusTooManyRequests {
		t.Fatalf("an unknown address must be throttled the same way, got %d", res.status)
	}
}

func TestForgotPasswordLimitIsPerAddressNotGlobal(t *testing.T) {
	h := newHarness(t)

	for i := 1; i <= 3; i++ {
		if res := h.forgotPassword("first@example.com"); res.status != http.StatusAccepted {
			t.Fatalf("first address request %d = %d", i, res.status)
		}
	}
	// Exhausting one address must not lock everyone else out.
	if res := h.forgotPassword("second@example.com"); res.status != http.StatusAccepted {
		t.Fatalf("a different address must have its own allowance, got %d: %s", res.status, res.body)
	}
}

// A mailer that always fails, to prove delivery problems cannot be used to
// discover which addresses are registered.
type failingMailer struct{}

func (failingMailer) SendPasswordReset(context.Context, string, string, string) error {
	return fmt.Errorf("smtp relay refused the message")
}
func (failingMailer) SendVerification(context.Context, string, string, string) error {
	return fmt.Errorf("smtp relay refused the message")
}

func TestMailFailureDoesNotRevealWhetherAnAccountExists(t *testing.T) {
	h := newHarnessWithMailer(t, failingMailer{})
	if res := h.register("alice", "alice@example.com", "hunter2hunter2"); res.status != http.StatusCreated {
		t.Fatalf("setup failed: %s", res.body)
	}

	// A real address reaches the mailer and fails; an unknown one returns early
	// and never tries. If the failure surfaced, the difference would say which
	// is which — which is precisely what this endpoint hides.
	known := h.forgotPassword("alice@example.com")
	unknown := h.forgotPassword("nobody@example.com")

	if known.status != http.StatusAccepted || unknown.status != http.StatusAccepted {
		t.Fatalf("statuses = %d and %d, want 202 for both", known.status, unknown.status)
	}
	if !bytes.Equal(known.body, unknown.body) {
		t.Errorf("responses differ:\n known:   %s\n unknown: %s", known.body, unknown.body)
	}
}
