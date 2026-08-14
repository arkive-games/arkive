package roles

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/games"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Service implements role grants and the authorization decisions they drive.
type Service struct {
	q        *coredb.Queries
	accounts AccountSource
	logger   *slog.Logger
}

// NewService wires the roles service.
func NewService(q *coredb.Queries, accounts AccountSource, logger *slog.Logger) *Service {
	return &Service{q: q, accounts: accounts, logger: logger}
}

// Can answers one authorization question for one game.
//
// This function is the whole policy. Every rule lives in the switch below, so adding
// a role or moving a permission is an edit here rather than a hunt through handlers —
// the property the placeholder it replaces was written to preserve.
//
// A site administrator passes everything: the bit is the platform's break-glass, and
// carving exceptions into it would create actions nobody could perform if a game had
// no staff.
func (s *Service) Can(ctx context.Context, p auth.Principal, action Action, game string) (bool, error) {
	// An inactive account holds no permissions even if its grants survive, so that
	// reactivation restores them rather than a deactivation having to revoke them.
	if !p.IsActive {
		return false, nil
	}
	if p.IsSuperuser {
		return true, nil
	}

	// Site-wide by definition: a game's administrator does not speak for the
	// platform, so no grant in any game confers this.
	if action == PostOfficial {
		return false, nil
	}

	// Every remaining action is game-scoped. A post tagged with no game therefore
	// reaches site administrators only — otherwise the administrator of one game
	// could moderate the general channel, which belongs to nobody in particular.
	if game == "" {
		return false, nil
	}

	held, err := s.held(ctx, p.ID, game)
	if err != nil {
		return false, err
	}

	switch action {
	case FeaturePost, GrantGameRole:
		return held[GameAdmin], nil
	case HideContent, HandleReport:
		return held[GameAdmin] || held[GameModerator], nil
	default:
		// An unrecognised action denies rather than permits. A typo in a call site
		// should lock a door, not open one.
		return false, nil
	}
}

