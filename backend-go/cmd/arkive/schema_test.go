package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The generated OpenAPI document is the contract the TypeScript client is built
// from, so a field whose schema disagrees with its own documentation is not a
// cosmetic problem: it becomes a type the frontend trusts and the server does not
// honour.
//
// This caught a real one. huma infers nullability from the pointer for `*int64`
// and `*time.Time`, but a `*uuid.UUID` reaches the encoding.TextUnmarshaler branch
// of schema generation, which returns a plain string and forgets it was a pointer.
// Three response fields therefore said `"type": "string"` while serialising as
// null, and the generated client typed `CommentRead.parentId` as `string` — the
// single field that distinguishes a comment from a reply. The fix is a
// `nullable:"true"` tag; this test is what stops the fourth one from shipping.
func TestDocumentedNullableFieldsAreTypedNullable(t *testing.T) {
	specPath := filepath.Join("..", "..", "openapi", "core.json")
	raw, err := os.ReadFile(specPath)
	if err != nil {
		t.Fatalf("read %s: %v (run `go run ./cmd/arkive openapi` first)", specPath, err)
	}

	var doc struct {
		Components struct {
			Schemas map[string]struct {
				Properties map[string]struct {
					Description string          `json:"description"`
					Type        json.RawMessage `json:"type"`
				} `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("parse spec: %v", err)
	}

	// "or null", "or null on a reply", "null when a post was reported" — the
	// phrasings the docs actually use for a nullable field.
	saysNull := regexp.MustCompile(`(?i)\bor null\b|\bnull when\b`)

	for schemaName, schema := range doc.Components.Schemas {
		for fieldName, field := range schema.Properties {
			if !saysNull.MatchString(field.Description) {
				continue
			}
			if strings.Contains(string(field.Type), `"null"`) {
				continue
			}
			t.Errorf("%s.%s is documented %q but its schema type is %s; "+
				"add `nullable:\"true\"` to the struct tag",
				schemaName, fieldName, field.Description, field.Type)
		}
	}
}
