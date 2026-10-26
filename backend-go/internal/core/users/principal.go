package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// PrincipalStore resolves a token's subject from nothing but the account table
// and the token settings.
//
// It is separate from Service so a game module can identify its callers without
// constructing the whole account service — mailer, hasher, object storage — just to
// read one row. Service delegates to it, so the two cannot disagree about who a
// token belongs to.
type PrincipalStore struct {
	q      *coredb.Queries
	tokens *auth.Tokens
}

// NewPrincipalStore builds the lookup.
func NewPrincipalStore(q *coredb.Queries, tokens *auth.Tokens) *PrincipalStore {
	return &PrincipalStore{q: q, tokens: tokens}
}

// Principal implements auth.PrincipalStore.
func (s *PrincipalStore) Principal(ctx context.Context, id uuid.UUID) (auth.Principal, error) {
	u, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.Principal{}, apierr.New(apierr.UserNotFound, "")
		}
		return auth.Principal{}, fmt.Errorf("load user: %w", err)
	}
	return auth.Principal{
		ID:                 u.ID,
		Name:               u.Name,
		IsActive:           u.IsActive,
		IsSuperuser:        u.IsSuperuser,
		IsVerified:         u.IsVerified,
		SessionFingerprint: s.tokens.SessionFingerprint(u.HashedPassword),
	}, nil
}
