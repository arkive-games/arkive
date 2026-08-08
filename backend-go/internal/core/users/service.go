package users

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Service implements the account use cases.
type Service struct {
	q      *coredb.Queries
	hasher *auth.Hasher
	tokens *auth.Tokens
	mailer auth.Mailer
	logger *slog.Logger
}

// NewService wires the account service.
func NewService(q *coredb.Queries, hasher *auth.Hasher, tokens *auth.Tokens, mailer auth.Mailer, logger *slog.Logger) *Service {
	return &Service{q: q, hasher: hasher, tokens: tokens, mailer: mailer, logger: logger}
}

// Principal implements auth.PrincipalStore so the identity middleware can
// resolve a token's subject without importing this package's concrete types.
func (s *Service) Principal(ctx context.Context, id uuid.UUID) (auth.Principal, error) {
	u, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.Principal{}, apierr.New(apierr.UserNotFound, "")
		}
		return auth.Principal{}, fmt.Errorf("load user: %w", err)
	}
	return auth.Principal{
		ID:          u.ID,
		Name:        u.Name,
		IsActive:    u.IsActive,
		IsSuperuser: u.IsSuperuser,
		IsVerified:  u.IsVerified,
	}, nil
}

// Register creates an account.
func (s *Service) Register(ctx context.Context, in RegisterInput) (UserRead, error) {
	name := strings.TrimSpace(in.Name)
	email := normalizeEmail(in.Email)

	if err := validateName(name); err != nil {
		return UserRead{}, err
	}
	if err := validateEmail(email); err != nil {
		return UserRead{}, err
	}
	if err := validatePassword(in.Password, email, name); err != nil {
		return UserRead{}, err
	}

	hash, err := s.hasher.Hash(in.Password)
	if err != nil {
		return UserRead{}, fmt.Errorf("hash password: %w", err)
	}

	// Uniqueness is enforced by the database rather than by a prior SELECT:
	// a check-then-insert races two concurrent registrations for the same
	// address and lets both through.
	u, err := s.q.CreateUser(ctx, coredb.CreateUserParams{
		ID:             uuid.New(),
		Name:           name,
		Email:          email,
		HashedPassword: hash,
		IsActive:       true,
		IsSuperuser:    false,
		IsVerified:     false,
	})
	if err != nil {
		return UserRead{}, mapConstraintError(err)
	}
	return toUserRead(u), nil
}

// Authenticate verifies credentials and returns the account.
//
// Every failure — unknown address, wrong password, disabled account — returns
// the same error, because distinguishing them turns the login form into an
// account-enumeration oracle.
func (s *Service) Authenticate(ctx context.Context, email, password string) (UserRead, error) {
	badCredentials := apierr.New(apierr.UserBadCredentials, "incorrect email or password")

	u, err := s.q.GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Burn comparable time so response latency does not disclose
			// whether the address is registered.
			s.hasher.VerifyDummy(password)
			return UserRead{}, badCredentials
		}
		return UserRead{}, fmt.Errorf("load user: %w", err)
	}

	ok, needsRehash, err := s.hasher.Verify(u.HashedPassword, password)
	if err != nil {
		// A hash we cannot parse is corrupted data, not a wrong password.
		s.logger.ErrorContext(ctx, "stored password hash is unreadable",
			slog.String("user_id", u.ID.String()), slog.Any("error", err))
		return UserRead{}, apierr.New(apierr.InternalServer, "").Wrap(err)
	}
	if !ok || !u.IsActive {
		return UserRead{}, badCredentials
	}

	if needsRehash {
		// Opportunistic upgrade: this is the only moment the plaintext is
		// available. Failure must not block a valid login.
		if upgraded, hashErr := s.hasher.Hash(password); hashErr == nil {
			if _, updErr := s.q.UpdateUser(ctx, coredb.UpdateUserParams{
				ID:             u.ID,
				HashedPassword: &upgraded,
			}); updErr != nil {
				s.logger.WarnContext(ctx, "could not upgrade password hash",
					slog.String("user_id", u.ID.String()), slog.Any("error", updErr))
			}
		}
	}

	return toUserRead(u), nil
}

