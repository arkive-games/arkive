// Package policy owns the publication tier and the audit-backed moderation unit.
package policy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

const (
	PolicyVersion           = "1.0.0"
	QualifyingApprovals     = 3
	MinimumAccountAge       = 72 * time.Hour
	ViolationLookback       = 30 * 24 * time.Hour
	OrdinaryViolationsLimit = 2
	CleanRestrictionPeriod  = 30 * 24 * time.Hour
)

type Tier string

const (
	TierNew        Tier = "new"
	TierTrusted    Tier = "trusted"
	TierRestricted Tier = "restricted"
)

type Eligibility struct {
	Tier                Tier
	EmailVerified       bool
	Active              bool
	AccountAge          time.Duration
	QualifyingApprovals int
	OrdinaryViolations  int
	SeriousViolations   int
	CleanHistory        bool
}

func (e Eligibility) RequiresReview() bool { return e.Tier != TierTrusted }

type Candidate struct {
	Title  string          `json:"title"`
	Body   string          `json:"body"`
	Fields json.RawMessage `json:"fields"`
	Media  json.RawMessage `json:"media"`
}

type Unit struct {
	ID             uuid.UUID       `json:"id"`
	AuthorID       uuid.UUID       `json:"authorId"`
	ContentType    string          `json:"contentType"`
	SourceTable    string          `json:"sourceTable"`
	SourceID       *uuid.UUID      `json:"sourceId"`
	Game           string          `json:"game,omitempty"`
	Revision       int64           `json:"revision"`
	State          string          `json:"state"`
	ReviewReason   string          `json:"reviewReason"`
	Candidate      Candidate       `json:"candidate"`
	PreviousPublic json.RawMessage `json:"previousPublic,omitempty"`
	PolicyVersion  string          `json:"policyVersion"`
	SubmittedAt    time.Time       `json:"submittedAt"`
	Author         AuthorSummary   `json:"author"`
}

type AuthorSummary struct {
	ID                  uuid.UUID `json:"id"`
	Name                string    `json:"name"`
	Tier                Tier      `json:"tier"`
	EmailVerified       bool      `json:"emailVerified"`
	AccountAgeHours     int       `json:"accountAgeHours"`
	QualifyingApprovals int       `json:"qualifyingApprovals"`
	CleanHistory        bool      `json:"cleanHistory"`
}

type ListFilter struct {
	ContentType string
	Game        string
	State       string
	Page        int
	PageSize    int
}

type ListResult struct {
	Count int64
	Units []Unit
}

type Service struct{ pool *pgxpool.Pool }

type executor interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

func (s *Service) Eligibility(ctx context.Context, userID uuid.UUID) (Eligibility, error) {
	var e Eligibility
	var created time.Time
	var approvals, ordinary, serious int
	var tier string
	var verified, active bool
	err := s.pool.QueryRow(ctx, `
		SELECT u.created_at, u.is_verified, u.is_active,
		       COALESCE(t.tier, 'new'), COALESCE(t.qualifying_approvals, 0),
		       COALESCE((SELECT count(*) FROM core.moderation_violations v
		          WHERE v.user_id = u.id AND v.severity = 'ordinary'
		            AND v.overturned_at IS NULL AND v.created_at >= now() - $2::interval), 0),
		       COALESCE((SELECT count(*) FROM core.moderation_violations v
		          WHERE v.user_id = u.id AND v.severity = 'serious'
		            AND v.overturned_at IS NULL AND v.created_at >= now() - $2::interval), 0)
		FROM core.users u LEFT JOIN core.moderation_trust t ON t.user_id = u.id
		WHERE u.id = $1`, userID, "30 days").Scan(&created, &verified, &active, &tier, &approvals, &ordinary, &serious)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Eligibility{}, apierr.New(apierr.UserNotFound, "no such user")
		}
		return Eligibility{}, fmt.Errorf("load publication eligibility: %w", err)
	}
	e = Eligibility{Tier: Tier(tier), EmailVerified: verified, Active: active, AccountAge: time.Since(created), QualifyingApprovals: approvals, OrdinaryViolations: ordinary, SeriousViolations: serious, CleanHistory: ordinary == 0 && serious == 0}
	if !active || !verified || e.AccountAge < MinimumAccountAge || approvals < QualifyingApprovals || serious > 0 || ordinary >= OrdinaryViolationsLimit {
		if serious > 0 || ordinary >= OrdinaryViolationsLimit {
			e.Tier = TierRestricted
		} else if e.Tier == TierTrusted {
			e.Tier = TierNew
		}
	}
	return e, nil
}

