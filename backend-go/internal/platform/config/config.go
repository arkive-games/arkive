// Package config loads service configuration from the environment.
//
// Every setting has a default that is safe for local development, except the
// two secrets: they must be set explicitly outside debug mode. The Python
// service shipped placeholder defaults ("YOUR-JWT-SECRET-KEY"), which meant a
// misconfigured production deploy silently signed tokens with a public string.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the fully resolved service configuration.
type Config struct {
	Debug bool

	// Modules names the modules this process serves. Empty means all
	// registered modules. Splitting the service into one process per game is
	// a change to this value and nothing else.
	Modules []string

	Server   Server
	Postgres Postgres
	Auth     Auth
	CORS     CORS
}

// Server holds HTTP listener settings.
type Server struct {
	Host      string
	Port      int
	APIPrefix string
}

// Addr renders the listen address.
func (s Server) Addr() string {
	return fmt.Sprintf("%s:%d", s.Host, s.Port)
}

// Postgres holds database connection settings.
type Postgres struct {
	// URL, when set, is used verbatim and the discrete fields are ignored.
	// Managed Postgres providers hand out a single connection string, and
	// tests point at an ephemeral instance the same way.
	URL string

	Host     string
	Port     int
	User     string
	Password string
	Database string
	SSLMode  string
	MaxConns int
}

// DSN renders a libpq connection URL. The password is escaped, so passwords
// containing "@" or "/" connect correctly.
func (p Postgres) DSN() string {
	if p.URL != "" {
		return p.URL
	}
	u := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(p.User, p.Password),
		Host:   fmt.Sprintf("%s:%d", p.Host, p.Port),
		Path:   "/" + p.Database,
	}
	q := u.Query()
	q.Set("sslmode", p.SSLMode)
	u.RawQuery = q.Encode()
	return u.String()
}

// Auth holds token, cookie and registration-gate settings.
type Auth struct {
	JWTSecret string

	// JWTAudience scopes session tokens to this service. It is Arkive's own
	// value, not the Python service's "fastapi-users:auth", so tokens issued
	// before the rewrite are rejected and every user signs in once more.
	JWTAudience string

	TokenLifetime       time.Duration
	ResetTokenLifetime  time.Duration
	VerifyTokenLifetime time.Duration

	CookieName     string
	CookieSecure   bool
	CookieSameSite string
	CookieDomain   string
	CookiePath     string

	AltchaHMACKey   string
	AltchaMaxNumber int64

	// RegisterPerMinute is the per-IP registration rate limit.
	RegisterPerMinute int

	// Argon2 parameters. Defaults match what pwdlib writes, so hashes stay
	// mutually readable during cutover.
	Argon2Memory      uint32
	Argon2Iterations  uint32
	Argon2Parallelism uint8
	Argon2SaltLength  uint32
	Argon2KeyLength   uint32
}

// CORS holds cross-origin settings.
type CORS struct {
	AllowedOrigins   []string
	AllowCredentials bool
}

