package comments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/coredb"
	"github.com/arkive-games/arkive/backend-go/internal/core/notify"
	"github.com/arkive-games/arkive/backend-go/internal/core/policy"
	"github.com/arkive-games/arkive/backend-go/internal/core/roles"
	"github.com/arkive-games/arkive/backend-go/internal/core/uploads"
	"github.com/arkive-games/arkive/backend-go/internal/core/users"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// MarkerImageRead describes either a gallery contribution or a comment attachment.
// Pending and rejected contributions are returned only to their author and staff.
type MarkerImageRead struct {
	ID        uuid.UUID        `json:"id"`
	Game      string           `json:"game"`
	Map       string           `json:"map"`
	Marker    string           `json:"marker"`
	CommentID *uuid.UUID       `json:"commentId" nullable:"true"`
	Position  int16            `json:"position"`
	URL       string           `json:"url"`
	Width     int32            `json:"width"`
	Height    int32            `json:"height"`
	Status    string           `json:"status" enum:"pending,published,rejected"`
	Author    users.UserPublic `json:"author"`
	CreatedAt time.Time        `json:"createdAt"`
	CanReview bool             `json:"canReview"`
}

type MarkerCommentWithImagesRead struct {
	Comment MarkerCommentRead `json:"comment"`
	Images  []MarkerImageRead `json:"images"`
}

func (s *Service) UploadGalleryImage(ctx context.Context, p auth.Principal, target Target, body io.Reader) (MarkerImageRead, error) {
	if _, err := validateTarget(target.GameKey, target.MapID, target.MarkerID); err != nil {
		return MarkerImageRead{}, err
	}
	if err := s.requireMarker(ctx, target); err != nil {
		return MarkerImageRead{}, err
	}
	stored, err := uploads.StoreMarkerImage(ctx, s.blobs, p.ID, body)
	if err != nil {
		return MarkerImageRead{}, err
	}
	status, reason := "pending", "new"
	if s.policy != nil {
		status, reason, err = s.policy.PublicationStatus(ctx, p.ID)
		if err != nil {
			s.discardImages(ctx, []string{stored.Key})
			return MarkerImageRead{}, err
		}
	}
	var row coredb.CoreMarkerImage
	if s.policy != nil && s.pool != nil {
		tx, txErr := s.pool.Begin(ctx)
		if txErr != nil {
			s.discardImages(ctx, []string{stored.Key})
			return MarkerImageRead{}, txErr
		}
		defer tx.Rollback(ctx)
		writer := *s
		writer.q = s.q.WithTx(tx)
		row, err = writer.q.CreateMarkerImage(ctx, imageParams(p, target, stored, nil, 0, status))
		if err != nil {
			if s.logger != nil {
				s.logger.ErrorContext(ctx, "record marker image in transaction", "error", err)
			}
			s.discardImages(ctx, []string{stored.Key})
			return MarkerImageRead{}, fmt.Errorf("record marker image: %w", err)
		}
		if status == "pending" {
			media, _ := json.Marshal([]map[string]any{{"id": row.ID.String(), "url": s.blobs.PublicURL(row.ObjectKey), "kind": "image"}})
			if _, err = s.policy.CreateUnitTx(ctx, tx, p.ID, "map", "marker_images", target.GameKey, &row.ID, reason, policy.Candidate{Media: media}); err != nil {
				if s.logger != nil {
					s.logger.ErrorContext(ctx, "create marker image moderation unit", "error", err)
				}
				s.discardImages(ctx, []string{stored.Key})
				return MarkerImageRead{}, err
			}
		}
		if err = tx.Commit(ctx); err != nil {
			s.discardImages(ctx, []string{stored.Key})
			return MarkerImageRead{}, err
		}
	} else {
		row, err = s.q.CreateMarkerImage(ctx, imageParams(p, target, stored, nil, 0, status))
		if err != nil {
			s.discardImages(ctx, []string{stored.Key})
			return MarkerImageRead{}, fmt.Errorf("record marker image: %w", err)
		}
	}
	rows, err := s.imageReads(ctx, []coredb.CoreMarkerImage{row}, false)
	if err != nil {
		return MarkerImageRead{}, err
	}
	return rows[0], nil
}

