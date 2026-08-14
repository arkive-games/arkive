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
	"log/slog"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/forum"
	"github.com/arkive-games/arkive/backend-go/internal/core/httpapi"
	"github.com/arkive-games/arkive/backend-go/internal/core/notify"
	"github.com/arkive-games/arkive/backend-go/internal/core/privacy"
	"github.com/arkive-games/arkive/backend-go/internal/core/roles"
	"github.com/arkive-games/arkive/backend-go/internal/core/social"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/module"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
	"github.com/arkive-games/arkive/backend-go/internal/platform/ratelimit"
	"github.com/redis/go-redis/v9"
)

//go:embed all:migrations
var migrationsFS embed.FS

// Module is the core module.
type Module struct {
	mailer auth.Mailer
	blobs  blob.Store
}

// Option customises the module at construction.
type Option func(*Module)

// WithBlobStore supplies object storage, overriding what configuration would
// build.
//
// Tests use it to run the avatar flow against blob.NewMemory, so the HTTP path is
// covered without a container. The storage client itself is exercised separately
// against a real server, because a fake would otherwise only prove the fake
// works.
func WithBlobStore(s blob.Store) Option {
	return func(mod *Module) { mod.blobs = s }
}

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

	// Storage is optional in development and validated in production, so an
	// absent client is a legitimate state here rather than a startup failure.
	// Only the avatar routes notice, and they report it as a service error.
	blobs := m.blobs
	if blobs == nil && d.Config.S3.Configured() {
		store, err := blob.NewS3(blob.S3Config{
			Endpoint:        d.Config.S3.Endpoint,
			Region:          d.Config.S3.Region,
			Bucket:          d.Config.S3.Bucket,
			AccessKeyID:     d.Config.S3.AccessKeyID,
			SecretAccessKey: d.Config.S3.SecretAccessKey,
			UsePathStyle:    d.Config.S3.UsePathStyle,
			PublicBaseURL:   d.Config.S3.PublicBaseURL,
		})
		if err != nil {
			return fmt.Errorf("build object storage client: %w", err)
		}
		blobs = store
	}
	if blobs == nil {
		d.Logger.Warn("object storage is not configured; avatar uploads will be refused")
	}

	// Redis is optional. Without it, rate limits and Altcha replay protection
	// fall back to in-process state: correct for one process, but forgotten on
	// restart, which reopens the replay window for unexpired challenges.
	var (
		limits ratelimit.Limiter = ratelimit.NewMemory()
		replay auth.ReplayStore  = auth.NewMemoryReplayStore()
	)
	if addr := d.Config.Redis.Addr; addr != "" {
		rdb := redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: d.Config.Redis.Password,
			DB:       d.Config.Redis.DB,
		})
		limits = ratelimit.NewRedis(rdb, ratelimit.NewMemory(), d.Logger)
		replay = auth.NewRedisReplayStore(rdb)
		d.Logger.Info("using redis for rate limits and replay protection", slog.String("addr", addr))
	} else {
		d.Logger.Warn("no REDIS_ADDR configured; rate limits and altcha replay protection are per-process and reset on restart")
	}

	mailer := m.mailer
	if mailer == nil {
		smtpCfg := auth.SMTPConfig{
			Host:             d.Config.Auth.SMTPHost,
			Port:             d.Config.Auth.SMTPPort,
			Username:         d.Config.Auth.SMTPUsername,
			Password:         d.Config.Auth.SMTPPassword,
			FromName:         d.Config.Auth.SMTPFromName,
			ResetURLTemplate: d.Config.Auth.ResetURLTemplate,
		}
		sesCfg := auth.SESConfig{
			SecretID:        d.Config.Auth.SESSecretID,
			SecretKey:       d.Config.Auth.SESSecretKey,
			Region:          d.Config.Auth.SESRegion,
			From:            d.Config.Auth.SESFrom,
			FromName:        d.Config.Auth.SESFromName,
			ResetTemplateID: d.Config.Auth.SESResetTemplate,
		}

		switch {
		case sesCfg.Configured():
			// Preferred: SMTP is unavailable on a personal-tier Tencent account,
			// so the API is the only path that actually delivers.
			mailer = auth.NewSESMailer(sesCfg, d.Logger)
			d.Logger.Info("sending mail via tencent ses api",
				slog.String("from", sesCfg.From),
				slog.Int64("reset_template", sesCfg.ResetTemplateID))
		case smtpCfg.Configured():
			mailer = auth.NewSMTPMailer(smtpCfg, d.Logger)
			d.Logger.Info("sending mail via smtp relay", slog.String("host", smtpCfg.Host))
		default:
			// Deliberate: an unconfigured deployment records tokens rather than
			// failing every reset request outright.
			mailer = auth.NewLogMailer(d.Logger)
			d.Logger.Warn("no mail transport configured; reset tokens will be logged, not emailed")
		}
	}
	service := users.NewService(queries, d.Pool, hasher, tokens, mailer, blobs, d.Logger)
	notifyService := notify.NewService(queries, service, d.Logger)
	rolesService := roles.NewService(queries, service, d.Logger)
	socialService := social.NewService(queries, service, notifyService, d.Logger)
	privacyService := privacy.NewService(queries, socialService, d.Logger)
	forumService := forum.NewService(queries, service, rolesService, notifyService, d.Logger)

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

	handlers := httpapi.NewHandlers(
		service,
		forumService,
		rolesService,
		socialService,
		privacyService,
		notifyService,
		tokens,
		auth.NewAltcha(
			d.Config.Auth.AltchaHMACKey,
			d.Config.Auth.AltchaMaxNumber,
			altchaChallengeTTL,
			replay,
		),
		auth.NewRateLimiter(d.Config.Auth.RegisterPerMinute),
		auth.NewRateLimiter(d.Config.S3.AvatarUploadsPerMinute),
		auth.NewRateLimiter(d.Config.Auth.ForumPostsPerMinute),
		auth.NewRateLimiter(d.Config.Auth.ForumCommentsPerMinute),
		limits,
		d.Config.Auth,
	)

	handlers.RegisterAuthRoutes(a)
	handlers.RegisterUserRoutes(a)
	handlers.RegisterForumRoutes(a)
	handlers.RegisterReactionRoutes(a)
	handlers.RegisterRoleRoutes(a)
	handlers.RegisterSocialRoutes(a)
	handlers.RegisterModerationRoutes(a)
	handlers.RegisterPrivacyRoutes(a)
	handlers.RegisterNotificationRoutes(a)
	return nil
}

// altchaChallengeTTL bounds how long a registration challenge stays solvable,
// and therefore how long a solved one must be remembered to block replays.
const altchaChallengeTTL = 10 * time.Minute

var _ module.Module = (*Module)(nil)
