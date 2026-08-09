package main

import (
	"net/http"
	"strings"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

const (
	allowedMethods  = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
	allowedHeaders  = "Authorization, Content-Type"
	preflightMaxAge = "600"
)

// corsMiddleware answers preflights and sets the cross-origin headers.
//
// There are two distinct paths, kept separate so they cannot be confused:
//
//   - A listed origin gets its own origin echoed back, with credentials when
//     configured. This is the cookie-session path used by the game subdomains,
//     and it is what makes single sign-on across them work. A wildcard cannot
//     be used here: browsers reject "*" together with credentials.
//
//   - An unlisted origin gets a wildcard and explicitly NO credentials, but
//     only when PublicFallback is on. This exists for the Bilibili Toy, which
//     runs as a third-party iframe where the session cookie is blocked by the
//     browser whatever CORS says, and therefore authenticates with a bearer
//     token instead. Because the response forbids credentials, no cookie can
//     ride such a request, so an unlisted origin cannot reach an existing
//     session — only a caller that already holds a token can do anything.
func corsMiddleware(cfg config.CORS) func(http.Handler) http.Handler {
	allowAll := false
	allowed := make(map[string]struct{}, len(cfg.AllowedOrigins))
	for _, o := range cfg.AllowedOrigins {
		if o == "*" {
			allowAll = true
			continue
		}
		allowed[normaliseOrigin(o)] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}

			h := w.Header()
			_, listed := allowed[normaliseOrigin(origin)]

			switch {
			case listed || allowAll:
				if cfg.AllowCredentials {
					h.Set("Access-Control-Allow-Origin", origin)
					h.Set("Access-Control-Allow-Credentials", "true")
					// The response varies by origin, so a shared cache must not
					// serve one origin's response to another.
					h.Add("Vary", "Origin")
				} else if allowAll {
					h.Set("Access-Control-Allow-Origin", "*")
				} else {
					h.Set("Access-Control-Allow-Origin", origin)
					h.Add("Vary", "Origin")
				}

			case cfg.PublicFallback:
				// Never Allow-Credentials here; see the doc comment.
				h.Set("Access-Control-Allow-Origin", "*")

			default:
				// Not permitted: continue with no CORS headers and let the
				// browser block the response.
				next.ServeHTTP(w, r)
				return
			}

			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", allowedMethods)
				h.Set("Access-Control-Allow-Headers", allowedHeaders)
				h.Set("Access-Control-Max-Age", preflightMaxAge)
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func normaliseOrigin(origin string) string {
	return strings.ToLower(strings.TrimSuffix(strings.TrimSpace(origin), "/"))
}
