# Shared State Matrix

Transitions only; [contracts](component-contracts.md) owns semantics and the
page topics own content/layout. This matrix is a rule, not passing-test evidence.

## Common states

| State | Required response |
| --- | --- |
| Default/filled; hover/pressed/selected | Retain independent actions and silhouette; meaningful feedback must not rely on color alone. |
| Focus-visible | Visible focus, accessible names and logical keyboard order. |
| Disabled / pending | Disabled blocks unavailable actions; pending prevents duplicate writes while retaining values and control geometry. |
| Loading / empty | Reserve expected result space; explain actual no-match/unavailable states without invented content. |
| Request / validation failure | Retain authored input/query/filters; explain failure and offer applicable recovery. Never report a failed write as saved. |

Local filtering has no artificial network error; its data host may fail.
Surfaces declare stale/partial-result policy. Natural error wrapping may change
height, but must not erase controls or browsing context.

## Task transitions

| Task | Transition and retention |
| --- | --- |
| Favorite | Anonymous opens existing login; pending retains appearance. Only confirmed success changes state/order; failure retains item/state with retry. Game/tool records are separate; announce confirmed changes. [Catalogs](catalogs.md) owns filter-before-order. |
| Pending game | Distinct from a pending request: preserve card geometry and omit unusable links. |
| Catalog / directory | Explicit loading/no-match/error. Loading/collapse retains branch/query/filters; applicable retry retains selection. |
| Map selector | Retain identifiable current choice while loading/failing. Explain no options; wrap long labels. Restore destination-map state. |
| Map search/detail | Reveal hidden active-map targets; explicit result/link wins conflicting view/selection without switching maps. Preserve unrelated state/query/filters; explain missing detail. |
| About | Initially collapsed; contextual loading/empty/error and retry retain open section, without resetting map operations. |
| Explicit-save tool exit | Save must succeed before leaving. Failure/cancel keeps work; discard starts the next ordinary visit fresh while preserving saved records; Continue Editing stays. Native unload is best effort. [Saving](tool-saving.md) excludes ordinary automatic-memory calculators. |
| Account save | Validation/request/storage failure retains fields and section; login follows existing rules. |
| Coordinate copy | Copy the displayed native tuple; unknown height omitted. No success/failure toast, message or substituted icon. Accessible action remains. |

Hover/focus/animation/open overlays are transient. Encyclopedia return restores
data/reveal depth before position. Scope, lifetime, clearing and migration belong
to [state memory](../ARKIVE_STATE_MEMORY_SPEC.yaml); current evidence and deferred
mobile scope belong to [Adoption](adoption.md).
