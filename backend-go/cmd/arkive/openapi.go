package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"time"

	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// writeOpenAPI emits one OpenAPI document per module to disk.
//
// The documents are captured by asking the real router for them rather than by
// building a spec separately, so the committed file is byte-for-byte what a
// running server serves. A separate code path could drift from the server; this
// one cannot.
//
// No database is contacted: modules are mounted only to register routes.
func writeOpenAPI(args []string) error {
	outDir := "openapi"
	if len(args) > 0 {
		outDir = args[0]
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", outDir, err)
	}

	cfg := specConfig()
	api.InstallErrorModel()

	reg, err := registry()
	if err != nil {
		return err
	}
	modules, err := reg.Select(nil)
	if err != nil {
		return err
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	router, err := buildRouter(cfg, nil, logger, modules)
	if err != nil {
		return err
	}

	for _, m := range modules {
		path := cfg.Server.APIPrefix + "/" + m.Name() + "/openapi.json"

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			return fmt.Errorf("GET %s returned %d, want 200", path, rec.Code)
		}

		// Re-indent so the committed artifact is diff-friendly and the CI
		// drift check compares formatting-stable bytes.
		var pretty bytes.Buffer
		if err := json.Indent(&pretty, rec.Body.Bytes(), "", "  "); err != nil {
			return fmt.Errorf("format %s spec: %w", m.Name(), err)
		}
		pretty.WriteByte('\n')

		target := filepath.Join(outDir, m.Name()+".json")
		if err := os.WriteFile(target, pretty.Bytes(), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", target, err)
		}
		fmt.Printf("wrote %s\n", target)
	}
	return nil
}

// specConfig is a fixed configuration used only for document generation.
//
// It deliberately ignores the environment: the generated specs must depend on
// the code alone, or the CI drift check would fail or pass according to whose
// machine ran it.
func specConfig() config.Config {
	return config.Config{
		Server: config.Server{APIPrefix: "/api/v1"},
		Auth: config.Auth{
			JWTSecret:           "openapi-generation-only",
			JWTAudience:         "arkive:auth",
			TokenLifetime:       14 * 24 * time.Hour,
			ResetTokenLifetime:  time.Hour,
			VerifyTokenLifetime: 24 * time.Hour,
			CookieName:          "arkive_auth",
			CookiePath:          "/",
			AltchaHMACKey:       "openapi-generation-only",
			AltchaMaxNumber:     50000,
			RegisterPerMinute:   5,
			Argon2Memory:        65536,
			Argon2Iterations:    3,
			Argon2Parallelism:   4,
			Argon2SaltLength:    16,
			Argon2KeyLength:     32,
		},
	}
}
