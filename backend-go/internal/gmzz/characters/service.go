// Package characters implements saved Lord of Mysteries characters: the score
// page's inputs, kept per account and readable by link.
//
// The stored document is the frontend's. This package checks its outer shape —
// an object, a size bound, an integer schemaVersion — and never reads the
// sections inside, so a new calculator input ships without a backend change.
// Nothing here stores or computes a score: the page derives every score from
// the inputs and the current dataset, which is what lets a saved character
// re-score itself when the game data moves.
package characters

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/arkive-games/arkive/backend-go/internal/gmzz/gmzzdb"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Limits. MaxPerOwner is the product decision; MaxDataBytes is generous for a
// full loadout (a complete one serializes to a few kilobytes) while keeping a
// single row from becoming a storage channel.
const (
	MaxPerOwner  = 10
	MaxDataBytes = 64 * 1024
	maxTextRunes = 32
	publicIDLen  = 10
)

// Error codes owned by this module. They ride the shared envelope; the status is
// set explicitly because apierr's default mapping knows only the core codes.
const (
	LimitReached     apierr.Code = "CharacterLimitReachedError"
	RevisionConflict apierr.Code = "CharacterRevisionConflictError"
)

// Visibility is who may read a character.
type Visibility string

// Visibilities. A later "public" (listed and searchable) is an addition here and
// in the table's CHECK, nothing else.
const (
	Private Visibility = "private"
	Link    Visibility = "link"
)

func (v Visibility) valid() bool { return v == Private || v == Link }

