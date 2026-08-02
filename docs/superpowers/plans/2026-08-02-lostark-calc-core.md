# Lost Ark Calc Core Implementation Plan

> ## ⚠️ SUPERSEDED — do not execute
>
> Written 2026-08-02, superseded the same day by
> `2026-08-02-lostark-data-pipeline.md`.
>
> This plan sourced ~400 coefficients by scraping a fan site's `calculator.js`. Investigation
> then found **every one of those constants in the game's own `EFTable_BattlePoint.db`**, along
> with authoritative zh-CN and ko-KR names in `EFTable_GameMsg.db`. The fan site also proved to
> carry a level-70 simplification and self-described estimates, so scraping it would have baked
> in known-wrong values.
>
> **Task 4 (extract tables from the reference) and Task 10 (golden vectors) are void.**
>
> Tasks 1–3 and 5–9 remain broadly sound as *engine* work — the formula structure they encode was
> verified against the game tables and holds — but their table imports must be re-pointed at the
> pipeline's output. Read the superseding plan; it reuses the verified formula content from here
> rather than rediscovering it.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a verified, pure TypeScript combat-power engine for Lost Ark covering both the DPS and support roles, proven correct against golden vectors harvested from the reference site.

**Architecture:** A new `frontend/apps/lostark` app whose `src/calc/` directory is pure TypeScript — no React, DOM, storage or i18n. Coefficient tables are *generated* from the reference's `calculator.js` by a committed extraction script rather than hand-transcribed, so the golden vectors verify engine logic instead of typing accuracy. One shared stat chain feeds role specs that emit one score component (DPS) or two summed components (support).

**Tech Stack:** TypeScript 5.9, Vite (rolldown), React 19, Tailwind 4, vitest 4, Playwright 1.61, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-02-lostark-combat-power-calculator-design.md`

**Phase:** 1 of 3. This phase ships a headless verified engine. Phase 2 is the calculator UI (form sections, sticky score rail, composition panel). Phase 3 is persistence (autosave, JSON export/import), e2e and changelog.

---

## Prerequisites

The reference sources must be present at `E:/arkive-games/arkive/_lostark_ref/` (gitignored). If absent:

```bash
mkdir -p _lostark_ref && cd _lostark_ref
for f in calculator.js calculator-page.js calculator-workspace.js; do
  curl -sS -o "$f" "https://lostark-cn.pages.dev/js/$f"
done
wc -l calculator.js   # expect 4057
```

Work on a git worktree branched from **local** `master` (not `origin/master`, which would drop
unpushed work):

```bash
git worktree add .claude/worktrees/lostark-calc -b feat/lostark-calc master
```

---

## File Structure

| File | Responsibility |
| --- | --- |
| `frontend/apps/lostark/package.json` | App manifest, scripts |
| `frontend/apps/lostark/vite.config.ts` | Vite config, dev port 15177 |
| `frontend/apps/lostark/tsconfig*.json` | TS project refs |
| `frontend/apps/lostark/index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css` | Minimal shell so the app builds |
| `frontend/apps/lostark/src/calc/types.ts` | `Loadout`, `AmpRow`, `ScoreComponent`, `Result`, `RoleSpec` |
| `frontend/apps/lostark/src/calc/num.ts` | `num`, `round`, `roundDown`, `clampInt` primitives |
| `frontend/apps/lostark/src/calc/tables/*.generated.ts` | Extracted coefficient data (generated, committed) |
| `frontend/apps/lostark/src/calc/gear.ts` | Gear/weapon stat lookups incl. T4.5, Esther, advanced honing |
| `frontend/apps/lostark/src/calc/chain.ts` | Shared `mainStat → weaponAttack → baseAttack → basicAttack` |
| `frontend/apps/lostark/src/calc/engine.ts` | `evaluate(loadout, spec) → Result` |
| `frontend/apps/lostark/src/calc/roles/dps.ts` | DPS spec: 1 component, 39 amp rows |
| `frontend/apps/lostark/src/calc/roles/support.ts` | Support spec: 2 components, 29 + 9 amp rows |
| `frontend/apps/lostark/scripts/extract-tables.mjs` | One-off generator: `calculator.js` → table modules |
| `frontend/apps/lostark/scripts/harvest-golden.mjs` | Playwright harvest of reference scores |
| `frontend/apps/lostark/src/calc/__tests__/golden.fixture.json` | Committed golden vectors |
| `frontend/apps/lostark/src/calc/__tests__/*.test.ts` | vitest suites |

---

### Task 1: Scaffold the lostark app

**Files:**
- Create: `frontend/apps/lostark/package.json`
- Create: `frontend/apps/lostark/vite.config.ts`
- Create: `frontend/apps/lostark/tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Create: `frontend/apps/lostark/index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Modify: `frontend/package.json` (add workspace scripts)

- [ ] **Step 1: Copy the closest existing scaffold**

`meta` is the only non-map app, so it is the right template.

```bash
cd frontend/apps
cp meta/tsconfig.json meta/tsconfig.app.json meta/tsconfig.node.json meta/eslint.config.js lostark/ 2>/dev/null || true
```

Create `frontend/apps/lostark/package.json`:

```json
{
  "name": "lostark",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@gamemap/ui": "workspace:*",
    "i18next": "^25.6.2",
    "i18next-browser-languagedetector": "^8.2.0",
    "lucide-react": "^1.21.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-i18next": "^16.3.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@playwright/test": "^1.61.1",
    "@tailwindcss/vite": "^4.1.17",
    "@types/node": "^24.10.0",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@vitejs/plugin-react": "^5.1.0",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "tailwindcss": "^4.1.17",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.46.3",
    "vite": "npm:rolldown-vite@7.2.2"
  }
}
```

- [ ] **Step 2: Add the Vite config on the assigned port**

Create `frontend/apps/lostark/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 15177, strictPort: true },
});
```

- [ ] **Step 3: Add the minimal shell**

`frontend/apps/lostark/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="google" content="notranslate" />
    <title>战斗力计算器 | Arkive</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/apps/lostark/src/index.css`:

```css
@import "tailwindcss";

:root {
  font-size: 17px;
}
```

`frontend/apps/lostark/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`frontend/apps/lostark/src/App.tsx`:

```tsx
export default function App() {
  return <main className="p-4 text-base">战斗力计算器</main>;
}
```

Note `notranslate` in the `<head>` — project convention, matching the other four apps.

- [ ] **Step 4: Register workspace scripts**

In `frontend/package.json`, add alongside the existing per-app blocks:

```json
    "dev:lostark": "pnpm --filter lostark dev",
    "build:lostark": "pnpm --filter lostark build",
    "lint:lostark": "pnpm --filter lostark lint",
    "preview:lostark": "pnpm --filter lostark preview",
    "e2e:lostark": "pnpm --filter lostark e2e",
```

- [ ] **Step 5: Install and verify the app builds**

Run: `cd frontend && pnpm install && pnpm build:lostark`
Expected: `tsc -b` passes, Vite writes `dist/`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/lostark frontend/package.json
git commit -m "feat(lostark): scaffold the app on port 15177"
```

---

### Task 2: Numeric primitives

The reference's float behaviour is load-bearing. These four helpers are used everywhere and must
match exactly.

**Files:**
- Create: `frontend/apps/lostark/src/calc/num.ts`
- Test: `frontend/apps/lostark/src/calc/__tests__/num.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { clampInt, num, round, roundDown } from "../num";

describe("num", () => {
  it("yields 0 for unparseable input", () => {
    expect(num("")).toBe(0);
    expect(num("-")).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num(NaN)).toBe(0);
  });
  it("parses leading numerics like parseFloat", () => {
    expect(num("12.5")).toBe(12.5);
    expect(num("40abc")).toBe(40);
  });
});

describe("round", () => {
  it("rounds to the given digits, default 2", () => {
    expect(round(1.005_6, 2)).toBe(1.01);
    expect(round(1.2345)).toBe(1.23);
  });
  it("clamps digits to 0..6", () => {
    expect(round(1.23456789, 99)).toBe(round(1.23456789, 6));
  });
});

describe("roundDown", () => {
  it("truncates rather than rounds", () => {
    expect(roundDown(0.000_199_9, 4)).toBe(0.0001);
  });
});

describe("clampInt", () => {
  it("clamps and truncates", () => {
    expect(clampInt("30", 0, 25)).toBe(25);
    expect(clampInt("-4", 0, 25)).toBe(0);
    expect(clampInt("12.9", 0, 25)).toBe(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/num.test.ts`
Expected: FAIL — cannot resolve `../num`.

- [ ] **Step 3: Implement**

`frontend/apps/lostark/src/calc/num.ts`:

```ts
/** Reference parity: parseFloat, with every non-finite result floored to 0. */
export function num(value: unknown): number {
  const parsed = parseFloat(value as string);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Reference parity: toFixed with digits clamped to 0..6. */
export function round(value: number, digits = 2): number {
  return Number(value.toFixed(Math.max(0, Math.min(6, digits))));
}

/** Truncate toward zero at `digits` decimals. Used for Ark-stone amps. */
export function roundDown(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.trunc(value * factor) / factor;
}

export function clampInt(value: unknown, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(num(value))));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/num.test.ts`
Expected: PASS, 4 suites.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/lostark/src/calc/num.ts frontend/apps/lostark/src/calc/__tests__/num.test.ts
git commit -m "feat(lostark): numeric primitives matching reference float behaviour"
```