// CanAny reports whether the principal may act on content belonging to any of the
// given games.
//
// A forum post carries up to five game tags, and a moderator of one of them may act
// on it. An empty list means content that belongs to no game, which Can already
// answers correctly for site administrators only — so it is passed through rather
// than special-cased here.
func (s *Service) CanAny(ctx context.Context, p auth.Principal, action Action, gameKeys []string) (bool, error) {
	if len(gameKeys) == 0 {
		return s.Can(ctx, p, action, "")
	}
	for _, game := range gameKeys {
		ok, err := s.Can(ctx, p, action, game)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	return false, nil
}

// held reads the roles an account holds in one game.
func (s *Service) held(ctx context.Context, userID uuid.UUID, game string) (map[Role]bool, error) {
	rows, err := s.q.ListRoleGrantsForUserInGame(ctx, coredb.ListRoleGrantsForUserInGameParams{
		UserID: userID,
		Game:   game,
	})
	if err != nil {
		return nil, fmt.Errorf("load role grants: %w", err)
	}
	held := make(map[Role]bool, len(rows))
	for _, row := range rows {
		held[Role(row.Role)] = true
	}
	return held, nil
}

// Grant appoints an account to a role in a game.
//
// Granting is idempotent, so a repeated request is not an error the client has to
// distinguish from a real conflict.
func (s *Service) Grant(ctx context.Context, actor auth.Principal, uid int64, role Role, game string) (GrantRead, error) {
	if err := validate(role, game); err != nil {
		return GrantRead{}, err
	}
	if err := s.mayAppoint(ctx, actor, role, game); err != nil {
		return GrantRead{}, err
	}

	holderID, err := s.accounts.IDByUID(ctx, uid)
	if err != nil {
		return GrantRead{}, err
	}

	row, err := s.q.GrantRole(ctx, coredb.GrantRoleParams{
		ID:        uuid.New(),
		UserID:    holderID,
		Role:      string(role),
		Game:      game,
		GrantedBy: &actor.ID,
	})
	if err != nil {
		return GrantRead{}, fmt.Errorf("grant role: %w", err)
	}

	s.logger.InfoContext(ctx, "role granted",
		slog.String("game", game), slog.String("role", string(role)),
		slog.Int64("holder", uid), slog.String("actor", actor.ID.String()))

	return s.read(ctx, row)
}

// Revoke removes a role from an account. Revoking a role nobody holds is not an
// error: the caller asked for an end state, and that state already holds.
func (s *Service) Revoke(ctx context.Context, actor auth.Principal, uid int64, role Role, game string) error {
	if err := validate(role, game); err != nil {
		return err
	}
	if err := s.mayAppoint(ctx, actor, role, game); err != nil {
		return err
	}

	holderID, err := s.accounts.IDByUID(ctx, uid)
	if err != nil {
		return err
	}

	if _, err := s.q.RevokeRole(ctx, coredb.RevokeRoleParams{
		UserID: holderID,
		Role:   string(role),
		Game:   game,
	}); err != nil {
		return fmt.Errorf("revoke role: %w", err)
	}

	s.logger.InfoContext(ctx, "role revoked",
		slog.String("game", game), slog.String("role", string(role)),
		slog.Int64("holder", uid), slog.String("actor", actor.ID.String()))
	return nil
}

// mayAppoint decides whether the actor may hand out or take back this role.
//
// A game administrator may appoint moderators for their own game but not other
// administrators: promoting a peer is how one compromised account becomes two, and
// there is no reason a game needs to grow its own administrators. Only a site
// administrator does that.
func (s *Service) mayAppoint(ctx context.Context, actor auth.Principal, role Role, game string) error {
	if actor.IsSuperuser && actor.IsActive {
		return nil
	}
	if role == GameAdmin {
		return apierr.New(apierr.Forbidden, "only site administrators may appoint a game administrator")
	}
	allowed, err := s.Can(ctx, actor, GrantGameRole, game)
	if err != nil {
		return err
	}
	if !allowed {
		return apierr.New(apierr.Forbidden, "you do not administer this game")
	}
	return nil
}

// ForGame lists a game's staff. Public: the cabin shows who runs it.
//
// Deliberately not subject to profileVisibility, which gates every other public listing of
// accounts. Holding office over other people's content is not a private fact: a moderator
// who can hide your post and cannot be named is a moderator who cannot be appealed to. An
// account that wants privacy can decline the role.
func (s *Service) ForGame(ctx context.Context, game string) ([]GrantRead, error) {
	if !games.Valid(game) {
		return nil, apierr.New(apierr.NotFound, "no such game")
	}
	rows, err := s.q.ListRoleGrantsForGame(ctx, game)
	if err != nil {
		return nil, fmt.Errorf("list role grants: %w", err)
	}
	return s.readAll(ctx, rows)
}

// ForUser lists every role one account holds, across games.
func (s *Service) ForUser(ctx context.Context, userID uuid.UUID) ([]GrantRead, error) {
	rows, err := s.q.ListRoleGrantsForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list role grants: %w", err)
	}
	return s.readAll(ctx, rows)
}

func validate(role Role, game string) error {
	if !Valid(role) {
		return apierr.New(apierr.Validation, fmt.Sprintf("%q is not a grantable role", role))
	}
	if !games.Valid(game) {
		return apierr.New(apierr.Validation, fmt.Sprintf("%q is not a game this platform serves", game))
	}
	return nil
}

func (s *Service) read(ctx context.Context, row coredb.CoreRoleGrant) (GrantRead, error) {
	out, err := s.readAll(ctx, []coredb.CoreRoleGrant{row})
	if err != nil {
		return GrantRead{}, err
	}
	if len(out) == 0 {
		return GrantRead{}, fmt.Errorf("grant holder %s is missing", row.UserID)
	}
	return out[0], nil
}

// readAll resolves holders in one lookup rather than one per row, matching how the
// forum loads a page of authors.
func (s *Service) readAll(ctx context.Context, rows []coredb.CoreRoleGrant) ([]GrantRead, error) {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.UserID)
	}
	holders, err := s.accounts.PublicByIDs(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("load role holders: %w", err)
	}

	out := make([]GrantRead, 0, len(rows))
	for _, row := range rows {
		holder, ok := holders[row.UserID]
		if !ok {
			// The holder was deleted or deactivated between the two queries. Dropping
			// the row matches how the forum handles an author who vanishes mid-read:
			// a UserPublic with no name is a shape no client should have to handle.
			continue
		}
		out = append(out, GrantRead{
			User:      holder,
			Role:      Role(row.Role),
			Game:      row.Game,
			CreatedAt: row.CreatedAt,
		})
	}
	return out, nil
}
