package forum

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Server-side safety checks on submitted markdown.
//
// These exist because bodies are stored raw and rendered by the client, which
// makes the renderer a security boundary: the meta site shares a cookie scope
// with every Arkive site, so markdown that renders to script is session theft
// from text anyone can submit.
//
// The checks refuse whole *classes* of construct rather than matching known-bad
// strings. A blocklist is hopeless here — of the ten bypasses these are tested
// against, eight contain no "<script" anywhere: an onerror attribute on an image,
// a javascript: URL in ordinary markdown, the same scheme spelled with an HTML
// entity, a data: URL, an uppercase SVG tag. Enumerating those is a losing game,
// so instead:
//
//   - no raw HTML at all, beyond markdown's own autolink form;
//   - link and image destinations must be http, https, mailto, or relative.
//
// This is defence in depth, not the whole defence. It cannot see what the client
// eventually does with the text, so it does not remove the renderer's obligation
// to disable raw HTML — it just means a hostile body is refused before it is ever
// stored, rather than relying on every current and future client to render it
// safely.
var (
	// A tag opener: "<" immediately followed by a name, a closing slash, or a
	// declaration/comment marker. Whitespace after "<" is not a tag in HTML
	// parsing, so "a < b" is left alone.
	rawHTMLTag = regexp.MustCompile(`<[a-zA-Z/!?]`)

	// Markdown's autolink, "<https://example.com>", is legitimate and starts with
	// a letter, so it would otherwise be caught by rawHTMLTag.
	autolink = regexp.MustCompile(`(?i)^<(https?://|mailto:)`)

	// Inline link and image destinations: the "(...)" of "[text](dest)". Also
	// catches the image form, since "![alt](dest)" ends the same way.
	inlineDestination = regexp.MustCompile(`\]\(([^)]*)\)`)

	// Reference definitions: "[label]: destination".
	referenceDestination = regexp.MustCompile(`(?m)^\s{0,3}\[[^\]]+\]:\s*(\S+)`)

	// A scheme at the start of a destination.
	schemePrefix = regexp.MustCompile(`(?i)^([a-z][a-z0-9+.-]*):`)

	numericEntity = regexp.MustCompile(`&#(x?[0-9a-fA-F]+);`)
)

// allowedSchemes are the only schemes a destination may name explicitly.
// Anything relative — "/guide", "#section", "post.png" — names no scheme and is
// allowed.
var allowedSchemes = map[string]bool{"http": true, "https": true, "mailto": true}

// validateMarkdownSafety refuses a body that would render to script.
func validateMarkdownSafety(body, what string) error {
	if err := refuseRawHTML(body, what); err != nil {
		return err
	}
	return refuseDangerousLinks(body, what)
}

// refuseRawHTML rejects any HTML tag, allowing markdown's autolink form.
func refuseRawHTML(body, what string) error {
	for _, idx := range rawHTMLTag.FindAllStringIndex(body, -1) {
		if autolink.MatchString(body[idx[0]:]) {
			continue
		}
		return apierr.New(apierr.Validation,
			"HTML is not allowed in a "+what+"; use markdown instead")
	}
	return nil
}

// refuseDangerousLinks rejects a destination naming a scheme outside the allow
// list.
//
// The destination is normalised first, because the dangerous forms hide in the
// spelling rather than the scheme: HTML entities ("java&#115;cript:"), leading
// whitespace and control characters, and case are all used to smuggle a scheme
// past a naive comparison.
func refuseDangerousLinks(body, what string) error {
	destinations := make([]string, 0, 8)
	for _, m := range inlineDestination.FindAllStringSubmatch(body, -1) {
		destinations = append(destinations, m[1])
	}
	for _, m := range referenceDestination.FindAllStringSubmatch(body, -1) {
		destinations = append(destinations, m[1])
	}

	for _, raw := range destinations {
		// Two readings, and a scheme in either is enough to refuse.
		//
		// A compliant parser ends the destination at the whitespace before a link
		// title, so that is one candidate. But whitespace and control characters
		// inside a scheme are ignored by browsers, so "java<tab>script:" reaches
		// the same place as "javascript:" — and truncating at that tab first would
		// leave the harmless-looking "java". Checking both closes the gap without
		// having to decide which parser the client uses.
		for _, dest := range []string{
			normaliseDestination(raw, true),
			normaliseDestination(raw, false),
		} {
			m := schemePrefix.FindStringSubmatch(dest)
			if m == nil {
				continue // relative, or no scheme at all
			}
			if !allowedSchemes[strings.ToLower(m[1])] {
				return apierr.New(apierr.Validation,
					"a link in that "+what+" uses the "+strings.ToLower(m[1])+
						": scheme; only http, https and mailto links are allowed")
			}
		}
	}
	return nil
}

// normaliseDestination undoes the spellings used to disguise a scheme.
//
// stopAtWhitespace picks the reading. True ends the destination where a compliant
// markdown parser would, at the whitespace before a link title. False keeps the
// whole string, which is what matters when the whitespace is *inside* the scheme
// rather than after the URL: truncating first would reduce "java<tab>script:" to
// the harmless-looking "java" and let it through.
func normaliseDestination(dest string, stopAtWhitespace bool) string {
	dest = strings.TrimSpace(dest)
	dest = strings.TrimPrefix(dest, "<")
	if stopAtWhitespace {
		if cut := strings.IndexAny(dest, " \t>"); cut >= 0 {
			dest = dest[:cut]
		}
	} else {
		dest = strings.TrimSuffix(dest, ">")
	}

	dest = decodeEntities(dest)

	// Control characters and whitespace anywhere inside the scheme are ignored by
	// browsers, so "java\tscript:" reaches the same place as "javascript:".
	dest = strings.Map(func(r rune) rune {
		if r <= 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, dest)

	return dest
}

// decodeEntities resolves the numeric and named HTML entities that appear inside
// smuggled schemes. It is deliberately narrow: it exists to make a comparison
// honest, not to be a general HTML unescaper.
func decodeEntities(s string) string {
	s = numericEntity.ReplaceAllStringFunc(s, func(m string) string {
		digits := numericEntity.FindStringSubmatch(m)[1]
		base, body := 10, digits
		if body[0] == 'x' || body[0] == 'X' {
			base, body = 16, body[1:]
		}
		code, err := strconv.ParseInt(body, base, 32)
		if err != nil || code <= 0 || code > 0x10FFFF {
			return m
		}
		return string(rune(code))
	})
	replacer := strings.NewReplacer("&colon;", ":", "&COLON;", ":", "&NewLine;", "\n", "&Tab;", "\t")
	return replacer.Replace(s)
}
