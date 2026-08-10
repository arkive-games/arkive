package users

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/uploads"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
)

// Service implements the account use cases.
type Service struct {
	q      *coredb.Queries
	hasher *auth.Hasher
	tokens *auth.Tokens
	mailer auth.Mailer
	logger *slog.Logger

	// blobs is nil when object storage is unconfigured, which is allowed in
	// development. Avatar routes then fail with a clear service error while
	// everything else works; see config.S3.Configured.
	blobs blob.Store
}

// NewService wires the account service.
func NewService(q *coredb.Queries, hasher *auth.Hasher, tokens *auth.Tokens, mailer auth.Mailer, blobs blob.Store, logger *slog.Logger) *Service {
	return &Service{q: q, hasher: hasher, tokens: tokens, mailer: mailer, blobs: blobs, logger: logger}
}

// avatarResolver renders stored keys as public URLs, or nil when there is no
// storage to render them from.
func (s *Service) avatarResolver() func(string) string {
	if s.blobs == nil {
		return nil
	}
	return s.blobs.PublicURL
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
	return toUserRead(u, s.avatarResolver()), nil
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

	return toUserRead(u, s.avatarResolver()), nil
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
	return toUserRead(u, s.avatarResolver()), nil
}

// ByAnyUID resolves an account from either kind of public number, and returns
// only what an anonymous caller may see.
//
// One query covers both because the two ranges cannot overlap: a real uid is at
// least 10000 and a special uid at most 9999, both enforced by check
// constraints. So no argument here classifies the number, and no boundary
// constant is duplicated in Go.
//
// A deactivated account reports the same not-found as a number nobody holds.
// Distinguishing them would tell any caller which accounts had been disabled,
// which is the kind of disclosure the login and reset flows already refuse.
func (s *Service) ByAnyUID(ctx context.Context, uid int64) (UserPublic, error) {
	notFound := apierr.New(apierr.UserNotFound, "no such user")

	u, err := s.q.GetUserByAnyUID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserPublic{}, notFound
		}
		return UserPublic{}, fmt.Errorf("load user by uid: %w", err)
	}
	if !u.IsActive {
		return UserPublic{}, notFound
	}
	return toUserPublic(u, s.avatarResolver()), nil
}

// SetAvatar normalises an uploaded image, stores it and points the account at it.
//
// The order of the three steps is the whole design:
//
//  1. Write the object. Its key contains the digest of its own bytes, so it is
//     immutable and its URL can be cached for a year.
//  2. Update the row. Only now is the new avatar the account's. Doing this first
//     would turn a transient upload failure into a permanently broken image.
//  3. Delete the rest of the account's prefix. Every object under it belongs to
//     this account alone, so there is nothing to reference-count and no
//     bucket-wide sweep to schedule — orphans cannot accumulate.
//
// Step 3 failing is not an error the caller needs: the avatar is already set, and
// the next upload will clean up whatever was left. It is logged instead.
func (s *Service) SetAvatar(ctx context.Context, id uuid.UUID, image io.Reader) (UserRead, error) {
	current, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserRead{}, apierr.New(apierr.UserNotFound, "no such user")
		}
		return UserRead{}, fmt.Errorf("load user: %w", err)
	}

	avatar, err := uploads.StoreAvatar(ctx, s.blobs, current.UID, image)
	if err != nil {
		return UserRead{}, err
	}

	u, err := s.q.SetUserAvatar(ctx, coredb.SetUserAvatarParams{ID: id, AvatarKey: &avatar.Key})
	if err != nil {
		return UserRead{}, mapConstraintError(err)
	}

	if err := uploads.RemoveSupersededUploads(ctx, s.blobs, current.UID, avatar.Key); err != nil {
		s.logger.WarnContext(ctx, "could not remove superseded avatars",
			slog.String("user_id", id.String()), slog.Any("error", err))
	}
	return toUserRead(u, s.avatarResolver()), nil
}

// SetAvatarPreset points the account at one of the shared preset avatars.
//
// A preset is an ordinary key in the same column, so this is the upload path
// without the upload. The account's own uploads are then removed, because having
// chosen a preset it no longer references them.
func (s *Service) SetAvatarPreset(ctx context.Context, id uuid.UUID, presetID string) (UserRead, error) {
	if err := uploads.ValidatePreset(presetID); err != nil {
		return UserRead{}, err
	}

	current, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserRead{}, apierr.New(apierr.UserNotFound, "no such user")
		}
		return UserRead{}, fmt.Errorf("load user: %w", err)
	}

	key := uploads.PresetKey(presetID)
	u, err := s.q.SetUserAvatar(ctx, coredb.SetUserAvatarParams{ID: id, AvatarKey: &key})
	if err != nil {
		return UserRead{}, mapConstraintError(err)
	}

	if err := uploads.RemoveAllUploads(ctx, s.blobs, current.UID); err != nil {
		s.logger.WarnContext(ctx, "could not remove superseded avatars",
			slog.String("user_id", id.String()), slog.Any("error", err))
	}
	return toUserRead(u, s.avatarResolver()), nil
}

