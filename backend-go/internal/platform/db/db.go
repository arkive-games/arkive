// Package db opens the connection pool and runs per-schema migrations.
package db

import (
	"context"
	"fmt"
	"io/fs"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// Open creates a connection pool and verifies it can reach the database.
func Open(ctx context.Context, cfg config.Postgres) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DSN())
	if err != nil {
		return nil, fmt.Errorf("parse postgres dsn: %w", err)
	}
	poolCfg.MaxConns = int32(cfg.MaxConns)
	poolCfg.MaxConnLifetime = time.Hour
	poolCfg.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return pool, nil
}

// safeSchemaName guards the schema identifier that gets interpolated into DDL.
// Schema names come from module definitions rather than user input, but the
// interpolation is unavoidable (identifiers cannot be bound as parameters), so
// the constraint is enforced rather than assumed.
var safeSchemaName = regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`)

// Migrate runs one module's migration stream.
//
// Each module gets an independent stream with its own version table inside its
// own schema, so a module can never observe or replay another module's
// migrations. This is what keeps the option of splitting the service into one
// process per module open: the split becomes a deployment change rather than a
// database change.
func Migrate(ctx context.Context, pool *pgxpool.Pool, schema string, fsys fs.FS) error {
	if !safeSchemaName.MatchString(schema) {
		return fmt.Errorf("invalid schema name %q", schema)
	}

	// goose stores its version table in the module's schema, so the schema has
	// to exist first.
	if _, err := pool.Exec(ctx, fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %q", schema)); err != nil {
		return fmt.Errorf("create schema %s: %w", schema, err)
	}

	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()

	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		sqlDB,
		fsys,
		goose.WithTableName(schema+".goose_db_version"),
	)
	if err != nil {
		return fmt.Errorf("build migration provider for %s: %w", schema, err)
	}

	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("migrate schema %s: %w", schema, err)
	}
	return nil
}

// MigrateDown rolls one module's stream back to the given version. It exists
// so tests can assert the down path is real rather than a stub.
func MigrateDown(ctx context.Context, pool *pgxpool.Pool, schema string, fsys fs.FS, version int64) error {
	if !safeSchemaName.MatchString(schema) {
		return fmt.Errorf("invalid schema name %q", schema)
	}

	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()

	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		sqlDB,
		fsys,
		goose.WithTableName(schema+".goose_db_version"),
	)
	if err != nil {
		return fmt.Errorf("build migration provider for %s: %w", schema, err)
	}

	if _, err := provider.DownTo(ctx, version); err != nil {
		return fmt.Errorf("roll back schema %s: %w", schema, err)
	}
	return nil
}
