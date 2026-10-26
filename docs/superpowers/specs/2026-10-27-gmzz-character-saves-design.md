# GMZZ character saves — design

Date: 2026-10-27
Status: approved in discussion, pending spec review
Branch: `feat/gmzz-relic-slots` (built on top of the relic-slot calculator work)

## Goal

Let a signed-in player keep up to ten Lord of Mysteries characters on the server, each holding
the score page's inputs, and let anyone open a character by link. The owner edits through the
same link; everyone else sees it read-only.

The stored record is **inputs only, never a score**. Every one of the fourteen rating items is
derived by the page from inputs and the current dataset, so a saved character re-scores itself
whenever the dataset changes.

## Non-goals (designed for, not built)

- A public, browsable or searchable character list, or per-server leaderboards. The schema
  keeps `visibility` open for a `'public'` value and keeps `server` a plain indexable column,
  but no list endpoint ships. Because no score is stored, a leaderboard will need a separate,
  recomputable derived index; it is never the source of truth.
- Rotating a character's link. The link is the character's identity; to revoke, make the
  character private. A new link is "copy, then delete the original".

## 1. Data format

### Envelope (schema version 1)

```json
{
  "schemaVersion": 1,
  "character": { "roleLevel": 70, "divinityLevel": 0, "professionId": 3 },
  "talents":   { "treeId": 12, "levels": { "1201": 5 } },
  "bonds":     { "puppets": [], "dominateSlots": null, "historyExtraPoints": null,
                 "skillPartnerId": null, "puppetSkillLevel": null, "fellows": [],
                 "fellowSkillId": null, "fellowRelationId": null },
  "equipment": { "pieces": [{ "slot": 1, "itemId": 100, "enhanceStage": 3, "refinePercent": 40,
                              "affixes": [{ "family": "Atk", "value": 120 }] }],
                 "batch": { "stage": 0, "badge": 0 }, "suitChoice": null },
  "relics":    { "knowledgeLevel": null, "server": "local",
                 "slots": [{ "groupId": 1, "artifactId": 7, "grade": 3, "grades": { "7": 3 },
                             "materialType": 1,
                             "materials": [[{ "affixId": 501, "value": 490 }]] }] }
}
```

Sections map one-to-one to today's local drafts (`score/character`, `score/talents`,
`score/bonds`, `score/equipment`, `score/relics`). UI state stays local and never enters the
envelope: `score/folded` (collapsed panels) and `score/equipment-layout` (a preference).

### Fields removed when building v1

These exist in today's drafts and are dropped by the local-draft → v1 conversion:

| Field | Why |
|---|---|
| `character.scores` | Hand-typed scores. All fourteen items are derived now; this is a leftover. |
| relic affix `mark`, `stat`, `scaled` | `mark` is a score; all three are looked up from the dataset by `affixId`. |
| relic slot `affixes`, `materialId` | Pre-`materials` legacy shapes, already read-once. |
| `bonds.historyRankId` | Documented as no longer read. |

A legacy relic affix without `affixId` is matched once against the dataset pool by
`stat` + `value` + `mark` (the existing fallback in `RelicSection.tsx`), then stored by id.
An affix that cannot be matched is dropped, as a stale one is today.

### Compatibility rules

1. **Additive change → no version bump.** New fields are optional with a default. Readers
   tolerate absence.
2. **Writers preserve unknown fields.** An edit is merged into the raw stored object rather than
   replacing it, so an older page that saves a newer record cannot erase fields it does not know.
   This applies per section and per array element the page addresses by key (slot, piece).
3. **Breaking change → `schemaVersion` + 1**, with a pure migration `vN → vN+1` added to a
   frontend chain (`migrate(raw): EnvelopeV<latest>`), next to the existing `validate` and
   `sanitize` functions. Migrations are unit-tested against frozen fixtures of every version.
4. **A client older than the record is read-only.** If `schemaVersion` exceeds the latest the
   page knows, the page renders what it can, disables editing and autosave, and asks for a
   reload.
5. **Stale dataset ids degrade, never fail.** Unchanged from today: `sanitize*` turns an item
   that left the dataset into an empty slot without rewriting the stored record.

The backend does not interpret sections. It validates only: the body is a JSON object, at most
64 KB serialized, with an integer `schemaVersion` ≥ 1, which it copies into a column.

## 2. Backend — new `gmzz` module

The first game module behind the `module.Module` seam: its own `gmzz` schema, its own goose
migration stream and sqlc package, its own OpenAPI document, mounted at `/gmzz`, registered in
`cmd/arkive/main.go` next to `core`.

