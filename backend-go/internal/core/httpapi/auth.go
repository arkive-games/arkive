// Package httpapi registers the core module's HTTP surface.
//
// It is the only package that knows about huma. The service layer beneath it
// deals in domain types and apierr values, so the transport can be changed or
// a second one added without touching any use case.
package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/forum"
	"github.com/arkive-games/arkive/backend-go/internal/core/privacy"
	"github.com/arkive-games/arkive/backend-go/internal/core/roles"
	"github.com/arkive-games/arkive/backend-go/internal/core/social"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
	"github.com/arkive-games/arkive/backend-go/internal/platform/ratelimit"
)

// Handlers holds everything the core endpoints need.
type Handlers struct {
	users   *users.Service
	tokens  *auth.Tokens
	altcha  *auth.Altcha
	limiter *auth.RateLimiter

	// avatarLimiter is separate from limiter because the two throttle different
	// things by different keys: registrations per address, avatar uploads per
	// account. Sharing one would let a burst of sign-ups block a user changing
	// their picture.
	avatarLimiter *auth.RateLimiter

	// limits is the shared, Redis-backed limiter used for password resets. It
	// coexists with the in-process RateLimiters above rather than replacing them:
	// those predate it and key differently, and folding them together is a change
	// worth making on its own rather than inside a mail feature.
	limits ratelimit.Limiter

	forum *forum.Service
	// Posting and commenting are limited separately, and at different rates: a
	// thread is read by many and written by few, so a rate that suits replies
	// would be far too generous for new threads.
	postLimiter    *auth.RateLimiter
	commentLimiter *auth.RateLimiter

	roles   *roles.Service
	social  *social.Service
	privacy *privacy.Service

	cfg config.Auth
}

