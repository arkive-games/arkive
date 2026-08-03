# Lost Ark combat power calculator — design

**Date:** 2026-08-02
**Status:** REVISED 2026-08-02 — coefficients now sourced from game data, not the fan site
**App:** `frontend/apps/lostark` (new)

## Goal

Ship the first page of a new `lostark` site: a combat power (战斗力) calculator covering both
the damage-dealer (输出战斗力) and support (辅助战斗力) roles, on one page with a tab switch.

## Revision note — where the numbers come from

The original version of this spec assumed the calculator needed **no game data**, and would port
~400 coefficients out of a fan site's `calculator.js`. Investigation on 2026-08-02 disproved that
premise: **every constant is in the game's own tables**, and the game data is strictly richer
than the fan site's transcription.

Evidence, from `EFTable_BattlePoint.db` (16,707 rows) in the extracted CN client:

| BattlePoint `Type` | PrimaryKey 1 (DPS) | PrimaryKey 2 (support) | Fan-site constant it matches |
| --- | --- | --- | --- |
| 1 | `288` | `124` | `baseRate` 0.000288 / 0.000124 |
| 2 | — | `12` | heal rate 0.0012 |
| 3 | `ValueB` 2945 @ level 70 | `476` @ level 70 | `FIXED_COMBAT_LEVEL_AMPS` |
| 5 | `75` | `160` | evolution 0.0075 / 0.016 |
| 6 | `70` | `72` | enlightenment 0.007 / 0.0072 |
| 7 | `20` | `20` | leap 0.002 |
| 9 | `2` | — | leap karma 0.0002 |
| 29 | 13,272 rows keyed by Ark-core id × points | | `dpsArkCoreValues` |

Two findings make the game source clearly better, not merely equivalent:

1. **The fan site's "constants" are parameterised in the game.** It hardcodes
   `FIXED_COMBAT_LEVEL_AMPS = { dps: 0.2945, support: 0.0476 }` and comments that combat level is
   "a formula constant in the current version". `BattlePoint` Type 3 is actually a table over
   combat levels 55–70 (dps 0.0895 → 0.2945). The fan site's model is a level-70 simplification
   that is simply wrong for a sub-70 character.
2. **The fan site ships acknowledged estimates.** Its `fixedEstherWeapons` carries the comment
   that the 艾拉3 +9 attack and stage amp are 推算值 — inferred from public stage data — and
   "can be replaced with official CN server data later". That replacement is exactly what
   sourcing from the game achieves.

Localization is also solved: `EFTable_GameMsg.db` has `GameMsg_Chinese` and `GameMsg_Korean`
(694,755 rows each), keyed by the ids the data tables reference. `tip.name.ability_adrenaline1`
resolves to 肾上腺素, `sys.arkgrid.core_order_sun` to 秩序之日 — the very strings the fan site
hardcoded, now available authoritatively and in two languages.

## Provenance

**Primary source: the game.** Coefficients, ids and display names come from the extracted client
tables. These are facts about the game, sourced first-hand.

**The fan site is demoted to a cross-check oracle.** <https://lostark-cn.pages.dev/html/dps>
remains useful for one thing: verifying our engine's *structure* — the order of operations, which
amps are multiplicative, the round-then-sum on support. Where our numbers and theirs disagree we
investigate, and where the disagreement traces to one of their acknowledged estimates or their
level-70 simplification, **the game data wins**.

We do not copy their code. Their `calculator.js` reads inputs straight off the DOM inside
`calcDps()`, which is why it cannot be unit-tested; we implement our own pure modules. The site is
credited by name and link in the app footer for the structural insight.

Fan-site sources live in a gitignored `_lostark_ref/` scratch dir and are never vendored.

## Decisions

