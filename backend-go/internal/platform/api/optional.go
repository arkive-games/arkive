package api

import (
	"bytes"
	"encoding/json"
	"reflect"

	"github.com/danielgtaylor/huma/v2"
)

// Optional distinguishes a JSON field that was absent from one that was sent
// explicitly as null.
//
// A partial-update body conventionally reads a nil field as "leave this alone",
// which makes a plain *T unable to express clearing a value: an absent field
// and an explicit null both arrive as nil. Optional separates the two, because
// encoding/json calls UnmarshalJSON only for a key that is actually present —
// including when its value is null.
//
//	{}                        -> Set false, Value nil   leave unchanged
//	{"specialUid": null}      -> Set true,  Value nil   clear it
//	{"specialUid": 42}        -> Set true,  Value &42   set it
//
// Declare the field as a value rather than a pointer, and tag it `omitzero`, or
// huma will mark it required and reject every request that omits it:
//
//	SpecialUID Optional[int32] `json:"specialUid,omitzero"`
type Optional[T any] struct {
	// Set reports whether the key was present, whatever its value.
	Set bool
	// Value is nil when the key was absent or its value was null.
	Value *T
}

// Assigned reports whether the caller supplied an actual value, as opposed to
// omitting the field or sending null.
func (o Optional[T]) Assigned() (T, bool) {
	if o.Value == nil {
		var zero T
		return zero, false
	}
	return *o.Value, true
}

// Cleared reports whether the caller explicitly asked for the value to be
// removed, which is the one intent a plain pointer cannot carry.
func (o Optional[T]) Cleared() bool {
	return o.Set && o.Value == nil
}

// IsZero makes the `omitzero` JSON tag treat an untouched Optional as absent.
func (o Optional[T]) IsZero() bool {
	return !o.Set && o.Value == nil
}

// UnmarshalJSON records that the key was present before decoding its value.
func (o *Optional[T]) UnmarshalJSON(data []byte) error {
	o.Set = true
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		o.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	o.Value = &v
	return nil
}

// MarshalJSON writes the value, or null when there is none. An Optional that
// was never set marshals as null too, which is why request bodies carrying one
// should tag the field `omitzero`.
func (o Optional[T]) MarshalJSON() ([]byte, error) {
	if o.Value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(o.Value)
}

// Schema describes the wrapped type as a nullable scalar, so the OpenAPI
// document shows `["integer", "null"]` rather than the struct's two Go fields.
//
// The schema is copied before being marked nullable: for a named type the
// registry hands back a shared pointer, and mutating it would make every other
// use of that type nullable too.
func (o Optional[T]) Schema(r huma.Registry) *huma.Schema {
	inner := huma.SchemaFromType(r, reflect.TypeFor[T]())
	if inner == nil {
		return &huma.Schema{Nullable: true}
	}
	s := *inner
	s.Nullable = true
	return &s
}
