package api_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
)

type body struct {
	Name       *string             `json:"name,omitempty"`
	SpecialUID api.Optional[int32] `json:"specialUid,omitzero" minimum:"0" maximum:"9999"`
}

// The three states are the whole reason this type exists, so they are asserted
// directly rather than through a handler.
func TestOptionalDistinguishesAbsentFromNull(t *testing.T) {
	for _, tc := range []struct {
		name    string
		in      string
		wantSet bool
		wantVal *int32
	}{
		{"absent field", `{}`, false, nil},
		{"explicit null", `{"specialUid":null}`, true, nil},
		{"a value", `{"specialUid":42}`, true, ptr(int32(42))},
		{"zero is a value, not absence", `{"specialUid":0}`, true, ptr(int32(0))},
		{"another field present", `{"name":"x"}`, false, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var b body
			if err := json.Unmarshal([]byte(tc.in), &b); err != nil {
				t.Fatalf("unmarshal %s: %v", tc.in, err)
			}
			if b.SpecialUID.Set != tc.wantSet {
				t.Errorf("Set = %v, want %v", b.SpecialUID.Set, tc.wantSet)
			}
			switch {
			case tc.wantVal == nil && b.SpecialUID.Value != nil:
				t.Errorf("Value = %d, want nil", *b.SpecialUID.Value)
			case tc.wantVal != nil && b.SpecialUID.Value == nil:
				t.Errorf("Value = nil, want %d", *tc.wantVal)
			case tc.wantVal != nil && *b.SpecialUID.Value != *tc.wantVal:
				t.Errorf("Value = %d, want %d", *b.SpecialUID.Value, *tc.wantVal)
			}
		})
	}
}

func TestOptionalIntentHelpers(t *testing.T) {
	var absent body
	if err := json.Unmarshal([]byte(`{}`), &absent); err != nil {
		t.Fatal(err)
	}
	if absent.SpecialUID.Cleared() {
		t.Error("an absent field must not read as a clear request")
	}
	if _, ok := absent.SpecialUID.Assigned(); ok {
		t.Error("an absent field must not read as an assignment")
	}

	var cleared body
	if err := json.Unmarshal([]byte(`{"specialUid":null}`), &cleared); err != nil {
		t.Fatal(err)
	}
	if !cleared.SpecialUID.Cleared() {
		t.Error("an explicit null must read as a clear request")
	}
	if _, ok := cleared.SpecialUID.Assigned(); ok {
		t.Error("an explicit null must not read as an assignment")
	}

	var assigned body
	if err := json.Unmarshal([]byte(`{"specialUid":7}`), &assigned); err != nil {
		t.Fatal(err)
	}
	if assigned.SpecialUID.Cleared() {
		t.Error("a value must not read as a clear request")
	}
	v, ok := assigned.SpecialUID.Assigned()
	if !ok || v != 7 {
		t.Errorf("Assigned() = %d, %v; want 7, true", v, ok)
	}
}

// An Optional field must not be required, or adding it to a partial-update body
// would reject every existing request that omits it.
func TestOptionalFieldIsNotRequiredAndAcceptsNull(t *testing.T) {
	registry := huma.NewMapRegistry("#/components/schemas/", huma.DefaultSchemaNamer)
	schema := huma.SchemaFromType(registry, reflect.TypeFor[body]())

	for _, name := range schema.Required {
		if name == "specialUid" {
			t.Fatal("specialUid is required; omitting it would fail validation")
		}
	}

	prop, ok := schema.Properties["specialUid"]
	if !ok {
		t.Fatal("specialUid is missing from the generated schema")
	}
	if prop.Type != huma.TypeInteger {
		t.Errorf("schema type = %q, want %q", prop.Type, huma.TypeInteger)
	}
	if !prop.Nullable {
		t.Error("schema is not nullable, so an explicit null would fail validation")
	}
	if prop.Maximum == nil || *prop.Maximum != 9999 {
		t.Errorf("maximum tag was not applied to the provided schema: %v", prop.Maximum)
	}

	// The document must offer `null` as a permitted type, since that is how a
	// client revokes a value.
	encoded, err := json.Marshal(prop)
	if err != nil {
		t.Fatal(err)
	}
	if want := `"type":["integer","null"]`; !strings.Contains(string(encoded), want) {
		t.Errorf("schema JSON %s does not contain %s", encoded, want)
	}

	// And the validator must actually accept each of the three states.
	for _, tc := range []struct {
		name string
		in   map[string]any
	}{
		{"absent", map[string]any{}},
		{"null", map[string]any{"specialUid": nil}},
		{"value", map[string]any{"specialUid": 42}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pb := huma.NewPathBuffer(make([]byte, 0, 64), 0)
			res := &huma.ValidateResult{}
			huma.Validate(registry, schema, pb, huma.ModeWriteToServer, tc.in, res)
			if len(res.Errors) > 0 {
				t.Errorf("validation rejected %v: %v", tc.in, res.Errors)
			}
		})
	}

	// Out-of-range values must still be caught by the tags.
	pb := huma.NewPathBuffer(make([]byte, 0, 64), 0)
	res := &huma.ValidateResult{}
	huma.Validate(registry, schema, pb, huma.ModeWriteToServer, map[string]any{"specialUid": 10000}, res)
	if len(res.Errors) == 0 {
		t.Error("10000 is outside 0-9999 but validation accepted it")
	}
}

func ptr[T any](v T) *T { return &v }
