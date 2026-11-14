# Shared State Matrix

Read only for state behavior. Page topics own content and layout;
[Contracts](component-contracts.md) owns component semantics. This is a rule
matrix, not evidence of passing tests.

## Common states

| State | Rule |
| --- | --- |
| Default/filled | Show current value and independent actions |
| Hover/pressed/selected | Clear applicable feedback; do not change silhouette or rely on color alone |
| Focus-visible | Visible focus, meaningful accessible name, logical keyboard order |
| Disabled | Unavailable action, readable retained value; distinguish from pending |
| Pending/loading | Prevent duplicate writes; retain values/control dimensions; reserve expected result slots |
| Empty/no match | Explain applicable empty state, no invented content |
| Request/validation failure | Preserve authored inputs/query/filters; explain failure and provide applicable retry |

Use native semantics, shared targets/safe areas and stable media/copy slots.
Local filtering has no artificial request failure; its data host may fail.
A stale/partial-result policy must be declared by the surface. Loading/error
content may wrap naturally; it must not erase controls or browsing context.

## Task transitions

| Task | Transition and recovery | Retention / owner |
| --- | --- | --- |
| Favorite | Anonymous opens existing login. Pending blocks repeats and keeps prior appearance; only success changes state. Failure keeps item/state and offers retry, without false success or movement | Separate game/tool records; announce confirmed change. [Catalogs](catalogs.md) owns filter-before-order |
| Pending game | Pending Launch card retains geometry with no unusable game link; differs from a pending favorite request | [Catalogs](catalogs.md) |
| Catalog load/query | Reserve records while loading; no-match is explicit; retained query/type filters on failure | Targets, counts and ordering: Catalogs |
| Directory | Toggle preserves branch/query/filter; child load does not collapse it. Empty/unavailable branch explains status; retry retains selection | [Encyclopedia](encyclopedia.md); map collapse is separate |
| Map selector | Current choice remains visible/identifiable while options load; failure retains it and permits retry; no options is explicit | Destination map restores its own state; long labels readable. [Map workspace](map-workspace.md) |
| Map search/detail | Result reveals hidden active-map target and opens detail; failure retains query/filters. Explicit link/result wins conflicting view/selection, without map switching from search | Other map preferences/progress intact; no detail record is explainable. Map workspace and [Markers](map-markers.md) |
| About | Starts collapsed; loading/empty/error stays contextual, retry retains open section | Independent map operations untouched. [About](map-about.md) |
| Dirty tool exit | Save pending blocks departure; failure/cancel keeps work. Discard starts next ordinary visit fresh; Continue Editing stays | Existing saved records survive; native unload best effort. [Saving](tool-saving.md) |
| Account save | Failure/validation keeps fields and selected section; login follows existing rules | [Account](account.md) |
| Coordinate copy | Copy displayed native tuple; no toast, message or status-icon substitution on success/failure; unknown height omitted | Accessible copy action retained. Markers |

Transient hover, focus, pressed animation and open overlays are not durable
state. Encyclopedia return restores data/reveal depth before position. Storage
classes and lifetimes remain with [State memory](../ARKIVE_STATE_MEMORY_SPEC.yaml).
Use [Adoption](adoption.md) for deferred mobile scope and remaining validation;
add only new task-specific transitions rather than duplicating common states.
