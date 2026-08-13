package forum

import (
	"net/http"
	"strings"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Every one of these is a real cross-site-scripting vector for markdown rendered
// with raw HTML enabled, and eight of the ten contain no "<script" anywhere. They
// are the reason this check refuses classes of construct rather than matching
// known-bad strings.
func TestDangerousMarkdownIsRefused(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
	}{
		{"a script tag", `<script>alert(1)</script>`},
		{"an image with an onerror handler", `<img src=x onerror=alert(1)>`},
		{"a javascript link in pure markdown", `[click](javascript:alert(1))`},
		{"the scheme in mixed case", `[click](JaVaScRiPt:alert(1))`},
		{"the scheme with an HTML entity inside it", `[click](java&#115;cript:alert(1))`},
		{"the scheme with a hex entity", `[click](java&#x73;cript:alert(1))`},
		{"leading whitespace before the scheme", `[click](   javascript:alert(1))`},
		{"a tab inside the scheme", "[click](java\tscript:alert(1))"},
		{"a data URL in an image", `![x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)`},
		{"an anchor tag with an entity-escaped scheme", `<a href="&#106;avascript:alert(1)">x</a>`},
		{"an uppercase SVG with a handler", `<SVG ONLOAD=alert(1)>`},
		{"a newline inside the tag", "<div\nonclick=alert(1)>"},
		{"a vbscript link", `[click](vbscript:msgbox(1))`},
		{"a reference-style javascript link", "[click][evil]\n\n[evil]: javascript:alert(1)"},
		{"an iframe", `<iframe src="https://evil.test"></iframe>`},
		{"a closing tag alone", `</p>`},
		{"an HTML comment", `<!-- <script>alert(1)</script> -->`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := validateMarkdownSafety(tc.body, "post")
			if err == nil {
				t.Fatalf("accepted a dangerous body: %q", tc.body)
			}
			e, ok := apierr.As(err)
			if !ok || e.GetStatus() != http.StatusUnprocessableEntity {
				t.Errorf("error = %v, want a 422 validation error", err)
			}
		})
	}
}

// The check must not make ordinary writing impossible. A forum post is mostly
// prose, code and links, and every one of these has to survive.
func TestOrdinaryMarkdownIsAccepted(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
	}{
		{"plain prose", "I looked everywhere and found nothing."},
		{"emphasis and strong", "This is **bold** and this is _italic_."},
		{"a heading and a list", "# Title\n\n- one\n- two\n"},
		{"an http link", `See [the guide](https://arkive.test/guide).`},
		{"an http link with a title", `[guide](https://arkive.test/guide "The Guide")`},
		{"a relative link", `[the map](/palworld/map)`},
		{"an anchor link", `[jump](#spawns)`},
		{"a bare filename", `[image](spawn.png)`},
		{"a mailto link", `[mail me](mailto:someone@example.com)`},
		{"an autolink", `Visit <https://arkive.test> for more.`},
		{"a mailto autolink", `Write to <mailto:someone@example.com>.`},
		{"an image with a relative source", `![a map](/images/map.png)`},
		{"a fenced code block", "```go\nif a < b { return }\n```"},
		{"a less-than in prose", "if a < b then it is smaller"},
		{"a comparison with spaces", "5 < 10 and 10 > 5"},
		{"a reference-style https link", "[guide][g]\n\n[g]: https://arkive.test/guide"},
		{"CJK prose", "帕鲁的刷新点在哪里？我找了很久。"},
		{"a blockquote", "> someone said this\n\nand I replied"},
		{"a table", "| a | b |\n|---|---|\n| 1 | 2 |"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateMarkdownSafety(tc.body, "post"); err != nil {
				t.Errorf("refused ordinary markdown %q: %v", tc.body, err)
			}
		})
	}
}

// The message has to say what to do about it, since the author is a person who
// typed something reasonable-looking.
func TestRefusalNamesTheProblem(t *testing.T) {
	err := validateMarkdownSafety(`<b>bold</b>`, "post")
	e, _ := apierr.As(err)
	if e == nil || !contains(e.ErrorMessage, "HTML is not allowed") {
		t.Errorf("message = %q, want it to say HTML is not allowed", e.ErrorMessage)
	}

	err = validateMarkdownSafety(`[x](javascript:alert(1))`, "comment")
	e, _ = apierr.As(err)
	if e == nil || !contains(e.ErrorMessage, "javascript") || !contains(e.ErrorMessage, "comment") {
		t.Errorf("message = %q, want it to name the scheme and the kind of body", e.ErrorMessage)
	}
}

func contains(haystack, needle string) bool { return strings.Contains(haystack, needle) }
