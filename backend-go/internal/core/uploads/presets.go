package uploads

import (
	"fmt"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Presets are the avatars an account may choose instead of uploading one.
//
// They live in the same bucket under their own prefix and are referenced through
// the same avatar_key column, so picking a preset and uploading a picture are one
// code path with one URL scheme. The frontend previously carried these as static
// assets of the meta app, which meant they could not render from the game sites.
//
// The ids match the file names the design already had, so the existing artwork is
// reused rather than replaced.
var Presets = []string{
	"water-spirit-explorer",
	"water-spirit-archivist",
	"male-tide-navigator",
	"male-sunlit-scout",
	"male-map-scholar",
	"male-harbor-guide",
	"female-night-cartographer",
	"female-amber-trailblazer",
	"female-tide-archivist",
	"female-ocean-ranger",
}

// PresetKey renders a preset's object key.
func PresetKey(id string) string {
	return PresetPrefix + id + ".png"
}

// ValidatePreset rejects an unknown id.
//
// The check is against this list rather than against the bucket: an id supplied
// by a client must never be interpolated into a key without being matched to a
// known value first, or a caller could point their avatar at any object in the
// bucket.
func ValidatePreset(id string) error {
	for _, known := range Presets {
		if known == id {
			return nil
		}
	}
	return apierr.New(apierr.Validation, fmt.Sprintf("%q is not a known avatar preset", id))
}

// DefaultPresetFor picks the preset shown for an account that has chosen nothing.
//
// Deriving it from the uid rather than storing it means every account has a
// stable, varied avatar from the moment it is created, with no column, no
// migration and no write. The uid is dense and never reused, so this spreads
// evenly across the set.
func DefaultPresetFor(uid int64) string {
	if len(Presets) == 0 {
		return ""
	}
	idx := uid % int64(len(Presets))
	if idx < 0 {
		idx += int64(len(Presets))
	}
	return Presets[idx]
}

// DefaultPresetKey is the object key of the avatar an account falls back to.
func DefaultPresetKey(uid int64) string {
	id := DefaultPresetFor(uid)
	if id == "" {
		return ""
	}
	return PresetKey(id)
}