---

### Task 3: Calc types

**Files:**
- Create: `frontend/apps/lostark/src/calc/types.ts`

No test — these are types only, exercised by every later task.

- [ ] **Step 1: Write the types**

```ts
export type GearTier = string;

export interface GearSlot {
  tier: GearTier;
  refine: number;
  advanced: number;
  quality: number;
}

export interface AccessorySlot {
  main: number;
  vitality: number;
  lines: [string, string, string];
}

export interface BraceletState {
  main: number;
  vitality: number;
  crit: number;
  spec: number;
  swift: number;
  lines: [string, string, string];
}

export interface EngravingState {
  selected: boolean;
  name: string;
  book: number;
  stone: number;
}

export interface ArkCoreState {
  type: string;
  progress: string;
  points: string;
}

/** Account-wide, shared between both roles. */
export interface AccountShared {
  expMain: number;
  expVitality: number;
  expCrit: number;
  expSpec: number;
  expSwift: number;
  petExtra: number;
  petMain: number;
  petHp: number;
}

export interface Loadout {
  /** 6 slots: head, shoulder, top, bottom, gloves, weapon. */
  gear: GearSlot[];
  /** 5 slots: necklace, earring1, earring2, ring1, ring2. */
  accessories: AccessorySlot[];
  bracelet: BraceletState;
  engravings: EngravingState[];
  arkCores: ArkCoreState[];
  gems: { t46: number; t47: number; t48: number; t49: number; t410: number };
  cardAwakening: number;
  avatar: { head: string; top: string; bottom: string; weapon: string };
  arkEvolution: number;
  arkEnlightenment: number;
  arkLeap: number;
  karmaEvolutionStage: number;
  karmaEvolutionLevel: number;
  karmaEnlightenmentLevel: number;
  karmaLeapLevel: number;
  arkStone: Record<string, number>;
  orbType: string;
  orbPower: number;
  /** Support only. Selects the vitality factor. */
  supportClass: string;
  account: AccountShared;
}

export interface AmpRow {
  name: string;
  value: number;
}

export interface ScoreComponent {
  key: string;
  label: string;
  base: number;
  amps: AmpRow[];
  /** base × Π(1+amp), rounded per the role's rule. */
  score: number;
}

export interface Result {
  components: ScoreComponent[];
  /** Sum of each component's already-rounded score. */
  total: number;
  /** Intermediates the UI surfaces. */
  mainStat: number;
  weaponAttack: number;
  baseAttack: number;
  basicAttack: number;
  maxHp?: number;
}

export interface RoleSpec {
  key: "dps" | "support";
  evaluate(loadout: Loadout): Result;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd frontend && pnpm --filter lostark exec tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/lostark/src/calc/types.ts
git commit -m "feat(lostark): calc domain types"
```

---

### Task 4: Extract coefficient tables from the reference

Hand-typing ~400 coefficients would introduce exactly the errors the golden vectors exist to
catch. Generate them instead, and commit the output so runtime never depends on the scratch dir.

**Files:**
- Create: `frontend/apps/lostark/scripts/extract-tables.mjs`
- Create (generated): `frontend/apps/lostark/src/calc/tables/*.generated.ts`
- Test: `frontend/apps/lostark/src/calc/__tests__/tables.test.ts`

- [ ] **Step 1: Write the failing test with spot values read from the reference**

Each expected value below was read directly out of `_lostark_ref/calculator.js` and pins a
different table, so a mis-wired extraction fails loudly.

```ts
import { describe, expect, it } from "vitest";
import { commonGearBase, commonTierRules, commonWeaponBase } from "../tables/gear.generated";
import { dpsGemData } from "../tables/gems.generated";
import { dpsLineEffects } from "../tables/accessoryLines.generated";

describe("extracted tables", () => {
  it("carries gear tier growth rules", () => {
    expect(commonTierRules["T4"]).toEqual({ base: 1590, growth: 5 });
  });

  it("carries per-item-level armour base stats", () => {
    expect(commonGearBase["T4 1640"].headMain).toBe(57721);
    expect(commonGearBase["T4 1640"].glovesVit).toBe(4862);
  });

  it("carries weapon base attack", () => {
    expect(commonWeaponBase["T4 1640"]).toBe(100036);
    expect(commonWeaponBase["神选+9埃拉2 1765"]).toBe(189570);
  });

  it("carries gem battle/basic rates", () => {
    expect(dpsGemData.t410).toBeDefined();
  });

  it("carries accessory line effects", () => {
    expect(dpsLineEffects["攻击力+390"]).toEqual({
      battle: 0.00273, weaponFlat: 0, weaponPct: 0,
    });
    expect(dpsLineEffects["武器攻击力+960"].weaponFlat).toBe(960);
  });

  it("has the expected item-level coverage", () => {
    const t4Keys = Object.keys(commonWeaponBase).filter(k => k.startsWith("T4 "));
    expect(t4Keys).toContain("T4 1755");
    expect(t4Keys.length).toBeGreaterThan(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/tables.test.ts`
Expected: FAIL — cannot resolve `../tables/gear.generated`.

- [ ] **Step 3: Write the extraction script**

The reference declares each table as a single-line `const NAME = {...};` or `[...]`, so the
values are extractable by locating the declaration and evaluating just its literal. Evaluating
with `Function` is safe here because the input is a pinned local file, not user input.

`frontend/apps/lostark/scripts/extract-tables.mjs`:

```js
#!/usr/bin/env node
// Regenerates src/calc/tables/*.generated.ts from the reference calculator.js.
// Usage: node scripts/extract-tables.mjs [path-to-calculator.js]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.argv[2] ?? resolve(HERE, "../../../../_lostark_ref/calculator.js"));
const OUT = resolve(HERE, "../src/calc/tables");

const source = readFileSync(SRC, "utf8");

/** Modules to emit: output file -> the reference const names it should carry. */
const MODULES = {
  "gear.generated.ts": [
    "commonTierRules", "commonGearBase", "commonWeaponBase",
    "fateTremorArmorValues", "fateTremorWeaponValues", "fixedEstherWeapons",
    "armorGearTiers", "weaponGearTiers", "gearStatKeys",
  ],
  "engravings.generated.ts": [
    "dpsEngravingBase", "dpsEngravingBooks", "dpsEngravingStones",
    "supportEngravingBase", "supportEngravingBooks", "supportEngravingStones",
  ],
  "arkCores.generated.ts": [
    "dpsArkCoreValues", "dpsArkCoreWeapon", "dpsArkStoneRate",
    "supportArkCoreValues", "supportArkCoreWeapon",
    "arkPointOptions", "arkCoreProgressOptions", "supportArkCoreProgressOptions",
  ],
  "gems.generated.ts": ["dpsGemData", "supportGemData"],
  "orbs.generated.ts": ["dpsOrbData"],
  "accessoryLines.generated.ts": [
    "dpsLineOptions", "supportLineOptions", "dpsLineEffects", "supportLineEffects",
  ],
};

/** Extract the literal assigned to `const NAME =`, balancing braces/brackets. */
function extractLiteral(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*`, "g");
  const m = re.exec(source);
  if (!m) throw new Error(`table not found: ${name}`);
  let i = m.index + m[0].length;

  // Unwrap Object.freeze( ... )
  let wrapped = false;
  if (source.startsWith("Object.freeze(", i)) { i += "Object.freeze(".length; wrapped = true; }

  const open = source[i];
  if (open !== "{" && open !== "[") throw new Error(`${name} is not an object/array literal`);
  const close = open === "{" ? "}" : "]";

  let depth = 0, inStr = null, out = "";
  for (; i < source.length; i++) {
    const ch = source[i];
    out += ch;
    if (inStr) { if (ch === inStr && source[i - 1] !== "\\") inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`unbalanced literal for ${name}`);
  void wrapped;
  return out;
}

mkdirSync(OUT, { recursive: true });

for (const [file, names] of Object.entries(MODULES)) {
  const parts = [
    "// GENERATED by scripts/extract-tables.mjs — do not edit by hand.",
    `// Source: ${SRC.replace(/\\/g, "/")}`,
    "",
  ];
  for (const name of names) {
    const literal = extractLiteral(name);
    // Round-trip through JSON so the emitted file is plain data, not expressions.
    const value = new Function(`return (${literal});`)();
    parts.push(`export const ${name} = ${JSON.stringify(value, null, 2)} as const;`, "");
  }
  writeFileSync(resolve(OUT, file), parts.join("\n"), "utf8");
  console.log(`wrote ${file} (${names.length} tables)`);
}
```

- [ ] **Step 4: Run the extraction**

Run:
```bash
cd frontend/apps/lostark && node scripts/extract-tables.mjs
```
Expected: six `wrote …` lines, no throw. If a name throws `table not found`, the reference
renamed it — fix `MODULES` rather than hand-editing generated output.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/tables.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/lostark/scripts/extract-tables.mjs \
        frontend/apps/lostark/src/calc/tables \
        frontend/apps/lostark/src/calc/__tests__/tables.test.ts
git commit -m "feat(lostark): generate coefficient tables from the reference"
```

---

### Task 5: Gear and weapon lookups

The subtlest code in the engine. Two details are load-bearing and easy to miss:
`gearStatValue` truncates to integer **per slot** (so a T4 +21/AH40 → T4.5 +12 transfer matches
exactly), and `lifeActivityAmp` uses an epsilon-guarded ceil.

**Files:**
- Create: `frontend/apps/lostark/src/calc/gear.ts`
- Test: `frontend/apps/lostark/src/calc/__tests__/gear.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  gearItemLevelKey, gearStatTotal, lifeActivityAmp,
  weaponBaseAttack, weaponQualityAmp, chosenWeaponAmp,
} from "../gear";
import type { GearSlot } from "../types";

const slot = (over: Partial<GearSlot> = {}): GearSlot =>
  ({ tier: "T4", refine: 0, advanced: 0, quality: 0, ...over });

/** 6 slots, all T4 at the given refine. */
const set = (refine: number, over: Partial<GearSlot> = {}): GearSlot[] =>
  Array.from({ length: 6 }, () => slot({ refine, ...over }));

describe("gearItemLevelKey", () => {
  it("is base + growth×refine + advanced", () => {
    // T4: base 1590, growth 5 → refine 10 lands on the 1640 row.
    expect(gearItemLevelKey(slot({ refine: 10 }))).toBe("T4 1640");
    expect(gearItemLevelKey(slot({ refine: 10, advanced: 5 }))).toBe("T4 1645");
  });
  it("is empty for T4.5, which uses its own table", () => {
    expect(gearItemLevelKey(slot({ tier: "T4.5" }))).toBe("");
  });
});

describe("gearStatTotal", () => {
  it("sums the five armour slots and ignores the weapon", () => {
    const total = gearStatTotal(set(10), "main");
    // 57721 + 61431 + 46177 + 49887 + 69265 from the T4 1640 row.
    expect(total).toBe(284481);
  });
  it("truncates each slot to an integer before summing", () => {
    // Advanced honing multiplies; per-slot Math.trunc must apply, not one trunc at the end.
    const total = gearStatTotal(set(10, { advanced: 30 }), "main");
    expect(Number.isInteger(total)).toBe(true);
  });
});

describe("weaponQualityAmp", () => {
  it("is (10 + 0.002×quality²)/100, so 10% even at quality 0", () => {
    expect(weaponQualityAmp(set(0))).toBeCloseTo(0.1, 10);
    expect(weaponQualityAmp(set(0, { quality: 100 }))).toBeCloseTo(0.3, 10);
  });
});

describe("chosenWeaponAmp", () => {
  it("is 1.9% for 神选 tiers and 0 otherwise", () => {
    expect(chosenWeaponAmp(set(0))).toBe(0);
    const esther = set(0);
    esther[5] = slot({ tier: "神选+9艾拉3" });
    expect(chosenWeaponAmp(esther)).toBe(0.019);
  });
});

describe("weaponBaseAttack", () => {
  it("reads the item-level row", () => {
    expect(weaponBaseAttack(set(10))).toBe(100036);
  });
  it("applies the advanced-honing weapon bonus at 30 and 40", () => {
    expect(weaponBaseAttack(set(10, { advanced: 40 }))).toBeCloseTo(
      // key becomes "T4 1680" at advanced 40, then ×1.05
      121961 * 1.05, 6,
    );
  });
});

describe("lifeActivityAmp", () => {
  it("epsilon-guards the ceil so exact multiples do not round up", () => {
    // quality 10 → 14×100/100 - eps = 14 exactly, ceil must stay 14, not 15.
    const g = set(0, { quality: 10 });
    expect(lifeActivityAmp(g)).toBeCloseTo((14 * 5) / 14000, 12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/gear.test.ts`
Expected: FAIL — cannot resolve `../gear`.