// Summary is a character without its document: what a list shows.
type Summary struct {
	ID            string     `json:"id" doc:"The character's public id: its link and its API path"`
	Name          string     `json:"name"`
	Server        *string    `json:"server,omitempty" doc:"Display only"`
	UID           *string    `json:"uid,omitempty" doc:"Display only, never a key. Omitted for readers other than the owner unless showUid is set"`
	ShowUID       bool       `json:"showUid" doc:"Whether readers other than the owner see uid"`
	Visibility    Visibility `json:"visibility" enum:"private,link"`
	SchemaVersion int32      `json:"schemaVersion" doc:"The document's schemaVersion, copied out of it"`
	Revision      int64      `json:"revision" doc:"Pass back on update; a stale value is refused with 409"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

// Character is one character with its document.
type Character struct {
	Summary
	Editable bool           `json:"editable" doc:"True when the caller owns the character"`
	Data     map[string]any `json:"data" doc:"The score page's inputs, as the frontend wrote them"`
}

// Input creates a character.
type Input struct {
	Name       string
	Server     *string
	UID        *string
	ShowUID    bool
	Visibility *Visibility
	Data       map[string]any
}

// Patch changes a character. A nil field is left alone; an empty Server or UID
// clears it.
type Patch struct {
	Revision   int64
	Name       *string
	Server     *string
	UID        *string
	ShowUID    *bool
	Visibility *Visibility
	Data       map[string]any
}

// Service implements the use cases.
type Service struct {
	pool *pgxpool.Pool
	q    *gmzzdb.Queries
}

// NewService wires the service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: gmzzdb.New(pool)}
}

// List returns the owner's characters in their chosen order.
func (s *Service) List(ctx context.Context, owner uuid.UUID) ([]Summary, error) {
	rows, err := s.q.ListOwnedCharacters(ctx, owner)
	if err != nil {
		return nil, fmt.Errorf("list characters: %w", err)
	}
	out := make([]Summary, 0, len(rows))
	for _, r := range rows {
		out = append(out, Summary{
			ID: r.PublicID, Name: r.Name, Server: r.Server, UID: r.UID, ShowUID: r.ShowUID,
			Visibility: Visibility(r.Visibility), SchemaVersion: r.SchemaVersion, Revision: r.Revision,
			CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		})
	}
	return out, nil
}

// Create stores a new character at the end of the owner's list.
func (s *Service) Create(ctx context.Context, owner uuid.UUID, in Input) (Character, error) {
	name, err := cleanName(in.Name)
	if err != nil {
		return Character{}, err
	}
	server, err := cleanOptional(in.Server, "server")
	if err != nil {
		return Character{}, err
	}
	uid, err := cleanOptional(in.UID, "uid")
	if err != nil {
		return Character{}, err
	}
	visibility := Link
	if in.Visibility != nil {
		visibility = *in.Visibility
	}
	if !visibility.valid() {
		return Character{}, apierr.New(apierr.Validation, "visibility must be private or link")
	}
	data, version, err := encodeData(in.Data)
	if err != nil {
		return Character{}, err
	}

	row, err := s.insert(ctx, owner, gmzzdb.InsertCharacterParams{
		OwnerID: owner, Name: name, Server: server, UID: uid, ShowUID: in.ShowUID,
		Visibility: string(visibility), SchemaVersion: version, Data: data,
	})
	if err != nil {
		return Character{}, err
	}
	return view(row, &owner)
}

// Get reads a character for any caller. viewer is nil for an anonymous one.
//
// A private character is reported as not found to everyone but its owner, so a
// link cannot be probed for whether something stands behind it.
func (s *Service) Get(ctx context.Context, viewer *uuid.UUID, publicID string) (Character, error) {
	row, err := s.readable(ctx, viewer, publicID)
	if err != nil {
		return Character{}, err
	}
	return view(row, viewer)
}

// Update applies a patch from the owner, refusing a stale revision.
func (s *Service) Update(ctx context.Context, owner uuid.UUID, publicID string, p Patch) (Character, error) {
	row, err := s.owned(ctx, owner, publicID)
	if err != nil {
		return Character{}, err
	}
	if row.Revision != p.Revision {
		return Character{}, conflict()
	}

	params := gmzzdb.UpdateCharacterParams{
		Name: row.Name, Server: row.Server, UID: row.UID, ShowUID: row.ShowUID, Visibility: row.Visibility,
		SchemaVersion: row.SchemaVersion, Data: row.Data,
		PublicID: publicID, OwnerID: owner, Revision: p.Revision,
	}
	if p.Name != nil {
		if params.Name, err = cleanName(*p.Name); err != nil {
			return Character{}, err
		}
	}
	if p.Server != nil {
		if params.Server, err = cleanOptional(p.Server, "server"); err != nil {
			return Character{}, err
		}
	}
	if p.UID != nil {
		if params.UID, err = cleanOptional(p.UID, "uid"); err != nil {
			return Character{}, err
		}
	}
	if p.ShowUID != nil {
		params.ShowUID = *p.ShowUID
	}
	if p.Visibility != nil {
		if !p.Visibility.valid() {
			return Character{}, apierr.New(apierr.Validation, "visibility must be private or link")
		}
		params.Visibility = string(*p.Visibility)
	}
	if p.Data != nil {
		if params.Data, params.SchemaVersion, err = encodeData(p.Data); err != nil {
			return Character{}, err
		}
	}

	updated, err := s.q.UpdateCharacter(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// The read above saw this revision, so the row was written or deleted in
			// between. Either way the caller's view is stale.
			if _, again := s.owned(ctx, owner, publicID); again != nil {
				return Character{}, again
			}
			return Character{}, conflict()
		}
		return Character{}, fmt.Errorf("update character: %w", err)
	}
	return view(updated, &owner)
}

// Delete removes one of the owner's characters.
func (s *Service) Delete(ctx context.Context, owner uuid.UUID, publicID string) error {
	n, err := s.q.DeleteCharacter(ctx, gmzzdb.DeleteCharacterParams{PublicID: publicID, OwnerID: owner})
	if err != nil {
		return fmt.Errorf("delete character: %w", err)
	}
	if n == 0 {
		return notFound()
	}
	return nil
}

// Copy duplicates a character the caller can read into the caller's own list.
//
// Copying one's own keeps every field. Copying another player's keeps the
// document and server but not the uid — it identifies that player, not the
// copier — and the copy is shared by link, as any new character is.
func (s *Service) Copy(ctx context.Context, caller uuid.UUID, publicID string, name *string) (Character, error) {
	src, err := s.readable(ctx, &caller, publicID)
	if err != nil {
		return Character{}, err
	}
	params := gmzzdb.InsertCharacterParams{
		OwnerID: caller, Name: src.Name, Server: src.Server, Visibility: string(Link),
		SchemaVersion: src.SchemaVersion, Data: src.Data,
	}
	if src.OwnerID == caller {
		params.UID, params.ShowUID, params.Visibility = src.UID, src.ShowUID, src.Visibility
	}
	if name != nil {
		if params.Name, err = cleanName(*name); err != nil {
			return Character{}, err
		}
	}
	row, err := s.insert(ctx, caller, params)
	if err != nil {
		return Character{}, err
	}
	return view(row, &caller)
}

// Reorder sets the owner's order. ids must be exactly the owner's characters.
func (s *Service) Reorder(ctx context.Context, owner uuid.UUID, ids []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.q.WithTx(tx)
	if err := q.LockOwner(ctx, lockKey(owner)); err != nil {
		return fmt.Errorf("lock owner: %w", err)
	}
	rows, err := q.ListOwnedCharacters(ctx, owner)
	if err != nil {
		return fmt.Errorf("list characters: %w", err)
	}
	owned := make(map[string]bool, len(rows))
	for _, r := range rows {
		owned[r.PublicID] = true
	}
	if len(ids) != len(owned) {
		return apierr.New(apierr.Validation, "ids must list each of your characters exactly once")
	}
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if !owned[id] || seen[id] {
			return apierr.New(apierr.Validation, "ids must list each of your characters exactly once")
		}
		seen[id] = true
	}
	for i, id := range ids {
		if err := q.SetCharacterOrder(ctx, gmzzdb.SetCharacterOrderParams{SortOrder: int32(i), PublicID: id, OwnerID: owner}); err != nil {
			return fmt.Errorf("set order: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// insert enforces the per-owner limit and draws a fresh public id.
func (s *Service) insert(ctx context.Context, owner uuid.UUID, params gmzzdb.InsertCharacterParams) (gmzzdb.GmzzCharacter, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return gmzzdb.GmzzCharacter{}, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.q.WithTx(tx)

	if err := q.LockOwner(ctx, lockKey(owner)); err != nil {
		return gmzzdb.GmzzCharacter{}, fmt.Errorf("lock owner: %w", err)
	}
	n, err := q.CountOwnedCharacters(ctx, owner)
	if err != nil {
		return gmzzdb.GmzzCharacter{}, fmt.Errorf("count characters: %w", err)
	}
	if n >= MaxPerOwner {
		return gmzzdb.GmzzCharacter{}, apierr.New(LimitReached, fmt.Sprintf("an account holds at most %d characters", MaxPerOwner)).
			WithStatus(409)
	}

	// 62^10 ids make a collision vanishingly rare, but a retry costs nothing and
	// ON CONFLICT DO NOTHING keeps the transaction usable for it.
	for attempt := 0; attempt < 5; attempt++ {
		params.PublicID, err = newPublicID()
		if err != nil {
			return gmzzdb.GmzzCharacter{}, err
		}
		row, err := q.InsertCharacter(ctx, params)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return gmzzdb.GmzzCharacter{}, fmt.Errorf("insert character: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return gmzzdb.GmzzCharacter{}, fmt.Errorf("commit: %w", err)
		}
		return row, nil
	}
	return gmzzdb.GmzzCharacter{}, errors.New("could not draw an unused public id")
}

// readable loads a character the viewer may read.
func (s *Service) readable(ctx context.Context, viewer *uuid.UUID, publicID string) (gmzzdb.GmzzCharacter, error) {
	row, err := s.load(ctx, publicID)
	if err != nil {
		return row, err
	}
	if Visibility(row.Visibility) == Private && (viewer == nil || *viewer != row.OwnerID) {
		return gmzzdb.GmzzCharacter{}, notFound()
	}
	return row, nil
}

// owned loads a character the caller owns. Someone else's is not found rather
// than forbidden, for the same reason readable hides a private one.
func (s *Service) owned(ctx context.Context, owner uuid.UUID, publicID string) (gmzzdb.GmzzCharacter, error) {
	row, err := s.load(ctx, publicID)
	if err != nil {
		return row, err
	}
	if row.OwnerID != owner {
		return gmzzdb.GmzzCharacter{}, notFound()
	}
	return row, nil
}

func (s *Service) load(ctx context.Context, publicID string) (gmzzdb.GmzzCharacter, error) {
	if !validPublicID(publicID) {
		return gmzzdb.GmzzCharacter{}, notFound()
	}
	row, err := s.q.GetCharacterByPublicID(ctx, publicID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return row, notFound()
		}
		return row, fmt.Errorf("load character: %w", err)
	}
	return row, nil
}

// view renders a row for viewer, hiding the uid from everyone but the owner
// unless the owner chose to show it.
func view(row gmzzdb.GmzzCharacter, viewer *uuid.UUID) (Character, error) {
	var data map[string]any
	if err := json.Unmarshal(row.Data, &data); err != nil {
		return Character{}, fmt.Errorf("decode character data: %w", err)
	}
	editable := viewer != nil && *viewer == row.OwnerID
	uid := row.UID
	if !editable && !row.ShowUID {
		uid = nil
	}
	return Character{
		Summary: Summary{
			ID: row.PublicID, Name: row.Name, Server: row.Server, UID: uid, ShowUID: row.ShowUID,
			Visibility: Visibility(row.Visibility), SchemaVersion: row.SchemaVersion, Revision: row.Revision,
			CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
		},
		Editable: editable,
		Data:     data,
	}, nil
}

// encodeData checks the document's outer shape and serializes it.
func encodeData(data map[string]any) ([]byte, int32, error) {
	if data == nil {
		return nil, 0, apierr.New(apierr.Validation, "data must be an object")
	}
	raw, ok := data["schemaVersion"].(float64)
	if !ok || raw != math.Trunc(raw) || raw < 1 || raw > math.MaxInt32 {
		return nil, 0, apierr.New(apierr.Validation, "data.schemaVersion must be a positive integer")
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		return nil, 0, apierr.New(apierr.Validation, "data is not serializable")
	}
	if len(encoded) > MaxDataBytes {
		return nil, 0, apierr.New(apierr.RequestEntityTooBig, fmt.Sprintf("data exceeds %d bytes", MaxDataBytes))
	}
	return encoded, int32(raw), nil
}

func cleanName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if n := utf8.RuneCountInString(name); n < 1 || n > maxTextRunes {
		return "", apierr.New(apierr.Validation, fmt.Sprintf("name must be 1 to %d characters", maxTextRunes))
	}
	return name, nil
}

// cleanOptional trims a display field; blank means absent.
func cleanOptional(value *string, field string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	v := strings.TrimSpace(*value)
	if v == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(v) > maxTextRunes {
		return nil, apierr.New(apierr.Validation, fmt.Sprintf("%s must be at most %d characters", field, maxTextRunes))
	}
	return &v, nil
}

const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

func newPublicID() (string, error) {
	var b strings.Builder
	b.Grow(publicIDLen)
	limit := big.NewInt(int64(len(base62)))
	for range publicIDLen {
		n, err := rand.Int(rand.Reader, limit)
		if err != nil {
			return "", fmt.Errorf("draw public id: %w", err)
		}
		b.WriteByte(base62[n.Int64()])
	}
	return b.String(), nil
}

// validPublicID rejects anything that could not have been issued, so a junk
// path costs no query.
func validPublicID(id string) bool {
	if len(id) != publicIDLen {
		return false
	}
	for i := 0; i < len(id); i++ {
		if !strings.ContainsRune(base62, rune(id[i])) {
			return false
		}
	}
	return true
}

// lockKey maps an owner to the advisory lock that serializes their writes.
// A collision between two owners only serializes them, never corrupts.
func lockKey(owner uuid.UUID) int64 {
	return int64(binary.BigEndian.Uint64(owner[:8]))
}

func notFound() error { return apierr.New(apierr.NotFound, "character not found") }

func conflict() error {
	return apierr.New(RevisionConflict, "the character changed since it was read").WithStatus(409)
}
