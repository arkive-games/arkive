package forum

import (
	"context"
	"fmt"
	"io"
	"log/slog"

	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// MaxPostImages is how many images one post may carry.
//
// Nine, which is the grid the composer draws and a common ceiling elsewhere. The database
// enforces the same bound through the position check, so this exists to name the limit in
// a rejection rather than surface a constraint violation.
const MaxPostImages = 9

// ImageRead is one attached image as the API returns it.
type ImageRead struct {
	Position int    `json:"position" doc:"Order within the post, from 0"`
	URL      string `json:"url" doc:"Where to fetch it"`
	Width    int    `json:"width" doc:"Stored width in pixels"`
	Height   int    `json:"height" doc:"Stored height in pixels"`
}

// ImageStore stores and addresses image objects.
//
// An interface so the forum depends on storing an image and naming it, not on the whole
// upload package — and so a test can attach images against an in-memory store, which is
// how the avatar flow is already covered without a container.
type ImageStore interface {
	StorePostImage(ctx context.Context, uid int64, r io.Reader) (key string, width, height int, err error)
	Delete(ctx context.Context, key string) error
	PublicURL(key string) string
}

// AttachImage stores an upload and attaches it to a post at a position.
//
// Author only. Not a moderator action and not open to readers: an image on someone else's
// post would be a way to put content under their name.
func (s *Service) AttachImage(ctx context.Context, principal auth.Principal, postNo int64, position int, uid int64, body io.Reader) (ImageRead, error) {
	if s.images == nil {
		return ImageRead{}, apierr.New(apierr.StorageUnavailable,
			"image storage is not configured on this server")
	}
	if position < 0 || position >= MaxPostImages {
		return ImageRead{}, apierr.New(apierr.Validation,
			fmt.Sprintf("position must be between 0 and %d", MaxPostImages-1))
	}

	post, err := s.ownedPost(ctx, principal, postNo)
	if err != nil {
		return ImageRead{}, err
	}

	// Counted before the upload, so an over-limit request does not write an object it
	// will never reference. Replacing an existing position is not a new image, which the
	// count cannot tell on its own — so the check allows equality when the slot is taken.
	existing, err := s.q.ListForumPostImages(ctx, post.ID)
	if err != nil {
		return ImageRead{}, fmt.Errorf("list images: %w", err)
	}
	replacing := false
	var displaced string
	for _, row := range existing {
		if int(row.Position) == position {
			replacing = true
			// Kept so the object it is about to point away from can be reclaimed. Without
			// this the row is overwritten and the old key becomes unreachable — nothing
			// references it and nothing knows it exists.
			displaced = row.ObjectKey
			break
		}
	}
	if !replacing && len(existing) >= MaxPostImages {
		return ImageRead{}, apierr.New(apierr.Validation,
			fmt.Sprintf("a post may carry at most %d images", MaxPostImages))
	}

	key, width, height, err := s.images.StorePostImage(ctx, uid, body)
	if err != nil {
		return ImageRead{}, err
	}

	row, err := s.q.AttachForumPostImage(ctx, coredb.AttachForumPostImageParams{
		PostID:    post.ID,
		Position:  int16(position),
		ObjectKey: key,
		Width:     int32(width),
		Height:    int32(height),
	})
	if err != nil {
		// The object is written but unreferenced. Left in place rather than deleted here:
		// it sits under the account's own prefix, where the next upload's reclamation
		// finds it, and a compensating delete that itself failed would be a second error
		// to report on top of this one.
		return ImageRead{}, mapConstraintError(err)
	}

	// Run after the new row is committed, so the displaced key's remaining references are
	// counted against the state that now exists.
	s.reclaimIfUnreferenced(ctx, displaced)

	s.logger.InfoContext(ctx, "post image attached",
		slog.Int64("postNo", postNo), slog.Int("position", position))

	return s.toImageRead(row), nil
}

// DetachImage removes an image from a post. Author only, and idempotent: a position that
// carries nothing is already in the state the caller asked for.
func (s *Service) DetachImage(ctx context.Context, principal auth.Principal, postNo int64, position int) error {
	post, err := s.ownedPost(ctx, principal, postNo)
	if err != nil {
		return err
	}

	rows, err := s.q.ListForumPostImages(ctx, post.ID)
	if err != nil {
		return fmt.Errorf("list images: %w", err)
	}

	var key string
	for _, row := range rows {
		if int(row.Position) == position {
			key = row.ObjectKey
			break
		}
	}

	if _, err := s.q.DetachForumPostImage(ctx, coredb.DetachForumPostImageParams{
		PostID:   post.ID,
		Position: int16(position),
	}); err != nil {
		return fmt.Errorf("detach image: %w", err)
	}

	s.reclaimIfUnreferenced(ctx, key)
	return nil
}

// reclaimIfUnreferenced deletes an object only once no row points at it.
//
// The counting is the whole function. Object keys are content-addressed and scoped to the
// uploader, so one account attaching the same image to two posts — or to two slots of one
// post, an easy double-pick in a nine-slot grid — produces one object with two rows
// referencing it. Deleting a displaced key without checking takes an object another post is
// still rendering: no error is raised, the warning below never fires because the delete
// succeeded, and the image is gone for good.
//
// The avatar path is safe from this because an account has exactly one avatar row, so a
// displaced key is provably unreferenced. Post images broke that invariant, and the delete
// was copied across before the invariant was rechecked.
//
// Best-effort after that: the rows are the source of truth and already say what they say,
// so a failed delete leaves a reclaimable orphan rather than a broken image. An orphan is
// cheap; a deleted object someone is rendering is not recoverable.
func (s *Service) reclaimIfUnreferenced(ctx context.Context, key string) {
	if key == "" || s.images == nil {
		return
	}

	remaining, err := s.q.CountForumPostImagesByKey(ctx, key)
	if err != nil {
		s.logger.WarnContext(ctx, "could not count references to a post image; leaving it in place",
			slog.String("key", key), slog.Any("error", err))
		return
	}
	if remaining > 0 {
		return
	}

	if err := s.images.Delete(ctx, key); err != nil {
		s.logger.WarnContext(ctx, "could not delete an unreferenced post image",
			slog.String("key", key), slog.Any("error", err))
	}
}

// imageKeys lists the objects a post references, for reclamation after it is deleted.
func (s *Service) imageKeys(ctx context.Context, postID uuid.UUID) ([]string, error) {
	if s.images == nil {
		return nil, nil
	}
	keys, err := s.q.ListForumPostImageKeys(ctx, postID)
	if err != nil {
		return nil, fmt.Errorf("list image keys: %w", err)
	}
	return keys, nil
}

// imagesFor loads one post's images.
func (s *Service) imagesFor(ctx context.Context, postID uuid.UUID) ([]ImageRead, error) {
	if s.images == nil {
		return []ImageRead{}, nil
	}
	rows, err := s.q.ListForumPostImages(ctx, postID)
	if err != nil {
		return nil, fmt.Errorf("list images: %w", err)
	}
	out := make([]ImageRead, 0, len(rows))
	for _, row := range rows {
		out = append(out, s.toImageRead(row))
	}
	return out, nil
}

// imagesForPosts loads images for a page of posts in one query.
func (s *Service) imagesForPosts(ctx context.Context, postIDs []uuid.UUID) (map[uuid.UUID][]ImageRead, error) {
	byPost := make(map[uuid.UUID][]ImageRead, len(postIDs))
	if s.images == nil || len(postIDs) == 0 {
		return byPost, nil
	}
	rows, err := s.q.ListForumPostImagesForPosts(ctx, postIDs)
	if err != nil {
		return nil, fmt.Errorf("list images: %w", err)
	}
	for _, row := range rows {
		byPost[row.PostID] = append(byPost[row.PostID], s.toImageRead(row))
	}
	return byPost, nil
}

func (s *Service) toImageRead(row coredb.CoreForumPostImage) ImageRead {
	return ImageRead{
		Position: int(row.Position),
		URL:      s.images.PublicURL(row.ObjectKey),
		Width:    int(row.Width),
		Height:   int(row.Height),
	}
}
