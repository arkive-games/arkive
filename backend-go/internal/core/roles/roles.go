// Package roles decides who may administer or moderate a game.
//
// It replaces the forum's `canPostToChannel`, which its own comment described as "a
// placeholder for a permission system that does not exist yet" and which kept the
// rule in one named function precisely so that replacing it would be a change to one
// place. This is that place.
//
// Two things are deliberately outside this package. Site-wide administration is
// `auth.Principal.IsSuperuser`, for the reasons recorded in the migration: the column
// already carries a last-administrator invariant, a bootstrap route and every
// existing route guard, and duplicating it here would create a window in which the
// two disagree. Ownership of a specific post or comment is also not a role — the
// forum's `ownedPost`/`ownedComment` answer that, and an author is not a moderator.
package roles

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/users"
)

// Role is a game-scoped grant.
type Role string

const (
	// GameAdmin runs a game's cabin: it may feature posts, moderate, and appoint
	// moderators for that game.
	GameAdmin Role = "game_admin"
	// GameModerator may act on that game's content, but appoints nobody.
	GameModerator Role = "game_moderator"
)

// Roles is every grantable role, ordered as the cabin lists them.
var Roles = []Role{GameAdmin, GameModerator}

// Valid reports whether r is a grantable role.
func Valid(r Role) bool {
	for _, known := range Roles {
		if r == known {
			return true
		}
	}
	return false
}

// Action is one authorization question.
//
// Actions are named for what the caller wants to do rather than for the role that
// permits it, so that adding a role does not mean revisiting every call site — the
// mapping lives in Service.Can and nowhere else.
type Action string

const (
	// PostOfficial publishes in the official channel. Site-wide: a game's
	// administrator does not speak for the platform.
	PostOfficial Action = "post:official"
	// FeaturePost puts a post on the editorial shelf.
	FeaturePost Action = "post:feature"
	// HideContent withdraws a post or comment from public view.
	HideContent Action = "content:hide"
	// HandleReport resolves a report.
	HandleReport Action = "report:handle"
	// GrantGameRole appoints or removes a game's staff.
	GrantGameRole Action = "role:grant"
)

// GrantRead is a grant as the API returns it.
//
// The holder is a UserPublic: listing a game's staff is public, so it must expose
// exactly what an anonymous caller may see and no more.
type GrantRead struct {
	User      users.UserPublic `json:"user" doc:"Who holds the role"`
	Role      Role             `json:"role" enum:"game_admin,game_moderator" doc:"What they hold"`
	Game      string           `json:"game" doc:"The game it applies to"`
	CreatedAt time.Time        `json:"createdAt" doc:"When it was granted"`
}

// AccountSource resolves accounts for the roles package.
//
// An interface for the same reason the forum has one: this package needs to turn an
// id into a public view and a public number into an id, not to depend on every
// account use case.
type AccountSource interface {
	PublicByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]users.UserPublic, error)
	IDByUID(ctx context.Context, uid int64) (uuid.UUID, error)
}
