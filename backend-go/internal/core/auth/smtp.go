package auth

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// SMTPConfig describes the upstream relay.
type SMTPConfig struct {
	Host string
	Port int
	// Username is the full sending address. Tencent SES rejects a From that
	// differs from the authenticated account, so it doubles as the From.
	Username string
	Password string
	// FromName is the display name shown beside the address.
	FromName string
	// ResetURLTemplate receives the token via %s.
	ResetURLTemplate string
}

// Configured reports whether enough is set to send.
func (c SMTPConfig) Configured() bool {
	return c.Host != "" && c.Username != "" && c.Password != ""
}

// SMTPMailer delivers through an authenticated relay.
//
// Implicit TLS on 465 rather than STARTTLS on 587: outbound port 25 is blocked
// on this host, and 465 wraps the whole session in TLS from the first byte
// instead of beginning in plaintext and asking to upgrade — so there is no
// window in which a downgrade can strip the encryption.
type SMTPMailer struct {
	cfg    SMTPConfig
	logger *slog.Logger

	// dial is injectable so tests can exercise the session without a network.
	dial func(ctx context.Context, addr string, cfg *tls.Config) (*smtp.Client, error)
}

// NewSMTPMailer builds a relay-backed mailer.
func NewSMTPMailer(cfg SMTPConfig, logger *slog.Logger) *SMTPMailer {
	return &SMTPMailer{cfg: cfg, logger: logger, dial: dialImplicitTLS}
}

// SendPasswordReset renders and delivers the reset message.
func (m *SMTPMailer) SendPasswordReset(ctx context.Context, email, displayName, token string) error {
	return m.sendPasswordReset(ctx, email, displayName, LocaleZhCN, token)
}

// SendPasswordResetLocalised renders in the requested language and addresses the
// recipient by display name.
func (m *SMTPMailer) SendPasswordResetLocalised(
	ctx context.Context, email, displayName, languageTag, token string,
) error {
	return m.sendPasswordReset(ctx, email, displayName, NormaliseMailLocale(languageTag), token)
}

func (m *SMTPMailer) sendPasswordReset(
	ctx context.Context, email, displayName string, locale MailLocale, token string,
) error {
	if displayName == "" {
		displayName = email
	}

	template := m.cfg.ResetURLTemplate
	if template == "" {
		return fmt.Errorf("no reset URL template configured")
	}
	link := fmt.Sprintf(template, token)

	msg, err := RenderPasswordReset(locale, displayName, link)
	if err != nil {
		return err
	}
	return m.send(ctx, email, msg.Subject, msg.Text, msg.HTML)
}

// SendVerification is not implemented yet; the flow exists but no verification
// campaign is planned, and a half-written message is worse than an obvious gap.
func (m *SMTPMailer) SendVerification(ctx context.Context, email, displayName, token string) error {
	// The token is deliberately NOT logged. /auth/request-verify-token is
	// unauthenticated, so logging it let any visitor write a working credential
	// into the operator's log on demand, where it outlives its own expiry. The
	// same line was removed from the Tencent path in 86db192a and missed here;
	// module.go selects this mailer whenever SMTP is configured, so it was the
	// live path for those deployments.
	m.logger.WarnContext(ctx, "verification mail is not implemented; no message was sent",
		slog.String("email", email))
	return nil
}

func (m *SMTPMailer) send(ctx context.Context, to, subject, text, html string) error {
	addr := net.JoinHostPort(m.cfg.Host, fmt.Sprint(m.cfg.Port))

	client, err := m.dial(ctx, addr, &tls.Config{ServerName: m.cfg.Host, MinVersion: tls.VersionTLS12})
	if err != nil {
		return fmt.Errorf("connect to smtp relay: %w", err)
	}
	defer func() { _ = client.Quit() }()

	auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}
	if err := client.Mail(m.cfg.Username); err != nil {
		return fmt.Errorf("smtp from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write([]byte(m.buildMessage(to, subject, text, html))); err != nil {
		return fmt.Errorf("write message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("finish message: %w", err)
	}
	return nil
}

// buildMessage assembles a multipart/alternative message.
//
// Headers are RFC 2047 encoded because the subject is Chinese in most cases and
// raw UTF-8 in a header is not legal; QQ Mail in particular renders unencoded
// subjects as mojibake.
func (m *SMTPMailer) buildMessage(to, subject, text, html string) string {
	boundary := randomBoundary()

	var b strings.Builder
	fmt.Fprintf(&b, "From: %s <%s>\r\n", mime.QEncoding.Encode("utf-8", m.cfg.FromName), m.cfg.Username)
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", mime.QEncoding.Encode("utf-8", subject))
	fmt.Fprintf(&b, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	fmt.Fprintf(&b, "Message-ID: <%s@%s>\r\n", randomBoundary(), domainOf(m.cfg.Username))
	b.WriteString("MIME-Version: 1.0\r\n")
	// Tells well-behaved bulk senders and mailing-list detectors that this is a
	// transactional message, which keeps it out of promotions tabs.
	b.WriteString("Auto-Submitted: auto-generated\r\n")
	fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", boundary)

	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(wrapBase64(text))

	fmt.Fprintf(&b, "\r\n--%s\r\n", boundary)
	b.WriteString("Content-Type: text/html; charset=utf-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(wrapBase64(html))

	fmt.Fprintf(&b, "\r\n--%s--\r\n", boundary)
	return b.String()
}

func dialImplicitTLS(ctx context.Context, addr string, cfg *tls.Config) (*smtp.Client, error) {
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, cfg)
	if err != nil {
		return nil, err
	}
	host, _, _ := net.SplitHostPort(addr)
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	return client, nil
}

// wrapBase64 encodes and folds to 76 columns, the limit SMTP lines must respect.
func wrapBase64(s string) string {
	encoded := base64.StdEncoding.EncodeToString([]byte(s))
	var b strings.Builder
	for len(encoded) > 76 {
		b.WriteString(encoded[:76])
		b.WriteString("\r\n")
		encoded = encoded[76:]
	}
	b.WriteString(encoded)
	return b.String()
}

func randomBoundary() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		// A predictable boundary is a correctness problem only if it appears in
		// the body, which base64 encoding guarantees it cannot.
		return fmt.Sprintf("arkive%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x", buf)
}

func domainOf(address string) string {
	if _, domain, ok := strings.Cut(address, "@"); ok {
		return domain
	}
	return "localhost"
}
