// Package gmzz is the Lord of Mysteries module: the per-game data that belongs
// to the players rather than to the game — today, saved score-page characters.
//
// It is the first game module behind the module seam. It owns the gmzz schema
// and its own migration stream, and it identifies callers through core's
// account lookup rather than holding any account data of its own.
package gmzz

import (
	"embed"
	"fmt"
	"io/fs"
	"log/slog"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"github.com/arkive-games/arkive/backend-go/internal/core"
	"github.com/arkive-games/arkive/backend-go/internal/gmzz/characters"
	"github.com/arkive-games/arkive/backend-go/internal/module"
	"github.com/arkive-games/arkive/backend-go/internal/platform/ratelimit"
)

//go:embed all:migrations
var migrationsFS embed.FS

// Module is the gmzz module.
type Module struct{}

// New builds the module.
func New() *Module { return &Module{} }

// Name identifies the module in configuration and in the URL.
func (m *Module) Name() string { return "gmzz" }

// Schema is the only Postgres schema this module writes.
func (m *Module) Schema() string { return "gmzz" }

// Migrations returns this module's own migration stream.
func (m *Module) Migrations() fs.FS {
	sub, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		// Embedded at compile time, so this cannot fail without a corrupt binary.
		panic(fmt.Sprintf("gmzz migrations are not embedded: %v", err))
	}
	return sub
}

// Mount attaches the module's routes and its OpenAPI document.
func (m *Module) Mount(r chi.Router, d module.Deps) error {
	r.Use(core.Identity(d))

	// Same arrangement as core: Redis when configured, so the limit holds across
	// processes once games are split out; in-process otherwise.
	var limits ratelimit.Limiter = ratelimit.NewMemory()
	if addr := d.Config.Redis.Addr; addr != "" {
		rdb := redis.NewClient(&redis.Options{Addr: addr, Password: d.Config.Redis.Password, DB: d.Config.Redis.DB})
		limits = ratelimit.NewRedis(rdb, ratelimit.NewMemory(), d.Logger)
		d.Logger.Info("gmzz: using redis for rate limits", slog.String("addr", addr))
	}

	cfg := huma.DefaultConfig("Arkive Lord of Mysteries API", "1.0.0")
	cfg.Info.Description = "Saved score-page characters for the Lord of Mysteries site."
	cfg.OpenAPIPath = "/openapi"
	cfg.DocsPath = "/docs"
	// As in core: no "$schema" property or describe-link header on responses,
	// which would otherwise surface on every generated client type.
	cfg.SchemasPath = ""
	cfg.CreateHooks = nil

	a := humachi.New(r, cfg)
	h := &handlers{characters: characters.NewService(d.Pool), limits: limits}
	h.register(a)
	return nil
}

var _ module.Module = (*Module)(nil)
