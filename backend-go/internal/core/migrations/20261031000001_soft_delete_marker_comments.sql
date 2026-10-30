-- +goose Up
-- An author's delete becomes a soft delete.
--
-- A hard DELETE cascaded into core.forum_reports, so an author could make a pending
-- report vanish by deleting the comment it was about, and the moderation queue lost
-- the record of what had been said. The row now stays, withdrawn from every public
-- read exactly as a hidden one is, and its reports stay answerable.
--
-- Distinct from hidden_at on purpose: hiding is a moderator's reversible action and
-- a moderator can restore it; deleting is the author's and nobody restores it.
-- +goose StatementBegin
ALTER TABLE core.marker_comments ADD COLUMN deleted_at timestamptz;
-- +goose StatementEnd

-- +goose Down
-- The soft-deleted rows are removed rather than resurrected: dropping the column
-- alone would publish every comment its author had deleted.
-- +goose StatementBegin
DELETE FROM core.marker_comments WHERE deleted_at IS NOT NULL;
ALTER TABLE core.marker_comments DROP COLUMN deleted_at;
-- +goose StatementEnd