### Table `gmzz.characters`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Internal only, never exposed. |
| `public_id` | `text` UNIQUE NOT NULL | 10-char base62, crypto-random; the only external id. |
| `owner_id` | `uuid` NOT NULL | FK `core.users(id) ON DELETE CASCADE`. |
| `name` | `text` NOT NULL | 1–32 chars after trimming. |
| `server` | `text` NULL | ≤32, free text for now (frontend suggests known servers). |
| `uid` | `text` NULL | ≤32, display only, never a key. |
| `show_uid` | `boolean` NOT NULL DEFAULT false | Whether non-owners see `uid`. |
| `visibility` | `text` NOT NULL DEFAULT `'link'` | CHECK `IN ('private','link')`; `'public'` later. |
| `sort_order` | `integer` NOT NULL | Owner's ordering. |
| `schema_version` | `integer` NOT NULL | Copied from the envelope. |
| `data` | `jsonb` NOT NULL | The envelope. |
| `revision` | `bigint` NOT NULL DEFAULT 1 | Incremented on every write; optimistic lock. |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` via trigger. |

Indexes: `(owner_id, sort_order)`. The foreign key into `core.users` is the module's one
cross-schema reference: account deletion must take the characters with it.

**Limit:** ten characters per owner, enforced in the inserting transaction (lock the owner's
rows, count, insert). Exceeding it is a 409 with a stable error code the page can explain.

### Identity

The module needs the caller. It reuses `core/auth.Resolver` (bearer token or cookie) with a
principal lookup against `core.users`; that read-only identity lookup is the only other place
the module touches the core schema. How the resolver is shared between modules is settled in
the implementation plan.

### API (prefix `/gmzz`)

| Method | Path | Who | Behaviour |
|---|---|---|---|
| GET | `/characters` | owner | Own characters, metadata only, by `sort_order`. |
| POST | `/characters` | signed in | Create from metadata + `data`. 409 at the limit. |
| GET | `/characters/{publicId}` | anyone | Data + metadata + `editable` (caller is owner). Non-owner on a private character → 404, identical to not-found. Non-owner with `show_uid=false` → `uid` omitted. |
| PATCH | `/characters/{publicId}` | owner | Metadata and/or `data`; requires `revision`; mismatch → 409 with the current revision. |
| DELETE | `/characters/{publicId}` | owner | Delete. |
| POST | `/characters/{publicId}/copy` | signed in | Copy into the caller's account (own character, or another's that the caller can see). Counts toward the limit. New `public_id`, name suffixed, `revision` 1. |
| PUT | `/characters/order` | owner | Full ordered list of own `publicId`s. |

Non-owner PATCH/DELETE return 404, not 403, so a private character's existence is not
disclosed. Write endpoints are rate-limited through the existing `ratelimit.Limiter`.

## 3. Frontend

### One character source for the whole page

Today each section reads its own draft (`ScorePage` holds three; `EquipmentSection` and
`RelicSection` own theirs). These become one **character context** supplying `[section, set]`
per section, backed by one of three sources:

- **Local draft** — not signed in, or signed in with no character selected. The existing
  `gmzzMemory` drafts, unchanged keys.
- **Cloud character** — a local working copy under a per-character key
  (`score/character/<publicId>`), plus autosave to the server.
- **Read-only** — another player's character; setters are no-ops and every input is disabled.

### Never lose local data

- Loading a cloud character never writes the unbound local draft; each source has its own keys.
- "Save local draft as a new character" is always offered while signed in and the local draft is
  non-empty — not only on first sign-in. At the limit, the draft simply stays local.
- Unsent changes stay in the per-character working copy across sign-out, offline periods and
  failed uploads, and are sent after the next sign-in.

### Autosave

Upload after 10 s without edits, and at most every 60 s during continuous editing. Flush
immediately on switching character, on `visibilitychange` to hidden, and on `pagehide`
(`fetch` with `keepalive`). Each PATCH carries the last known `revision`. On 409 the page shows
a dialog: keep mine (re-send against the server's revision) or load the server's version. A
save-state indicator shows saved / saving / offline-pending / conflict.

### Routes

- `/score` — not signed in: the local draft, as today. Signed in: redirects to the last edited
  character if one exists, else shows the local draft with the save prompt.
- `/score/c/$publicId` — the owner edits; anyone else reads, with "copy as my character"
  (sign-in prompt when anonymous) and a note that scores are computed from the current dataset.
- `edgeone.json` gains `"/score/c/*"` in the same commit as the route.

### Character bar

Top of the score page: a character switcher plus a manage panel — create, rename, server, uid,
show-uid toggle, sharing toggle (private ↔ link), copy link, copy, delete, reorder.

### Cleanup bundled with this work

- Delete `character.scores`, `setScore`/`onScore`, and the `kind: 'typed'` path in
  `GroupSection`. A rating item whose module the page does not recognise renders as
  "not supported yet" and scores 0, never as an input box.
- Relic affixes stored by `affixId` + `value` only; `mark` and the rest come from the dataset.

## 4. Testing

- **Go**, against a real Postgres as the existing integration tests do: the ten limit
  (including concurrent creates), revision conflict, private → 404 for non-owners and anonymous,
  uid omission, copy of own / of another's visible / of another's private (404), order,
  cascade on account deletion, 64 KB and `schemaVersion` validation.
- **Frontend unit:** local-draft → v1 conversion (including legacy relic shapes), migration chain
  on frozen fixtures, unknown-field preservation, newer-version read-only detection, autosave
  debounce/max-interval/flush timing, conflict handling.
- **e2e smoke:** owner edits and reloads; a second session opens the link read-only; a private
  character 404s.
- Independent review by Codex before handoff.

## 5. Delivery

- Lands on `feat/gmzz-relic-slots`, in this worktree.
- gmzz changelog: one MINOR entry after the feature commit(s).
- Generated API client regenerated from the new OpenAPI document.