func (s *Service) PublicationStatus(ctx context.Context, userID uuid.UUID) (string, string, error) {
	e, err := s.Eligibility(ctx, userID)
	if err != nil {
		return "", "", err
	}
	if !e.RequiresReview() {
		return "published", "trusted", nil
	}
	reason := "new"
	if e.Tier == TierRestricted {
		reason = "restricted"
	} else if !e.EmailVerified {
		reason = "unverified"
	}
	return "pending", reason, nil
}

func (s *Service) CreateUnit(ctx context.Context, authorID uuid.UUID, contentType, sourceTable, game string, sourceID *uuid.UUID, reviewReason string, candidate Candidate) (uuid.UUID, error) {
	return s.createUnit(ctx, s.pool, authorID, contentType, sourceTable, game, sourceID, 1, reviewReason, candidate, nil)
}

// CreateUnitTx keeps the publication unit in the same transaction as the
// source row and its attachments.
func (s *Service) CreateUnitTx(ctx context.Context, tx pgx.Tx, authorID uuid.UUID, contentType, sourceTable, game string, sourceID *uuid.UUID, reviewReason string, candidate Candidate) (uuid.UUID, error) {
	return s.createUnit(ctx, tx, authorID, contentType, sourceTable, game, sourceID, 1, reviewReason, candidate, nil)
}

// CreateRevisionUnitTx stores an edit candidate while the current public row
// remains visible until the candidate is approved.
func (s *Service) CreateRevisionUnitTx(ctx context.Context, tx pgx.Tx, authorID uuid.UUID, contentType, sourceTable, game string, sourceID *uuid.UUID, revision int64, reviewReason string, candidate Candidate, previousPublic json.RawMessage) (uuid.UUID, error) {
	return s.createUnit(ctx, tx, authorID, contentType, sourceTable, game, sourceID, revision, reviewReason, candidate, previousPublic)
}

func (s *Service) createUnit(ctx context.Context, db executor, authorID uuid.UUID, contentType, sourceTable, game string, sourceID *uuid.UUID, revision int64, reviewReason string, candidate Candidate, previousPublic json.RawMessage) (uuid.UUID, error) {
	if revision < 1 {
		revision = 1
	}
	fields := candidate.Fields
	if len(fields) == 0 {
		fields = json.RawMessage(`{}`)
	}
	media := candidate.Media
	if len(media) == 0 {
		media = json.RawMessage(`[]`)
	}
	id := uuid.New()
	_, err := db.Exec(ctx, `INSERT INTO core.content_units (id, author_id, content_type, source_table, scope_game, source_id, revision, review_reason, title, body, fields, media, previous_public, policy_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, id, authorID, contentType, sourceTable, game, sourceID, revision, reviewReason, candidate.Title, candidate.Body, fields, media, previousPublic, PolicyVersion)
	if err != nil {
		return uuid.Nil, fmt.Errorf("create moderation unit: %w", err)
	}
	return id, nil
}

func (s *Service) NextRevision(ctx context.Context, sourceTable string, sourceID uuid.UUID) (int64, error) {
	var revision int64
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(MAX(revision), 0) + 1 FROM core.content_units WHERE source_table=$1 AND source_id=$2`, sourceTable, sourceID).Scan(&revision); err != nil {
		return 0, fmt.Errorf("load moderation revision: %w", err)
	}
	return revision, nil
}

