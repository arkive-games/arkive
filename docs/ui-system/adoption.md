# Current Adoption and Acceptance

Updated 2026-11-15. Single status owner; rules are routed by the
[task index](../ARKIVE_UI_INDEX.md). All implementation is local,
not deployed. [Evidence](evidence.md) records exact coverage/limits;
[history](reconciliation.md) retains the earlier batch summary/Git lookup.

## Six-stage status

| Stage | Status |
| --- | --- |
| 1. Product hierarchy | Confirmed |
| 2. Page structures | Confirmed and locally adopted for the agreed scope; game records remain contextual |
| 3. Components/states | Contracts and shared primitives established |
| 4. Code reconciliation | Agreed local changes implemented, including this closeout's fixes |
| 5. Acceptance | Tooling and scoped checks complete; coverage/limits below, not universal art approval |
| 6. Team Skill | Repository-owned `arkive-ui` created; structure, references and task-scope walkthroughs validated |

## Acceptance closeout

| ID | Result |
| --- | --- |
| AUTH-01 | Real single-account login/logout/reauth, independent game/tool favorites, ordering and reload passed. Two-account persistence isolation is automatically tested; no second real-account or production-cookie SSO claim. |
| FAIL-01 | Real-client profile/data failure injection and denied-storage cold start/write/retry passed. Profile storage failure now reports failure instead of false success and preserves the draft. |
| VIS-01 | Both-theme shared contrast and 1440/900/390 long-label checks passed. Selected light text corrected from 4.25:1 to 4.57:1; original game art and mobile composition retained. |
| IA-01 | Six live game entries and 45 feature destinations checked; RO3 handbook registered as the seventh tool and canonical links corrected. Homepage selections stay independent. |

These scoped acceptance items are closed. A deliberate injected failure proves
recovery of that client, not a production outage. HTTP checks do not certify
every record; automatic identity partitions do not replace two real logins.
Existing component/portal/map automation remains in the
[acceptance procedure](visual-regression.md). Ordinary footer center links and
six encyclopedia shells are locally complete, not new pending reconstruction.
Validation: 176 test files / 1928 tests, seven app builds, Meta lint, 140 memory
keys and the scoped browser/route checks. Documentation links are checked separately.

## Provisional and deferred scope

Adjustable directory/picker dimensions, record/detail layouts and future editorial
or membership choices remain contextual, not missing closeout work. No fixed
card count, universal grouping or mobile encyclopedia layout is invented.
About/credits generation/editor, forum redesign, mobile redesign, GMZZ BUILD
exit/account integration and unreleased games remain deferred by the user.
Their exclusion does not block packaging the current confirmed rules.

## Content moderation policy

Confirmed on 2026-11-23: [the unified content-moderation
specification](../ARKIVE_CONTENT_MODERATION_SPEC.yaml) owns the selected
new-user review and trusted-user publication model for maps, forum content,
public tool snapshots and public profiles. Its thresholds, complete-submission
decisions and appeals are product rules. Backend policy enforcement,
private-media access, migration and production adoption remain pending.

The local portal workspace now presents complete-submission review, credit
eligibility, correction/violation decisions, separate report and appeal cases,
resolved-case reasons, administrator trust actions and publication rules through
the shared encyclopedia frame. The account entrance uses Content moderation and
a shield-check icon. Old image deep links open read-only historical records.

The production route intentionally has no unified gateway. It shows availability
feedback instead of claiming an empty unified queue, and never maps the existing
per-image writes onto a whole-submission approval. This candidate changes the
old image-review entrance to read-only: release it only with the coordinated
backend policy rollout, not as a standalone moderation replacement. The typed
UI boundary is `frontend/apps/meta/src/moderation/model.ts`; a real adapter must
use backend-owned generated operations after the server contract exists.
Its list operations need scoped server filtering before paging, revision checks,
author eligibility, authorized media, complete candidates and decision records.

`http://localhost:15172/ui-review.html?moderation` is a development-only preview
using the real workspace components and in-memory sample records. Its decisions
never reach a server and do not prove production authorization, credit changes,
publication or appeal restoration. The existing image-only API is not policy
conformance. Record backend and coordinated rollout evidence here before enabling
the unified gateway or claiming the publication model is live.

Local verification on 2026-11-23: 191 frontend test files / 2032 tests,
Meta build and lint, canonical-policy threshold/locale checks, and real-component
browser checks at 1440 x 1000, 1024 x 900 and 390 x 844. Light/dark captures
cover complete media, rejection evidence, appeal and trust details without
document overflow. Focused regressions cover failed previews, appeal restoration,
stale revisions, permission revocation and shrinking legacy pages. These use
sample identities and data, not authenticated production moderation.

## Delivery boundary

The user subsequently authorized formal PR submission of `codex/ui-stage4`.
Merge, checks and deployment status must be read from GitHub; the evidence here
describes local acceptance, not an automatic production certification. The
configured Claude review workflow is currently disabled, despite older repository
instructions describing its comment trigger. Do not report a posted review
request as a completed review. The
[Skill](../../.agents/skills/arkive-ui/SKILL.md) routes to existing rules rather
than copying them; its component map is read only when relevant. It needs an
Arkive checkout, not a fixed personal path. Team members need this repository
version and a workspace rooted in that checkout; discovery on their computers
has not been observed. Structure/link checks and manual walkthroughs cover new
encyclopedia content, shared search, tool registration and review-only work;
they are not an independent model trial. No app code changed in this batch.