// CreateWithImages commits the text and all attachments together. A rejected file
// leaves neither a published partial comment nor uploaded objects behind.
func (s *Service) CreateWithImages(ctx context.Context, p auth.Principal, in CreateInput, files []io.Reader) (out MarkerCommentWithImagesRead, err error) {
	if len(files) < 1 || len(files) > 3 {
		return out, apierr.New(apierr.Validation, "attach between 1 and 3 images")
	}
	if s.pool == nil || s.blobs == nil {
		return out, apierr.New(apierr.StorageUnavailable, "image storage is not configured on this server")
	}
	target, err := validateTarget(in.GameKey, in.MapID, in.MarkerID)
	if err != nil {
		return out, err
	}
	if _, err := validateBody(in.Body); err != nil {
		return out, err
	}
	if err := s.requireMarker(ctx, target); err != nil {
		return out, err
	}
	keys := []string{}
	committed := false
	defer func() {
		if !committed {
			s.discardImages(ctx, keys)
		}
	}()
	stored := make([]uploads.PostImage, 0, len(files))
	for _, file := range files {
		image, e := uploads.StoreMarkerImage(ctx, s.blobs, p.ID, file)
		if e != nil {
			return out, e
		}
		keys = append(keys, image.Key)
		stored = append(stored, image)
	}
	status, reviewReason := "pending", "new"
	if s.policy != nil {
		status, reviewReason, err = s.policy.PublicationStatus(ctx, p.ID)
		if err != nil {
			return out, err
		}
	}

	// AuthorSource normally uses the pool independently of s.q. Resolve this
	// account before reserving a transaction connection, including on pools of
	// size one, so rendering a response cannot wait on its own transaction.
	authors, err := s.authors.PublicByIDs(ctx, []uuid.UUID{p.ID})
	if err != nil {
		return out, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	pending := &pendingNotifications{}
	writer := *s
	writer.q, writer.notifier = s.q.WithTx(tx), pending
	writer.authors = prefetchedAuthors(authors)
	writer.policy = nil
	writer.publicationStatusOverride, writer.publicationReasonOverride = status, reviewReason
	out.Comment, err = writer.Create(ctx, p, in)
	if err != nil {
		return out, err
	}
	rows := make([]coredb.CoreMarkerImage, 0, len(stored))
	for i, image := range stored {
		row, e := writer.q.CreateMarkerImage(ctx, imageParams(p, target, image, &out.Comment.ID, int16(i), status))
		if e != nil {
			return out, fmt.Errorf("attach marker image: %w", e)
		}
		rows = append(rows, row)
	}
	if s.policy != nil && status == "pending" {
		mediaItems := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			mediaItems = append(mediaItems, map[string]any{"id": row.ID.String(), "url": s.blobs.PublicURL(row.ObjectKey), "kind": "image"})
		}
		media, _ := json.Marshal(mediaItems)
		if _, err = s.policy.CreateUnitTx(ctx, tx, p.ID, "map", "marker_comments", target.GameKey, &out.Comment.ID, reviewReason, policy.Candidate{Body: out.Comment.Body, Media: media}); err != nil {
			if s.logger != nil {
				s.logger.ErrorContext(ctx, "create marker comment moderation unit", "error", err)
			}
			return out, err
		}
	}
	out.Images, err = writer.imageReads(ctx, rows, false)
	if err != nil {
		return out, err
	}
	if err := tx.Commit(ctx); err != nil {
		return out, err
	}
	committed = true
	for _, event := range pending.events {
		s.notify(ctx, event)
	}
	return out, nil
}

func imageParams(p auth.Principal, target Target, image uploads.PostImage, comment *uuid.UUID, position int16, status string) coredb.CreateMarkerImageParams {
	return coredb.CreateMarkerImageParams{ID: uuid.New(), GameKey: target.GameKey, MapID: target.MapID, MarkerID: target.MarkerID, AuthorID: p.ID, CommentID: comment, Position: position, ObjectKey: image.Key, Width: int32(image.Width), Height: int32(image.Height), Status: status}
}