// ByID loads one account.
func (s *Service) ByID(ctx context.Context, id uuid.UUID) (UserRead, error) {
	u, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserRead{}, apierr.New(apierr.UserNotFound, "no such user")
		}
		return UserRead{}, fmt.Errorf("load user: %w", err)
	}
	return toUserRead(u), nil
}

// Update applies a partial edit.
//
// privileged must be true only for an administrator. Without it the
// is_active, is_superuser and is_verified fields are ignored rather than
// rejected, matching fastapi-users, so a user editing their own profile cannot
// promote themselves by adding a field to the request body.
func (s *Service) Update(ctx context.Context, id uuid.UUID, in UpdateInput, privileged bool) (UserRead, error) {
	current, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserRead{}, apierr.New(apierr.UserNotFound, "no such user")
		}
		return UserRead{}, fmt.Errorf("load user: %w", err)
	}

	params := coredb.UpdateUserParams{ID: id}

	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if err := validateName(name); err != nil {
			return UserRead{}, err
		}
		params.Name = &name
	}

	if in.Email != nil {
		email := normalizeEmail(*in.Email)
		if err := validateEmail(email); err != nil {
			return UserRead{}, err
		}
		if email != current.Email {
			params.Email = &email
			// The new address has not been proven, so verification must be
			// withdrawn. Otherwise changing an address inherits the previous
			// address's verified status.
			unverified := false
			params.IsVerified = &unverified
		}
	}

	if in.Password != nil {
		email := current.Email
		if params.Email != nil {
			email = *params.Email
		}
		name := current.Name
		if params.Name != nil {
			name = *params.Name
		}
		if err := validatePassword(*in.Password, email, name); err != nil {
			return UserRead{}, err
		}
		hash, err := s.hasher.Hash(*in.Password)
		if err != nil {
			return UserRead{}, fmt.Errorf("hash password: %w", err)
		}
		params.HashedPassword = &hash
	}

	if privileged {
		if in.IsActive != nil {
			params.IsActive = in.IsActive
		}
		if in.IsSuperuser != nil {
			params.IsSuperuser = in.IsSuperuser
		}
		if in.IsVerified != nil {
			params.IsVerified = in.IsVerified
		}
	}

	u, err := s.q.UpdateUser(ctx, params)
	if err != nil {
		return UserRead{}, mapConstraintError(err)
	}
	return toUserRead(u), nil
}

// Delete removes an account.
func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	rows, err := s.q.DeleteUser(ctx, id)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if rows == 0 {
		return apierr.New(apierr.UserNotFound, "no such user")
	}
	return nil
}

// Search lists accounts matching an optional name or email fragment.
func (s *Service) Search(ctx context.Context, name, email *string, page, pageSize int) ([]UserRead, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	total, err := s.q.CountUsers(ctx, coredb.CountUsersParams{Name: name, Email: email})
	if err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	rows, err := s.q.SearchUsers(ctx, coredb.SearchUsersParams{
		Name:         name,
		Email:        email,
		ResultLimit:  int32(pageSize),
		ResultOffset: int32((page - 1) * pageSize),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("search users: %w", err)
	}

	out := make([]UserRead, 0, len(rows))
	for _, u := range rows {
		out = append(out, toUserRead(u))
	}
	return out, total, nil
}

// BecomeSuperuser promotes the caller to administrator, but only while no
// administrator exists. It is the bootstrap for a fresh deployment.
//
// The Python endpoint could never succeed: it was guarded by
// get_current_superuser, so the caller had to already be an administrator, and
// then refused if any administrator existed. Requiring only an authenticated
// user restores the evident intent.
func (s *Service) BecomeSuperuser(ctx context.Context, id uuid.UUID) (UserRead, error) {
	exists, err := s.q.SuperuserExists(ctx)
	if err != nil {
		return UserRead{}, fmt.Errorf("check for existing superuser: %w", err)
	}
	if exists {
		return UserRead{}, apierr.New(apierr.Forbidden,
			"an administrator already exists; ask them to promote you")
	}

	promote := true
	u, err := s.q.UpdateUser(ctx, coredb.UpdateUserParams{ID: id, IsSuperuser: &promote})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserRead{}, apierr.New(apierr.UserNotFound, "no such user")
		}
		return UserRead{}, fmt.Errorf("promote user: %w", err)
	}
	s.logger.WarnContext(ctx, "user promoted to administrator via bootstrap endpoint",
		slog.String("user_id", u.ID.String()), slog.String("name", u.Name))
	return toUserRead(u), nil
}

