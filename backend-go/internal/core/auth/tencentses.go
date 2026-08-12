package auth

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// SESConfig describes the Tencent Cloud SES account and templates.
type SESConfig struct {
	SecretID  string
	SecretKey string
	// Region of the SES instance, e.g. ap-guangzhou.
	Region string
	// From must be a verified sending address on a verified domain.
	From     string
	FromName string
	// ResetTemplateID is an approved template taking {name} and {token}.
	ResetTemplateID int64
}

// Configured reports whether enough is set to send.
func (c SESConfig) Configured() bool {
	return c.SecretID != "" && c.SecretKey != "" && c.From != "" && c.ResetTemplateID != 0
}

// SESMailer sends through the Tencent Cloud SES HTTP API.
//
// Not SMTP, which this account tier cannot use at all: Tencent restricts SMTP
// to enterprise-verified accounts and answers a personal account's login with
// "Invalid login or password[not exist in redis]" no matter how often the
// password is set. The API is the documented alternative.
//
// The API in turn refuses freeform content on this tier, answering
// FailedOperation.WithOutPermission — "custom sending is not enabled on this
// account; use a template". So the message body lives in an approved template at
// Tencent and this client only supplies the variables, which is why no HTML is
// rendered here; see mail_templates.go for the copy the template was built from.
type SESMailer struct {
	cfg    SESConfig
	logger *slog.Logger
	client *http.Client
	now    func() time.Time
}

// NewSESMailer builds an API-backed mailer.
func NewSESMailer(cfg SESConfig, logger *slog.Logger) *SESMailer {
	if cfg.Region == "" {
		cfg.Region = "ap-guangzhou"
	}
	return &SESMailer{
		cfg:    cfg,
		logger: logger,
		client: &http.Client{Timeout: 20 * time.Second},
		now:    time.Now,
	}
}

// SendPasswordReset delivers the reset link for one account.
func (m *SESMailer) SendPasswordReset(ctx context.Context, email, displayName, token string) error {
	if displayName == "" {
		// The template greets the recipient by name; falling back to the local
		// part avoids printing the full address into the body.
		displayName, _, _ = strings.Cut(email, "@")
	}

	// The template embeds the domain and only substitutes the token, because
	// Tencent's review rules forbid a variable standing in for a whole URL.
	data, err := json.Marshal(map[string]string{"name": displayName, "token": token})
	if err != nil {
		return fmt.Errorf("encode template data: %w", err)
	}

	// One approved template exists, and it is Chinese, so the subject matches it
	// rather than the recipient's browsing language. Sending in another language
	// means getting another template reviewed first; until then the locale map in
	// mail_templates.go describes copy this path cannot select.
	payload := map[string]any{
		"FromEmailAddress": m.fromHeader(),
		"Destination":      []string{email},
		"Subject":          passwordResetCopy[LocaleZhCN].Subject,
		"Template": map[string]any{
			"TemplateID":   m.cfg.ResetTemplateID,
			"TemplateData": string(data),
		},
	}

	messageID, err := m.call(ctx, "SendEmail", payload)
	if err != nil {
		return err
	}
	// Logged because SES accepting a message is not the same as delivering it;
	// the id is what GetSendEmailStatus is queried with when someone reports a
	// missing email.
	m.logger.InfoContext(ctx, "password reset mail accepted by ses",
		slog.String("message_id", messageID))
	return nil
}

// SendVerification is not implemented: it needs its own approved template, and
// no verification campaign is planned.
//
// The token is deliberately NOT logged. /auth/request-verify-token is a live
// endpoint any visitor can trigger, so logging it would write a working
// credential into the production log on demand. LogMailer may print one because
// it only runs where no mail is configured at all; this path is production.
func (m *SESMailer) SendVerification(ctx context.Context, email, displayName, token string) error {
	m.logger.WarnContext(ctx, "verification mail requested but no approved template exists; nothing sent",
		slog.String("email", email))
	return nil
}

func (m *SESMailer) fromHeader() string {
	if m.cfg.FromName == "" {
		return m.cfg.From
	}
	return fmt.Sprintf("%s <%s>", m.cfg.FromName, m.cfg.From)
}

const (
	sesHost    = "ses.tencentcloudapi.com"
	sesService = "ses"
	sesVersion = "2020-10-02"
)

// call performs one signed API request and returns the MessageId.
func (m *SESMailer) call(ctx context.Context, action string, payload any) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode %s request: %w", action, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://"+sesHost, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build %s request: %w", action, err)
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Host", sesHost)
	req.Header.Set("X-TC-Action", action)
	req.Header.Set("X-TC-Version", sesVersion)
	req.Header.Set("X-TC-Region", m.cfg.Region)

	ts := m.now().UTC()
	req.Header.Set("X-TC-Timestamp", strconv.FormatInt(ts.Unix(), 10))
	req.Header.Set("Authorization", m.sign(action, body, ts))

	resp, err := m.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("call ses %s: %w", action, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read ses response: %w", err)
	}

	var parsed struct {
		Response struct {
			MessageId string `json:"MessageId"`
			Error     *struct {
				Code    string `json:"Code"`
				Message string `json:"Message"`
			} `json:"Error"`
			RequestId string `json:"RequestId"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("ses returned an unreadable response (%d): %s", resp.StatusCode, truncate(raw, 200))
	}
	if e := parsed.Response.Error; e != nil {
		// Surfaced verbatim: these codes are the difference between "template
		// awaiting review", "address not verified" and "quota exhausted", and
		// collapsing them would make the cause unguessable from a log.
		return "", fmt.Errorf("ses %s failed: %s: %s (request %s)",
			action, e.Code, e.Message, parsed.Response.RequestId)
	}
	return parsed.Response.MessageId, nil
}

// sign builds a TC3-HMAC-SHA256 Authorization header.
//
// Implemented directly rather than pulling in tencentcloud-sdk-go, which would
// add a large dependency tree for one call. The algorithm is fully specified and
// the signing steps are covered by tests.
func (m *SESMailer) sign(action string, body []byte, ts time.Time) string {
	date := ts.Format("2006-01-02")

	// Only the headers named in signedHeaders participate, and they must be
	// lowercase, sorted, and match what is actually sent.
	canonicalHeaders := strings.Join([]string{
		"content-type:application/json; charset=utf-8",
		"host:" + sesHost,
		"x-tc-action:" + strings.ToLower(action),
	}, "\n") + "\n"
	const signedHeaders = "content-type;host;x-tc-action"

	canonicalRequest := strings.Join([]string{
		http.MethodPost,
		"/",
		"", // no query string
		canonicalHeaders,
		signedHeaders,
		sha256hex(body),
	}, "\n")

	credentialScope := fmt.Sprintf("%s/%s/tc3_request", date, sesService)
	stringToSign := strings.Join([]string{
		"TC3-HMAC-SHA256",
		strconv.FormatInt(ts.Unix(), 10),
		credentialScope,
		sha256hex([]byte(canonicalRequest)),
	}, "\n")

	secretDate := hmacSHA256([]byte("TC3"+m.cfg.SecretKey), date)
	secretService := hmacSHA256(secretDate, sesService)
	secretSigning := hmacSHA256(secretService, "tc3_request")
	signature := hex.EncodeToString(hmacSHA256(secretSigning, stringToSign))

	return fmt.Sprintf("TC3-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		m.cfg.SecretID, credentialScope, signedHeaders, signature)
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

func sha256hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