| Decision | Choice |
| --- | --- |
| Roles | Both 输出 and 辅助, in the first release |
| Page structure | One page, tab switch between roles |
| Coefficient source | **Game tables**, via a `tools/apps/lostark` pipeline into `data-lostark` |
| Locales | **zh-CN and ko-KR**, both authoritative from `GameMsg`. en-US deferred |
| Save features | Autosave + JSON export/import. **No** named build profiles |
| Math location | Pure `src/calc/` module inside the app (not a workspace package) |
| Layout | Sticky score rail (score + composition pinned beside the form) |
| Verification | Fan-site cross-check vectors, with game data authoritative on conflict |
| Dev port | `15177` (next free after vrising's `15176`) |

### Locales

`GameMsg` gives us Chinese and Korean, both first-hand, so the calculator ships **zh-CN and
ko-KR**. This satisfies the convention against inventing translations — every term is a game
string resolved through its own key.

**en-US is deferred, and the reason is specific:** the extracted client is the CN build, whose
`EFTable_GameMsg.db` contains exactly two tables, `GameMsg_Chinese` and `GameMsg_Korean`. There
is no English in this data. `lostark-explorer` supports NAEU archive crypto, so extracting an
NAEU install would yield English — that is the unblock, and it is a data task, not a code task.
Until then the language switcher offers zh-CN and ko-KR only.

zh-TW is not available either and is not faked from zh-CN.

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

## Data pipeline

The monorepo's established shape is *extractor tool → pipeline → artifact repo → frontend*
(uex/unex/gdex → `tools/apps/<game>` → `data-<game>` → app). Lost Ark slots into it with one
difference worth stating plainly:

**We do not need a new first-party extractor.** uex, unex and gdex exist because Unreal, Unity
and Godot ship proprietary containers that needed a decoder written. For Lost Ark that role is
already filled by **`lostark-explorer`** (`D:\lostark-explorer`, a .NET solution you already
develop), which handles `.lpk`/`.ipk`/`.upk`/`.bnk` decryption. Its output at
`D:\lostark-extracted\EFGame` is **908 plain SQLite databases**. Writing a fourth extractor to
re-do decryption already solved would be duplicated work.

So the pipeline is the only new tool:

```
Lost Ark client
  --lostark-explorer-->  D:\lostark-extracted\EFGame\...\TableData\EFTable_*.db   (908 SQLite)
  --tools/apps/lostark-->  data-lostark/   (coefficients + locales, JSON)
  --HTTP-->  frontend/apps/lostark
```

`tools/apps/lostark` is Python under uv, matching the other four pipelines. It reads the EFTable
DBs read-only and emits:

| Artifact | Source tables |
| --- | --- |
| `battlepoint/{dps,support}.json` | `EFTable_BattlePoint` split by PrimaryKey |
| `arkgrid/cores.json` | `EFTable_ArkGridCore`, `ArkGridCoreOption`, BattlePoint Type 29 |
| `engravings.json` | `EFTable_AbilityEngrave`, `AbilityStone*` |
| `gear.json` | `EFTable_Item`, `ItemAmplification*` |
| `accessories.json`, `bracelet.json` | `ItemAccessory*`, `ItemBracelet*` |
| `locales/{zh-CN,ko-KR}.json` | `EFTable_GameMsg` `GameMsg_Chinese` / `GameMsg_Korean` |

Two pipeline concerns to design for:

- **Localized strings carry markup.** Values include `<font color='…'>`, `<img src='…'>` and
  templating like `<$CALC %2 <$TABLE_COMBATEFFECT Action0ArgA 608111000/>/100/>`. The pipeline
  strips presentational markup and must **either resolve or explicitly reject** rows whose text
  depends on `<$TABLE_*>` lookups, rather than shipping raw template syntax to the UI. This is
  the same class of problem as sts2's card text needing `vars`.
- **The extracted tree is not in the repo and is machine-local.** Its path belongs in
  `tools/.env` like the other pipelines, and a missing var must raise rather than silently
  defaulting.

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

**Pipeline contract tests (pytest, on `tools/apps/lostark`).** The extraction is now the place a
wrong number can enter, so it is where the assertions belong: BattlePoint Type 1 yields exactly
two rows (288 / 124), Type 3 covers levels 55–70 for both roles, every Ark-core id in Type 29
resolves to a row in `ArkGridCore`, and every emitted locale key resolves in `GameMsg`. A table
that silently loses rows after a patch fails here rather than in the UI.

**Cross-check vectors, not golden vectors.** The fan site is no longer the source of truth, so it
can no longer define pass/fail. It remains valuable as an independent implementation to compare
against: a script drives it in Playwright over ~30 loadouts and records its scores, and a test
reports the delta against our engine.

That test is **informational for known-divergent inputs and strict elsewhere**. We expect
disagreement in two places and must not "fix" our engine to match:

- any loadout below combat level 70, where the fan site applies its level-70 constant;
- 艾拉3 Esther weapons, where the fan site uses its acknowledged 推算值 estimates.

Everywhere else a mismatch is a real bug in our engine, and the itemised named amp rows make it
traceable to the offending row. Where we disagree and the cause isn't one of the two above, the
resolution is to re-read the game table — not to match the fan site.

**E2E (Playwright).** Tab switch preserves both roles' state, autosave survives reload,
export→import round-trips, account-shared values propagate across tabs.

Note for implementation: aion2's e2e defaults to port 5173 and will collide with a running dev
server — use an explicit `E2E_PORT`.

## Out of scope

- Named build profiles with history and delta-vs-reference comparison (the reference's
  `calculator-workspace.js`). A clear follow-up feature with its own changelog entry.
- en-US and zh-TW locales, pending an NAEU extraction (see Locales above).
- `resource-lostark/` — the calculator needs no images. Icons referenced by the tables
  (`ArkGridCore.Icon`) are a later concern if the UI wants them.
- The fan site's honing-prediction page (`honing.html`).
- Bilibili Toy packaging.
- Any change to `lostark-explorer` itself. We consume its output; if a needed table turns out to
  be unextracted, that becomes a separate task in that repo.

## Follow-ups

- Create the `data-lostark` artifact repo (private, matching `data-palworld` et al.) and wire the
  pipeline's output to it.
- Bump `frontend/apps/lostark/src/changelog.json` **after** the feature commit — the entry pins
  the SHA of the commit it describes, so it cannot be in that commit. `MINOR` for a new page.
  Write all three changelog locales even though the UI ships zh-CN and ko-KR.
- Register `dev:lostark` / `build:lostark` / `lint:lostark` / `preview:lostark` / `e2e:lostark`
  in the workspace root `package.json`, and add `check:calc`.
- Extract an NAEU install with `lostark-explorer` to unblock en-US, then add the locale as a
  data change.
- **Add the app to the `meta` landing site — blocked on deployment, not on code.**
  Verified 2026-08-03: `aion2.tc-imba.com` returns 200 while `lostark.tc-imba.com` and
  `sts2.tc-imba.com` are unreachable. The grid lists only aion2 and palworld precisely because a
  `SiteCard` needs a live URL, and sts2 and vrising are absent for the same reason. Adding a card
  now would ship a dead link, which is worse than an absent one. Do it when the subdomain
  answers; it needs a `SiteCard` entry plus background art in `apps/meta/src/assets/`.
- Work on a git worktree branched from local `master` (not `origin/master`, which would silently
  drop unpushed work), and integrate with rebase. Re-run `pnpm changelog:verify` after the
  rebase, since rebasing orphans stamped SHAs.
