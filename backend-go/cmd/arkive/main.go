// Command arkive serves the Arkive backend.
//
// Which modules a process serves is configuration (ARKIVE_MODULES), not code.
// Running everything in one process and running one process per game are the
// same binary with different environments.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/arkive-games/arkive/backend-go/internal/core"
	"github.com/arkive-games/arkive/backend-go/internal/module"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
	"github.com/arkive-games/arkive/backend-go/internal/platform/db"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "arkive: %v\n", err)
		os.Exit(1)
	}
}

// registry lists every module compiled into the binary.
func registry() (*module.Registry, error) {
	return module.NewRegistry(
		core.New(),
	)
}

func run(args []string) error {
	if len(args) == 0 {
		return serve()
	}
	switch args[0] {
	case "openapi":
		return writeOpenAPI(args[1:])
	case "migrate":
		return migrate()
	case "serve":
		return serve()
	default:
		return fmt.Errorf("unknown command %q; use one of: serve, migrate, openapi", args[0])
	}
}

// migrate applies every selected module's migration stream and exits.
//
// serve does this on boot too. Having it as its own command lets a deploy
// migrate before it swaps traffic over, and lets an operator see a migration
// fail without a half-started service to reason about.
func migrate() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := newLogger(cfg.Debug)

	reg, err := registry()
	if err != nil {
		return err
	}
	modules, err := reg.Select(cfg.Modules)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.Postgres)
	if err != nil {
		return err
	}
	defer pool.Close()

	for _, m := range modules {
		if err := db.Migrate(ctx, pool, m.Schema(), m.Migrations()); err != nil {
			return err
		}
		logger.Info("migrated", slog.String("module", m.Name()), slog.String("schema", m.Schema()))
	}
	return nil
}

func serve() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := newLogger(cfg.Debug)
	api.InstallErrorModel()

	reg, err := registry()
	if err != nil {
		return err
	}
	modules, err := reg.Select(cfg.Modules)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.Postgres)
	if err != nil {
		return err
	}
	defer pool.Close()

	// Each module migrates only its own schema, so a process serving one game
	// cannot advance another game's stream.
	for _, m := range modules {
		if err := db.Migrate(ctx, pool, m.Schema(), m.Migrations()); err != nil {
			return err
		}
		logger.Info("migrated", slog.String("module", m.Name()), slog.String("schema", m.Schema()))
	}

	router, err := buildRouter(cfg, pool, logger, modules)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              cfg.Server.Addr(),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening",
			slog.String("addr", cfg.Server.Addr()),
			slog.String("prefix", cfg.Server.APIPrefix),
			slog.Any("modules", moduleNames(modules)),
		)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// buildRouter mounts every selected module under its own path prefix.
func buildRouter(cfg config.Config, pool *pgxpool.Pool, logger *slog.Logger, modules []module.Module) (chi.Router, error) {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware(cfg.CORS))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	deps := module.Deps{Config: cfg, Pool: pool, Logger: logger}

	var mountErr error
	r.Route(cfg.Server.APIPrefix, func(root chi.Router) {
		for _, m := range modules {
			mod := m
			root.Route("/"+mod.Name(), func(sub chi.Router) {
				if err := mod.Mount(sub, deps); err != nil {
					mountErr = fmt.Errorf("mount module %s: %w", mod.Name(), err)
				}
			})
		}
	})
	return r, mountErr
}

func moduleNames(modules []module.Module) []string {
	names := make([]string, 0, len(modules))
	for _, m := range modules {
		names = append(names, m.Name())
	}
	return names
}

func newLogger(debug bool) *slog.Logger {
	level := slog.LevelInfo
	if debug {
		level = slog.LevelDebug
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
}
