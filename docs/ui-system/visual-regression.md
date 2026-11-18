# Visual Regression Acceptance

Use real components and current page references; screenshots are evidence, not
final art approval. Preserve page/game design outside confirmed shared rules.

## Executable checks

Open [the Chinese component gallery](http://localhost:15172/ui-review.html).
If the Meta dev server is stopped, run `pnpm dev:meta` from `frontend/`.
The gallery is development-only; the old standalone HTML is historical.

| Command, from frontend/ | Purpose |
| --- | --- |
| `pnpm check:ui` | Reject new raw type/radius/layer/color/`100vh`/`*-screen` values in shared chrome, missing `@custom-variant dark` declarations on app `index.css` entries, and app overrides of shared search geometry/token ownership. Also runs in `pnpm test`. |
| `pnpm test --maxWorkers=2` | Regression tests, including canonical YAML/Markdown link checks, scoped contrast, account partitioning and failure recovery. |
| `pnpm ui:verify --update-baseline --routes` | Explicitly record candidate component images only if every check passes; review them before adoption. |
| `pnpm ui:verify` | Compare existing component references and check states, geometry, keyboard focus, reduced motion and narrow overflow. Never updates the reference. |
| `pnpm ui:verify --routes` | Also check/capture portal and AION2/Palworld map references; dynamic remote imagery is not a deterministic pixel baseline. |

Seven deterministic images cover light/dark desktop/narrow components, hover,
focus and dialog. Pixel channel tolerance is 16 with at most 0.1 percent changed
pixels; geometry/state checks are independent. Inspect highlighted differences,
not just exit codes. Same browser/platform/fonts are required; environment and
commit/dirty-state metadata explain capture context. Other computers record a
reviewed compatible baseline or copy compatible reviewed artifacts.

Artifacts stay in ignored `output/playwright/ui-acceptance/`: current images,
baseline/environment and `report.json`. No generated images are committed.
The script closes its own browser; missing servers/data/images fail the check.
Windows uses installed Chrome, other platforms Playwright Chromium. Override
`UI_REVIEW_BROWSER_CHANNEL`/`UI_REVIEW_URL` when needed; install a missing browser
with `pnpm exec playwright install chromium`. Authenticated acceptance additionally
uses the development-only `acceptance.html` and a user-entered real login; never
record credentials or substitute a fixture identity for real-login evidence.

On Windows, stop the entire task-owned process tree before restarting an
interrupted check. Stopping only the test runner can leave its parent shell
running later build commands. Keep one full-suite run and one affected-app build
active at a time; run focused checks first and use bounded worker counts.
If fork workers time out during startup, rerun the unchanged suite with
`pnpm exec vitest run --pool=threads --maxWorkers=2`; do not mark skipped worker
files as passing or reduce the test scope to obtain a green result.

## Required captures

Use 1440 x 1000 desktop and 390 x 844 narrow references. Cover real component
states, both portal themes, catalog search/type/empty/favorite behavior, and
map sidebar/search/switch/progress where changed. Mobile encyclopedia redesign
is deferred; retaining its existing no-overflow behavior does not approve a new
mobile layout. Load actual records/images before capture; a mounted input is
not proof that data or map tiles are ready.

## Acceptance rules

No document overflow, duplicate boundary lines or overlapping controls. Keep
shared geometry, independent hit targets, visible focus and safe areas; short
pages place ordinary footers at the bottom in normal flow. Disabled controls
cannot act; pending blocks duplicate writes. Failures retain input/state and
report truthfully; successful retry remains available where supported.
Verify long labels and normal/selected/error text in both themes. Required text
contrast is 4.5:1 (3:1 for large text); meaningful focus/boundaries require 3:1.
Decorative dividers and original game-art semantics have separate roles.

The style guard covers shared UI/shell and released-game/portal component chrome,
not every game-record renderer. Its six reviewed legacy exceptions retain seven
existing occurrences; new copies or changed values fail. Baseline regeneration
requires review and is never automatic. See [Adoption](adoption.md) for current
coverage and [dated evidence](evidence.md) for authenticated/fault-injection limits.
