// Package module defines the seam that keeps the service splittable.
//
// Every feature area registers as a Module. A module owns exactly one Postgres
// schema, ships its own migration stream, and mounts its own OpenAPI document.
// Which modules a process serves is configuration, not code, so running one
// process per game later is a deployment change rather than a rewrite.
package module

import (
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// Deps carries everything a module needs from the host process.
type Deps struct {
	Config config.Config
	Pool   *pgxpool.Pool
	Logger *slog.Logger
}

// Module is one independently deployable feature area.
type Module interface {
	// Name is the URL segment and configuration key, e.g. "core", "aion2".
	Name() string

	// Schema is the only Postgres schema this module may read or write.
	Schema() string

	// Migrations is the module's own migration stream, rooted at the
	// directory containing the .sql files.
	Migrations() fs.FS

	// Mount attaches the module's routes to the router it is given. The
	// router is already scoped to the module's path prefix.
	Mount(r chi.Router, d Deps) error
}

// Registry holds the modules compiled into the binary.
type Registry struct {
	modules map[string]Module
}

// NewRegistry builds a registry from the given modules.
func NewRegistry(modules ...Module) (*Registry, error) {
	r := &Registry{modules: make(map[string]Module, len(modules))}
	schemas := make(map[string]string, len(modules))

	for _, m := range modules {
		name := m.Name()
		if _, dup := r.modules[name]; dup {
			return nil, fmt.Errorf("duplicate module name %q", name)
		}
		// Two modules sharing a schema would share a migration stream, which
		// silently destroys the isolation the whole design rests on.
		if owner, taken := schemas[m.Schema()]; taken {
			return nil, fmt.Errorf("modules %q and %q both claim schema %q", owner, name, m.Schema())
		}
		schemas[m.Schema()] = name
		r.modules[name] = m
	}
	return r, nil
}

// Names lists every registered module, sorted.
func (r *Registry) Names() []string {
	names := make([]string, 0, len(r.modules))
	for name := range r.modules {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Select resolves the modules this process should serve. An empty selection
// means all of them, which is how the service runs as a single deployment.
func (r *Registry) Select(names []string) ([]Module, error) {
	if len(names) == 0 {
		names = r.Names()
	}

	out := make([]Module, 0, len(names))
	var unknown []string
	for _, name := range names {
		m, ok := r.modules[name]
		if !ok {
			unknown = append(unknown, name)
			continue
		}
		out = append(out, m)
	}
	if len(unknown) > 0 {
		return nil, fmt.Errorf(
			"unknown module(s) %s; registered: %s",
			strings.Join(unknown, ", "), strings.Join(r.Names(), ", "),
		)
	}
	return out, nil
}
