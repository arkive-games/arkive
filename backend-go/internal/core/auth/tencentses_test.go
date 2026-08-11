package auth

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"
)

func testSESMailer(t *testing.T, handler http.RoundTripper) *SESMailer {
	t.Helper()
	m := NewSESMailer(SESConfig{
		SecretID:        "AKIDEXAMPLE",
		SecretKey:       "SECRETEXAMPLE",
		Region:          "ap-guangzhou",
		From:            "noreply@tc-imba.com",
		FromName:        "藏舟 Arkive",
		ResetTemplateID: 56621,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	m.now = func() time.Time { return time.Unix(1_786_000_000, 0).UTC() }
	if handler != nil {
		m.client = &http.Client{Transport: handler}
	}
	return m
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
}

// The signature is deterministic for fixed inputs, so a golden value catches any
// accidental change to the canonical request — a signing bug is otherwise only
// visible as an opaque AuthFailure from the live API.
func TestSignatureIsStable(t *testing.T) {
	m := testSESMailer(t, nil)
	got := m.sign("SendEmail", []byte(`{"a":1}`), m.now())

	for _, want := range []string{
		"TC3-HMAC-SHA256 ",
		"Credential=AKIDEXAMPLE/2026-08-06/ses/tc3_request",
		"SignedHeaders=content-type;host;x-tc-action",
		"Signature=",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("authorization header missing %q\ngot: %s", want, got)
		}
	}

	// Same inputs must give the same signature; different bodies must not.
	if again := m.sign("SendEmail", []byte(`{"a":1}`), m.now()); again != got {
		t.Error("signing is not deterministic")
	}
	if other := m.sign("SendEmail", []byte(`{"a":2}`), m.now()); other == got {
		t.Error("a different payload must produce a different signature")
	}
}

func TestSendPasswordResetPostsTheTemplateAndVariables(t *testing.T) {
	var captured map[string]any
	var headers http.Header

	m := testSESMailer(t, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		headers = r.Header.Clone()
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		return jsonResponse(200, `{"Response":{"MessageId":"msg-1","RequestId":"req-1"}}`), nil
	}))

	if err := m.SendPasswordReset(context.Background(), "alice@qq.com", "alice", "TOK123"); err != nil {
		t.Fatalf("SendPasswordReset: %v", err)
	}

	if got := headers.Get("X-TC-Action"); got != "SendEmail" {
		t.Errorf("X-TC-Action = %q", got)
	}
	if got := headers.Get("X-TC-Version"); got != sesVersion {
		t.Errorf("X-TC-Version = %q, want %q", got, sesVersion)
	}
	if !strings.HasPrefix(headers.Get("Authorization"), "TC3-HMAC-SHA256 ") {
		t.Error("request is not signed")
	}

	if got := captured["FromEmailAddress"]; got != "藏舟 Arkive <noreply@tc-imba.com>" {
		t.Errorf("FromEmailAddress = %v", got)
	}
	dest, _ := captured["Destination"].([]any)
	if len(dest) != 1 || dest[0] != "alice@qq.com" {
		t.Errorf("Destination = %v", captured["Destination"])
	}

	tpl, _ := captured["Template"].(map[string]any)
	if tpl["TemplateID"] != float64(56621) {
		t.Errorf("TemplateID = %v, want 56621", tpl["TemplateID"])
	}

	// TemplateData is a JSON *string*, not a nested object — the API requires it.
	raw, ok := tpl["TemplateData"].(string)
	if !ok {
		t.Fatalf("TemplateData should be a string, got %T", tpl["TemplateData"])
	}
	var vars map[string]string
	if err := json.Unmarshal([]byte(raw), &vars); err != nil {
		t.Fatalf("TemplateData is not JSON: %v", err)
	}
	if vars["name"] != "alice" || vars["token"] != "TOK123" {
		t.Errorf("variables = %v", vars)
	}
	// The token alone is sent; the template holds the domain, because a variable
	// may not stand in for an entire URL under Tencent's review rules.
	if strings.Contains(raw, "http") {
		t.Errorf("TemplateData should carry the bare token, not a URL: %s", raw)
	}
}

func TestSendPasswordResetFallsBackToTheLocalPartForAName(t *testing.T) {
	var captured map[string]any
	m := testSESMailer(t, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		return jsonResponse(200, `{"Response":{"MessageId":"m","RequestId":"r"}}`), nil
	}))

	if err := m.SendPasswordReset(context.Background(), "someone@qq.com", "", "TOK"); err != nil {
		t.Fatalf("SendPasswordReset: %v", err)
	}

	tpl, _ := captured["Template"].(map[string]any)
	raw, _ := tpl["TemplateData"].(string)
	var vars map[string]string
	_ = json.Unmarshal([]byte(raw), &vars)
	// Not the full address: the greeting should not print someone's email at them.
	if vars["name"] != "someone" {
		t.Errorf("name = %q, want the local part", vars["name"])
	}
}

func TestApiErrorsAreSurfacedWithTheirCode(t *testing.T) {
	m := testSESMailer(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		return jsonResponse(200, `{"Response":{"Error":{"Code":"FailedOperation.InvalidTemplateID","Message":"template unavailable"},"RequestId":"req-9"}}`), nil
	}))

	err := m.SendPasswordReset(context.Background(), "a@qq.com", "a", "T")
	if err == nil {
		t.Fatal("expected an error")
	}
	// The code distinguishes "awaiting review" from "quota exhausted" from
	// "address not verified"; collapsing it would make the cause unguessable.
	for _, want := range []string{"FailedOperation.InvalidTemplateID", "template unavailable", "req-9"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should mention %q, got: %v", want, err)
		}
	}
}

func TestNonJSONResponseIsReportedAsSuch(t *testing.T) {
	m := testSESMailer(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		return jsonResponse(502, `<html>gateway error</html>`), nil
	}))

	err := m.SendPasswordReset(context.Background(), "a@qq.com", "a", "T")
	if err == nil || !strings.Contains(err.Error(), "unreadable") {
		t.Fatalf("an edge error page should be reported as unreadable, got: %v", err)
	}
}

func TestConfiguredRequiresEverythingNeededToSend(t *testing.T) {
	full := SESConfig{SecretID: "a", SecretKey: "b", From: "c@d.com", ResetTemplateID: 1}
	if !full.Configured() {
		t.Fatal("a complete config should be usable")
	}
	for name, broken := range map[string]SESConfig{
		"no secret id":  {SecretKey: "b", From: "c@d.com", ResetTemplateID: 1},
		"no secret key": {SecretID: "a", From: "c@d.com", ResetTemplateID: 1},
		"no from":       {SecretID: "a", SecretKey: "b", ResetTemplateID: 1},
		"no template":   {SecretID: "a", SecretKey: "b", From: "c@d.com"},
	} {
		if broken.Configured() {
			t.Errorf("%s: should not be considered configured", name)
		}
	}
}