// NewHandlers builds the core module's HTTP handlers.
func NewHandlers(
	svc *users.Service,
	forumSvc *forum.Service,
	rolesSvc *roles.Service,
	socialSvc *social.Service,
	privacySvc *privacy.Service,
	tokens *auth.Tokens,
	altcha *auth.Altcha,
	limiter, avatarLimiter, postLimiter, commentLimiter *auth.RateLimiter,
	limits ratelimit.Limiter,
	cfg config.Auth,
) *Handlers {
	if limits == nil {
		limits = ratelimit.NewMemory()
	}
	return &Handlers{
		users:          svc,
		forum:          forumSvc,
		roles:          rolesSvc,
		social:         socialSvc,
		privacy:        privacySvc,
		tokens:         tokens,
		altcha:         altcha,
		limiter:        limiter,
		avatarLimiter:  avatarLimiter,
		postLimiter:    postLimiter,
		commentLimiter: commentLimiter,
		limits:         limits,
		cfg:            cfg,
	}
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

// RegisterBody is a new-account request.
type RegisterBody struct {
	Name     string `json:"name" minLength:"1" maxLength:"64" doc:"Display name, unique across the site"`
	Email    string `json:"email" format:"email" maxLength:"320" doc:"Email address"`
	Password string `json:"password" minLength:"8" maxLength:"1024" doc:"Password"`
}

// CredentialsBody is a login request.
type CredentialsBody struct {
	Email    string `json:"email" format:"email" doc:"Email address"`
	Password string `json:"password" doc:"Password"`
}

// EmailBody names an account by address.
type EmailBody struct {
	Email string `json:"email" format:"email" doc:"Email address"`
}

// TokenBody carries a single-use token from a link.
type TokenBody struct {
	Token string `json:"token" minLength:"1" doc:"Token from the emailed link"`
}

// ResetPasswordBody completes a password reset.
type ResetPasswordBody struct {
	Token    string `json:"token" minLength:"1" doc:"Token from the emailed link"`
	Password string `json:"password" minLength:"8" maxLength:"1024" doc:"The new password"`
}

// TokenResponse is the bearer-token payload.
//
// This is the one endpoint that does not use the standard envelope: returning
// the token at the top level keeps it usable by conventional OAuth2 client
// tooling, which expects to find the credential there.
type TokenResponse struct {
	AccessToken string    `json:"accessToken" doc:"Bearer token for the Authorization header"`
	TokenType   string    `json:"tokenType" doc:"Always \"bearer\"" example:"bearer"`
	ExpiresAt   time.Time `json:"expiresAt" doc:"When the token stops being accepted"`
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

type getAltchaInput struct{}

type registerInput struct {
	Altcha string `query:"altcha" required:"true" doc:"Base64-encoded Altcha proof-of-work solution from /auth/altcha"`
	Body   RegisterBody
}

type loginInput struct {
	Body CredentialsBody
}

type emailInput struct {
	Body EmailBody
}

// forgotPasswordInput gates the reset request behind proof of work.
//
// Without it, one HTTP request mails a real person on demand: an attacker can
// mail-bomb a chosen address, and every message spends the sending quota. The
// challenge makes each attempt cost measurable client CPU.
type forgotPasswordInput struct {
	Altcha string `query:"altcha" required:"true" doc:"Base64-encoded Altcha proof-of-work solution from /auth/altcha"`
	Body   EmailBody
}

type tokenInput struct {
	Body TokenBody
}

type resetPasswordInput struct {
	Body ResetPasswordBody
}

// cookieOutput carries a Set-Cookie header alongside an enveloped payload.
type cookieOutput[T any] struct {
	SetCookie string `header:"Set-Cookie"`
	Body      api.Envelope[T]
}

type tokenOutput struct {
	Body TokenResponse
}

// RegisterAuthRoutes mounts the /auth surface.
func (h *Handlers) RegisterAuthRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "getAltchaChallenge",
		Method:      http.MethodGet,
		Path:        "/auth/altcha",
		Summary:     "Get a registration challenge",
		Description: "Issues the proof-of-work challenge that /auth/register requires. " +
			"A challenge expires, and each one may be redeemed only once.",
		Tags: []string{"auth"},
	}, func(ctx context.Context, _ *getAltchaInput) (*api.Response[auth.Challenge], error) {
		challenge, err := h.altcha.Create()
		if err != nil {
			return nil, apierr.New(apierr.AltchaChallenge, "could not create a challenge").Wrap(err)
		}
		return api.OK(challenge), nil
	})

	huma.Register(a, huma.Operation{
		OperationID:   "register",
		Method:        http.MethodPost,
		Path:          "/auth/register",
		Summary:       "Create an account",
		Description:   "Creates an account. Requires a solved Altcha challenge and is rate limited per IP.",
		Tags:          []string{"auth"},
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{h.rateLimit},
		Errors: []int{
			http.StatusConflict,
			http.StatusUnprocessableEntity,
			http.StatusTooManyRequests,
		},
	}, func(ctx context.Context, in *registerInput) (*api.Response[users.UserRead], error) {
		if err := h.altcha.Verify(ctx, in.Altcha); err != nil {
			return nil, apierr.New(apierr.AltchaChallenge, "challenge verification failed").Wrap(err)
		}
		user, err := h.users.Register(ctx, users.RegisterInput{
			Name:     in.Body.Name,
			Email:    in.Body.Email,
			Password: in.Body.Password,
		})
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})

	// -----------------------------------------------------------------------
	// Sessions
	// -----------------------------------------------------------------------

	huma.Register(a, huma.Operation{
		OperationID: "loginJWT",
		Method:      http.MethodPost,
		Path:        "/auth/jwt/login",
		Summary:     "Exchange credentials for a bearer token",
		Tags:        []string{"auth"},
		Errors:      []int{http.StatusUnauthorized},
	}, func(ctx context.Context, in *loginInput) (*tokenOutput, error) {
		user, fgpt, err := h.users.Authenticate(ctx, in.Body.Email, in.Body.Password)
		if err != nil {
			return nil, err
		}
		token, expires, err := h.tokens.IssueAccess(user.ID, fgpt)
		if err != nil {
			return nil, apierr.New(apierr.InternalServer, "").Wrap(err)
		}
		return &tokenOutput{Body: TokenResponse{
			AccessToken: token,
			TokenType:   "bearer",
			ExpiresAt:   expires,
		}}, nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "logoutJWT",
		Method:      http.MethodPost,
		Path:        "/auth/jwt/logout",
		Summary:     "End a bearer-token session",
		Description: "Bearer tokens are stateless, so this endpoint exists for symmetry " +
			"and always succeeds. The client must discard its token.",
		Tags:   []string{"auth"},
		Errors: []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *struct{}) (*api.Response[api.Empty], error) {
		if _, err := auth.RequireUser(ctx); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "loginCookie",
		Method:      http.MethodPost,
		Path:        "/auth/cookie/login",
		Summary:     "Exchange credentials for a session cookie",
		Tags:        []string{"auth"},
		Errors:      []int{http.StatusUnauthorized},
	}, func(ctx context.Context, in *loginInput) (*cookieOutput[users.UserRead], error) {
		user, fgpt, err := h.users.Authenticate(ctx, in.Body.Email, in.Body.Password)
		if err != nil {
			return nil, err
		}
		token, _, err := h.tokens.IssueAccess(user.ID, fgpt)
		if err != nil {
			return nil, apierr.New(apierr.InternalServer, "").Wrap(err)
		}
		return &cookieOutput[users.UserRead]{
			SetCookie: h.sessionCookie(token, h.tokens.AccessTTL()).String(),
			Body:      api.OK(user).Body,
		}, nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "logoutCookie",
		Method:      http.MethodPost,
		Path:        "/auth/cookie/logout",
		Summary:     "Clear the session cookie",
		Tags:        []string{"auth"},
		Errors:      []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *struct{}) (*cookieOutput[api.Empty], error) {
		if _, err := auth.RequireUser(ctx); err != nil {
			return nil, err
		}
		return &cookieOutput[api.Empty]{
			SetCookie: h.sessionCookie("", -time.Hour).String(),
			Body:      api.OKEmpty().Body,
		}, nil
	})

	// -----------------------------------------------------------------------
	// Password reset and address verification
	// -----------------------------------------------------------------------

	huma.Register(a, huma.Operation{
		OperationID:   "forgotPassword",
		Method:        http.MethodPost,
		Path:          "/auth/forgot-password",
		Summary:       "Request a password-reset link",
		Description:   "Always reports success, whether or not the address is registered, so that the endpoint cannot be used to discover accounts.",
		Tags:          []string{"auth"},
		DefaultStatus: http.StatusAccepted,
		Middlewares:   huma.Middlewares{h.rateLimitForgotPassword},
	}, func(ctx context.Context, in *forgotPasswordInput) (*api.Response[api.Empty], error) {
		if err := h.altcha.Verify(ctx, in.Altcha); err != nil {
			return nil, apierr.New(apierr.AltchaChallenge, "challenge verification failed").Wrap(err)
		}

		// Limited per address as well as per IP, and applied BEFORE the account
		// is looked up. Limiting only addresses that exist would make the
		// limiter itself an account-enumeration oracle and undo the constant
		// response this endpoint deliberately returns.
		if !h.allowForgotPasswordFor(ctx, in.Body.Email) {
			return nil, apierr.New(apierr.RateLimitExceeded,
				"too many reset requests for this address; please wait")
		}

		if err := h.users.ForgotPassword(ctx, in.Body.Email); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "resetPassword",
		Method:      http.MethodPost,
		Path:        "/auth/reset-password",
		Summary:     "Set a new password using a reset link",
		Tags:        []string{"auth"},
		Errors:      []int{http.StatusUnauthorized, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *resetPasswordInput) (*api.Response[api.Empty], error) {
		if err := h.users.ResetPassword(ctx, in.Body.Token, in.Body.Password); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID:   "requestVerifyToken",
		Method:        http.MethodPost,
		Path:          "/auth/request-verify-token",
		Summary:       "Request an address-verification link",
		Description:   "Always reports success, whether or not the address is registered.",
		Tags:          []string{"auth"},
		DefaultStatus: http.StatusAccepted,
	}, func(ctx context.Context, in *emailInput) (*api.Response[api.Empty], error) {
		if err := h.users.RequestVerify(ctx, in.Body.Email); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "verifyUser",
		Method:      http.MethodPost,
		Path:        "/auth/verify",
		Summary:     "Confirm an email address",
		Tags:        []string{"auth"},
		Errors:      []int{http.StatusUnauthorized, http.StatusConflict},
	}, func(ctx context.Context, in *tokenInput) (*api.Response[users.UserRead], error) {
		user, err := h.users.Verify(ctx, in.Body.Token)
		if err != nil {
			return nil, err
		}
		return api.OK(user), nil
	})
}

