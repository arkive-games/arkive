// Package games holds the registry of games the platform serves.
//
// Games are code, not data. A game arrives as a frontend app directory, a tools
// pipeline, two artifact repositories, a deploy target and a DNS name, so a row in
// a table could only ever disagree with the deployment — and would have to be
// seeded separately in development, staging and production. Game-scoped tables
// therefore reference these keys as plain text guarded by a check constraint, with
// no foreign key to join to. See §5 of
// docs/superpowers/specs/2026-08-08-go-backend-architecture-design.md.
package games

// Keys is every game the platform serves, in the order the portal lists them.
//
// A key is permanent. It is already baked into an app directory, a pipeline, two
// artifact repositories, a DNS name and a published Bilibili Toy slug — which the
// Toy platform will not let us change — so renaming one is a coordinated migration
// across all of those rather than an edit here. Display names are separate: they
// live in the frontend's message catalogues and may be changed freely.
//
// Adding a game means updating core.game_keys() in a migration to match. The test
// alongside this file is what stops the two from drifting.
var Keys = []string{"aion2", "gmzz", "palworld", "vrising", "sts2"}

// Valid reports whether key names a game the platform serves.
//
// The list is short enough that a linear scan beats a map: it avoids the
// package-level mutable state a prebuilt map would introduce, and it is called at
// most five times per request.
func Valid(key string) bool {
	for _, known := range Keys {
		if key == known {
			return true
		}
	}
	return false
}