// ReplacePendingUnit advances the candidate revision for an already pending
// source. This prevents a user editing a queued item from creating two review
// cards for the same publication slot.
func (s *Service) ReplacePendingUnit(ctx context.Context, authorID uuid.UUID, contentType, sourceTable, game string, sourceID uuid.UUID, reviewReason string, candidate Candidate, previousPublic json.RawMessage) (uuid.UUID, error) {
	fields := candidate.Fields
	if len(fields) == 0 {
		fields = json.RawMessage(`{}`)
	}
	media := candidate.Media
	if len(media) == 0 {
		media = json.RawMessage(`[]`)
	}
	var id uuid.UUID
	var revision int64
	err := s.pool.QueryRow(ctx, `SELECT id, revision FROM core.content_units WHERE source_table=$1 AND source_id=$2 AND state='pending' ORDER BY revision DESC LIMIT 1`, sourceTable, sourceID).Scan(&id, &revision)
	if errors.Is(err, pgx.ErrNoRows) {
		revision = 1
		if len(previousPublic) > 0 && string(previousPublic) != "null" {
			revision = 2
		}
		return s.createUnit(ctx, s.pool, authorID, contentType, sourceTable, game, &sourceID, revision, reviewReason, candidate, previousPublic)
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("find pending moderation unit: %w", err)
	}
	_, err = s.pool.Exec(ctx, `UPDATE core.content_units SET author_id=$2, content_type=$3, scope_game=$4, revision=$5, review_reason=$6, title=$7, body=$8, fields=$9, media=$10, previous_public=$11, updated_at=now() WHERE id=$1`, id, authorID, contentType, game, revision+1, reviewReason, candidate.Title, candidate.Body, fields, media, previousPublic)
	if err != nil {
		return uuid.Nil, fmt.Errorf("replace pending moderation unit: %w", err)
	}
	return id, nil
}

// ScopeForUnit returns the game scope used by the moderation authorization
// boundary. An empty scope is platform content and therefore site-admin only.
func (s *Service) ScopeForUnit(ctx context.Context, id uuid.UUID) (string, error) {
	var game string
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(scope_game, '') FROM core.content_units WHERE id=$1`, id).Scan(&game); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", apierr.New(apierr.NotFound, "no such moderation unit")
		}
		return "", fmt.Errorf("load moderation scope: %w", err)
	}
	return game, nil
}

// CanReviewUnit applies the same scope rule to a decision that ListUnits uses
// for paging. Forum posts may carry several game tags, so a moderator of any
// tagged game can review the single publication unit.
func (s *Service) CanReviewUnit(ctx context.Context, id uuid.UUID, games []string) (bool, error) {
	var allowed bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM core.content_units c
			WHERE c.id=$1 AND (
				c.scope_game = ANY($2::text[])
				OR (c.source_table='forum_posts' AND EXISTS (
					SELECT 1 FROM core.forum_posts p
					WHERE p.id=c.source_id AND p.game_ids && $2::text[]
				))
			)
		)`, id, games).Scan(&allowed); err != nil {
		return false, fmt.Errorf("check moderation scope: %w", err)
	}
	return allowed, nil
}