// ClearAvatar returns an account to its default preset.
//
// The uploaded objects are removed as well. Unlike the content-addressed scheme
// this replaced, an account's uploads are stored under a prefix only it uses, so
// deleting them cannot blank anybody else's picture.
//
// The resulting avatarUrl is not empty: it becomes the preset derived from the
// account's uid.
func (s *Service) ClearAvatar(ctx context.Context, id uuid.UUID) (UserRead, error) {
	u, err := s.q.SetUserAvatar(ctx, coredb.SetUserAvatarParams{ID: id, AvatarKey: nil})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserRead{}, apierr.New(apierr.UserNotFound, "no such user")
		}
		return UserRead{}, fmt.Errorf("clear avatar: %w", err)
	}

	if err := uploads.RemoveAllUploads(ctx, s.blobs, u.UID); err != nil {
		s.logger.WarnContext(ctx, "could not remove superseded avatars",
			slog.String("user_id", id.String()), slog.Any("error", err))
	}
	return toUserRead(u, s.avatarResolver()), nil
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
		// The vanity number is an administrative grant, so it belongs here
		// rather than beside the self-editable fields: a user PATCHing their own
		// profile must not be able to award themselves one.
		//
		// SetSpecialUID is what tells the query to write the column at all. Left
		// false, the existing value survives; set true, special_uid is written
		// verbatim, and a nil value revokes.
		if in.SpecialUID.Set {
			params.SetSpecialUID = true
			if value, ok := in.SpecialUID.Assigned(); ok {
				if err := validateSpecialUID(value); err != nil {
					return UserRead{}, err
				}
				params.SpecialUID = &value
			}
		}
	}

	u, err := s.q.UpdateUser(ctx, params)
	if err != nil {
		return UserRead{}, mapConstraintError(err)
	}
	return toUserRead(u, s.avatarResolver()), nil
}

// Delete removes an account, and with it whatever it uploaded.
//
// The uid is read before the row goes away, because it is what names the storage
// prefix. Objects are removed after the row, so a storage failure cannot leave an
// account that exists with its pictures gone; the reverse could.
func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	var uid int64
	if current, err := s.q.GetUserByID(ctx, id); err == nil {
		uid = current.UID
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("load user: %w", err)
	}

	rows, err := s.q.DeleteUser(ctx, id)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if rows == 0 {
		return apierr.New(apierr.UserNotFound, "no such user")
	}

	if uid != 0 {
		if err := uploads.RemoveAllUploads(ctx, s.blobs, uid); err != nil {
			s.logger.WarnContext(ctx, "could not remove a deleted account's avatars",
				slog.String("user_id", id.String()), slog.Any("error", err))
		}
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
		out = append(out, toUserRead(u, s.avatarResolver()))
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
	return toUserRead(u, s.avatarResolver()), nil
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
	return toUserRead(updated, s.avatarResolver()), nil
}

// mapConstraintError turns a database constraint violation into the API's
// vocabulary, so a race between two registrations produces a clear conflict
// rather than a 500.
//
// Only Code and ConstraintName are read, and that is deliberate: a Postgres
// constraint violation carries the entire offending row in its Detail field,
// hashed_password included. Copying Detail into a response — or into a log line
// at anything short of debug — would publish password hashes on a duplicate-key
// error. The messages here are written by hand for that reason.
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
		case "users_special_uid_key":
			// Losing this race is ordinary: the pool is 10000 numbers wide and
			// two administrators can reach for the same one.
			return apierr.New(apierr.UserSpecialUIDTaken, "that special uid is already assigned to another account")
		default:
			return apierr.New(apierr.Integrity, "that value is already in use")
		}
	case "23514": // check_violation
		if pgErr.ConstraintName == "users_special_uid_range" {
			return apierr.New(apierr.Validation,
				fmt.Sprintf("a special uid must be between %d and %d", minSpecialUID, maxSpecialUID))
		}
		return apierr.New(apierr.Validation, "one of the supplied values is not acceptable")
	default:
		return fmt.Errorf("write user: %w", err)
	}
}

// AvatarPresets lists the selectable preset avatars with their URLs.
//
// The URLs are composed here rather than in each frontend so that the bucket
// layout, and any CDN in front of it, stay a server-side concern. The artwork
// previously lived in one app's static assets, which meant a picker could not be
// rendered from the game sites at all.
func (s *Service) AvatarPresets() AvatarPresetList {
	resolve := s.avatarResolver()
	out := AvatarPresetList{Presets: make([]AvatarPreset, 0, len(uploads.Presets))}
	for _, id := range uploads.Presets {
		url := ""
		if resolve != nil {
			url = resolve(uploads.PresetKey(id))
		}
		out.Presets = append(out.Presets, AvatarPreset{ID: id, URL: url})
	}
	return out
}