// Load reads configuration from the environment and validates it.
func Load() (Config, error) {
	c := Config{
		Debug:   envBool("DEBUG", false),
		Modules: envList("ARKIVE_MODULES", nil),
		Server: Server{
			Host:      envString("SERVER_HOST", "0.0.0.0"),
			Port:      envInt("SERVER_PORT", 9000),
			APIPrefix: envString("API_PREFIX", "/api/v1"),
		},
		Postgres: Postgres{
			URL:      envString("POSTGRES_URL", ""),
			Host:     envString("POSTGRES_HOST", "localhost"),
			Port:     envInt("POSTGRES_PORT", 5432),
			User:     envString("POSTGRES_USERNAME", "arkive"),
			Password: envString("POSTGRES_PASSWORD", "pass"),
			Database: envString("POSTGRES_DATABASE", "arkive"),
			SSLMode:  envString("POSTGRES_SSLMODE", "disable"),
			MaxConns: envInt("POSTGRES_MAX_CONNS", 10),
		},
		Auth: Auth{
			JWTSecret:           envString("JWT_SECRET_KEY", ""),
			JWTAudience:         envString("JWT_AUDIENCE", "arkive:auth"),
			TokenLifetime:       envDuration("JWT_LIFETIME", 14*24*time.Hour),
			ResetTokenLifetime:  envDuration("RESET_TOKEN_LIFETIME", time.Hour),
			VerifyTokenLifetime: envDuration("VERIFY_TOKEN_LIFETIME", 24*time.Hour),

			CookieName:     envString("AUTH_COOKIE_NAME", "arkive_auth"),
			CookieSecure:   envBool("AUTH_COOKIE_SECURE", true),
			CookieSameSite: envString("AUTH_COOKIE_SAMESITE", "lax"),
			CookieDomain:   envString("AUTH_COOKIE_DOMAIN", ""),
			CookiePath:     envString("AUTH_COOKIE_PATH", "/"),

			AltchaHMACKey:   envString("ALTCHA_HMAC_KEY", ""),
			AltchaMaxNumber: int64(envInt("ALTCHA_MAX_NUMBER", 50000)),

			RegisterPerMinute: envInt("REGISTER_PER_MINUTE", 5),

			Argon2Memory:      uint32(envInt("ARGON2_MEMORY_KIB", 65536)),
			Argon2Iterations:  uint32(envInt("ARGON2_ITERATIONS", 3)),
			Argon2Parallelism: uint8(envInt("ARGON2_PARALLELISM", 4)),
			Argon2SaltLength:  uint32(envInt("ARGON2_SALT_LENGTH", 16)),
			Argon2KeyLength:   uint32(envInt("ARGON2_KEY_LENGTH", 32)),
		},
		CORS: CORS{
			AllowedOrigins:   envList("ALLOWED_ORIGINS", []string{"*"}),
			AllowCredentials: envBool("ALLOW_CREDENTIALS", true),
		},
	}

	if err := c.validate(); err != nil {
		return Config{}, err
	}
	return c, nil
}

var errPlaceholderSecret = errors.New("refusing to start with a placeholder secret")

func (c *Config) validate() error {
	var problems []string

	// Outside debug the secrets must be real. In debug we fill deterministic
	// development values so `go run ./cmd/arkive` works with no setup.
	if c.Auth.JWTSecret == "" {
		if c.Debug {
			c.Auth.JWTSecret = "development-jwt-secret-do-not-use-in-production"
		} else {
			problems = append(problems, "JWT_SECRET_KEY is required")
		}
	}
	if c.Auth.AltchaHMACKey == "" {
		if c.Debug {
			c.Auth.AltchaHMACKey = "development-altcha-key-do-not-use-in-production"
		} else {
			problems = append(problems, "ALTCHA_HMAC_KEY is required")
		}
	}
	if !c.Debug {
		for name, v := range map[string]string{
			"JWT_SECRET_KEY":  c.Auth.JWTSecret,
			"ALTCHA_HMAC_KEY": c.Auth.AltchaHMACKey,
		} {
			if strings.HasPrefix(v, "YOUR-") || strings.HasPrefix(v, "development-") {
				problems = append(problems, name+" still holds a placeholder value")
			}
		}
	}
	if c.Auth.Argon2Parallelism == 0 {
		problems = append(problems, "ARGON2_PARALLELISM must be at least 1")
	}
	if c.Postgres.MaxConns < 1 {
		problems = append(problems, "POSTGRES_MAX_CONNS must be at least 1")
	}

	if len(problems) > 0 {
		return fmt.Errorf("%w: %s", errPlaceholderSecret, strings.Join(problems, "; "))
	}
	return nil
}

func envString(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envBool(key string, def bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}

func envDuration(key string, def time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
		// Bare integers are seconds, matching JWT_EXPIRE_SECONDS.
		if n, err := strconv.Atoi(v); err == nil {
			return time.Duration(n) * time.Second
		}
	}
	return def
}

func envList(key string, def []string) []string {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return def
	}
	return out
}
