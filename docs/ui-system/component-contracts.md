# Shared Component Contracts

Semantics only. [States](state-matrix.md) owns transitions;
[visual foundations](visual-direction.md) owns appearance;
[state memory](../ARKIVE_STATE_MEMORY_SPEC.yaml) owns retention.

## Ownership boundaries

UI primitives belong to `frontend/packages/ui`; navigation/workspace frames to
`frontend/packages/map-shell`; labels, data, routes and record layouts to apps.
Extend shared variants rather than copying them. A primitive must not infer a
page's search scope, persistence or auth policy.

## Priority contracts

| Component | Contract |
| --- | --- |
| Action | Native button/link, independent targets, accessible icon names, stable geometry. Busy blocks duplicate writes; disabled differs from pending. |
| Input/search | Caller owns value, scope, submit timing and pagination reset. IME-safe; one composite focus ring; reachable clear/submit actions follow disabled state. |
| Field | Stable label/control/error ids and `aria-describedby`/`aria-invalid`; distinguish field validation from request failure. Retain read-only associations. |
| Select/combobox | Keyboard navigation, explicit selection/expansion, dismissal and focus return; readable long labels; declared loading/empty/error policy. |
| Dialog/sheet/popover | Correct layer, labelled surface, focus containment/return, escape/outside/close policy and safe areas. Declare nested overlay behavior. |
| Async list | Stable identities, deduplication, order and independent commands; distinct loading/empty/error/unavailable states; declare stale/partial policy. No invented records. |
| Directory | Distinct selected/expanded/collapsed states. Collapse and child loading retain branch/query/filters; unavailable branches explain status and allow retry where supported. |

Before adding a shared variant, identify its slots, independent targets,
auth/events, states/recovery, long-content/mobile behavior, keyboard/focus and
retention owner. Test reachable transitions; N/A means unreachable, not omitted.
Ordinary fields retain foundation defaults; catalog composites use the pill role.

## Page-specific contracts

Read only the relevant owner: [catalogs](catalogs.md),
[encyclopedia](encyclopedia.md), [map workspace](map-workspace.md),
[marker details](map-markers.md), [About](map-about.md),
[tool saving](tool-saving.md) or [account](account.md).
Implementation and acceptance status live only in [Adoption](adoption.md).
