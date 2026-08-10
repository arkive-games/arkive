package users

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// UserRead is the public representation of an account.
//
// The password hash has no field here, so no endpoint can serialise it by
// forgetting to strip it — the type simply cannot carry one.
type UserRead struct {
	ID          uuid.UUID `json:"id" doc:"Account identifier"`
	UID         int64     `json:"uid" doc:"Permanent account number, 10000 or above; never reused" example:"10042"`
	SpecialUID  *int32    `json:"specialUid" doc:"Vanity number below 10000, or null; may be reassigned" example:"42"`
	Name        string    `json:"name" doc:"Display name, unique across the site"`
	Email       string    `json:"email" doc:"Email address, stored lowercased"`
	IsActive    bool      `json:"isActive" doc:"False for disabled accounts"`
	IsSuperuser bool      `json:"isSuperuser" doc:"True for administrators"`
	IsVerified  bool      `json:"isVerified" doc:"True once the email address has been confirmed"`
	AvatarURL   *string   `json:"avatarUrl" doc:"Absolute URL of the account picture, or null" example:"https://cdn.arkive.test/avatars/abc.256.jpg"`
	CreatedAt   time.Time `json:"createdAt" doc:"When the account was created"`
	UpdatedAt   time.Time `json:"updatedAt" doc:"When the account was last modified"`
}

// avatarURL renders a stored key as the address a browser fetches.
//
// It takes the resolver rather than reading configuration so that the DTO layer
// stays ignorant of buckets and CDNs, and so a test can assert the URL without
// object storage. A nil resolver, which is what an unconfigured development
// server has, renders as no avatar rather than a broken link.
func avatarURL(resolve func(string) string, key *string) *string {
	if key == nil || *key == "" || resolve == nil {
		return nil
	}
	url := resolve(*key)
	return &url
}

func toUserRead(u coredb.CoreUser, resolve func(string) string) UserRead {
	return UserRead{
		AvatarURL:   avatarURL(resolve, u.AvatarKey),
		ID:          u.ID,
		UID:         u.UID,
		SpecialUID:  u.SpecialUID,
		Name:        u.Name,
		Email:       u.Email,
		IsActive:    u.IsActive,
		IsSuperuser: u.IsSuperuser,
		IsVerified:  u.IsVerified,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
}

// UserPublic is what an unauthenticated visitor may see about an account.
//
// It is a separate type rather than a UserRead with fields blanked out, for the
// same reason UserRead has no password field: a type that cannot carry an email
// address or a privilege flag cannot leak one, however carelessly a future
// endpoint reuses it.
//
// The uuid is absent too. Permanent links use UID, which is the stable public
// identifier, so the internal key has no reason to travel to anonymous callers.
type UserPublic struct {
	UID        int64     `json:"uid" doc:"Permanent account number; use this in links" example:"10042"`
	SpecialUID *int32    `json:"specialUid" doc:"Vanity number below 10000, or null. Display only: it can change, so never link by it" example:"42"`
	Name       string    `json:"name" doc:"Display name"`
	AvatarURL  *string   `json:"avatarUrl" doc:"Absolute URL of the account picture, or null" example:"https://cdn.arkive.test/avatars/abc.256.jpg"`
	CreatedAt  time.Time `json:"createdAt" doc:"When the account was created"`
}

func toUserPublic(u coredb.CoreUser, resolve func(string) string) UserPublic {
	return UserPublic{
		AvatarURL:  avatarURL(resolve, u.AvatarKey),
		UID:        u.UID,
		SpecialUID: u.SpecialUID,
		Name:       u.Name,
		CreatedAt:  u.CreatedAt,
	}
}

// RegisterInput is a new-account request.
type RegisterInput struct {
	Name     string
	Email    string
	Password string
}

// UpdateInput is a partial account edit. A nil field means "leave unchanged",
// which is why every field is a pointer: without that, omitting a field and
// clearing it would be indistinguishable.
type UpdateInput struct {
	Name     *string
	Email    *string
	Password *string

	// Privileged fields are only honoured for an administrator; see
	// Service.Update.
	IsActive    *bool
	IsSuperuser *bool
	IsVerified  *bool

	// SpecialUID is privileged too, and needs three states rather than two:
	// absent leaves any existing vanity number alone, an explicit null revokes
	// it, and a value assigns or moves it. A plain pointer collapses the first
	// two into nil, which is why this one field is an api.Optional.
	SpecialUID api.Optional[int32]
}

const (
	minPasswordLength = 8
	// Argon2id has no input length limit, but an unbounded password is a
	// cheap way to make the server do expensive work.
	maxPasswordLength = 1024
	maxNameLength     = 64
	maxEmailLength    = 320

	// The vanity range. users_special_uid_range is the actual enforcement; these
	// exist so a rejection can name the bounds instead of surfacing a generic
	// check violation.
	//
	// Deliberately there is no matching constant for the real-uid floor of
	// 10000. Nothing in Go decides which kind of number it has been handed —
	// the two ranges are disjoint in the schema, so the database resolves either
	// one and cannot disagree with a copy of the boundary kept here.
	minSpecialUID = 0
	maxSpecialUID = 9999
)

// normalizeEmail lowercases and trims an address so that lookups, uniqueness
// and storage all agree on one form.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validateEmail(email string) error {
	if email == "" {
		return apierr.New(apierr.Validation, "email is required")
	}
	if len(email) > maxEmailLength {
		return apierr.New(apierr.Validation, "email is too long")
	}
	at := strings.Index(email, "@")
	if at < 1 || at == len(email)-1 || strings.Contains(email, " ") {
		return apierr.New(apierr.Validation, "email is not a valid address")
	}
	return nil
}

func validateName(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return apierr.New(apierr.Validation, "name is required")
	}
	if utf8.RuneCountInString(trimmed) > maxNameLength {
		return apierr.New(apierr.Validation, "name is too long")
	}
	return nil
}

// validateSpecialUID checks the vanity range before the database does, so the
// caller is told the bounds rather than being handed a check-constraint failure.
func validateSpecialUID(uid int32) error {
	if uid < minSpecialUID || uid > maxSpecialUID {
		return apierr.New(apierr.Validation,
			fmt.Sprintf("a special uid must be between %d and %d", minSpecialUID, maxSpecialUID))
	}
	return nil
}

// validatePassword enforces the password policy. The rules mirror the
// fastapi-users defaults the site already advertised.
func validatePassword(password, email, name string) error {
	if utf8.RuneCountInString(password) < minPasswordLength {
		return apierr.New(apierr.UserInvalidPassword,
			"password must be at least 8 characters")
	}
	if len(password) > maxPasswordLength {
		return apierr.New(apierr.UserInvalidPassword,
			"password must be at most 1024 bytes")
	}
	lower := strings.ToLower(password)
	if email != "" && strings.Contains(lower, strings.ToLower(email)) {
		return apierr.New(apierr.UserInvalidPassword,
			"password must not contain your email address")
	}
	if name != "" && strings.EqualFold(strings.TrimSpace(password), strings.TrimSpace(name)) {
		return apierr.New(apierr.UserInvalidPassword,
			"password must not be your display name")
	}
	return nil
}
