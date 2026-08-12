package auth

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Principal is the authenticated caller, as much of it as authorization needs.
// It deliberately excludes the email address and password hash so that no
// handler can leak them by reaching through the request context.
type Principal struct {
	ID          uuid.UUID
	Name        string
	IsActive    bool
	IsSuperuser bool
	IsVerified  bool

	// SessionFingerprint is a one-way digest of the password hash, not the hash.
	// It is here because session resolution has to compare it, and it cannot be
	// reversed into a credential -- so it does not reopen what the comment above
	// closes. Middleware treats a token whose fingerprint no longer matches as
	// anonymous, which is what logs a stolen session out on a password change.
	SessionFingerprint string
}

// PrincipalStore resolves a user id to a Principal. It is an interface so the
// auth package stays free of any dependency on the users package, which keeps
// the import graph acyclic.
type PrincipalStore interface {
	Principal(ctx context.Context, id uuid.UUID) (Principal, error)
}

type principalKey struct{}

// Resolver attaches the caller's identity to the request context.
//
// It never rejects a request. Anonymous access, an expired token and a forged
// token all arrive at the handler as "no principal", and the handler decides
// whether that is allowed. Keeping the decision in the handler is what lets
// every rejection carry the module's own error envelope, and what makes an
// endpoint's access rules visible where the endpoint is defined.
type Resolver struct {
	tokens     *Tokens
	store      PrincipalStore
	cookieName string
}

// NewResolver builds the identity middleware.
func NewResolver(tokens *Tokens, store PrincipalStore, cookieName string) *Resolver {
	return &Resolver{tokens: tokens, store: store, cookieName: cookieName}
}

// Middleware is the chi middleware that performs the resolution.
func (r *Resolver) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		raw := r.extractToken(req)
		if raw == "" {
			next.ServeHTTP(w, req)
			return
		}

		id, fgpt, err := r.tokens.ParseAccess(raw)
		if err != nil {
			next.ServeHTTP(w, req)
			return
		}

		principal, err := r.store.Principal(req.Context(), id)
		if err != nil {
			// A token whose user has since been deleted is simply anonymous.
			next.ServeHTTP(w, req)
			return
		}

		// A token minted against a previous password is anonymous too. The store
		// lookup above already happened, so this costs no extra query -- the
		// session becomes revocable for free.
		if subtle.ConstantTimeCompare([]byte(fgpt), []byte(principal.SessionFingerprint)) != 1 {
			next.ServeHTTP(w, req)
			return
		}

		ctx := context.WithValue(req.Context(), principalKey{}, principal)
		next.ServeHTTP(w, req.WithContext(ctx))
	})
}

// extractToken prefers the Authorization header, falling back to the cookie,
// so an API client's explicit token always wins over a stale browser session.
func (r *Resolver) extractToken(req *http.Request) string {
	if header := req.Header.Get("Authorization"); header != "" {
		if token, ok := strings.CutPrefix(header, "Bearer "); ok {
			return strings.TrimSpace(token)
		}
		return ""
	}
	if cookie, err := req.Cookie(r.cookieName); err == nil {
		return cookie.Value
	}
	return ""
}

// PrincipalFrom returns the caller, if any.
func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}

// WithPrincipal injects a principal. It exists for tests and for handlers that
// have just authenticated a caller themselves.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// RequireUser returns the caller or an error suitable for returning directly
// from a handler.
func RequireUser(ctx context.Context) (Principal, error) {
	p, ok := PrincipalFrom(ctx)
	if !ok {
		return Principal{}, apierr.New(apierr.Unauthorized, "authentication required")
	}
	if !p.IsActive {
		return Principal{}, apierr.New(apierr.UserInactive, "this account is disabled")
	}
	return p, nil
}

// RequireSuperuser returns the caller if they are an administrator.
func RequireSuperuser(ctx context.Context) (Principal, error) {
	p, err := RequireUser(ctx)
	if err != nil {
		return Principal{}, err
	}
	if !p.IsSuperuser {
		return Principal{}, apierr.New(apierr.Forbidden, "administrator privileges required")
	}
	return p, nil
}