func (s *Service) ListImages(ctx context.Context, target Target, p *auth.Principal, page, pageSize int) ([]MarkerImageRead, int64, error) {
	if _, err := validateTarget(target.GameKey, target.MapID, target.MarkerID); err != nil {
		return nil, 0, err
	}
	var viewer *uuid.UUID
	canReview := false
	if p != nil {
		viewer = &p.ID
		var err error
		canReview, err = s.authz.CanAny(ctx, *p, roles.HideContent, []string{target.GameKey})
		if err != nil {
			return nil, 0, err
		}
	}
	limit, offset := api.ClampPaging(page, pageSize, DefaultPageSize, MaxPageSize)
	rows, err := s.q.ListMarkerImages(ctx, coredb.ListMarkerImagesParams{GameKey: target.GameKey, MapID: target.MapID, MarkerID: target.MarkerID, ViewerID: viewer, CanReview: canReview, ResultLimit: limit, ResultOffset: offset})
	if err != nil {
		return nil, 0, err
	}
	count, err := s.q.CountMarkerImages(ctx, coredb.CountMarkerImagesParams{GameKey: target.GameKey, MapID: target.MapID, MarkerID: target.MarkerID, ViewerID: viewer, CanReview: canReview})
	if err != nil {
		return nil, 0, err
	}
	out, err := s.imageReads(ctx, rows, canReview)
	return out, count, err
}

func (s *Service) PendingImages(ctx context.Context, p auth.Principal, page, pageSize int) ([]MarkerImageRead, int64, error) {
	scope, err := s.moderationScope(ctx, p)
	if err != nil {
		return nil, 0, err
	}
	limit, offset := api.ClampPaging(page, pageSize, DefaultPageSize, MaxPageSize)
	rows, err := s.q.ListPendingMarkerImages(ctx, coredb.ListPendingMarkerImagesParams{Games: scope, ResultLimit: limit, ResultOffset: offset})
	if err != nil {
		return nil, 0, err
	}
	count, err := s.q.CountPendingMarkerImages(ctx, scope)
	if err != nil {
		return nil, 0, err
	}
	out, err := s.imageReads(ctx, rows, true)
	return out, count, err
}

func (s *Service) ReviewImage(ctx context.Context, p auth.Principal, id uuid.UUID, publish bool) (MarkerImageRead, error) {
	row, err := s.q.GetMarkerImage(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return MarkerImageRead{}, apierr.New(apierr.NotFound, "no such image")
	}
	if err != nil {
		return MarkerImageRead{}, err
	}
	if err := s.mayModerate(ctx, p, row.GameKey); err != nil {
		return MarkerImageRead{}, err
	}
	status := "rejected"
	if publish {
		status = "published"
	}
	row, err = s.q.ReviewMarkerImage(ctx, coredb.ReviewMarkerImageParams{ID: id, Status: status, ReviewedBy: &p.ID})
	if err != nil {
		return MarkerImageRead{}, err
	}
	rows, err := s.imageReads(ctx, []coredb.CoreMarkerImage{row}, true)
	if err != nil {
		return MarkerImageRead{}, err
	}
	return rows[0], nil
}

func (s *Service) imageReads(ctx context.Context, rows []coredb.CoreMarkerImage, canReview bool) ([]MarkerImageRead, error) {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.AuthorID)
	}
	authors, err := s.authors.PublicByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]MarkerImageRead, 0, len(rows))
	for _, row := range rows {
		url := ""
		if s.blobs != nil {
			url = s.blobs.PublicURL(row.ObjectKey)
		}
		out = append(out, MarkerImageRead{ID: row.ID, Game: row.GameKey, Map: row.MapID, Marker: row.MarkerID, CommentID: row.CommentID, Position: row.Position, URL: url, Width: row.Width, Height: row.Height, Status: row.Status, Author: authors[row.AuthorID], CreatedAt: row.CreatedAt, CanReview: canReview})
	}
	return out, nil
}

func (s *Service) discardImages(ctx context.Context, keys []string) {
	// Cleanup must still run after a disconnected request cancels its context.
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	for _, key := range keys {
		if err := s.blobs.Delete(cleanup, key); err != nil && s.logger != nil {
			s.logger.WarnContext(cleanup, "could not remove rolled-back marker image", "key", key, "error", err)
		}
	}
}

type pendingNotifications struct{ events []notify.Event }

func (p *pendingNotifications) Notify(_ context.Context, event notify.Event) error {
	p.events = append(p.events, event)
	return nil
}

type prefetchedAuthors map[uuid.UUID]users.UserPublic

func (p prefetchedAuthors) PublicByIDs(context.Context, []uuid.UUID) (map[uuid.UUID]users.UserPublic, error) {
	return p, nil
}
