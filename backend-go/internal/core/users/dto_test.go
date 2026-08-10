package users

import (
	"strings"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// The HTTP layer rejects an out-of-range number first, from the minimum/maximum
// tags on the request body, so this guard is not what a browser client meets.
// It is the invariant at the package boundary: Service.Update is callable
// without going through huma, and the range must hold for any caller. Tested
// directly for that reason — otherwise it would be unexercised code.
func TestValidateSpecialUIDBounds(t *testing.T) {
	for _, valid := range []int32{0, 1, 42, 9998, 9999} {
		if err := validateSpecialUID(valid); err != nil {
			t.Errorf("validateSpecialUID(%d) = %v, want nil", valid, err)
		}
	}

	for _, invalid := range []int32{-1, -9999, 10000, 10001, 2147483647} {
		err := validateSpecialUID(invalid)
		if err == nil {
			t.Errorf("validateSpecialUID(%d) = nil, want a rejection", invalid)
			continue
		}
		e, ok := apierr.As(err)
		if !ok {
			t.Errorf("validateSpecialUID(%d) returned %T, want *apierr.Error", invalid, err)
			continue
		}
		if e.ErrorCode != apierr.Validation {
			t.Errorf("validateSpecialUID(%d) code = %q, want %q", invalid, e.ErrorCode, apierr.Validation)
		}
		// The point of the guard over a bare check constraint is that it names
		// the bounds.
		if !strings.Contains(e.ErrorMessage, "0") || !strings.Contains(e.ErrorMessage, "9999") {
			t.Errorf("validateSpecialUID(%d) message %q does not state the bounds", invalid, e.ErrorMessage)
		}
	}
}

// 10000 is the boundary between the two number spaces, so it is the value most
// likely to be got wrong in either direction.
func TestVanityRangeStopsBelowTheRealUIDFloor(t *testing.T) {
	if maxSpecialUID != 9999 || minSpecialUID != 0 {
		t.Fatalf("vanity range is %d-%d, want 0-9999", minSpecialUID, maxSpecialUID)
	}
	if err := validateSpecialUID(maxSpecialUID); err != nil {
		t.Errorf("the upper bound itself must be assignable: %v", err)
	}
	if err := validateSpecialUID(maxSpecialUID + 1); err == nil {
		t.Error("10000 belongs to the permanent range and must not be assignable as an alias")
	}
}
