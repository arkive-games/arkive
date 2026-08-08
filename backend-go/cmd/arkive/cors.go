package main

import (
	"net/http"
	"strings"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// corsMiddleware answers preflights and echoes an allowed origin.
//
// When credentials are allowed the response cannot use "*" — browsers reject
// that combination — so the request's own origin is echoed after checking it
// against the allow list. A wildcard entry combined with credentials therefore
// means "reflect any origin", which is a deliberate and documented choice for
// a site whose game front ends live on several hosts.
func corsMiddleware(cfg config.CORS) func(http.Handler) http.Handler {
	allowAll := false
	allowed := make(map[string]struct{}, len(cfg.AllowedOrigins))
	for _, o := range cfg.AllowedOrigins {
		if o == "*" {
			allowAll = true
			continue
		}
		allowed[strings.ToLower(strings.TrimSuffix(o, "/"))] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}

			_, listed := allowed[strings.ToLower(strings.TrimSuffix(origin, "/"))]
			if !listed && !allowAll {
				// Not an allowed origin: continue without CORS headers and let
				// the browser block the response.
				next.ServeHTTP(w, r)
				return
			}

			h := w.Header()
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

			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