// rateLimit throttles an operation per client IP.
func (h *Handlers) rateLimit(ctx huma.Context, next func(huma.Context)) {
	if !h.limiter.Allow(ctx.RemoteAddr(), ctx.Header("X-Forwarded-For")) {
		err := apierr.New(apierr.RateLimitExceeded, "too many attempts; please wait a minute")
		ctx.SetStatus(err.GetStatus())
		ctx.SetHeader("Content-Type", "application/json")
		writeJSON(ctx, err)
		return
	}
	next(ctx)
}

// Fallback allowances used when configuration leaves a limit unset.
//
// ratelimit treats a zero limit as "no rule", which is the right primitive but
// the wrong default here: a config that forgets to set these would silently
// remove the only thing standing between an attacker and unlimited mail. These
// values apply instead, so protection has to be disabled deliberately rather
// than by omission.
const (
	defaultForgotPerHourPerIP    = 5
	defaultForgotPerHourPerEmail = 3
)

// orDefault treats an unset (zero) value as "use the fallback", and a negative
// value as "disabled" rather than as unset -- the comments at the call sites
// describe a limit that can be turned off deliberately, and folding negatives
// into the fallback made that impossible.
func orDefault(configured, fallback int) int {
	switch {
	case configured == 0:
		return fallback
	case configured < 0:
		return 0
	default:
		return configured
	}
}

