# Lost Ark combat power calculator — design

**Date:** 2026-08-02
**Status:** approved, ready for implementation planning
**App:** `frontend/apps/lostark` (new)

## Goal

Ship the first page of a new `lostark` site: a combat power (战斗力) calculator covering both
the damage-dealer (输出战斗力) and support (辅助战斗力) roles, on one page with a tab switch.
It needs **no game data** — no `data-lostark/` or `resource-lostark/` artifact repos, no
pipeline stage in `tools/`. The whole feature is a form, a pure calculation, and a breakdown.

This is deliberately the first thing built for lostark: it is self-contained, so it validates
the app scaffold and theme without waiting on the data export.

## Reference and provenance

Modelled on <https://lostark-cn.pages.dev/html/dps> (and its `support.html` sibling), whose
`js/calculator.js` ships unminified with every coefficient table inline.

What we take and what we don't:

- **Taken:** the numeric coefficient tables and the formula structure. These are *facts about
  the game* — gear base stats per item level, engraving percentages, core values. Facts aren't
  authored expression.
- **Not taken:** their code. `calculator.js` reads inputs straight off the DOM inside
  `calcDps()` and writes results back into elements, which is why it cannot be unit-tested.
  We re-implement the math as typed, pure modules of our own.
- **Credit:** the reference is credited by name and link in the app footer.

Reference sources are pulled to a gitignored `_lostark_ref/` scratch dir for extraction and
are never vendored into the repo.

## Decisions

