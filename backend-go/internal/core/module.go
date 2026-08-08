// Package core is the module holding everything that is not specific to one
// game: accounts, authentication, and later comments, progress, feedback and
// uploads.
//
// Global concerns and cross-game features live together deliberately. They can
// never be deployed or migrated independently — every cross-game feature is
// user-scoped, so they always change together — and separating them would put
// a cross-schema boundary on the most frequently joined relationship in the
// system. The boundaries that do matter are between the packages inside.
package core

import (
	"embed"
	"fmt"
	"io/fs"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/httpapi"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/module"
)

//go:embed all:migrations
var migrationsFS embed.FS

// Module is the core module.
type Module struct {
	mailer auth.Mailer
}

// Option customises the module at construction.
type Option func(*Module)

// WithMailer supplies the transport for password-reset and verification mail.
// Without it the module logs tokens instead of sending them, which is what the
// Python service did. Tests use it to observe the tokens a flow issues.
func WithMailer(m auth.Mailer) Option {
	return func(mod *Module) { mod.mailer = m }
}

// New builds the core module.
func New(opts ...Option) *Module {
	m := &Module{}
	for _, opt := range opts {
		opt(m)
	}
	return m
}

// Name identifies the module in configuration and in the URL.
func (m *Module) Name() string { return "core" }

// Schema is the only Postgres schema this module touches.
func (m *Module) Schema() string { return "core" }

// Migrations returns this module's own migration stream.
func (m *Module) Migrations() fs.FS {
	sub, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		// The directory is embedded at compile time, so this cannot fail at
		// runtime without the binary being corrupt.
		panic(fmt.Sprintf("core migrations are not embedded: %v", err))
	}
	return sub
}

// Mount attaches the module's routes and its OpenAPI document to the router.
func (m *Module) Mount(r chi.Router, d module.Deps) error {
	hasher, err := auth.NewHasher(d.Config.Auth)
	if err != nil {
		return fmt.Errorf("build password hasher: %w", err)
	}

	queries := coredb.New(d.Pool)
	tokens := auth.NewTokens(d.Config.Auth)

	mailer := m.mailer
	if mailer == nil {
		mailer = auth.NewLogMailer(d.Logger)
	}
	service := users.NewService(queries, hasher, tokens, mailer, d.Logger)

	// Identity resolution runs before huma so that every operation can read
	// the caller from its context. It never rejects: authorization is decided
	// per operation, where it is visible.
	resolver := auth.NewResolver(tokens, service, d.Config.Auth.CookieName)
	r.Use(resolver.Middleware)

	cfg := huma.DefaultConfig("Arkive Core API", "1.0.0")
	cfg.Info.Description = "Accounts and authentication shared by every Arkive game site."
	// Each module publishes its own document, so a game's generated client
	// carries only that game's surface plus core.
	cfg.OpenAPIPath = "/openapi"
	cfg.DocsPath = "/docs"
	// huma's default create hook injects a "$schema" property into every
	// response body and a Link header alongside it. That would surface as an
	// optional field on every generated TypeScript type, so the describe-link
	// feature is switched off in favour of a clean client.
	cfg.SchemasPath = ""
	cfg.CreateHooks = nil

	a := humachi.New(r, cfg)

	handlers := httpapi.NewHandlers(service, tokens, auth.NewAltcha(
		d.Config.Auth.AltchaHMACKey,
		d.Config.Auth.AltchaMaxNumber,
		altchaChallengeTTL,
	), auth.NewRateLimiter(d.Config.Auth.RegisterPerMinute), d.Config.Auth)

	handlers.RegisterAuthRoutes(a)
	handlers.RegisterUserRoutes(a)
	return nil
}

// altchaChallengeTTL bounds how long a registration challenge stays solvable,
// and therefore how long a solved one must be remembered to block replays.
const altchaChallengeTTL = 10 * time.Minute

var _ module.Module = (*Module)(nil)
