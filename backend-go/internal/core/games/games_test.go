package games_test

import (
	"os"
	"regexp"
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
// So the migration is the fixture. If this fails, the two were edited apart.
const migrationPath = "../migrations/20260814000001_game_key_registry.sql"

var arrayLiteral = regexp.MustCompile(`SELECT ARRAY\[([^\]]*)\]`)

func TestKeysMatchTheMigration(t *testing.T) {
	source, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}

	match := arrayLiteral.FindSubmatch(source)
	if match == nil {
		t.Fatalf("no `SELECT ARRAY[...]` found in %s; did core.game_keys() change shape?", migrationPath)
	}

	var fromSQL []string
	for _, raw := range strings.Split(string(match[1]), ",") {
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
