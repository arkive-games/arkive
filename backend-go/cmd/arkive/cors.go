package main

import (
	"net/http"
	"net/url"
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
//
// A listed entry may also be a subdomain pattern, "https://*.tc-imba.com",
// matching any host beneath that domain on that scheme. Exact entries had to be
// kept in step with every site by hand, and forgetting one fails silently: the
// origin falls through to the public path, the browser refuses the credentialed
// response, and sign-in on that site reads as "cannot reach the server". That
// took www out once, and gmzz and ro3 later. The apex is not a subdomain of
// itself, so it still needs its own entry.
func corsMiddleware(cfg config.CORS) func(http.Handler) http.Handler {
	allowAll := false
	allowed := make(map[string]struct{}, len(cfg.AllowedOrigins))
	var patterns []subdomainPattern
	for _, o := range cfg.AllowedOrigins {
		if o == "*" {
			allowAll = true
			continue
		}
		if p, ok := parseSubdomainPattern(o); ok {
			patterns = append(patterns, p)
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
			if !listed {
				listed = matchesAny(patterns, origin)
			}

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

// subdomainPattern is a parsed "scheme://*.domain" allow-list entry.
type subdomainPattern struct {
	scheme string
	// suffix is the domain with its leading dot, so "*.tc-imba.com" cannot
	// match "eviltc-imba.com".
	suffix string
}

func parseSubdomainPattern(entry string) (subdomainPattern, bool) {
	scheme, domain, ok := strings.Cut(normaliseOrigin(entry), "://*.")
	if !ok || scheme == "" || domain == "" || strings.ContainsAny(domain, "/*?#@") {
		return subdomainPattern{}, false
	}
	return subdomainPattern{scheme: scheme, suffix: "." + domain}, true
}

func matchesAny(patterns []subdomainPattern, origin string) bool {
	if len(patterns) == 0 {
		return false
	}
	u, err := url.Parse(normaliseOrigin(origin))
	// An origin is exactly scheme://host[:port]; anything carrying user info, a
	// path or a query is not one, and is not matched.
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	for _, p := range patterns {
		// u.Host keeps any port, which then sits after the suffix, so an origin
		// on a port the pattern does not name never matches.
		labels, found := strings.CutSuffix(u.Host, p.suffix)
		if found && u.Scheme == p.scheme && validLabels(labels) {
			return true
		}
	}
	return false
}

// validLabels reports whether s is one or more dot-separated hostname labels.
func validLabels(s string) bool {
	if s == "" {
		return false
	}
	for _, label := range strings.Split(s, ".") {
		if label == "" || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return false
		}
		for _, r := range label {
			if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' {
				return false
			}
		}
	}
	return true
}
