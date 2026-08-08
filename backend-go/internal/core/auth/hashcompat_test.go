package auth

import (
	"context"

	"os"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// dsnEnv points at a database holding imported production accounts. This test
// is read-only and is skipped when unset.
const dsnEnv = "ARKIVE_VERIFY_HASHES_URL"

// TestEveryStoredHashIsReadable is the cutover gate for imported accounts.
//
// It cannot check passwords — the plaintexts are not known — but it can prove
// the thing that matters: that no stored hash is rejected as unreadable. A hash
// this service cannot parse is an account that cannot log in, so a single
// failure here means locked-out users.
//
// It also counts how many hashes would be rewritten on first login. That number
// should be zero for a freshly imported set; a large one means every returning
// user triggers a write, which is a thundering herd on cutover day rather than a
// correctness problem.
func TestEveryStoredHashIsReadable(t *testing.T) {
	dsn := os.Getenv(dsnEnv)
	if dsn == "" {
		t.Skipf("%s is not set; skipping stored-hash verification", dsnEnv)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer conn.Close(ctx)

	cfg := config.Auth{
		Argon2Memory:      65536,
		Argon2Iterations:  3,
		Argon2Parallelism: 4,
		Argon2SaltLength:  16,
		Argon2KeyLength:   32,
	}
	hasher, err := NewHasher(cfg)
	if err != nil {
		t.Fatalf("NewHasher: %v", err)
	}

	rows, err := conn.Query(ctx, `SELECT id, email, hashed_password FROM core.users ORDER BY created_at`)
	if err != nil {
		t.Fatalf("query users: %v", err)
	}
	defer rows.Close()

	var total, unreadable, wouldRehash, falseAccept int
	var firstFailures []string

	for rows.Next() {
		var id, email, hash string
		if err := rows.Scan(&id, &email, &hash); err != nil {
			t.Fatalf("scan: %v", err)
		}
		total++

		// Verifying against a password that is certainly wrong separates
		// "cannot read this hash" (an error) from "wrong password" (false, nil).
		ok, needsRehash, err := hasher.Verify(hash, "\x00 certainly not this account's password \x00")
		switch {
		case err != nil:
			unreadable++
			if len(firstFailures) < 5 {
				firstFailures = append(firstFailures, email+": "+err.Error())
			}
		case ok:
			// Would mean the hash accepts an arbitrary string.
			falseAccept++
			if len(firstFailures) < 5 {
				firstFailures = append(firstFailures, email+": accepted a wrong password")
			}
		case needsRehash:
			wouldRehash++
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate users: %v", err)
	}

	if total == 0 {
		t.Fatal("no accounts found; is this the right database?")
	}
	t.Logf("checked %d accounts: %d unreadable, %d would rehash on login, %d false accepts",
		total, unreadable, wouldRehash, falseAccept)

	if unreadable > 0 {
		t.Fatalf("%d of %d stored hashes cannot be read, so those users could not log in; first: %v",
			unreadable, total, firstFailures)
	}
	if falseAccept > 0 {
		t.Fatalf("%d hashes accepted a wrong password: %v", falseAccept, firstFailures)
	}
	if wouldRehash > 0 {
		// Not a failure: correctness is unaffected and the upgrade is the
		// intended behaviour. Surfaced so the cost is known before cutover.
		t.Logf("note: %d of %d accounts would be rewritten on first login", wouldRehash, total)
	}
}
