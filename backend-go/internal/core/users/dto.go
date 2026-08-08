package users

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// UserRead is the public representation of an account.
//
// The password hash has no field here, so no endpoint can serialise it by
// forgetting to strip it — the type simply cannot carry one.
type UserRead struct {
	ID          uuid.UUID `json:"id" doc:"Account identifier"`
	Name        string    `json:"name" doc:"Display name, unique across the site"`
	Email       string    `json:"email" doc:"Email address, stored lowercased"`
	IsActive    bool      `json:"isActive" doc:"False for disabled accounts"`
	IsSuperuser bool      `json:"isSuperuser" doc:"True for administrators"`
	IsVerified  bool      `json:"isVerified" doc:"True once the email address has been confirmed"`
	CreatedAt   time.Time `json:"createdAt" doc:"When the account was created"`
	UpdatedAt   time.Time `json:"updatedAt" doc:"When the account was last modified"`
}

func toUserRead(u coredb.CoreUser) UserRead {
	return UserRead{
		ID:          u.ID,
		Name:        u.Name,
		Email:       u.Email,
		IsActive:    u.IsActive,
		IsSuperuser: u.IsSuperuser,
		IsVerified:  u.IsVerified,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
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
}

const (
	minPasswordLength = 8
	// Argon2id has no input length limit, but an unbounded password is a
	// cheap way to make the server do expensive work.
	maxPasswordLength = 1024
	maxNameLength     = 64
	maxEmailLength    = 320
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