func (s *Service) ListUnits(ctx context.Context, filter ListFilter, games []string) (ListResult, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}
	args := []any{filter.ContentType, filter.State, filter.Game, games, filter.PageSize, (filter.Page - 1) * filter.PageSize}
	var count int64
	if err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM core.content_units
		WHERE ($1 = '' OR content_type = $1)
		  AND ($2 = '' OR state = $2)
		  AND ($3 = '' OR scope_game = $3)
		  AND ($4::text[] IS NULL OR scope_game = ANY($4::text[])
		       OR (source_table='forum_posts' AND EXISTS (
				SELECT 1 FROM core.forum_posts p WHERE p.id=source_id AND p.game_ids && $4::text[]
			)))`, args[:4]...).Scan(&count); err != nil {
		return ListResult{}, fmt.Errorf("count moderation units: %w", err)
	}
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.author_id, c.content_type, c.source_table, c.scope_game, c.source_id, c.revision, c.state, c.review_reason, c.title, c.body, c.fields, c.media, COALESCE(c.previous_public, 'null'::jsonb), c.policy_version, c.submitted_at
		FROM core.content_units c
		WHERE ($1 = '' OR content_type = $1)
		  AND ($2 = '' OR state = $2)
		  AND ($3 = '' OR scope_game = $3)
		  AND ($4::text[] IS NULL OR scope_game = ANY($4::text[])
		       OR (source_table='forum_posts' AND EXISTS (
				SELECT 1 FROM core.forum_posts p WHERE p.id=source_id AND p.game_ids && $4::text[]
			)))
		ORDER BY c.submitted_at, c.id LIMIT $5 OFFSET $6`, args...)
	if err != nil {
		return ListResult{}, fmt.Errorf("list moderation units: %w", err)
	}
	defer rows.Close()
	result := ListResult{Count: count, Units: []Unit{}}
	for rows.Next() {
		var u Unit
		if err := rows.Scan(&u.ID, &u.AuthorID, &u.ContentType, &u.SourceTable, &u.Game, &u.SourceID, &u.Revision, &u.State, &u.ReviewReason, &u.Candidate.Title, &u.Candidate.Body, &u.Candidate.Fields, &u.Candidate.Media, &u.PreviousPublic, &u.PolicyVersion, &u.SubmittedAt); err != nil {
			return ListResult{}, fmt.Errorf("scan moderation unit: %w", err)
		}
		var name string
		if err := s.pool.QueryRow(ctx, `SELECT name FROM core.users WHERE id=$1`, u.AuthorID).Scan(&name); err != nil {
			return ListResult{}, fmt.Errorf("load moderation author: %w", err)
		}
		eligibility, err := s.Eligibility(ctx, u.AuthorID)
		if err != nil {
			return ListResult{}, err
		}
		u.Author = AuthorSummary{ID: u.AuthorID, Name: name, Tier: eligibility.Tier, EmailVerified: eligibility.EmailVerified, AccountAgeHours: int(eligibility.AccountAge / time.Hour), QualifyingApprovals: eligibility.QualifyingApprovals, CleanHistory: eligibility.CleanHistory}
		result.Units = append(result.Units, u)
	}
	if err := rows.Err(); err != nil {
		return ListResult{}, fmt.Errorf("iterate moderation units: %w", err)
	}
	return result, nil
}

