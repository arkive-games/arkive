package auth

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"
	textTemplate "text/template"
)

// MailLocale selects the language of a message.
type MailLocale string

// Supported message languages. Anything else falls back to English.
const (
	LocaleZhCN MailLocale = "zh-CN"
	LocaleZhTW MailLocale = "zh-TW"
	LocaleEnUS MailLocale = "en-US"
)

// NormaliseMailLocale maps an i18next tag onto a supported message language.
func NormaliseMailLocale(tag string) MailLocale {
	lower := strings.ToLower(strings.TrimSpace(tag))
	switch {
	case strings.HasPrefix(lower, "zh"):
		if strings.Contains(lower, "hant") || strings.Contains(lower, "tw") ||
			strings.Contains(lower, "hk") || strings.Contains(lower, "mo") {
			return LocaleZhTW
		}
		return LocaleZhCN
	case strings.HasPrefix(lower, "en"):
		return LocaleEnUS
	default:
		// Most accounts in the imported data are Chinese, but guessing a
		// language from an address is worse than a neutral default.
		return LocaleEnUS
	}
}

// mailCopy is the wording of one message in one language.
type mailCopy struct {
	Subject   string
	Greeting  string // takes the display name
	Lead      string
	Action    string
	Expiry    string
	Ignore    string
	Fallback  string
	Footer    string
	Automated string
}

var passwordResetCopy = map[MailLocale]mailCopy{
	LocaleZhCN: {
		Subject:   "重置你的藏舟密码",
		Greeting:  "你好，%s",
		Lead:      "我们收到了重置该邮箱密码的请求。点击下面的按钮设置新密码：",
		Action:    "设置新密码",
		Expiry:    "链接 1 小时后失效，且仅能使用一次。",
		Ignore:    "如果不是你本人操作，请忽略这封邮件——你的密码不会有任何改变。",
		Fallback:  "按钮无法点击？把下面的链接复制到浏览器打开：",
		Footer:    "藏舟 Arkive · tc-imba.com",
		Automated: "这封邮件由系统自动发送，请勿回复。",
	},
	LocaleZhTW: {
		Subject:   "重設你的藏舟密碼",
		Greeting:  "你好，%s",
		Lead:      "我們收到了重設該信箱密碼的請求。點選下面的按鈕設定新密碼：",
		Action:    "設定新密碼",
		Expiry:    "連結 1 小時後失效，且僅能使用一次。",
		Ignore:    "如果不是你本人操作，請忽略這封郵件——你的密碼不會有任何改變。",
		Fallback:  "按鈕無法點選？把下面的連結複製到瀏覽器開啟：",
		Footer:    "藏舟 Arkive · tc-imba.com",
		Automated: "這封郵件由系統自動發送，請勿回覆。",
	},
	LocaleEnUS: {
		Subject:   "Reset your Arkive password",
		Greeting:  "Hello %s,",
		Lead:      "We received a request to reset the password for this address. Use the button below to choose a new one:",
		Action:    "Choose a new password",
		Expiry:    "This link expires in 1 hour and can only be used once.",
		Ignore:    "If this wasn't you, ignore this email — your password will not change.",
		Fallback:  "Button not working? Copy this link into your browser:",
		Footer:    "Arkive · tc-imba.com",
		Automated: "This message was sent automatically. Please do not reply.",
	},
}

// PasswordResetMail is the rendered message.
type PasswordResetMail struct {
	Subject string
	HTML    string
	Text    string
}

type resetView struct {
	Copy     mailCopy
	Greeting string
	Link     string
	Dir      string
}

// The layout is one table with inline styles and no external images. Mail
// clients strip <style> blocks and external CSS, and a remote image is both a
// spam signal and a read-tracker — which this message has no business being.
// The raw link always appears in the body because button rendering in QQ Mail
// is unreliable.
var resetHTML = template.Must(template.New("reset").Parse(`<!doctype html>
<html lang="{{.Dir}}">
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
        <tr>
          <td style="padding:20px 28px;background:#0f172a;color:#ffffff;font-size:16px;font-weight:700;">
            {{.Copy.Footer}}
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:#0f172a;font-size:15px;line-height:1.7;">
            <p style="margin:0 0 16px;font-weight:600;">{{.Greeting}}</p>
            <p style="margin:0 0 24px;color:#334155;">{{.Copy.Lead}}</p>
            <p style="margin:0 0 24px;">
              <a href="{{.Link}}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">{{.Copy.Action}}</a>
            </p>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;">{{.Copy.Expiry}}</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:13px;">{{.Copy.Ignore}}</p>
            <p style="margin:0 0 6px;color:#64748b;font-size:13px;">{{.Copy.Fallback}}</p>
            <p style="margin:0;word-break:break-all;font-size:12px;"><a href="{{.Link}}" style="color:#2563eb;">{{.Link}}</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:12px;line-height:1.6;">
            {{.Copy.Automated}}<br>{{.Copy.Footer}}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`))

// A real plaintext alternative, not a stripped afterthought: QQ Mail and many
// Chinese clients render the text part in list previews, and a message with no
// text part scores worse with spam filters.
var resetText = textTemplate.Must(textTemplate.New("resetText").Parse(
	`{{.Greeting}}

{{.Copy.Lead}}

{{.Link}}

{{.Copy.Expiry}}
{{.Copy.Ignore}}

--
{{.Copy.Automated}}
{{.Copy.Footer}}
`))

// RenderPasswordReset builds the message for one recipient.
//
// The display name is used rather than the email address: if the message ever
// reaches the wrong inbox, it should disclose as little as possible about the
// account it belongs to.
func RenderPasswordReset(locale MailLocale, displayName, link string) (PasswordResetMail, error) {
	wording, ok := passwordResetCopy[locale]
	if !ok {
		wording = passwordResetCopy[LocaleEnUS]
	}

	view := resetView{
		Copy:     wording,
		Greeting: fmt.Sprintf(wording.Greeting, displayName),
		Link:     link,
		Dir:      string(locale),
	}

	var html, text bytes.Buffer
	if err := resetHTML.Execute(&html, view); err != nil {
		return PasswordResetMail{}, fmt.Errorf("render reset html: %w", err)
	}
	if err := resetText.Execute(&text, view); err != nil {
		return PasswordResetMail{}, fmt.Errorf("render reset text: %w", err)
	}

	return PasswordResetMail{
		Subject: wording.Subject,
		HTML:    html.String(),
		Text:    text.String(),
	}, nil
}
