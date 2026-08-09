package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

func exercise(t *testing.T, cfg config.CORS, method, origin string) *httptest.ResponseRecorder {
	t.Helper()

	reached := false
	handler := corsMiddleware(cfg)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(method, "/api/v1/core/users/me", nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if method == http.MethodOptions && reached {
		t.Error("a preflight must be answered by the middleware, not the handler")
	}
	return rec
}

var siteOrigins = config.CORS{
	AllowedOrigins:   []string{"https://tc-imba.com", "https://aion2.tc-imba.com"},
	AllowCredentials: true,
}

func TestListedOriginGetsCredentialedCORS(t *testing.T) {
	rec := exercise(t, siteOrigins, http.MethodGet, "https://aion2.tc-imba.com")

	// The cookie session depends on both of these; a wildcard here would be
	// rejected by the browser when credentials are involved.
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://aion2.tc-imba.com" {
		t.Errorf("Allow-Origin = %q, want the echoed origin", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("Allow-Credentials = %q, want true", got)
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Errorf("Vary = %q, want Origin so caches do not cross origins", got)
	}
}

func TestUnlistedOriginIsRefusedByDefault(t *testing.T) {
	rec := exercise(t, siteOrigins, http.MethodGet, "https://evil.example")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Allow-Origin = %q, want no CORS headers at all", got)
	}
}

func TestPublicFallbackAllowsBearerCallersWithoutCredentials(t *testing.T) {
	cfg := siteOrigins
	cfg.PublicFallback = true

	rec := exercise(t, cfg, http.MethodGet, "https://www.bilibili.com")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Allow-Origin = %q, want *", got)
	}
	// The critical assertion. With credentials the browser would attach the
	// session cookie, and any origin could then act as a signed-in user.
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
		t.Fatalf("Allow-Credentials = %q, must never be set on the public path", got)
	}
}

func TestPublicFallbackDoesNotDowngradeAListedOrigin(t *testing.T) {
	cfg := siteOrigins
	cfg.PublicFallback = true

	rec := exercise(t, cfg, http.MethodGet, "https://tc-imba.com")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://tc-imba.com" {
		t.Errorf("Allow-Origin = %q, want the echoed origin", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Error("a listed origin must keep its credentialed session")
	}
}

func TestPreflightIsAnsweredWithoutTouchingTheHandler(t *testing.T) {
	rec := exercise(t, siteOrigins, http.MethodOptions, "https://aion2.tc-imba.com")

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != allowedHeaders {
		t.Errorf("Allow-Headers = %q, want %q", got, allowedHeaders)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != allowedMethods {
		t.Errorf("Allow-Methods = %q, want %q", got, allowedMethods)
	}
}

func TestWildcardWithCredentialsEchoesRatherThanStarring(t *testing.T) {
	// The development default. "*" plus credentials is rejected by browsers, so
	// the origin has to be echoed even when the allow list is a wildcard.
	cfg := config.CORS{AllowedOrigins: []string{"*"}, AllowCredentials: true}
	rec := exercise(t, cfg, http.MethodGet, "http://localhost:15173")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:15173" {
		t.Errorf("Allow-Origin = %q, want the echoed origin", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Error("credentials should still be allowed under a wildcard list")
	}
}

func TestOriginMatchingIgnoresCaseAndTrailingSlash(t *testing.T) {
	for _, origin := range []string{
		"https://AION2.tc-imba.com",
		"https://aion2.tc-imba.com/",
	} {
		rec := exercise(t, siteOrigins, http.MethodGet, origin)
		if rec.Header().Get("Access-Control-Allow-Origin") == "" {
			t.Errorf("origin %q should have matched the allow list", origin)
		}
	}
}

func TestRequestWithoutAnOriginIsUntouched(t *testing.T) {
	rec := exercise(t, siteOrigins, http.MethodGet, "")

	// Same-origin and server-to-server calls must not acquire CORS headers.
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Allow-Origin = %q, want none", got)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want the handler to have run", rec.Code)
	}
}