func (s *Service) DecideUnit(ctx context.Context, actor auth.Principal, id uuid.UUID, expectedRevision int64, decision, classification, reason, evidence string, credit bool) error {
	if reason == "" {
		return apierr.New(apierr.Validation, "decision reason is required")
	}
	if classification != "quality" && evidence == "" {
		return apierr.New(apierr.Validation, "confirmed violations require evidence")
	}
	if decision != "approve" && decision != "reject" {
		return apierr.New(apierr.Validation, "unsupported content decision")
	}
	if decision == "approve" && classification != "quality" {
		return apierr.New(apierr.Validation, "an approved submission cannot carry a violation classification")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin moderation decision: %w", err)
	}
	defer tx.Rollback(ctx)
	var author uuid.UUID
	var state, sourceTable string
	var sourceID *uuid.UUID
	var fields, media []byte
	var title, body string
	var revision int64
	err = tx.QueryRow(ctx, `SELECT author_id, state, source_table, source_id, revision, title, body, fields, media FROM core.content_units WHERE id=$1 AND revision=$2 FOR UPDATE`, id, expectedRevision).Scan(&author, &state, &sourceTable, &sourceID, &revision, &title, &body, &fields, &media)
	_ = title
	_ = media
	if errors.Is(err, pgx.ErrNoRows) {
		return apierr.New(apierr.Integrity, "the content revision changed")
	}
	if err != nil {
		return fmt.Errorf("lock moderation unit: %w", err)
	}
	if state != "pending" {
		return apierr.New(apierr.Integrity, "the content is no longer pending")
	}
	unitState := "rejected"
	if decision == "approve" {
		unitState = "published"
	}
	sourceStatus := unitState
	if decision == "reject" && revision > 1 && sourceTable != "marker_images" {
		// A rejected replacement leaves the last public snapshot in place.
		sourceStatus = "published"
	}
	if sourceID != nil {
		var query string
		switch sourceTable {
		case "marker_comments":
			query = `UPDATE core.marker_comments SET publication_status=$2, body=CASE WHEN $6::boolean THEN $4 ELSE body END WHERE id=$1`
		case "forum_posts":
			query = `UPDATE core.forum_posts SET publication_status=$2, title=CASE WHEN $6::boolean THEN NULLIF($4,'') ELSE title END, body=CASE WHEN $6::boolean THEN NULLIF($5,'') ELSE body END WHERE id=$1`
		case "forum_comments":
			query = `UPDATE core.forum_comments SET publication_status=$2, body=CASE WHEN $6::boolean THEN $4 ELSE body END WHERE id=$1`
		case "marker_images":
			query = `UPDATE core.marker_images SET status=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1`
		}
		if query != "" {
			args := []any{*sourceID, sourceStatus, revision, body, body, decision == "approve" && revision > 1}
			if sourceTable == "marker_images" {
				args = []any{*sourceID, sourceStatus, actor.ID}
			}
			if _, err = tx.Exec(ctx, query, args...); err != nil {
				return fmt.Errorf("update published source: %w", err)
			}
			if sourceTable == "marker_comments" {
				imageStatus := sourceStatus
				if decision == "reject" {
					imageStatus = "rejected"
				}
				if _, err = tx.Exec(ctx, `UPDATE core.marker_images SET status=$2, reviewed_by=$3, reviewed_at=now() WHERE comment_id=$1 AND status='pending'`, *sourceID, imageStatus, actor.ID); err != nil {
					return fmt.Errorf("update marker attachments: %w", err)
				}
			}
		}
		if sourceTable == "users" && decision == "approve" {
			var profile map[string]any
			if err := json.Unmarshal(fields, &profile); err != nil {
				return fmt.Errorf("decode profile candidate: %w", err)
			}
			if name, _ := profile["name"].(string); name != "" {
				if _, err = tx.Exec(ctx, `UPDATE core.users SET name=$2 WHERE id=$1`, *sourceID, name); err != nil {
					return fmt.Errorf("publish profile candidate: %w", err)
				}
			}
			if avatarKey, ok := profile["avatarKey"].(string); ok {
				var key *string
				if avatarKey != "" {
					key = &avatarKey
				}
				if _, err = tx.Exec(ctx, `UPDATE core.users SET avatar_key=$2 WHERE id=$1`, *sourceID, key); err != nil {
					return fmt.Errorf("publish avatar candidate: %w", err)
				}
			}
		}
		if sourceTable == "forum_posts" && decision == "approve" && revision > 1 {
			var values map[string]json.RawMessage
			if err := json.Unmarshal(fields, &values); err != nil {
				return fmt.Errorf("decode forum candidate: %w", err)
			}
			var gameIDs, tags []string
			_ = json.Unmarshal(values["gameIds"], &gameIDs)
			_ = json.Unmarshal(values["tags"], &tags)
			var topic, videoURL *string
			if raw, ok := values["topic"]; ok && string(raw) != "null" {
				var value string
				if json.Unmarshal(raw, &value) == nil {
					topic = &value
				}
			}
			if raw, ok := values["videoUrl"]; ok && string(raw) != "null" {
				var value string
				if json.Unmarshal(raw, &value) == nil {
					videoURL = &value
				}
			}
			if _, err = tx.Exec(ctx, `UPDATE core.forum_posts SET topic=$2, game_ids=$3, tags=$4, video_url=$5 WHERE id=$1`, *sourceID, topic, gameIDs, tags, videoURL); err != nil {
				return fmt.Errorf("publish forum candidate fields: %w", err)
			}
		}
		if sourceTable == "forum_posts" {
			imageStatus := sourceStatus
			if decision == "reject" && revision > 1 {
				imageStatus = "rejected"
			}
			if _, err = tx.Exec(ctx, `UPDATE core.forum_post_images SET publication_status=$2 WHERE post_id=$1 AND publication_status='pending'`, *sourceID, imageStatus); err != nil {
				return fmt.Errorf("update forum attachments: %w", err)
			}
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE core.content_units SET state=$2, published_at=CASE WHEN $2='published' THEN now() ELSE published_at END, updated_at=now() WHERE id=$1`, id, unitState); err != nil {
		return fmt.Errorf("update moderation unit: %w", err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO core.moderation_decisions (id,unit_id,expected_revision,actor_id,decision,classification,qualification_credit,reason,evidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, uuid.New(), id, expectedRevision, actor.ID, decision, classification, credit, reason, evidence); err != nil {
		return fmt.Errorf("record moderation decision: %w", err)
	}
	if classification != "quality" && decision == "reject" {
		severity := classification
		if _, err = tx.Exec(ctx, `INSERT INTO core.moderation_violations (id,user_id,unit_id,severity,evidence) VALUES ($1,$2,$3,$4,$5)`, uuid.New(), author, id, severity, evidence); err != nil {
			return fmt.Errorf("record moderation violation: %w", err)
		}
	}
	if credit && decision == "approve" {
		if actor.ID == author {
			return apierr.New(apierr.Validation, "a reviewer cannot earn credit for their own submission")
		}
		if _, err = tx.Exec(ctx, `INSERT INTO core.moderation_credits (id,unit_id,reviewer_id,author_id,reason) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (unit_id) DO NOTHING`, uuid.New(), id, actor.ID, author, reason); err != nil {
			return fmt.Errorf("record moderation credit: %w", err)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO core.moderation_trust (user_id, qualifying_approvals, tier) VALUES ($1, 1, 'new') ON CONFLICT (user_id) DO UPDATE SET qualifying_approvals = core.moderation_trust.qualifying_approvals + 1, updated_at=now()`, author); err != nil {
			return fmt.Errorf("record qualification progress: %w", err)
		}
	}
	if classification != "quality" && decision == "reject" {
		if _, err = tx.Exec(ctx, `INSERT INTO core.moderation_trust (user_id, tier, restricted_until) VALUES ($1, 'restricted', now() + interval '30 days') ON CONFLICT (user_id) DO UPDATE SET tier='restricted', restricted_until=now() + interval '30 days', updated_at=now()`, author); err != nil {
			return fmt.Errorf("restrict author: %w", err)
		}
	}
	if decision == "approve" && credit {
		if _, err = tx.Exec(ctx, `UPDATE core.moderation_trust t SET tier='trusted', updated_at=now() FROM core.users u WHERE t.user_id=$1 AND u.id=t.user_id AND u.is_active AND u.is_verified AND u.created_at <= now() - interval '72 hours' AND t.qualifying_approvals >= 3 AND NOT EXISTS (SELECT 1 FROM core.moderation_violations v WHERE v.user_id=t.user_id AND v.overturned_at IS NULL AND v.created_at >= now() - interval '30 days')`, author); err != nil {
			return fmt.Errorf("promote trusted author: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit moderation decision: %w", err)
	}
	return nil
}
