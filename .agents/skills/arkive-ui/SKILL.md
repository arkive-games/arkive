---
name: arkive-ui
description: Implement or review Arkive game-guide interfaces using the project's confirmed UI rules, existing shared components and scoped acceptance checks. Use for Arkive page, navigation, encyclopedia, map, catalog, tool and account UI work; not unrelated backend or extraction work.
---

# Arkive UI

Use inside an Arkive repository checkout. Keep specifications in their existing
owners; this skill routes work rather than maintaining a second design system.

## Choose the task scope

Resolve the repository root with `git rev-parse --show-toplevel` and follow its
applicable instructions. Distinguish discussion/review, visual preview and code
changes from the request; a design question does not authorize implementation.
If the checkout lacks the linked specifications, identify that missing context
instead of inventing Arkive rules.

Read the required [site specification](../../../docs/ARKIVE_SITE_SPEC.yaml),
then use the matching row in the [task index](../../../docs/ARKIVE_PRODUCT_IA_DRAFT.md).
Read only that topic and the specialist sections needed for the change:
foundations for geometry/type, colors for themes/contrast, memory for retention.
Do not preload every topic, historical audit or screenshot. Use
[Adoption](../../../docs/ui-system/adoption.md) when current scope, provisional
values or deferrals matter; the user's current instructions can reopen that work.

## Work with the existing product

Inspect the owning page and relevant shared implementation before editing.
For code or component reviews, consult only the relevant row in the
[implementation map](references/implementation-map.md). Reuse components and
semantic tokens; do not recreate navigation, search, directory toggles or footers
from a screenshot. Verify current live visuals/data when they are the reference;
explicit product decisions govern intended differences from production.

Preserve game artwork, record schemas and existing composition outside the
requested change. Adjustable measurements are not universal fixed layouts.
Do not invent mobile encyclopedia layouts or a missing game's homepage.
For new content, apply the registration rules: navigation and an existing game
homepage stay consistent; tools also enter the Tool Library. Homepage promotion
is a separate editorial choice. Preserve independent commands and the declared
search/memory scope rather than inferring them from appearance.

## Verify and hand off

For implementation, use the [acceptance procedure](../../../docs/ui-system/visual-regression.md)
to select checks proportional to the changed surface. Reuse fixed-port servers
and the real-component gallery; do not substitute the old static HTML for the
actual component. Compare relevant states/themes and return/failure behavior.
Do not automatically accept a changed visual baseline. Report actual test/data
coverage and separate real login, fault injection and fixture evidence.

Keep rule changes in the existing owner and status in Adoption. Preserve
provisional/deferred boundaries; avoid another parallel specification. Describe
the concrete result and material limits in the user's language. Local work does
not imply authorization to push, open/land a PR or deploy; follow the repository's
delivery instructions when that delivery is requested.