// rateLimitForgotPassword throttles reset requests per client IP.
func (h *Handlers) rateLimitForgotPassword(ctx huma.Context, next func(huma.Context)) {
	ip := auth.ClientIP(ctx.RemoteAddr(), ctx.Header("X-Forwarded-For"))
	rule := ratelimit.Rule{Limit: orDefault(h.cfg.ForgotPerHourPerIP, defaultForgotPerHourPerIP), Window: time.Hour}

	if !h.limits.Allow(ctx.Context(), ratelimit.Key("forgot", "ip", ip), rule).Allowed {
		err := apierr.New(apierr.RateLimitExceeded, "too many reset requests; please wait")
		ctx.SetStatus(err.GetStatus())
		ctx.SetHeader("Content-Type", "application/json")
		writeJSON(ctx, err)
		return
	}
	next(ctx)
}

// allowForgotPasswordFor throttles reset requests per target address.
//
// This is the limit that stops one person being mail-bombed: without it the
// per-IP cap is trivially bypassed from a handful of addresses, and every
// message spends real sending quota. It is checked before the account lookup
// and applied to any syntactically valid address, so an address that exists and
// one that does not behave identically — otherwise the limiter would leak
// exactly what the endpoint's constant response is designed to hide.
func (h *Handlers) allowForgotPasswordFor(ctx context.Context, email string) bool {
	normalised := strings.ToLower(strings.TrimSpace(email))
	if normalised == "" {
		return true // let validation reject it, not the limiter
	}
	rule := ratelimit.Rule{Limit: orDefault(h.cfg.ForgotPerHourPerEmail, defaultForgotPerHourPerEmail), Window: time.Hour}
	return h.limits.Allow(ctx, ratelimit.Key("forgot", "email", normalised), rule).Allowed
}

// sessionCookie builds the session cookie. maxAge below zero expires it.
func (h *Handlers) sessionCookie(value string, ttl time.Duration) *http.Cookie {
	c := &http.Cookie{
		Name:  h.cfg.CookieName,
		Value: value,
		Path:  h.cfg.CookiePath,
		// The cookie is the credential, so script must never be able to read
		// it, and it must not ride along on cross-site requests.
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: sameSite(h.cfg.CookieSameSite),
		MaxAge:   int(ttl.Seconds()),
	}
	if h.cfg.CookieDomain != "" {
		c.Domain = h.cfg.CookieDomain
	}
	if c.Path == "" {
		c.Path = "/"
	}
	return c
}

func sameSite(name string) http.SameSite {
	switch name {
	case "strict", "Strict":
		return http.SameSiteStrictMode
	case "none", "None":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}