- [ ] **Step 3: Implement, porting the reference logic faithfully**

Port from `_lostark_ref/calculator.js`: `gearStatValue` L2769, `gearStatTotal` L2779,
`weaponBaseAttack` L2786, `weaponQualityAmp` L2796, `chosenWeaponAmp` L2801,
`lifeActivityAmp` L2808, `gearItemLevelKey` L2739, `advancedWeaponPercent` L2733,
`isT45Gear` L2172, `fixedEstherWeapon` L2176, `clampT45Refine` L2188,
`advancedStatMultiplier` L2727, `gearArmorBaseRow` and `fateTremorArmorRow` (search by name),
`gearStatKeys` L2746.

`frontend/apps/lostark/src/calc/gear.ts`:

```ts
import { clampInt, num } from "./num";
import type { GearSlot } from "./types";
import {
  commonGearBase, commonTierRules, commonWeaponBase,
  fateTremorArmorValues, fateTremorWeaponValues, fixedEstherWeapons, gearStatKeys,
} from "./tables/gear.generated";

const T45_TIER = "T4.5";
const LEGACY_T45_TIER = "T4.5 命运战栗";

export const isT45Gear = (item?: GearSlot): boolean =>
  item?.tier === T45_TIER || item?.tier === LEGACY_T45_TIER;

export const fixedEstherWeapon = (item?: GearSlot) =>
  (fixedEstherWeapons as Record<string, { weaponAttack: number; amp: number }>)[
    item?.tier ?? ""
  ] ?? null;

export const clampT45Refine = (value: unknown): number => clampInt(value, 0, 25);

export function gearItemLevelKey(item: GearSlot): string {
  if (isT45Gear(item) || fixedEstherWeapon(item)) return "";
  const rule = (commonTierRules as Record<string, { base: number; growth: number }>)[item.tier];
  if (!rule) return "";
  return `${item.tier} ${num(rule.base) + num(rule.growth) * num(item.refine) + num(item.advanced)}`;
}

export function advancedWeaponPercent(advanced: number): number {
  if (advanced >= 40) return 0.05;
  if (advanced >= 30) return 0.02;
  return 0;
}

export function advancedStatMultiplier(advanced: number): number {
  if (advanced >= 40) return 1.05;
  if (advanced >= 30) return 1.02;
  return 1;
}

export function fateTremorItemLevel(refine: unknown): number {
  return 1675 + clampT45Refine(refine) * 5;
}

/**
 * T4.5 data is stored stat-name → array-indexed-by-refine, the transpose of `commonGearBase`.
 * Rebuild a row so both tiers share one lookup shape.
 */
export function fateTremorArmorRow(refine: unknown): Record<string, number> {
  const rank = clampT45Refine(refine);
  return Object.fromEntries(
    Object.entries(fateTremorArmorValues as Record<string, number[]>).map(
      ([key, values]) => [key, values[rank]],
    ),
  );
}

function gearArmorBaseRow(item: GearSlot): Record<string, number> | undefined {
  if (isT45Gear(item)) return fateTremorArmorRow(item.refine);
  return (commonGearBase as Record<string, Record<string, number>>)[gearItemLevelKey(item)];
}

/**
 * Per-slot stat. The game tooltip shows integers and the advanced-honing multiplier is
 * floored at this layer, which is what makes a T4 +21/AH40 → T4.5 +12 transfer match exactly.
 */
export function gearStatValue(
  item: GearSlot,
  index: number,
  statType: "main" | "vitality",
): number {
  const row = gearArmorBaseRow(item);
  if (!row) return 0;
  const key = (gearStatKeys as string[][])[index][statType === "vitality" ? 1 : 0];
  const value = num(row[key]) * (isT45Gear(item) ? 1 : advancedStatMultiplier(num(item.advanced)));
  return Math.trunc(value);
}

export function gearStatTotal(gear: GearSlot[], statType: "main" | "vitality"): number {
  return gear
    .slice(0, 5)
    .reduce((total, item, index) => total + gearStatValue(item, index, statType), 0);
}

export function weaponBaseAttack(gear: GearSlot[]): number {
  const weapon = gear[5];
  if (!weapon) return 0;
  const fixed = fixedEstherWeapon(weapon);
  if (fixed) return fixed.weaponAttack;
  if (isT45Gear(weapon)) {
    return (fateTremorWeaponValues as number[])[clampT45Refine(weapon.refine)];
  }
  return (
    num((commonWeaponBase as Record<string, number>)[gearItemLevelKey(weapon)]) *
    (1 + advancedWeaponPercent(num(weapon.advanced)))
  );
}

export function weaponQualityAmp(gear: GearSlot[]): number {
  const weapon = gear[5];
  return (10 + 0.002 * num(weapon?.quality) ** 2) / 100;
}

export function chosenWeaponAmp(gear: GearSlot[]): number {
  const weapon = gear[5];
  const fixed = fixedEstherWeapon(weapon);
  if (fixed) return fixed.amp;
  return String(weapon?.tier ?? "").startsWith("神选") ? 0.019 : 0;
}

/** Support-only. Epsilon-guarded ceil is deliberate — do not simplify to Math.ceil. */
export function lifeActivityAmp(gear: GearSlot[]): number {
  const activity = gear
    .slice(0, 5)
    .reduce((total, item) => total + Math.ceil((14 * num(item.quality) ** 2) / 100 - 1e-9), 0);
  return activity / 14000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/gear.test.ts`
Expected: PASS. If `advancedStatMultiplier` mismatches, read its real body in the reference and
correct this port — the test for integer truncation will catch a wrong multiplier shape.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/lostark/src/calc/gear.ts frontend/apps/lostark/src/calc/__tests__/gear.test.ts
git commit -m "feat(lostark): gear and weapon stat lookups"
```

---

### Task 6: Shared stat chain

**Files:**
- Create: `frontend/apps/lostark/src/calc/chain.ts`
- Test: `frontend/apps/lostark/src/calc/__tests__/chain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { baseAttackOf, basicAttackOf, mainStatOf, weaponAttackOf } from "../chain";
import type { GearSlot, Loadout } from "../types";

const gear = (): GearSlot[] =>
  Array.from({ length: 6 }, () => ({ tier: "T4", refine: 10, advanced: 0, quality: 0 }));

const emptyLoadout = (): Loadout => ({
  gear: gear(),
  accessories: Array.from({ length: 5 }, () => ({
    main: 0, vitality: 0, lines: ["其它", "其它", "其它"] as [string, string, string],
  })),
  bracelet: { main: 0, vitality: 0, crit: 0, spec: 0, swift: 0, lines: ["其它", "其它", "其它"] },
  engravings: [], arkCores: [],
  gems: { t46: 0, t47: 0, t48: 0, t49: 0, t410: 0 },
  cardAwakening: 0,
  avatar: { head: "无", top: "无", bottom: "无", weapon: "无" },
  arkEvolution: 0, arkEnlightenment: 0, arkLeap: 0,
  karmaEvolutionStage: 0, karmaEvolutionLevel: 0, karmaEnlightenmentLevel: 0, karmaLeapLevel: 0,
  arkStone: {}, orbType: "无", orbPower: 0, supportClass: "墨灵/吟游诗人",
  account: {
    expMain: 0, expVitality: 0, expCrit: 0, expSpec: 0, expSwift: 0,
    petExtra: 0, petMain: 0, petHp: 0,
  },
});

