package auth

import (
	"context"
	"log/slog"
)

// Mailer delivers the transactional messages the auth flows produce.
//
// It exists as an interface with only a logging implementation because the
// Python service never sent mail either: it printed reset and verification
// tokens to stdout. Naming the seam makes that gap visible instead of leaving
// a reader to discover it, and gives an SMTP implementation somewhere to land
// without touching any flow.
type Mailer interface {
	SendPasswordReset(ctx context.Context, email, token string) error
	SendVerification(ctx context.Context, email, token string) error
}

// LogMailer writes tokens to the log instead of sending mail.
type LogMailer struct {
	logger *slog.Logger
}

// NewLogMailer builds a Mailer that logs.
func NewLogMailer(logger *slog.Logger) *LogMailer {
	return &LogMailer{logger: logger}
}

// SendPasswordReset logs the reset token.
func (m *LogMailer) SendPasswordReset(ctx context.Context, email, token string) error {
	m.logger.WarnContext(ctx, "password reset requested but no mailer is configured; token logged instead",
		slog.String("email", email),
		slog.String("token", token),
	)
	return nil
}

// SendVerification logs the verification token.
func (m *LogMailer) SendVerification(ctx context.Context, email, token string) error {
	m.logger.WarnContext(ctx, "email verification requested but no mailer is configured; token logged instead",
		slog.String("email", email),
		slog.String("token", token),
	)
	return nil
}
