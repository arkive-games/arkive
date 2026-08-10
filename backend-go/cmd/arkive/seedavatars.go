package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/arkive-games/arkive/backend-go/internal/core/uploads"
	"github.com/arkive-games/arkive/backend-go/internal/platform/blob"
	"github.com/arkive-games/arkive/backend-go/internal/platform/config"
)

// seedAvatarPresets uploads the preset avatar artwork into the bucket.
//
// The images are read from a directory given on the command line rather than
// embedded in the binary. Embedding would bake frontend artwork into the server
// and require a redeploy to change a picture; this way the art stays where the
// designers work on it and the upload is an operational step:
//
//	arkive seed-avatars ../frontend/apps/meta/public/images/avatars
//
// The command is idempotent — a preset key is fixed, so re-running overwrites the
// same objects — and it reports which presets it could not find rather than
// silently leaving gaps, because a missing preset shows up later as a broken
// avatar for every account whose uid happens to select it.
func seedAvatarPresets(args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("usage: arkive seed-avatars <directory of preset images>")
	}
	dir := args[0]

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if !cfg.S3.Configured() {
		return fmt.Errorf("object storage is not configured; set S3_ENDPOINT, S3_BUCKET and the credentials")
	}

	store, err := blob.NewS3(blob.S3Config{
		Endpoint:        cfg.S3.Endpoint,
		Region:          cfg.S3.Region,
		Bucket:          cfg.S3.Bucket,
		AccessKeyID:     cfg.S3.AccessKeyID,
		SecretAccessKey: cfg.S3.SecretAccessKey,
		UsePathStyle:    cfg.S3.UsePathStyle,
		PublicBaseURL:   cfg.S3.PublicBaseURL,
	})
	if err != nil {
		return fmt.Errorf("build object storage client: %w", err)
	}

	found, err := presetFiles(dir)
	if err != nil {
		return err
	}

	ctx := context.Background()
	var missing []string
	for _, id := range uploads.Presets {
		path, ok := found[id]
		if !ok {
			missing = append(missing, id)
			continue
		}

		raw, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		key := uploads.PresetKey(id)
		// Mutable: a preset key is fixed, so replacing the artwork has to become
		// visible rather than being cached for a year.
		opts := blob.PutOptions{ContentType: "image/png", Mutable: true}
		if err := store.Put(ctx, key, bytes.NewReader(raw), int64(len(raw)), opts); err != nil {
			return fmt.Errorf("upload preset %q: %w", id, err)
		}
		fmt.Printf("uploaded %-28s -> %s\n", id, store.PublicURL(key))
	}

	if len(missing) > 0 {
		return fmt.Errorf("no image found in %s for %d preset(s): %s",
			dir, len(missing), strings.Join(missing, ", "))
	}
	fmt.Printf("\n%d presets are in place under %s\n", len(uploads.Presets), uploads.PresetPrefix)
	return nil
}

// presetFiles maps a preset id to the file that carries its artwork.
//
// The files are named with an ordering prefix ("03-male-tide-navigator.png"),
// which the preset ids do not carry, so the numeric prefix is stripped before
// matching. Matching on the id rather than on position means renumbering the
// files cannot silently shuffle who gets which picture.
func presetFiles(dir string) (map[string]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read preset directory: %w", err)
	}

	out := make(map[string]string, len(entries))
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".png") {
			continue
		}
		names = append(names, e.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		id := strings.TrimSuffix(name, filepath.Ext(name))
		if idx := strings.Index(id, "-"); idx > 0 && isAllDigits(id[:idx]) {
			id = id[idx+1:]
		}
		out[id] = filepath.Join(dir, name)
	}
	return out, nil
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
