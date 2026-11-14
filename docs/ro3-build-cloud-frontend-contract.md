# RO3 build manual: frontend integration contract

Status: frontend preparation only. Backend implementation and integration belong to tc-imba. No backend routes or database changes are included in this change.

## Integration point

`frontend/apps/ro3/src/lib/buildGateway.ts` defines the transport-independent `BuildGateway`. `BuildManual` accepts a gateway prop; the production default is `pendingBuildGateway`, which is explicitly unavailable and rejects every operation. Replace that default through an API adapter after agreeing and implementing the server contract. Do not enable a mock, localStorage fallback, or success-only placeholder in production.

Reuse the account session from `@gamemap/auth` and the shared API transport, following the GMZZ character adapter. The frontend does not currently make speculative requests to proposed RO3 endpoints.

## Shapes and operations

- `BuildPayload`: schemaVersion 2 and the editor's title, summary, jobId, branchId, rulesVariant, attributes, skills, equipment, cardSlots, combat, assist, talents, souls. No original/recovery blobs or owner fields.
- `CloudBuild`: opaque id, integer revision, nullable publishedRevision, server-derived editable and favorited booleans, data payload.
- `list({collection, search, root, branch, page, pageSize})`: collection is public/mine/favorites; return `{items,total}`. Filtering precedes pagination. Page is one-based, pageSize currently 20. List items currently carry the full payload; an adapter can hydrate summaries before returning.
- `getPublic(id)`: public snapshot only, even for its owner. Return editable=false for this representation unless the adapter explicitly fetches the private owner draft before enabling editing. Public view must not accidentally overwrite a newer private draft.
- `save({id?,revision?,requestId,data})`: create or revision-checked update, private by default. Return the authoritative saved record. requestId identifies a create attempt and must deduplicate retries within the account; ignore it for updates. A lost response must not create duplicates.
- `publish(id,revision)`: publish precisely the indicated saved revision, atomically. A stale revision is a conflict, not permission to publish a newer private draft. Snapshot title/summary/filter metadata along with payload.
- `unpublish(id,revision)`: owner-only, revision-checked, return authoritative private record.
- `remove(id,revision)`: owner-only, revision-checked; remove public visibility and bookmarks.
- `favorite(id,enabled)`: idempotent account bookmark of a published build.
- Map errors to `BuildFailure`: unavailable, unauthorized, conflict, notFound, failed.

No HTTP paths are prescribed here: the adapter is the boundary for the backend owner to choose and document them.

## Privacy and state

Save never updates the published snapshot. Publish is a separate confirmed operation. Another reader receives only the snapshot. Private or unpublished records must be inaccessible to nonowners. Public lists and favorites must stop returning withdrawn/deleted records. Server must enforce ownership, schema/size limits, pagination limits, write limits, and revisions independently of client flags.

Account change clears private frontend state; anonymous login can retain an unsaved in-memory draft. Save acknowledgements do not overwrite edits made while the request was pending. The client retains the submitted revision on a publish failure, allowing retry without falsely reporting publication.

There is no persistent browser draft. Legacy `ro3-build-planner` and `ro3-build-planner:before-v2`, plus the state-memory build favorites record, are explicitly removed with the owner's authorization. No import path is provided. Existing migration helpers remain unused compatibility code pending independent cleanup; they are not called by the live UI.

## Links and frontend behavior

Share URL: `/builds?build=<opaque-id>`, encoded using URLSearchParams. Existing `/builds*` hosting rule covers it. Opening the link invokes getPublic. No new static sitemap entries are needed for individual user builds.

Save and publish remain visible before integration but return an explicit service-unavailable message. With auth enabled, signed-out actions open AccountDialog; login does not silently publish anything. After login the user clicks the intended action again. Empty/error/loading states are separate; an unavailable service is not an empty public directory.

## Backend handoff acceptance

Verify with a real test server: login, private save, reload on another device, published anonymous read, private save not changing published content, revision conflict, update publication, bookmark isolation, unpublish, deletion, 401/403/404, retries, and account switching while requests are pending. Frontend fake-gateway tests only validate UI/state behavior and are not evidence that cloud persistence works.
