# Acceptance Evidence: 2026-11-15

Dated observations only. Rules belong to the [task index](../ARKIVE_PRODUCT_IA_DRAFT.md);
current completion/deferred status belongs to [Adoption](adoption.md).
No local correction below has been deployed by this work.

## Production inventory and local corrections

Production All Games lists AION2, Palworld, Lord of Mysteries, Ragnarok 3,
V Rising and Phantom Blade Zero. Only Lord of Mysteries and Ragnarok 3 have
homepages; other roots open maps. Local development additionally exposes OSS;
that preview is excluded from released-game acceptance. STS2 is also excluded.

The six production Tool Library entries are Palworld Breeding/Stat and GMZZ
Build/Score/League Points/Station Planner. Ragnarok 3's live homepage/navigation
also expose the editable Build Handbook at `/builds`, but the portal registry
classified it as wiki. The local correction makes seven library tools and uses
RO3's canonical category paths. The homepage retains its six editorial tool
selections; adding a library entry does not automatically promote it.

The 45 corrected feature-registry destinations across the six games returned
HTTP 200 and application HTML. This proves reload/deep-link serving, not every
record's content. GMZZ and RO3 homepage entries were compared with navigation;
local shared navigation inventories and existing route tests cover category
registration. The complete registry stays in source, not a duplicate MD table.

## Targeted browser acceptance

| Area | Evidence and boundary |
| --- | --- |
| Authentication/favorites | User signed in to the real API in an isolated local browser, then signed out and back into the same account. Game/tool priority, query/type membership, independent records and reload/reauth recovery passed. Two-account persisted partitions are additionally tested automatically; a second real account and production-cookie SSO were not exercised. |
| Favorite failure | Browser fault injection denied actual progress writes; both game/tool cards retained state/order and exposed working retry. No fictional success or identity. |
| Account failure | Actual profile PATCH was deliberately aborted before reaching the server; edited name remained. Denying local profile persistence reproduced false success; the fix retains the draft, reports failure and permits retry. Original profile fields were restored; no test nickname was submitted successfully. |
| Data/storage failure | Aborting Palworld's actual item JSON load retained the query and displayed failure; removing the fault/reloading recovered real records. A cold-start storage-denied page stayed usable without false favorites or a restoration promise. |
| Visual states | Real shared color pairs and all three warm-arrow gradient stops were measured in both themes. Light selected text was 4.25:1; the corrected blue is 4.57:1. Normal text/error/metadata/primary and focus pairs meet their scoped thresholds. Game-art palettes are not covered. |
| Long content | Tool names/descriptions/game labels were stress-tested at 1440/900/390 pixels in both themes; no document overflow or displaced favorite command. These are explicit stress strings, not production records. |

## Existing regression coverage

Six encyclopedia shells previously passed 47 category-route shell checks and
representative collapse/query/reload/return/no-match flows. The standard browser
checker covers 29 component/portal/map checks and seven deterministic images.
Map labels remain dense at the existing default zoom; mobile encyclopedia
redesign, About/credits and forum remain deferred.

Historical fixture and artifact caveats are summarized in
[Reconciliation](reconciliation.md#local-implementation-evidence-through-2026-11-15).
Do not convert a scoped browser check, injected failure or unit test into a
claim that every production page/state/account has been certified.