| Decision | Choice |
| --- | --- |
| Roles | Both 输出 and 辅助, in the first release |
| Page structure | One page, tab switch between roles |
| Locales | **zh-CN only.** Term tables are keyed lookups so locales are a later data change |
| Save features | Autosave + JSON export/import. **No** named build profiles |
| Math location | Pure `src/calc/` module inside the app (not a workspace package) |
| Layout | Sticky score rail (score + composition pinned beside the form) |
| Verification | Playwright-harvested golden vectors, committed as a fixture |
| Dev port | `15177` (next free after vrising's `15176`) |

### Why zh-CN only

The ~120 game terms (engravings, cores, affix lines, gear tiers) exist in the reference only in
Chinese. Project convention forbids inventing translations, and no Lost Ark export was found on
this machine to source official en-US/zh-TW names from. Rather than ship invented English or
block the release on term extraction, the calculator ships single-locale with every term behind
a keyed lookup — adding locales later is a data change, not a refactor.

This is a deliberate, documented divergence from the other four sites' tri-locale setup.

### Why not a workspace package

`packages/` exists for cross-app sharing (`ui`, `map-engine`, `map-shell`, `data-contract`).
This engine has exactly one consumer. It stays in-app but stays *pure*, which is what actually
buys the testability. Promote it to `packages/lostark-calc` if a Toy build or the backend ever
needs the math.

## The formula

Both roles share one chain, then diverge into role-specific score components.

### Shared chain

```
mainStat    = (gearMain + accessoryMain + rosterMain + braceletMain + 477)
              × (1 + petMain% + costumeAmp)

weaponAttack = floor( (weaponBase + accessoryWeaponFlat + braceletFlat + arkCoreFlat)
               × (1 + karmaEnlightenmentLevel × 0.001 + accessoryWeaponPct + arkCorePct) )

baseAttack   = round( sqrt(weaponAttack × mainStat / 6), 2 )
basicAttack  = baseAttack × (1 + gemBasic + stoneBasic)
```

`gemBasic = Σ gem.basic × count`, `stoneBasic` comes from engraving ability-stone levels.

### DPS — one score component

```
basePower = basicAttack × 0.000288
totalAmp  = Π (1 + ampᵢ)          over 39 rows
score     = round(basePower × totalAmp, 2)
```

### Support — two score components, summed

```
vitality      = gearVit + accessoryVit + rosterVit + braceletVit + 27722
maxHp         = (vitality × classFactor + karmaEvolutionLevel × 400
                 + accessoryMaxHpFlat + braceletMaxHpFlat)
                × (1 + lifeActivityAmp) × (1 + petHp% + 0.17)

supportScore  = (basicAttack × 0.000124) × Π(1 + supportAmpᵢ)     29 rows
healScore     = (maxHp       × 0.0012  ) × Π(1 + healAmpᵢ)         9 rows

total         = round(supportScore, 2) + round(healScore, 2)
```

`classFactor` = `2.1` for Paladin (男/女圣骑士), `2.0` otherwise (墨灵/吟游诗人).
`lifeActivityAmp` is derived from the equipped gear tiers, via its own table.

**Each half is rounded before summing.** Rounding the total instead produces a different
answer. This must be replicated exactly.

### Amp rows

Every amp is multiplicative as `(1 + v)`; the engine returns each row **named and itemised**,
because the composition panel needs that breakdown and because a wrong total must be
traceable to the row that caused it.

**DPS (39 rows):** 战斗等级 (fixed `0.2945`), 武器品质, 进化(2-4阶), 顿悟, 飞跃, 进化业力,
飞跃业力, 刻印效果, 宝石, 战斗特性, 卡牌, 牧场, 神选英雄武器, 15 accessory lines
(项链×3, 耳环1×3, 耳环2×3, 戒指1×3, 戒指2×3), 手镯, 乐园宝珠, 6 Ark cores,
攻击力, 额外伤害, 首领伤害.

**Support (29 rows):** 战斗等级 (fixed `0.0476`), 进化(2-4阶), 顿悟, 飞跃, 进化业力, 刻印效果,
战斗特性, 宝石, 卡牌, 神选英雄武器, 项链×3, 戒指1×3, 戒指2×3, 手镯, 6 Ark cores,
烙印力, 我军攻击强化, 我军伤害强化.

**Heal (9 rows):** 刻印, 耳环1×3, 耳环2×3, 手镯, 乐园宝珠.

Non-obvious routing to preserve:

- **Accessory lines split across components on support** — necklace and ring lines feed the
  support score; **earring lines feed the heal score**. Engravings, bracelet and orb contribute
  to *both*, via separate per-component values.
- Support has **no** 武器品质, 飞跃业力, or 牧场 amp row. Pet HP feeds `maxHp` instead.
- Support's **Chaos Star core is hardwired to contribute 0** (index 5).
- Coefficients differ per role: evolution `0.0075` vs `0.016`; enlightenment `0.007` vs
  `0.0072`; combat stats `×0.0003` over crit+spec+swift vs `×0.0004` over spec+swift only.
- Ark-stone axes differ entirely: attack/boss/extra vs brand/ally-attack/ally-damage.

## Architecture

```
frontend/apps/lostark/
  src/
    calc/                     pure TypeScript — no React, DOM, storage or i18n
      types.ts                Loadout, AmpRow, ScoreComponent, Result
      engine.ts               shared chain; consumes a role spec
      roles/dps.ts            1 component, 39 amp rows
      roles/support.ts        2 components, own tables, class factor
      tables/                 gear, weapon, engravings, arkCores, gems,
                              orbs, accessoryLines, braceletLines
      __tests__/              vitest, incl. the golden-vector fixture
    features/calculator/      React: form sections, score rail, composition
    features/changelog/       per existing app convention
    lib/                      storage adapter, export/import, i18n wiring
```

`engine.ts` is a function from a plain `Loadout` to a plain `Result`. It imports nothing from
React, the DOM, `localStorage`, or i18n. That constraint is the whole reason the math is
cheaply verifiable, so it is enforced by a `check:calc` grep script in the workspace root
`package.json`, mirroring the existing `check:engine` / `check:shell` guards. It fails the build
if `src/calc/` (tests excluded) matches any of: `react`, `i18next`, `localStorage`,
`import.meta.env`, `document.`, `window.`, or `fetch(`.

### State

Three slices: `dps`, `support`, and `accountShared`.

Roster bonus (远征队加成) and pet ranch perks (宠物牧场特技) are account-wide, not
per-character. The reference syncs them across its two pages via `ACCOUNT_SHARED_KEYS`; on a
single tabbed page the sharing is natural — enter roster crit once and both tabs see it.

## Layout

**Sticky score rail.** Desktop is three columns: section nav (配装 / 成长 / 账号 / 构成),
the form, and a pinned right rail holding the live score plus the composition breakdown. The
score never leaves the viewport, so it visibly moves as you type.

Phone: the rail's score becomes a slim sticky bar at the top; composition drops to its own
accordion at the end. Sections become accordions with 装备 / 首饰 / 刻印 open by default.

**The gear table on phones** collapses from a 5-column table to one row per slot — 部位 label
plus four compact inline fields. A real table needs horizontal scrolling at 390px.

Typography follows project convention: Tailwind scale steps only, floor `text-xs` for
in-content text, no hard-coded pixel sizes.

## Validation and error handling

Guards that the reference implements and we must too, because each one is a way a calculator
silently produces a wrong number:

- **Gem cap** — 11 total across levels 6–10, enforced by clamping the *last-changed* field so
  the form never deadlocks.
- **NaN floor** — every numeric read yields `0` on unparseable input, so a half-typed `-` can't
  propagate `NaN` through the amp product.
- **Evolution floor** — `max(0, (points − 40) × rate)`. Without it, low-investment builds are
  *penalised* instead of unaffected.
- **Range clamps** — refinement 0–25, quality 0–100, advanced honing 0–40.

JSON import **validates before applying** and reports what it rejected. Silently merging a
stale or hand-edited file is how you get a score you cannot explain.

## Testing

Three layers.

**Unit (vitest, on `src/calc/`).** Every table lookup, every clamp, the shared chain, and
specifically support's round-then-sum.

**Golden vectors.** A one-off harvest script drives the live reference in Playwright, sets ~30
loadouts — empty, fully maxed, randomised mid-range, and one isolating each subsystem — reads
its rendered score, and commits the input/output pairs as a JSON fixture. Vitest asserts our
engine reproduces each within the reference's own stated `±0.01%` tolerance.

This exists because roughly 400 coefficients are being transcribed, and a single wrong cell is
invisible to review but fatal to trust. Once committed the fixture runs offline; the harvest
script is re-run only when the reference updates its numbers for a new game patch.

**E2E (Playwright).** Tab switch preserves both roles' state, autosave survives reload,
export→import round-trips, account-shared values propagate across tabs.

Note for implementation: aion2's e2e defaults to port 5173 and will collide with a running dev
server — use an explicit `E2E_PORT`.

## Out of scope

- Named build profiles with history and delta-vs-reference comparison (the reference's
  `calculator-workspace.js`). A clear follow-up feature with its own changelog entry.
- en-US / zh-TW locales, pending a source for official term names.
- Any use of the Lost Ark data export; no `data-lostark/` or `resource-lostark/` repo, no
  `tools/apps/lostark` pipeline.
- The reference's honing-prediction page (`honing.html`).
- Bilibili Toy packaging.

## Follow-ups

- Bump `frontend/apps/lostark/src/changelog.json` **after** the feature commit — the entry pins
  the SHA of the commit it describes, so it cannot be in that commit. `MINOR` for a new page.
  Write all three locales even though the UI ships zh-CN.
- Register `dev:lostark` / `build:lostark` / `lint:lostark` / `preview:lostark` / `e2e:lostark`
  in the workspace root `package.json`, and add `check:calc`.
- Add the app to the `meta` landing site once it has something to link to.
- Work on a git worktree branched from local `master` (not `origin/master`, which would silently
  drop unpushed work), and integrate with rebase. Re-run `pnpm changelog:verify` after the
  rebase, since rebasing orphans stamped SHAs.