describe("mainStatOf", () => {
  it("adds the flat 477 and applies pet/avatar multipliers", () => {
    const l = emptyLoadout();
    expect(mainStatOf(l)).toBe(284481 + 477);
  });
  it("scales by pet main stat", () => {
    const l = emptyLoadout();
    l.account.petMain = 0.01;
    expect(mainStatOf(l)).toBeCloseTo((284481 + 477) * 1.01, 6);
  });
});

describe("weaponAttackOf", () => {
  it("floors the result", () => {
    const l = emptyLoadout();
    l.karmaEnlightenmentLevel = 7; // ×1.007 → fractional before floor
    const v = weaponAttackOf(l, { weaponFlat: 0, weaponPct: 0 });
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBe(Math.floor(100036 * 1.007));
  });
});

describe("baseAttackOf / basicAttackOf", () => {
  it("is sqrt(weaponAttack × mainStat / 6) rounded to 2", () => {
    expect(baseAttackOf(100036, 284958)).toBe(
      Number(Math.sqrt((100036 * 284958) / 6).toFixed(2)),
    );
  });
  it("scales basic attack by gem and stone basic rates", () => {
    expect(basicAttackOf(1000, 0.02, 0.015)).toBeCloseTo(1000 * 1.035, 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/chain.test.ts`
Expected: FAIL — cannot resolve `../chain`.

- [ ] **Step 3: Implement**

```ts
import { gearStatTotal, weaponBaseAttack } from "./gear";
import { num, round } from "./num";
import type { Loadout } from "./types";

export function avatarAmp(level: string): number {
  if (level === "传说") return 0.02;
  if (level === "英雄") return 0.01;
  if (level === "稀有") return 0.005;
  return 0;
}

export function totalAvatarAmp(l: Loadout): number {
  return (
    avatarAmp(l.avatar.head) + avatarAmp(l.avatar.top) +
    avatarAmp(l.avatar.bottom) + avatarAmp(l.avatar.weapon)
  );
}

export function accessoryMainTotal(l: Loadout): number {
  return l.accessories.reduce((t, a) => t + num(a.main), 0);
}

export function accessoryVitalityTotal(l: Loadout): number {
  return l.accessories.reduce((t, a) => t + num(a.vitality), 0);
}

export function mainStatOf(l: Loadout): number {
  const flat =
    gearStatTotal(l.gear, "main") + accessoryMainTotal(l) +
    num(l.account.expMain) + num(l.bracelet.main) + 477;
  return flat * (1 + num(l.account.petMain) + totalAvatarAmp(l));
}

/**
 * Bracelet and Ark-core weapon contributions arrive via `extra` rather than being read from
 * the loadout, because both differ per role.
 */
export function weaponAttackOf(
  l: Loadout,
  extra: { weaponFlat: number; weaponPct: number },
): number {
  return Math.floor(
    (weaponBaseAttack(l.gear) + extra.weaponFlat) *
      (1 + num(l.karmaEnlightenmentLevel) * 0.001 + extra.weaponPct),
  );
}

export function baseAttackOf(weaponAttack: number, mainStat: number): number {
  return round(Math.sqrt((weaponAttack * mainStat) / 6), 2);
}

export function basicAttackOf(
  baseAttack: number, gemBasic: number, stoneBasic: number,
): number {
  return baseAttack * (1 + gemBasic + stoneBasic);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/chain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/lostark/src/calc/chain.ts frontend/apps/lostark/src/calc/__tests__/chain.test.ts
git commit -m "feat(lostark): shared main-stat and weapon-attack chain"
```

---

### Task 7: Engine

**Files:**
- Create: `frontend/apps/lostark/src/calc/engine.ts`
- Test: `frontend/apps/lostark/src/calc/__tests__/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { productAmp, scoreComponent } from "../engine";

describe("productAmp", () => {
  it("multiplies (1+v) across rows", () => {
    expect(productAmp([{ name: "a", value: 0.1 }, { name: "b", value: 0.2 }]))
      .toBeCloseTo(1.32, 10);
  });
  it("is 1 for no rows", () => {
    expect(productAmp([])).toBe(1);
  });
});

describe("scoreComponent", () => {
  it("rounds base × product to 2 decimals", () => {
    const c = scoreComponent("dps", "输出战斗力", 100, [{ name: "a", value: 0.5 }]);
    expect(c.score).toBe(150);
    expect(c.amps).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/engine.test.ts`
Expected: FAIL — cannot resolve `../engine`.

- [ ] **Step 3: Implement**

```ts
import { round } from "./num";
import type { AmpRow, ScoreComponent } from "./types";

export function productAmp(rows: AmpRow[]): number {
  return rows.reduce((acc, row) => acc * (1 + row.value), 1);
}

export function scoreComponent(
  key: string, label: string, base: number, amps: AmpRow[],
): ScoreComponent {
  return { key, label, base, amps, score: round(base * productAmp(amps), 2) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/lostark/src/calc/engine.ts frontend/apps/lostark/src/calc/__tests__/engine.test.ts
git commit -m "feat(lostark): amp product and score component primitives"
```

---

### Task 8: DPS role

**Files:**
- Create: `frontend/apps/lostark/src/calc/roles/dps.ts`
- Test: `frontend/apps/lostark/src/calc/__tests__/dps.test.ts`

Port `calcDps` from `_lostark_ref/calculator.js` L3373-3440, plus `engravingAmp` L2599,
`arkCoreAmp` L2687, `karmaStageAmp` L660, `dpsCardAmp` L670, `petExtraAmp` L653,
`engravingStoneBasic` L2886.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { dpsRole } from "../roles/dps";
import { emptyLoadout } from "./fixtures";

describe("dps role", () => {
  it("emits exactly one score component with 39 amp rows", () => {
    const r = dpsRole.evaluate(emptyLoadout());
    expect(r.components).toHaveLength(1);
    expect(r.components[0].amps).toHaveLength(39);
  });

  it("pins the combat-level amp at 0.2945", () => {
    const r = dpsRole.evaluate(emptyLoadout());
    expect(r.components[0].amps.find(a => a.name === "战斗等级")?.value).toBe(0.2945);
  });

  it("uses baseRate 0.000288", () => {
    const r = dpsRole.evaluate(emptyLoadout());
    expect(r.components[0].base).toBeCloseTo(r.basicAttack * 0.000288, 12);
  });

  it("never penalises evolution below 40", () => {
    const l = emptyLoadout();
    l.arkEvolution = 10;
    const amp = dpsRole.evaluate(l).components[0].amps
      .find(a => a.name === "进化(2-4阶)");
    expect(amp?.value).toBe(0);
  });

  it("credits evolution above 40 at 0.0075 per point", () => {
    const l = emptyLoadout();
    l.arkEvolution = 60;
    const amp = dpsRole.evaluate(l).components[0].amps
      .find(a => a.name === "进化(2-4阶)");
    expect(amp?.value).toBeCloseTo(20 * 0.0075, 10);
  });

  it("grants stone basic only once total stone levels reach 5", () => {
    const l = emptyLoadout();
    l.engravings = [
      { selected: true, name: "怨恨", book: 0, stone: 2 },
      { selected: true, name: "肾上腺素", book: 0, stone: 2 },
    ];
    expect(dpsRole.evaluate(l).basicAttack).toBeCloseTo(dpsRole.evaluate(l).baseAttack, 6);
    l.engravings[1].stone = 3; // total 5
    const r = dpsRole.evaluate(l);
    expect(r.basicAttack).toBeCloseTo(r.baseAttack * 1.015, 6);
  });

  it("computes combat stats over crit+spec+swift at 0.0003", () => {
    const l = emptyLoadout();
    l.account.expCrit = 100;
    const amp = dpsRole.evaluate(l).components[0].amps.find(a => a.name === "战斗特性");
    expect(amp?.value).toBeCloseTo((2160 + 100) * 0.0003, 10);
  });
});
```

- [ ] **Step 2: Extract the shared test fixture**

Create `frontend/apps/lostark/src/calc/__tests__/fixtures.ts` holding the `emptyLoadout()`
factory written in Task 6 Step 1, exported. Update `chain.test.ts` to import it instead of
declaring its own copy, so the two never drift.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/dps.test.ts`
Expected: FAIL — cannot resolve `../roles/dps`.

- [ ] **Step 4: Implement the DPS role**

Build the 39 amp rows in this exact order (the composition panel renders them in order):
`战斗等级, 武器品质, 进化(2-4阶), 顿悟, 飞跃, 进化业力, 飞跃业力, 刻印效果, 宝石, 战斗特性,
卡牌, 牧场, 神选英雄武器, 项链1..3, 耳环1-1..3, 耳环2-1..3, 戒指1-1..3, 戒指2-1..3, 手镯,
乐园宝珠, 秩序之日, 秩序之月, 秩序之星, 混沌之日, 混沌之月, 混沌之星, 攻击力, 额外伤害, 首领伤害`.

Key values:

```ts
const COMBAT_LEVEL_AMP = 0.2945;
const COMBAT_BASE = 2160;
const BASE_RATE = 0.000288;

// 进化: Math.max(0, (arkEvolution - 40) * 0.0075)
// 顿悟: arkEnlightenment * 0.007
// 飞跃: arkLeap * 0.002
// 飞跃业力: karmaLeapLevel * 0.0002
// 刻印效果: productAmp(engravings.map(engravingAmp)) - 1
// 战斗特性: (COMBAT_BASE + expCrit + expSpec + expSwift + braceletCritSpecSwift) * 0.0003
// 宝石:    Π (1 + gem.battle)^count − 1
// 攻击力/额外伤害/首领伤害: roundDown(arkStone[k] * dpsArkStoneRate[k], 4)
```

Step functions to port verbatim:

```ts
export function karmaStageAmp(stage: number): number {
  if (stage >= 6) return 0.036;
  if (stage >= 5) return 0.03;
  if (stage >= 4) return 0.024;
  if (stage >= 3) return 0.018;
  if (stage >= 2) return 0.012;
  if (stage >= 1) return 0.006;
  return 0;
}

export function dpsCardAmp(awakening: number): number {
  if (awakening >= 30) return 0.15;
  if (awakening >= 24) return 0.11;
  if (awakening >= 18) return 0.07;
  return 0;
}

export function petExtraAmp(value: number): number {
  if (value >= 0.01) return 0.0077;
  if (value >= 0.007) return 0.00539;
  if (value >= 0.004) return 0.0031;
  return 0;
}

export function engravingStoneBasic(engravings: EngravingState[]): number {
  const total = engravings
    .filter(e => e.selected)
    .reduce((t, e) => t + num(e.stone), 0);
  return total >= 5 ? 0.015 : 0;
}

export function engravingAmp(item: EngravingState): number {
  if (!item.selected) return 0;
  const base = num((dpsEngravingBase as Record<string, number>)[item.name]);
  const book = num((dpsEngravingBooks as Record<string, number[]>)[item.name]?.[num(item.book)]);
  const stone = num((dpsEngravingStones as Record<string, number[]>)[item.name]?.[num(item.stone)]);
  return base + book + stone;
}

export function arkCoreAmp(item: ArkCoreState): number {
  if (item.progress === "未装配" || item.points === "未激活") return 0;
  const row = (dpsArkCoreValues as Record<string, Record<string, number>>)[
    `${item.type}_${item.progress}`
  ];
  return num(row?.[item.points]);
}
```

Orb amp: `dpsOrbData[orbType].base + dpsOrbData[orbType].perMillion * (orbPower / 1_000_000)`,
falling back to the `"无"` row for unknown types.

`evaluate` assembles `mainStat`, `weaponAttack` (passing accessory + bracelet + Ark-core weapon
flat/pct as `extra`), `baseAttack`, `basicAttack`, then returns a single component via
`scoreComponent("dps", "输出战斗力", basicAttack * BASE_RATE, amps)` with `total` equal to that
component's score.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/dps.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/lostark/src/calc/roles/dps.ts \
        frontend/apps/lostark/src/calc/__tests__/dps.test.ts \
        frontend/apps/lostark/src/calc/__tests__/fixtures.ts \
        frontend/apps/lostark/src/calc/__tests__/chain.test.ts
git commit -m "feat(lostark): DPS role spec with 39 amp rows"
```

---

### Task 9: Support role

The highest-risk task. Support is **not** DPS with different numbers.

**Files:**
- Create: `frontend/apps/lostark/src/calc/roles/support.ts`
- Test: `frontend/apps/lostark/src/calc/__tests__/support.test.ts`

Port `calcSupport` from `_lostark_ref/calculator.js` L3477-3540, plus `supportVitalityFactor`
L2813, `supportCardAmp` L677.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { supportRole } from "../roles/support";
import { emptyLoadout } from "./fixtures";
import { round } from "../num";

describe("support role", () => {
  it("emits two components: support and heal", () => {
    const r = supportRole.evaluate(emptyLoadout());
    expect(r.components.map(c => c.key)).toEqual(["support", "heal"]);
    expect(r.components[0].amps).toHaveLength(29);
    expect(r.components[1].amps).toHaveLength(9);
  });

  it("sums the two ALREADY-ROUNDED component scores", () => {
    const r = supportRole.evaluate(emptyLoadout());
    const [s, h] = r.components;
    expect(r.total).toBeCloseTo(round(s.score, 2) + round(h.score, 2), 10);
  });

  it("pins the combat-level amp at 0.0476", () => {
    const r = supportRole.evaluate(emptyLoadout());
    expect(r.components[0].amps.find(a => a.name === "战斗等级")?.value).toBe(0.0476);
  });

  it("uses vitality factor 2.1 for Paladin and 2.0 otherwise", () => {
    const bard = emptyLoadout();
    const pally = emptyLoadout();
    pally.supportClass = "男/女圣骑士";
    expect(supportRole.evaluate(pally).maxHp!)
      .toBeGreaterThan(supportRole.evaluate(bard).maxHp!);
  });

  it("routes necklace and ring lines to support, earrings to heal", () => {
    const r = supportRole.evaluate(emptyLoadout());
    const supportNames = r.components[0].amps.map(a => a.name);
    const healNames = r.components[1].amps.map(a => a.name);
    expect(supportNames).toContain("项链1");
    expect(supportNames).toContain("戒指1-1");
    expect(supportNames).not.toContain("耳环1-1");
    expect(healNames).toContain("耳环1-1");
    expect(healNames).toContain("耳环2-3");
  });

  it("omits DPS-only amp rows", () => {
    const names = supportRole.evaluate(emptyLoadout()).components[0].amps.map(a => a.name);
    expect(names).not.toContain("武器品质");
    expect(names).not.toContain("飞跃业力");
    expect(names).not.toContain("牧场");
  });

  it("zeroes the Chaos Star core", () => {
    const l = emptyLoadout();
    l.arkCores = [
      { type: "秩序之日", progress: "古代", points: "20P" },
      { type: "秩序之月", progress: "古代", points: "20P" },
      { type: "秩序之星", progress: "古代", points: "20P" },
      { type: "混沌之日", progress: "古代攻击", points: "20P" },
      { type: "混沌之月", progress: "古代炽烈一击", points: "20P" },
      { type: "混沌之星", progress: "古代攻击", points: "20P" },
    ];
    const star = supportRole.evaluate(l).components[0].amps
      .find(a => a.name === "混沌之星");
    expect(star?.value).toBe(0);
  });

  it("computes combat stats over spec+swift only, at 0.0004", () => {
    const l = emptyLoadout();
    l.account.expCrit = 500;   // must NOT count
    l.account.expSpec = 100;
    const amp = supportRole.evaluate(l).components[0].amps
      .find(a => a.name === "战斗特性");
    expect(amp?.value).toBeCloseTo((2160 + 100) * 0.0004, 10);
  });

  it("uses its own card table, not the DPS one", () => {
    const l = emptyLoadout();
    l.cardAwakening = 30;
    const amp = supportRole.evaluate(l).components[0].amps.find(a => a.name === "卡牌");
    expect(amp?.value).toBe(0.21);   // DPS would be 0.15
  });

  it("adds the flat 27722 vitality and the hardcoded 0.17 HP amp", () => {
    const l = emptyLoadout();
    const r = supportRole.evaluate(l);
    // vitality × 2.0 × (1 + lifeActivity) × 1.17 at zero pet HP
    expect(r.maxHp).toBeGreaterThan(27722 * 2 * 1.17 * 0.999);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/support.test.ts`
Expected: FAIL — cannot resolve `../roles/support`.

- [ ] **Step 3: Implement**

```ts
const COMBAT_LEVEL_AMP = 0.0476;
const COMBAT_BASE = 2160;
const SUPPORT_RATE = 0.000124;
const HEAL_RATE = 0.0012;
const VITALITY_FLAT = 27722;
const HP_FIXED_AMP = 0.17;

export const supportVitalityFactor = (job: string): number =>
  job === "男/女圣骑士" ? 2.1 : 2;

/** Same thresholds as DPS, different values — do not reuse dpsCardAmp. */
export function supportCardAmp(awakening: number): number {
  if (awakening >= 30) return 0.21;
  if (awakening >= 24) return 0.12;
  if (awakening >= 18) return 0.06;
  return 0;
}
```

`maxHp`:

```ts
const vitality =
  gearStatTotal(l.gear, "vitality") + accessoryVitalityTotal(l) +
  num(l.account.expVitality) + num(l.bracelet.vitality) + VITALITY_FLAT;

const maxHp =
  (vitality * supportVitalityFactor(l.supportClass) +
    num(l.karmaEvolutionLevel) * 400 +
    accessoryMaxHpFlat + braceletMaxHpFlat) *
  (1 + lifeActivityAmp(l.gear)) *
  (1 + num(l.account.petHp) + HP_FIXED_AMP);
```

Support amp rows, in order (29): `战斗等级, 进化(2-4阶), 顿悟, 飞跃, 进化业力, 刻印效果,
战斗特性, 宝石, 卡牌, 神选英雄武器, 项链1..3, 戒指1-1..3, 戒指2-1..3, 手镯, 秩序之日,
秩序之月, 秩序之星, 混沌之日, 混沌之月, 混沌之星, 烙印力, 我军攻击强化, 我军伤害强化`.

Heal amp rows, in order (9): `刻印, 耳环1-1..3, 耳环2-1..3, 手镯, 乐园宝珠`.

Role-specific coefficients: evolution `0.016`, enlightenment `0.0072`, leap `0.002`,
combat stats `(COMBAT_BASE + expSpec + expSwift + braceletSpecSwift) * 0.0004`,
Ark stones `烙印力 ×0.000875`, `我军攻击强化 ×0.00125`, `我军伤害强化 ×0.0005`
(each via `roundDown(v, 4)`).

Heal-side values use `supportEngravingHealAmp`, `supportBraceletHealAmp`, and the orb heal amp
(`0.013` for 生命大地宝珠, else `0`).

`total = round(supportComponent.score, 2) + round(healComponent.score, 2)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/support.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/lostark/src/calc/roles/support.ts \
        frontend/apps/lostark/src/calc/__tests__/support.test.ts
git commit -m "feat(lostark): support role with summed support and heal components"
```

---

### Task 10: Golden vectors

Proves the whole engine against the reference, which is the point of the phase.

**Files:**
- Create: `frontend/apps/lostark/scripts/harvest-golden.mjs`
- Create: `frontend/apps/lostark/src/calc/__tests__/golden.fixture.json`
- Test: `frontend/apps/lostark/src/calc/__tests__/golden.test.ts`

- [ ] **Step 1: Write the harvest script**

It drives the live reference, writes each loadout into the DOM, reads the rendered score, and
records input + output pairs. It stamps the harvest date and the reference's script `?v=`
version, because a game patch legitimately changes expected values and the fixture must say
which reference it was taken from.

```js
#!/usr/bin/env node
// Harvests golden vectors from the live reference.
// Usage: node scripts/harvest-golden.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const PAGES = {
  dps: "https://lostark-cn.pages.dev/html/dps",
  support: "https://lostark-cn.pages.dev/html/support",
};

/** Deterministic pseudo-random so re-harvests are comparable. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Field groups, keyed by the aria-label prefix or data attribute the reference uses.
 * Verified against the rendered page on 2026-08-01; `discoverFields` below asserts each
 * group still resolves, so a reference redesign fails loudly instead of silently
 * harvesting an all-zero vector.
 */
const GROUPS = {
  gear: ['[aria-label$="精炼"]', '[aria-label$="高阶"]', '[aria-label$="品质"]'],
  accessories: ['[aria-label="主属性"]', '[aria-label="体力"]'],
  gems: ['[aria-label^="T4 "][aria-label$="级数量"]'],
  arkPassive: ['[aria-label="进化"]', '[aria-label="顿悟"]', '[aria-label="飞跃"]'],
  karma: ['[aria-label="进化阶段"]', '[aria-label="顿悟等级"]', '[aria-label="飞跃等级"]'],
  arkStone: ['[aria-label="攻击力"]', '[aria-label="首领伤害"]', '[aria-label="额外伤害"]'],
  roster: ['[aria-label="会心"]', '[aria-label="专长"]', '[aria-label="迅捷"]'],
};

/** Mid-range values per group — chosen to exercise thresholds, not just arithmetic. */
const MID = {
  gear: { 精炼: 15, 高阶: 30, 品质: 70 },   // 高阶 30 crosses the 1.02 multiplier step
  gems: 2,
  arkPassive: 45,                            // above the 40 evolution floor
  karma: 3,
  arkStone: 400,
  accessories: 3000,
  roster: 120,
};

/**
 * Cases: empty, each group alone (isolates one subsystem's contribution), everything at
 * mid-range, everything maxed, plus seeded pseudo-random builds.
 */
const cases = [
  { name: "empty", groups: [] },
  ...Object.keys(GROUPS).map(g => ({ name: `only-${g}`, groups: [g] })),
  { name: "all-mid", groups: Object.keys(GROUPS) },
  { name: "all-max", groups: Object.keys(GROUPS), max: true },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(seed => ({
    name: `random-${seed}`, groups: Object.keys(GROUPS), seed,
  })),
];

/** Mid-range value for a field, by group and its aria-label. */
function groupMidValue(group, label, max) {
  if (group === "gear") {
    for (const [suffix, value] of Object.entries(MID.gear)) {
      if (label.endsWith(suffix)) return max ? Math.min(value, max) : value;
    }
    return 0;
  }
  const value = MID[group] ?? 0;
  return max ? Math.min(value, max) : value;
}

const browser = await chromium.launch();
const out = { harvestedAt: new Date().toISOString(), reference: {}, vectors: [] };

for (const [role, url] of Object.entries(PAGES)) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  out.reference[role] = await page.evaluate(() =>
    [...document.querySelectorAll("script[src]")]
      .map(s => s.src).filter(s => s.includes("calculator.js"))[0] ?? null,
  );

  // Fail loudly if the reference redesigned its inputs, rather than harvesting zeros.
  for (const [group, selectors] of Object.entries(GROUPS)) {
    for (const sel of selectors) {
      if (await page.locator(sel).count() === 0) {
        throw new Error(`group ${group}: selector no longer matches: ${sel}`);
      }
    }
  }

  const scoreSel = role === "dps" ? "#dpsScore" : "#supportScore";

  for (const c of cases) {
    await page.reload({ waitUntil: "networkidle" });
    const rand = c.seed ? mulberry32(c.seed) : null;
    const applied = {};

    for (const group of c.groups) {
      for (const sel of GROUPS[group]) {
        const boxes = page.locator(sel);
        const n = await boxes.count();
        for (let i = 0; i < n; i++) {
          const box = boxes.nth(i);
          const label = (await box.getAttribute("aria-label")) ?? sel;
          const max = Number((await box.getAttribute("max")) ?? 0) || null;
          let value;
          if (c.max) value = max ?? 100;
          else if (rand) value = Math.floor(rand() * ((max ?? 100) + 1));
          else value = groupMidValue(group, label, max);
          await box.fill(String(value));
          await box.dispatchEvent("input");
          applied[`${label}#${i}`] = value;
        }
      }
    }

    const score = await page.textContent(scoreSel);
    out.vectors.push({
      role, name: c.name, seed: c.seed ?? null, inputs: applied,
      score: Number(String(score).replace(/,/g, "")),
    });
  }
  await page.close();
}

await browser.close();
writeFileSync(
  new URL("../src/calc/__tests__/golden.fixture.json", import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(`wrote ${out.vectors.length} vectors`);
```

- [ ] **Step 2: Run the harvest**

Run:
```bash
cd frontend/apps/lostark && node scripts/harvest-golden.mjs
```
Expected: `wrote N vectors`, and `golden.fixture.json` contains a non-empty `vectors` array
plus a `reference` map naming the harvested `calculator.js?v=…` per role.

Sanity-check the fixture before trusting it: the `empty` DPS vector must be `0`, because an
empty loadout has zero main stat contribution from gear at refine 0 with no tier selected.

- [ ] **Step 3: Write the assertion test**

```ts
import { describe, expect, it } from "vitest";
import fixture from "./golden.fixture.json";
import { dpsRole } from "../roles/dps";
import { supportRole } from "../roles/support";
import { loadoutFromInputs } from "./fixtures";

const roles = { dps: dpsRole, support: supportRole };

describe("golden vectors", () => {
  it("has vectors to check", () => {
    expect(fixture.vectors.length).toBeGreaterThan(0);
  });

  for (const v of fixture.vectors) {
    it(`${v.role}/${v.name} matches the reference`, () => {
      const result = roles[v.role as "dps" | "support"]
        .evaluate(loadoutFromInputs(v.role, v.inputs));
      // Reference states ±0.01% tolerance.
      const tolerance = Math.max(0.01, Math.abs(v.score) * 0.0001);
      expect(Math.abs(result.total - v.score)).toBeLessThanOrEqual(tolerance);
    });
  }
});
```

Add `loadoutFromInputs(role, inputs)` to `fixtures.ts`. The harvest records keys as
`"<aria-label>#<index>"` (e.g. `"头饰精炼#0"`, `"T4 6级数量#0"`), so this function starts from
`emptyLoadout()` and maps each label to its `Loadout` field, using the index to pick the slot.
Keep that mapping table in one place — it is the only bridge between the reference's DOM naming
and our domain model, and it is the first thing to check when a vector fails.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run apps/lostark/src/calc/__tests__/golden.test.ts`
Expected: PASS for every vector.

A failure here means a real discrepancy. Diff the itemised `amps` array against the reference's
own amp table (visible in its `#dpsMetrics` block) to find the offending row — this is exactly
why `Result` carries named rows.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/lostark/scripts/harvest-golden.mjs \
        frontend/apps/lostark/src/calc/__tests__/golden.fixture.json \
        frontend/apps/lostark/src/calc/__tests__/golden.test.ts \
        frontend/apps/lostark/src/calc/__tests__/fixtures.ts
git commit -m "test(lostark): golden vectors harvested from the reference"
```

---

### Task 11: Enforce calc purity

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Add the guard script**

Mirroring the existing `check:engine` / `check:shell` guards:

```json
    "check:calc": "grep -rn --include=*.ts --exclude-dir=__tests__ -P \"from ['\\\"]react|i18next|localStorage|import\\.meta\\.env|document\\.|window\\.|fetch\\(\" apps/lostark/src/calc && exit 1 || exit 0",
```

- [ ] **Step 2: Verify it passes on clean code**

Run: `cd frontend && pnpm check:calc`
Expected: exit 0, no output.

- [ ] **Step 3: Verify it actually catches a violation**

A guard that never fires is not a guard.

```bash
cd frontend
printf '\nexport const bad = localStorage.getItem("x");\n' >> apps/lostark/src/calc/num.ts
pnpm check:calc; echo "exit=$?"      # expect a match printed and exit=1
git checkout apps/lostark/src/calc/num.ts
pnpm check:calc; echo "exit=$?"      # expect exit=0
```

- [ ] **Step 4: Run the whole suite**

Run: `cd frontend && pnpm test && pnpm build:lostark && pnpm lint:lostark`
Expected: all vitest suites pass, `tsc -b` clean, eslint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json
git commit -m "chore(lostark): enforce calc-layer purity with check:calc"
```

---

## Phase exit criteria

- [ ] `pnpm test` green, including every golden vector
- [ ] `pnpm build:lostark` and `pnpm lint:lostark` clean
- [ ] `pnpm check:calc` exits 0, and is proven to exit 1 on a planted violation
- [ ] `golden.fixture.json` records `harvestedAt` and the reference `calculator.js?v=` per role
- [ ] No `changelog.json` entry yet — nothing user-visible ships in this phase

## Deliberately deferred to phase 2/3

Form sections, sticky score rail, composition panel, tab switch, mobile gear rows, autosave,
JSON export/import, e2e, changelog entry, `meta` site link.

**Spec guards that land in phase 2, not here.** The spec lists four validation guards. Three are
engine-layer and are covered above: the NaN floor (Task 2), the evolution floor (Task 8), and
range clamps (`clampInt` in Task 2, `clampT45Refine` in Task 5). The fourth — the **11-gem
total cap**, enforced by clamping the *last-changed* field — is input-editing behaviour that
needs the form to know which field the user just touched. It has no meaning in a pure
`Loadout → Result` function, so it belongs with the gem section in phase 2. Phase 1's engine
must therefore tolerate an over-cap gem count arithmetically rather than throwing.
