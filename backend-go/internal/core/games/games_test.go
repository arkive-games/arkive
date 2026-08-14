package games_test

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/core/games"
)

// The registry exists twice — once in Go, once as core.game_keys() in the
// migration that check constraints call. Two copies of one list drift, and the
// failure mode is silent in the direction that matters: a key added to Go but not
// to SQL passes every request validation and is then rejected by the database as a
// check violation, which surfaces as a 500 rather than a 422.
//
// So the migrations are the fixture. If this fails, the two were edited apart.
//
// The whole directory is scanned and the *last* definition wins, rather than one file
// being named: adding a game is a new migration with another CREATE OR REPLACE, and a
// test pinned to the original filename would then parse a superseded list and pass while
// checking nothing.
const migrationsDir = "../migrations"

var gameKeysDefinition = regexp.MustCompile(
	`(?s)CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+core\.game_keys\(\).*?SELECT ARRAY\[([^\]]*)\]`)

func TestKeysMatchTheMigrations(t *testing.T) {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		t.Fatalf("read migrations: %v", err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	// Goose applies them in filename order, so the last definition in that order is the
	// one a migrated database ends up with.
	sort.Strings(names)

	var latest string
	var from string
	for _, name := range names {
		source, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if all := gameKeysDefinition.FindAllStringSubmatch(string(source), -1); all != nil {
			latest = all[len(all)-1][1]
			from = name
		}
	}
	if latest == "" {
		t.Fatalf("no core.game_keys() definition found in %s; did it change shape?", migrationsDir)
	}
	t.Logf("comparing against the definition in %s", from)

	var fromSQL []string
	for _, raw := range strings.Split(latest, ",") {
		fromSQL = append(fromSQL, strings.Trim(strings.TrimSpace(raw), "'"))
	}

	if strings.Join(fromSQL, ",") != strings.Join(games.Keys, ",") {
		t.Errorf("registry drift.\n  Go:  %v\n  SQL: %v\nEdit both, in one commit.", games.Keys, fromSQL)
	}
}

func TestValid(t *testing.T) {
	for _, key := range games.Keys {
		if !games.Valid(key) {
			t.Errorf("Valid(%q) = false, want true for a registered key", key)
		}
	}

	// Case matters, and so does whitespace: these reach the database as-is, and a
	// key that differs only in case would create a second cabin nothing links to.
	for _, key := range []string{"", "not-a-game", "Palworld", "palworld ", "PALWORLD"} {
		if games.Valid(key) {
			t.Errorf("Valid(%q) = true, want false", key)
		}
	}
}