// ForgotPassword issues a reset token and hands it to the mailer.
//
// It reports success even for an unknown address: a distinguishable response
// turns this endpoint into a registration oracle.
func (s *Service) ForgotPassword(ctx context.Context, email string) error {
	u, err := s.q.GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("load user: %w", err)
	}
	if !u.IsActive {
		return nil
	}

	token, err := s.tokens.IssueReset(u.ID, u.HashedPassword)
	if err != nil {
		return fmt.Errorf("issue reset token: %w", err)
	}
	if err := s.mailer.SendPasswordReset(ctx, u.Email, token); err != nil {
		return fmt.Errorf("send reset mail: %w", err)
	}
	return nil
}

// ResetPassword consumes a reset token and sets a new password.
func (s *Service) ResetPassword(ctx context.Context, token, newPassword string) error {
	id, fingerprint, err := s.tokens.ParseReset(token)
	if err != nil {
		return apierr.New(apierr.InvalidToken, "this reset link is invalid or has expired")
	}

	u, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.New(apierr.InvalidToken, "this reset link is invalid or has expired")
		}
		return fmt.Errorf("load user: %w", err)
	}

	// The fingerprint pins the token to the password it was issued against, so
	// a link cannot be replayed after it has already been used.
	if !s.tokens.MatchesFingerprint(fingerprint, u.HashedPassword) {
		return apierr.New(apierr.InvalidToken, "this reset link has already been used")
	}
	if err := validatePassword(newPassword, u.Email, u.Name); err != nil {
		return err
	}

	hash, err := s.hasher.Hash(newPassword)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if _, err := s.q.UpdateUser(ctx, coredb.UpdateUserParams{ID: id, HashedPassword: &hash}); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}

// RequestVerify issues an email-verification token. Like ForgotPassword it
// reports success regardless, to avoid disclosing which addresses exist.
func (s *Service) RequestVerify(ctx context.Context, email string) error {
	u, err := s.q.GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("load user: %w", err)
	}
	if u.IsVerified || !u.IsActive {
		return nil
	}

	token, err := s.tokens.IssueVerify(u.ID, u.Email)
	if err != nil {
		return fmt.Errorf("issue verification token: %w", err)
	}
	if err := s.mailer.SendVerification(ctx, u.Email, token); err != nil {
		return fmt.Errorf("send verification mail: %w", err)
	}
	return nil
}

// Verify consumes a verification token and marks the address confirmed.
func (s *Service) Verify(ctx context.Context, token string) (UserRead, error) {
	invalid := apierr.New(apierr.InvalidToken, "this verification link is invalid or has expired")

	id, email, err := s.tokens.ParseVerify(token)
	if err != nil {
		return UserRead{}, invalid
	}

	u, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserRead{}, invalid
		}
		return UserRead{}, fmt.Errorf("load user: %w", err)
	}
	// The token names the address it was issued for, so a link sent to a
	// previous address cannot verify a new one.
	if u.Email != email {
		return UserRead{}, invalid
	}
	if u.IsVerified {
		return UserRead{}, apierr.New(apierr.UserAlreadyVerified, "this address is already verified")
	}

	verified := true
	updated, err := s.q.UpdateUser(ctx, coredb.UpdateUserParams{ID: id, IsVerified: &verified})
	if err != nil {
		return UserRead{}, fmt.Errorf("mark verified: %w", err)
	}
	return toUserRead(updated), nil
}

// mapConstraintError turns a database constraint violation into the API's
// vocabulary, so a race between two registrations produces a clear conflict
// rather than a 500.
func mapConstraintError(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return fmt.Errorf("write user: %w", err)
	}

	switch pgErr.Code {
	case "23505": // unique_violation
		switch pgErr.ConstraintName {
		case "users_name_key":
			return apierr.New(apierr.UserAlreadyExists, "that name is already taken")
		case "users_email_key":
			return apierr.New(apierr.UserEmailAlreadyExists, "that email address is already registered")
		default:
			return apierr.New(apierr.Integrity, "that value is already in use")
		}
	case "23514": // check_violation
		return apierr.New(apierr.Validation, "one of the supplied values is not acceptable")
	default:
		return fmt.Errorf("write user: %w", err)
	}
}
