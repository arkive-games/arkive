# AION2 Mobile Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all six aion2 routes usable on a 390px-wide phone — full-width map with bottom-sheet
controls, a bottom tab bar replacing the overflowing desktop top bar, and reachable
language/theme/contact controls — without changing any `md+` (≥768px) layout.

**Architecture:** Port the palworld mobile layer as per-app aion2 components, reusing the shared
primitives that already ship: `useIsMobile()` and `Sheet` from `@gamemap/ui`, `SearchPanel`'s
`variant="inline"` from `@gamemap/map-shell`. The desktop top bar is hidden below `md` via a CSS
class; the map swaps to a full-screen branch via the `useIsMobile()` hook (CSS alone cannot
*replace* the 346px sidebar with sheets). Shared packages are not modified — they are
contractually free of i18n, router and storage access.

**Tech Stack:** React 19, TypeScript, Vite (rolldown), Tailwind CSS v4, TanStack Router,
react-i18next (YAML locales over HTTP), Leaflet via `@gamemap/map-engine`, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-07-28-aion2-mobile-compatibility-design.md`

---

## Orientation for the implementer

Read this once before Task 1.

**Where things are.** Everything you touch lives under `frontend/apps/aion2/`. Run all commands
from `frontend/apps/aion2` unless a step says otherwise. The monorepo root is
`E:\arkive-games\arkive`; the frontend pnpm workspace root is `E:\arkive-games\arkive\frontend`.

**Dev server.** `pnpm dev` serves aion2 on **port 15173** (fixed in `vite.config.ts`). A server may
already be running — probe first with
`curl -s -o /dev/null -w "%{http_code}" http://localhost:15173` and only start one if that prints
`000`.

**e2e.** `pnpm e2e` runs Playwright. The config defaults to port **5173**, which on this machine
often already holds an unrelated app or a palworld server — **always pass `E2E_PORT=15173`**:

```bash
E2E_PORT=15173 pnpm e2e
```

`reuseExistingServer: true`, so an already-running dev server on that port is reused.

**One pre-existing failure. Do not try to fix it, and do not let it mask yours.** Capture the
baseline before touching anything, and **run it at least twice** — one run is not enough to
characterise this suite:

```bash
E2E_PORT=15173 pnpm e2e 2>&1 | tail -30
E2E_PORT=15173 pnpm e2e 2>&1 | tail -30
```

Expected: **25 passed, 1 failed** — the failure being `wiki.spec.ts` → "quest page embedded map
shows only POI pins" (renders 0 marker icons). Measured 3/3 on pristine `7bf9529`, and it fails
3/3 in isolation too. A single cold-cache run was once observed passing 26/26; that is the
outlier, so do not conclude the suite is green from one run. Any *other* failure is yours.

**The breakpoint.** Mobile is `< 768px`. In CSS that is the *absence* of a `md:` prefix — write the
mobile style bare and the desktop style with `md:`. In TS it is `useIsMobile()` from `@gamemap/ui`,
which reads `matchMedia('(max-width: 767px)')` synchronously on first render.

**Typography rule (workspace-wide, enforced in review).** Never hard-code a font size — no
`text-[13px]`, no `font-size: 11px`. Only Tailwind scale steps (`text-xs` … `text-3xl`). `text-xs`
is the floor for in-content text. Padding, gap and width values in px/rem are fine; only *font
sizes* are restricted.

**Translations.** Never invent a translation. Every string below is copied verbatim from an
existing table in this monorepo (aion2's own `common.yaml`, or palworld's `MORE_LABELS` /
`breedingStrings.navMap`). The four locales are `en-US`, `zh-CN`, `zh-TW`, `ko-KR`.

**CJK editing hazard.** Some file tools NFC-normalize CJK codepoints. When you add the Chinese and
Korean YAML values in Task 3, append them with the provided Python script (which opens files with
an explicit `utf-8` encoding) rather than retyping them by hand, and verify with the readback step.

**Commits must be signed.** `commit.gpgsign=true` is configured, so a plain `git commit` signs.
Never pass `--no-gpg-sign`. Verify with `git log -1 --format='%G?'` → must print `G`.

**Stage explicit paths.** Never `git add -A` or `git add .` — the user edits files in this repo
concurrently. Always `git add <exact paths>`.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `index.html` | viewport meta — enable `env(safe-area-inset-*)` | 1 |
| `src/routes/wiki/route.tsx` | wiki layout shell: `h-dvh`, mobile header, footer clearance | 1, 5 |
| `public/locales/*/common.yaml` | `mobileNav` label block ×4 locales | 3 |
| `src/components/BottomTabBar.tsx` **(new)** | mobile navigation: 4 tabs + More sheet | 3 |
| `src/routes/__root.tsx` | mounts `BottomTabBar` once for every route | 3 |
| `src/components/TopNavbar.tsx` | desktop top bar — hidden below `md` | 4 |
| `src/features/map/sidebar/MarkerTypesSection.tsx` **(new)** | the marker-types header + panel, shared by sidebar and sheet | 6 |
| `src/features/map/sidebar/Sidebar.tsx` | desktop sidebar — consumes the extracted section | 6 |
| `src/features/map/MapRoute.tsx` | map route: adds the mobile full-screen branch | 7 |
| `src/features/wiki/TypeHub.tsx` | type-hub chips — touch-sized below `md` | 8 |
| `e2e/mobile.spec.ts` **(new)** | all mobile assertions + desktop regression | 1,3,4,5,7,8 |

`MarkerTypesSection` exists so the desktop sidebar and the mobile filter sheet render one source
instead of two copies that can drift. `BottomTabBar` stays in the app (not `map-shell`) because it
needs i18n, the router and theme context, all three of which `map-shell` forbids.

---

## Task 1: Viewport meta, `h-dvh`, and the mobile e2e harness

Two one-line hygiene fixes, plus the spec file that later tasks extend.

**Files:**
- Modify: `frontend/apps/aion2/index.html:6`
- Modify: `frontend/apps/aion2/src/routes/wiki/route.tsx:7`
- Create: `frontend/apps/aion2/e2e/mobile.spec.ts`

- [ ] **Step 1: Capture the e2e baseline before changing anything**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e 2>&1 | tail -30
```

Expected: **25 passed, 1 failed (embedded map POI)**. This is your comparison point for every
later task: "same as baseline" below always means *that one failure and no other*.

- [ ] **Step 2: Write the failing test**

Create `frontend/apps/aion2/e2e/mobile.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test.describe("mobile chrome", () => {
  test.use({ viewport: PHONE });

  test("viewport meta opts into the safe area", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    const content = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(content).toContain("viewport-fit=cover");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: FAIL — `expect(received).toContain("viewport-fit=cover")` because the current content is
`width=device-width, initial-scale=1.0`.

- [ ] **Step 4: Add `viewport-fit=cover`**

In `frontend/apps/aion2/index.html`, replace line 6:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
```

with:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (1 passed).

- [ ] **Step 6: Switch the wiki shell from `h-screen` to `h-dvh`**

In `frontend/apps/aion2/src/routes/wiki/route.tsx`, line 7 currently reads:

```tsx
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
```

Change `h-screen` to `h-dvh`:

```tsx
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
```

`100vh` on mobile browsers includes the retracting URL bar, so the bottom of the page sits under
browser chrome; `100dvh` tracks the visible viewport. Headless Chromium cannot distinguish the two
(there is no dynamic chrome), so there is no meaningful automated assertion for this — the
guarantee is the code change plus the existing suite not regressing.

- [ ] **Step 7: Verify no regression**

```bash
E2E_PORT=15173 pnpm e2e 2>&1 | tail -30
```

Expected: 26 passed (25 + the new `mobile.spec.ts` test), still 1 failed (embedded map POI).

- [ ] **Step 8: Commit**

```bash
cd ../../..
git add frontend/apps/aion2/index.html \
        frontend/apps/aion2/src/routes/wiki/route.tsx \
        frontend/apps/aion2/e2e/mobile.spec.ts
git commit -m "fix(aion2): viewport-fit=cover and h-dvh for the wiki shell

Only app of the three missing viewport-fit, so env(safe-area-inset-*)
resolved to 0 and the bottom tab bar (next commit) could not clear a
notch. h-screen (100vh) let mobile browser chrome clip the wiki page."
git log -1 --format='%G?'
```

Expected: `G` (good signature).

---

## Task 2: Verify the audit numbers are reproducible

No production code. This locks in the *defects* as tests so later tasks prove they are fixed. Two
of these tests must FAIL at the end of this task and stay failing until Tasks 4 and 7 — mark them
`test.fail()` so the suite stays green and flips loudly when fixed.

**Files:**
- Modify: `frontend/apps/aion2/e2e/mobile.spec.ts`

- [ ] **Step 1: Add the two defect tests**

Append inside the existing `test.describe("mobile chrome", …)` block in
`frontend/apps/aion2/e2e/mobile.spec.ts`:

```ts
  // Fixed by the "hide desktop top bar below md" task. Until then the bar
  // measures ~518px in a 390px viewport and the lang/theme/contact buttons sit
  // outside the viewport entirely.
  test.fail("KNOWN DEFECT: top bar overflows the viewport", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    // The bar only reaches its overflowing width once the i18n strings have
    // arrived over HTTP — measuring right after goto sees a still-empty bar.
    await page
      .locator('header a[href="https://archive.tc-imba.com/"]')
      .waitFor({ state: "attached" });
    const overflow = await page.evaluate(() => {
      const h = document.querySelector("header");
      return h ? h.scrollWidth - h.clientWidth : 0;
    });
    expect(overflow).toBe(0);
  });

  // Fixed by the "mobile map branch" task. Until then the 346px sidebar leaves
  // the Leaflet container ~44px wide.
  test.fail("KNOWN DEFECT: map is a sliver next to the sidebar", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    const el = page.locator(".leaflet-container");
    await el.waitFor({ state: "visible" });
    const box = await el.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(380);
  });
```

- [ ] **Step 2: Run and confirm both are red-but-expected**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: 3 passed. The two `test.fail` tests count as passing *because* they fail — Playwright
inverts them. If either reports "expected to fail but passed", do NOT assume the defect is gone:
first check you are not measuring before the page finished loading (this exact trap cost a cycle —
the top bar is narrow until its i18n strings arrive, hence the explicit `waitFor` above). Only
after ruling that out should you re-audit.

- [ ] **Step 3: Commit**

```bash
cd ../../..
git add frontend/apps/aion2/e2e/mobile.spec.ts
git commit -m "test(aion2): pin the two measured mobile defects as test.fail

Top bar overflows 390->518px so lang/theme/contact are off-screen, and
the map renders ~44px wide beside the 346px sidebar. Both flip to real
assertions when the corresponding fix lands."
git log -1 --format='%G?'
```

---

## Task 3: Bottom tab bar + More sheet

**Files:**
- Modify: `frontend/apps/aion2/public/locales/en-US/common.yaml`
- Modify: `frontend/apps/aion2/public/locales/zh-CN/common.yaml`
- Modify: `frontend/apps/aion2/public/locales/zh-TW/common.yaml`
- Modify: `frontend/apps/aion2/public/locales/ko-KR/common.yaml`
- Create: `frontend/apps/aion2/src/components/BottomTabBar.tsx`
- Modify: `frontend/apps/aion2/src/routes/__root.tsx`
- Modify: `frontend/apps/aion2/e2e/mobile.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/apps/aion2/e2e/mobile.spec.ts`, inside the `mobile chrome` describe:

```ts
  test("bottom tab bar navigates and marks the active tab", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    const bar = page.getByTestId("bottom-tab-bar");
    await expect(bar).toBeVisible();

    await page.getByTestId("tab-quest").click();
    await expect(page).toHaveURL(/\/wiki\/quest/);
    await expect(page.getByTestId("tab-quest")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("language and theme are reachable in the More sheet", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    await page.getByTestId("tab-more").click();
    const sheet = page.getByTestId("more-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("more-lang-zh-CN")).toBeVisible();
    await expect(sheet.getByTestId("more-theme-dark")).toBeVisible();
    await expect(sheet.getByTestId("more-archive")).toBeVisible();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: FAIL — both new tests time out waiting for `bottom-tab-bar`, which does not exist yet.

- [ ] **Step 3: Add the `mobileNav` labels to all four locales**

Run this from the monorepo root (`E:\arkive-games\arkive`). It appends the block with an explicit
UTF-8 encoding so the CJK and Hangul values are written byte-exact:

```bash
python - <<'PY'
import io

BLOCKS = {
 'en-US': 'map: "Map"\n  quest: "Quests"\n  npc: "NPCs"\n  item: "Items"\n  wiki: "Wiki"\n  more: "More"\n',
 'zh-CN': 'map: "\u5730\u56fe"\n  quest: "\u4efb\u52a1"\n  npc: "NPC"\n  item: "\u7269\u54c1"\n  wiki: "Wiki"\n  more: "\u66f4\u591a"\n',
 'zh-TW': 'map: "\u5730\u5716"\n  quest: "\u4efb\u52d9"\n  npc: "NPC"\n  item: "\u7269\u54c1"\n  wiki: "Wiki"\n  more: "\u66f4\u591a"\n',
 'ko-KR': 'map: "\uc9c0\ub3c4"\n  quest: "\ud035\uc2a4\ud2b8"\n  npc: "NPC"\n  item: "\uc544\uc774\ud15c"\n  wiki: "Wiki"\n  more: "\ub354\ubcf4\uae30"\n',
}

for lng, body in BLOCKS.items():
    p = f'frontend/apps/aion2/public/locales/{lng}/common.yaml'
    s = io.open(p, encoding='utf-8').read()
    if 'mobileNav:' in s:
        print(f'{lng}: already present, skipped')
        continue
    if not s.endswith('\n'):
        s += '\n'
    s += '\n# Bottom-tab-bar labels (mobile only). Short forms on purpose: five\n'
    s += '# tabs share a 390px bar. Values reuse the strings already approved\n'
    s += '# elsewhere in the platform - do not invent new translations here.\nmobileNav:\n  '
    s += body
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print(f'{lng}: appended')
PY
```

- [ ] **Step 4: Read the values back to confirm the CJK survived**

```bash
python - <<'PY'
import io
for lng in ['en-US','zh-CN','zh-TW','ko-KR']:
    s = io.open(f'frontend/apps/aion2/public/locales/{lng}/common.yaml', encoding='utf-8').read()
    blk = s[s.find('mobileNav:'):]
    io.open('_check.txt', 'a', encoding='utf-8').write(f'--- {lng}\n{blk}\n')
PY
cat _check.txt && rm _check.txt
```

Expected — exactly these values (the terminal may render CJK as mojibake; the file content is what
matters, so compare via this file readback, not console echo):

| locale | map | quest | npc | item | more |
| --- | --- | --- | --- | --- | --- |
| en-US | Map | Quests | NPCs | Items | More |
| zh-CN | 地图 | 任务 | NPC | 物品 | 更多 |
| zh-TW | 地圖 | 任務 | NPC | 物品 | 更多 |
| ko-KR | 지도 | 퀘스트 | NPC | 아이템 | 더보기 |

- [ ] **Step 5: Create the BottomTabBar component**

Create `frontend/apps/aion2/src/components/BottomTabBar.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Map as MapIcon,
  Menu,
  Package,
  ScrollText,
  Users,
} from "lucide-react";
import {
  cn,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@gamemap/ui";
import { useTheme, type Theme } from "@/context/ThemeContext";
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "@/i18n";

// Same archive entry the desktop top bar links to; on mobile that notice is not
// rendered, so the link lives in the More sheet instead.
const ARCHIVE_URL = "https://archive.tc-imba.com/";
// "abyss" is intentionally absent, matching TopNavbar.
const THEME_OPTIONS: Theme[] = ["auto", "light", "dark"];

/** The three wiki type slugs, in tab order. Confirmed against data/wiki/taxonomy.json. */
const WIKI_TABS = [
  { type: "quest", labelKey: "common:mobileNav.quest", icon: ScrollText },
  { type: "npc", labelKey: "common:mobileNav.npc", icon: Users },
  { type: "item", labelKey: "common:mobileNav.item", icon: Package },
] as const;

type ActiveTab = "map" | "quest" | "npc" | "item" | "more";

/**
 * Which tab owns the current path. Bare `/wiki` and any wiki path that is not
 * one of the three typed tabs resolve to "more", because Wiki home lives in the
 * More sheet — that keeps exactly one tab highlighted at all times.
 */
export function activeTab(pathname: string): ActiveTab {
  if (pathname.startsWith("/wiki/quest")) return "quest";
  if (pathname.startsWith("/wiki/npc")) return "npc";
  if (pathname.startsWith("/wiki/item")) return "item";
  if (pathname.startsWith("/wiki")) return "more";
  return "map";
}

export default function BottomTabBar() {
  const { t } = useTranslation(["common"]);
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();
  const active = activeTab(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const currentLng = i18n.resolvedLanguage ?? i18n.language;

  // A tap that navigates must not leave the sheet covering the destination.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const itemCls = (isActive: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition-colors",
      isActive ? "text-primary" : "text-muted-foreground",
    );

  return (
    <>
      <nav
        data-testid="bottom-tab-bar"
        className="fixed inset-x-0 bottom-0 z-[2500] flex border-t border-border bg-card text-card-foreground md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Link
          to="/"
          data-testid="tab-map"
          data-active={active === "map"}
          className={itemCls(active === "map")}
        >
          <MapIcon className="size-5" />
          <span className="max-w-full truncate px-0.5">
            {t("common:mobileNav.map")}
          </span>
        </Link>

        {WIKI_TABS.map(({ type, labelKey, icon: Icon }) => (
          <Link
            key={type}
            to="/wiki/$type"
            params={{ type }}
            data-testid={`tab-${type}`}
            data-active={active === type}
            className={itemCls(active === type)}
          >
            <Icon className="size-5" />
            <span className="max-w-full truncate px-0.5">{t(labelKey)}</span>
          </Link>
        ))}

        <button
          type="button"
          data-testid="tab-more"
          data-active={active === "more"}
          aria-label={t("common:mobileNav.more")}
          onClick={() => setMoreOpen(true)}
          className={itemCls(active === "more")}
        >
          <Menu className="size-5" />
          <span className="px-0.5">{t("common:mobileNav.more")}</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          data-testid="more-sheet"
          className="max-h-[85dvh] overflow-y-auto"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <SheetHeader>
            <SheetTitle>{t("common:mobileNav.more")}</SheetTitle>
          </SheetHeader>

          <Link
            to="/wiki"
            data-testid="more-wiki"
            onClick={() => setMoreOpen(false)}
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium"
          >
            <BookOpen className="size-5" />
            {t("common:mobileNav.wiki")}
          </Link>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {t("common:menu.switchLanguage", "Switch language")}
            </div>
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_LANGUAGES.map((code) => (
                <button
                  key={code}
                  type="button"
                  data-testid={`more-lang-${code}`}
                  onClick={() => void i18n.changeLanguage(code)}
                  className={cn(
                    "min-h-9 rounded px-3 py-1.5 text-sm",
                    currentLng === code
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {LANGUAGE_LABELS[code]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {t("common:menu.switchTheme", "Switch theme")}
            </div>
            <div className="flex flex-wrap gap-1">
              {THEME_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`more-theme-${value}`}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "min-h-9 rounded px-3 py-1.5 text-sm",
                    theme === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {t(`common:theme.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {t("common:rightSidebar.contact.title", "Communication & Contact")}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm [&_a]:text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {t("common:rightSidebar.contact.content")}
              </ReactMarkdown>
            </div>
            <a
              href={ARCHIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="more-archive"
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              {ARCHIVE_URL}
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 6: Mount it once in the root route**

Replace the whole of `frontend/apps/aion2/src/routes/__root.tsx` with:

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/context/ThemeContext";
import { GameMapProvider } from "@/context/GameMapContext";
import { MarkersProvider } from "@/context/MarkersContext";
import { GameDataProvider } from "@/context/GameDataContext";
import { ThemeMapBridge } from "@/context/ThemeMapBridge";
import BottomTabBar from "@/components/BottomTabBar";

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider>
      <GameMapProvider>
        <ThemeMapBridge />
        <MarkersProvider>
          <GameDataProvider>
            <Outlet />
            {/* Mobile-only (md:hidden inside). Mounted here so one instance
                serves every route — map and wiki alike. */}
            <BottomTabBar />
          </GameDataProvider>
        </MarkersProvider>
      </GameMapProvider>
    </ThemeProvider>
  ),
});
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (5 passed — the 3 from Tasks 1-2 plus the 2 new ones).

- [ ] **Step 8: Verify the desktop is untouched**

```bash
E2E_PORT=15173 pnpm e2e 2>&1 | tail -30
```

Expected: baseline failure only. The tab bar is `md:hidden`, so no desktop test should notice it.

- [ ] **Step 9: Commit**

```bash
cd ../../..
git add frontend/apps/aion2/src/components/BottomTabBar.tsx \
        frontend/apps/aion2/src/routes/__root.tsx \
        frontend/apps/aion2/public/locales/en-US/common.yaml \
        frontend/apps/aion2/public/locales/zh-CN/common.yaml \
        frontend/apps/aion2/public/locales/zh-TW/common.yaml \
        frontend/apps/aion2/public/locales/ko-KR/common.yaml \
        frontend/apps/aion2/e2e/mobile.spec.ts
git commit -m "feat(aion2): mobile bottom tab bar with More sheet

Map / Quests / NPCs / Items, plus a More sheet carrying Wiki home, the
language switcher, the theme switcher, contact and the archive link --
i.e. everything the desktop top bar holds that the four tabs do not.
Mounted in __root so one instance covers the map and the wiki.

Labels reuse strings already approved in the platform (aion2's own
globalSearch group labels, palworld's MORE_LABELS and navMap); nothing
was newly translated."
git log -1 --format='%G?'
```

---

## Task 4: Hide the desktop top bar below `md`

This is the fix for the unreachable language/theme/contact buttons.

**Files:**
- Modify: `frontend/apps/aion2/src/components/TopNavbar.tsx:34`
- Modify: `frontend/apps/aion2/e2e/mobile.spec.ts`

- [ ] **Step 1: Flip the known-defect test to a real assertion**

In `frontend/apps/aion2/e2e/mobile.spec.ts`, find the `test.fail("KNOWN DEFECT: top bar overflows
the viewport", …)` block and replace it entirely with:

```ts
  test("desktop top bar is not rendered on phones", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    // The overflowing 518px-wide bar is gone; the mobile header (added with the
    // wiki shell) and the bottom tab bar navigate instead.
    await expect(page.getByTestId("desktop-topbar")).toBeHidden();
    const scrollW = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollW).toBe(390);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: FAIL — no element has `data-testid="desktop-topbar"` yet, so `getByTestId` never
resolves and `toBeHidden()` times out.

- [ ] **Step 3: Hide the bar below `md` and give it a testid**

In `frontend/apps/aion2/src/components/TopNavbar.tsx`, the `ShellTopBar` call currently starts:

```tsx
    <ShellTopBar
      classNames={{
        root: "bg-topnavbar text-foreground",
        right: "text-[#3D3D3D] dark:text-white/85",
      }}
```

Change the `root` class to hide it below `md`. `ShellTopBar`'s own base class is `flex h-12 …`, so
the override must restore `flex` at `md`:

```tsx
    <ShellTopBar
      classNames={{
        root: "hidden bg-topnavbar text-foreground md:flex",
        right: "text-[#3D3D3D] dark:text-white/85",
      }}
```

`ShellTopBar` does not forward arbitrary DOM props, so the testid goes on the `leftSlot` content
instead. Wrap the existing `leftSlot` fragment in a `<div>` carrying it — replace the `leftSlot`
opening `<>` and closing `</>` with:

```tsx
      leftSlot={
        <div
          data-testid="desktop-topbar"
          className="flex items-center gap-6"
        >
```

...and the matching close:

```tsx
        </div>
      }
```

Leave every child inside (the AION2 link, the Wiki link, the archive notice div) exactly as it is.

- [ ] **Step 4: Run the test to verify it passes**

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (5 passed). `toBeHidden()` succeeds because the `hidden` class means the ancestor
`header` has `display: none` at 390px.

- [ ] **Step 5: Add and run the desktop regression guard**

Append a new describe block at the end of `frontend/apps/aion2/e2e/mobile.spec.ts`:

```ts
test.describe("desktop is unchanged", () => {
  test.use({ viewport: DESKTOP });

  test("top bar shows, tab bar does not", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    await expect(page.getByTestId("desktop-topbar")).toBeVisible();
    await expect(page.getByTestId("bottom-tab-bar")).toBeHidden();
    await expect(page.getByTestId("lang-menu")).toBeVisible();
    await expect(page.getByTestId("theme-menu")).toBeVisible();
  });
});
```

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (6 passed).

- [ ] **Step 6: Full suite**

```bash
E2E_PORT=15173 pnpm e2e 2>&1 | tail -30
```

Expected: the embedded-map POI failure only — no others.

- [ ] **Step 7: Commit**

```bash
cd ../../..
git add frontend/apps/aion2/src/components/TopNavbar.tsx \
        frontend/apps/aion2/e2e/mobile.spec.ts
git commit -m "fix(aion2): hide the desktop top bar below md

Measured at 390px the bar's scrollWidth was 518px, putting lang-menu,
theme-menu and contact-menu entirely outside the viewport with no way to
reach them -- language and theme were simply unavailable on a phone. The
bottom tab bar's More sheet now carries those controls, so below md the
desktop bar (including the 106px-tall archive notice that overflowed the
h-12 header) stops rendering."
git log -1 --format='%G?'
```

---

## Task 5: Wiki mobile header + footer clearance

With the desktop bar hidden, wiki pages need a compact header for branding and global search, and
the page bottom must clear the fixed tab bar.

**Files:**
- Modify: `frontend/apps/aion2/src/routes/wiki/route.tsx`
- Modify: `frontend/apps/aion2/e2e/mobile.spec.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `mobile chrome` describe in `frontend/apps/aion2/e2e/mobile.spec.ts`:

```ts
  test("wiki pages get a compact header and clear the tab bar", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    await expect(page.getByTestId("wiki-mobile-header")).toBeVisible();
    // Global search must stay reachable now that the desktop bar is hidden.
    await page.getByTestId("global-search-button").click();
    await expect(page.getByPlaceholder(/Search quests/i)).toBeVisible();
    await page.keyboard.press("Escape");

    // The footer is the last element in the scroll column, so it carries the
    // clearance for the fixed 56px tab bar.
    const pad = await page.evaluate(() => {
      const f = document.querySelector("footer");
      return f ? parseFloat(getComputedStyle(f).paddingBottom) : 0;
    });
    expect(pad).toBeGreaterThanOrEqual(64);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: FAIL — `wiki-mobile-header` does not exist.

- [ ] **Step 3: Add the mobile header and footer padding**

Replace the whole of `frontend/apps/aion2/src/routes/wiki/route.tsx` with:

```tsx
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { SiteFooter } from "@gamemap/ui";

import TopNavbar from "@/components/TopNavbar";
import GlobalSearchWidget from "@/components/GlobalSearchWidget";

export const Route = createFileRoute("/wiki")({
  component: () => (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopNavbar />
      {/* Mobile-only utility bar. Deliberately NOT a page title: every wiki
          page already renders its own <h1>, so a title here would duplicate
          it and would have to be threaded through the router. */}
      <header
        data-testid="wiki-mobile-header"
        className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-topnavbar px-4 md:hidden"
      >
        <Link
          to="/"
          className="text-lg font-bold tracking-tight text-[#2E97FF] select-none"
        >
          AION2
        </Link>
        <GlobalSearchWidget />
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            <Outlet />
          </div>
          {/* Last element in the scroll column, so its bottom padding is what
              lifts content clear of the fixed bottom tab bar + safe area. */}
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
            homeUrl={import.meta.env.VITE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
          />
        </div>
      </main>
    </div>
  ),
});
```

- [ ] **Step 4: Sanity-check the `SiteFooter` prop**

`SiteFooter` already extends `React.ComponentProps<"footer">` and merges `className` into the root
`<footer>` via `cn()` (verified in `packages/ui/src/site-footer.tsx:20-28`), so no package change is
needed. Confirm nothing has shifted:

```bash
grep -n "className" ../../packages/ui/src/site-footer.tsx | head -4
```

Expected: a `className` destructured from props and passed through `cn(...)` on the `<footer>`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (7 passed).

- [ ] **Step 6: Full suite**

```bash
E2E_PORT=15173 pnpm e2e 2>&1 | tail -30
```

Expected: the embedded-map POI failure only — no others.

- [ ] **Step 7: Commit**

```bash
cd ../../..
git add frontend/apps/aion2/src/routes/wiki/route.tsx \
        frontend/apps/aion2/e2e/mobile.spec.ts
git commit -m "feat(aion2): compact mobile header on wiki pages

With the desktop bar hidden below md, wiki pages need branding and a
route back to the map, and global search has to stay reachable. Not a
page title -- each wiki page already renders its own h1. The footer
carries the bottom padding that lifts content clear of the tab bar."
git log -1 --format='%G?'
```

---

## Task 6: Extract `MarkerTypesSection`

Pure refactor with no behaviour change, so the mobile filter sheet in Task 7 and the desktop
sidebar render one source.

**Files:**
- Create: `frontend/apps/aion2/src/features/map/sidebar/MarkerTypesSection.tsx`
- Modify: `frontend/apps/aion2/src/features/map/sidebar/Sidebar.tsx`

- [ ] **Step 1: Write the failing test**

Append a test to the `desktop is unchanged` describe in
`frontend/apps/aion2/e2e/mobile.spec.ts`:

```ts
  test("sidebar still renders the marker-types section", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    await expect(page.getByTestId("marker-types-section")).toBeVisible();
    await expect(page.getByTestId("show-names-toggle")).toBeVisible();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: FAIL — `marker-types-section` does not exist yet.

- [ ] **Step 3: Create the extracted component**

Create `frontend/apps/aion2/src/features/map/sidebar/MarkerTypesSection.tsx`. This is verbatim the
block currently inlined in `Sidebar.tsx` lines 42-55, with the `selectedMap` guard moved inside and
a testid added:

```tsx
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useGameMap } from "@/context/GameMapContext";
import MarkerTypes from "./MarkerTypes";

/**
 * The "Marker Types" heading plus the filter panel. Rendered by the desktop
 * sidebar AND by the mobile filter sheet, so the two cannot drift apart.
 * Returns null until a map is selected (the counts come from its markers).
 */
export default function MarkerTypesSection() {
  const { t } = useTranslation(["common"]);
  const { selectedMap } = useGameMap();

  if (!selectedMap) return null;

  return (
    <div className="w-full" data-testid="marker-types-section">
      {/* Static section header — no longer collapsible. */}
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-4 w-4 items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 fill-primary text-primary" />
        </span>
        <span className="truncate text-base font-bold leading-[16px]">
          {t("common:menu.markerTypes", "Marker Types")}
        </span>
      </div>
      <MarkerTypes />
    </div>
  );
}
```

- [ ] **Step 4: Consume it from the sidebar**

Replace the whole of `frontend/apps/aion2/src/features/map/sidebar/Sidebar.tsx` with:

```tsx
import { useTranslation } from "react-i18next";
import { ShellSidebar } from "@gamemap/map-shell";
import { useTheme } from "@/context/ThemeContext";
import { getStaticUrl } from "@/lib/url";
import Logo from "./Logo";
import SelectMap from "./SelectMap";
import MarkerTypesSection from "./MarkerTypesSection";

export default function Sidebar() {
  const { t } = useTranslation(["common"]);
  const { realTheme } = useTheme();

  const isLight = realTheme === "light";
  const bgUrl = getStaticUrl(
    isLight ? "images/Sidebar_Light.webp" : "images/Sidebar_Dark.webp",
  );

  return (
    <ShellSidebar
      collapseLabel={t("common:menu.collapse", "Collapse")}
      expandLabel={t("common:menu.expand", "Expand")}
      classNames={{
        root: "text-foreground bg-[image:var(--background-image-sidebar)]",
        collapseButton: "text-[#3D3D3D] bg-[color:var(--color-sidebar-collapse)]",
      }}
      backgroundSlot={
        <div
          className="pointer-events-none absolute inset-0 bg-no-repeat opacity-70"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: "346px auto",
            backgroundPosition: "top left",
          }}
        />
      }
      headerSlot={<Logo />}
      mapSelectorSlot={<SelectMap />}
    >
      <MarkerTypesSection />
    </ShellSidebar>
  );
}
```

Note `useGameMap` and `Sparkles` are no longer imported here — they moved into
`MarkerTypesSection`. Leaving them would fail `pnpm lint`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (8 passed).

- [ ] **Step 6: Lint and typecheck**

```bash
pnpm lint && pnpm exec tsc -b --noEmit
```

Expected: no errors. Unused-import errors here mean Step 4 was applied incompletely.

- [ ] **Step 7: Commit**

```bash
cd ../../..
git add frontend/apps/aion2/src/features/map/sidebar/MarkerTypesSection.tsx \
        frontend/apps/aion2/src/features/map/sidebar/Sidebar.tsx \
        frontend/apps/aion2/e2e/mobile.spec.ts
git commit -m "refactor(aion2): extract MarkerTypesSection from the sidebar

No behaviour change. The mobile filter sheet needs the same heading +
filter panel the desktop sidebar renders; sharing one component keeps
the two from drifting."
git log -1 --format='%G?'
```

---

## Task 7: Mobile map branch

The headline fix: a full-width map with the filters and search in bottom sheets.

**Files:**
- Modify: `frontend/apps/aion2/src/features/map/MapRoute.tsx`
- Modify: `frontend/apps/aion2/e2e/mobile.spec.ts`

- [ ] **Step 1: Flip the known-defect test and add the sheet tests**

In `frontend/apps/aion2/e2e/mobile.spec.ts`, replace the whole
`test.fail("KNOWN DEFECT: map is a sliver next to the sidebar", …)` block with:

```ts
  test("map fills the viewport width", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    const el = page.locator(".leaflet-container");
    await el.waitFor({ state: "visible" });
    const box = await el.boundingBox();
    // Was ~44px, squeezed beside the 346px desktop sidebar.
    expect(box!.width).toBeGreaterThanOrEqual(380);
    await expect(page.getByTestId("marker-types-section")).toBeHidden();
  });

  test("filter and search sheets open from their FABs", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    await page.locator(".leaflet-container").waitFor({ state: "visible" });

    await page.getByTestId("map-fab-filter").click();
    const filterSheet = page.getByTestId("filter-sheet");
    await expect(filterSheet).toBeVisible();
    // The shared section, and a control from it, are both inside the sheet.
    await expect(filterSheet.getByTestId("marker-types-section")).toBeVisible();
    await expect(filterSheet.getByTestId("show-names-toggle")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(filterSheet).toBeHidden();

    await page.getByTestId("map-fab-search").click();
    const searchSheet = page.getByTestId("search-sheet");
    await expect(searchSheet).toBeVisible();
    // Searching must still work from inside the sheet, not just render.
    await searchSheet.getByTestId("marker-search").fill("a");
    await expect(searchSheet.getByTestId("search-results")).toBeVisible();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: FAIL — the map is still ~44px wide and there are no FABs.

- [ ] **Step 3: Add the mobile branch to `MapRoute`**

In `frontend/apps/aion2/src/features/map/MapRoute.tsx`:

**3a.** Extend the imports. Replace the `@gamemap/map-shell` import block and add two more:

```tsx
import {
  ShellLayout,
  SearchPanel,
  readMapView,
  useMapViewMemory,
  type MapViewStore,
  type SearchItem,
} from "@gamemap/map-shell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from "@gamemap/ui";
import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
```

Also add `MarkerTypesSection` and `SelectMap` alongside the existing `Sidebar` import:

```tsx
import Sidebar from "@/features/map/sidebar/Sidebar";
import SelectMap from "@/features/map/sidebar/SelectMap";
import MarkerTypesSection from "@/features/map/sidebar/MarkerTypesSection";
```

**3b.** Add the mobile state next to the other `useState` calls (just after
`const { t } = useTranslation();` is fine):

```tsx
  const isMobile = useIsMobile();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
```

**3c.** Replace the entire `return (…)` at the end of the component. Extract the two children into
consts first so both branches render one definition, then branch:

```tsx
  const mapView = (
    <GameMapView
      mapRef={mapRef}
      map={selectedMap}
      markers={engineMarkers}
      regions={regions}
      visibleSubtypes={visibleSubtypes}
      visibleRegions={visibleRegions}
      showLabels={showLabels}
      showBorders={showBorders}
      lodEnabled={lodEnabled}
      selectedMarkerId={selectedMarkerId}
      forceShowIds={forceShowIds}
      selectedPosition={selectedPosition}
      initialView={initialView}
      onViewChange={saveView}
      suppressInitialFlyForId={restoredMarkerId}
      onToggleMarker={handleToggleMarker}
      subzoneAt={subzoneAt}
      flyToDuration={MAP_FLY_TO_DURATION}
      assets={aionAssets}
      theme={aionTheme}
      labels={labels}
      renderPopupContent={renderPopupContent}
      exposeTestHandle={import.meta.env.DEV}
    />
  );

  const searchPanel = (variant: "floating" | "inline") => (
    <SearchPanel
      items={searchItems}
      onSelect={setSelectedMarkerId}
      onFlyTo={setSelectedPosition}
      onResultsChange={setSearchResultIds}
      initialQuery={initialQuery}
      labels={searchLabels}
      searchFields={["name", "description"]}
      resultAside={(itm) => subzoneAt(itm.x, itm.y) || undefined}
      variant={variant}
    />
  );

  if (isMobile) {
    return (
      <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
        {/* Same flex chain as the desktop ShellLayout: the map root needs a
            definite height or Leaflet sizes to zero on mount. */}
        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          {mapView}
        </main>

        {/* Floating actions, lifted above the bottom tab bar (h-14) + safe area. */}
        <div
          className="absolute right-3 z-[700] flex flex-col gap-2"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
        >
          <button
            type="button"
            data-testid="map-fab-search"
            aria-label={t("common:ui.search", "Search")}
            onClick={() => setSearchSheetOpen(true)}
            className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <SearchIcon className="size-5" />
          </button>
          <button
            type="button"
            data-testid="map-fab-filter"
            aria-label={t("common:menu.markerTypes", "Marker Types")}
            onClick={() => setFilterSheetOpen(true)}
            className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg"
          >
            <SlidersHorizontal className="size-5" />
          </button>
        </div>

        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent
            side="bottom"
            data-testid="filter-sheet"
            className="max-h-[85dvh]"
          >
            <SheetHeader>
              <SheetTitle className="sr-only">
                {t("common:menu.markerTypes", "Marker Types")}
              </SheetTitle>
              <SelectMap />
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MarkerTypesSection />
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={searchSheetOpen} onOpenChange={setSearchSheetOpen}>
          <SheetContent
            side="bottom"
            data-testid="search-sheet"
            className="h-[70dvh]"
          >
            <SheetTitle className="sr-only">
              {t("common:ui.search", "Search")}
            </SheetTitle>
            {searchPanel("inline")}
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <ShellLayout
      className="bg-background text-foreground"
      topBar={<TopNavbar />}
      sidebar={<Sidebar />}
    >
      <div className="relative flex flex-1 overflow-hidden">
        {mapView}
        {searchPanel("floating")}
      </div>
    </ShellLayout>
  );
}
```

Every hook above this point is untouched and runs in both branches, so deep links, view
persistence, selection restore and `forceShowIds` behave identically on phone and desktop. The
branch is after all hooks, so hook order never changes between renders.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (9 passed).

- [ ] **Step 5: Confirm filtering still works through the sheet**

Add to the `mobile chrome` describe:

```ts
  test("toggling a subtype in the filter sheet changes the map", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    await page.locator(".leaflet-container").waitFor({ state: "visible" });
    const before = await page.locator(".leaflet-marker-icon").count();

    await page.getByTestId("map-fab-filter").click();
    await page.getByTestId("filter-sheet").waitFor({ state: "visible" });
    await page
      .getByTestId("filter-sheet")
      .locator("button")
      .filter({ hasText: /Hide all/i })
      .first()
      .click();
    await page.keyboard.press("Escape");

    await expect
      .poll(() => page.locator(".leaflet-marker-icon").count())
      .toBeLessThan(before);
  });
```

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (10 passed). If "Hide all" is not found, the button label comes from
`common:menu.hideAllMarkers` — confirm the en-US value is `"Hide all"` with
`grep -n "hideAllMarkers" public/locales/en-US/common.yaml` and match the filter text to it.

- [ ] **Step 6: Look at it**

Only automated checks so far; confirm it actually looks right.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15173
```

If `000`, run `pnpm dev` first. Then load `http://localhost:15173/?map=World_L_A` in a 390×844
viewport and check: the map fills the width, both FABs sit above the tab bar without covering the
zoom control, each sheet opens and scrolls, and closing a sheet leaves the map interactive.

- [ ] **Step 7: Full suite**

```bash
E2E_PORT=15173 pnpm e2e 2>&1 | tail -30
```

Expected: the embedded-map POI failure only — no others.

- [ ] **Step 8: Commit**

```bash
cd ../../..
git add frontend/apps/aion2/src/features/map/MapRoute.tsx \
        frontend/apps/aion2/e2e/mobile.spec.ts
git commit -m "feat(aion2): full-screen mobile map with filter/search sheets

The 346px sidebar left the map ~44px wide at 390px, and the floating
search panel was clipped off-screen. Below md the map now fills the
viewport and two FABs open bottom sheets: filter (map selector + the
shared MarkerTypesSection) and search (SearchPanel inline variant).

The branch sits after every hook, so deep links, view persistence and
selection restore are shared with the desktop path unchanged."
git log -1 --format='%G?'
```

---

## Task 8: Touch-sized type-hub chips

Measured 25px tall with 5px vertical gaps — 96 of them on `/wiki/item`.

**Files:**
- Modify: `frontend/apps/aion2/src/features/wiki/TypeHub.tsx:88,96,106`
- Modify: `frontend/apps/aion2/e2e/mobile.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to the `mobile chrome` describe:

```ts
  test("type-hub section chips are touch-sized", async ({ page }) => {
    await page.goto("/wiki/item?lng=en-US");
    const chip = page.locator('main a[href*="#"]').first();
    await chip.waitFor({ state: "visible" });
    const box = await chip.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });
```

And to the `desktop is unchanged` describe:

```ts
  test("type-hub chips stay compact on desktop", async ({ page }) => {
    await page.goto("/wiki/item?lng=en-US");
    const chip = page.locator('main a[href*="#"]').first();
    await chip.waitFor({ state: "visible" });
    const box = await chip.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(28);
  });
```

- [ ] **Step 2: Run the tests to verify one fails**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: the mobile chip test FAILS (`25` is not `>= 36`); the desktop one PASSES already.

- [ ] **Step 3: Size the chips up below `md` only**

In `frontend/apps/aion2/src/features/wiki/TypeHub.tsx`, `renderSectionChips` currently opens with:

```tsx
      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
```

Widen the row gap so wrapped rows are not 5px apart:

```tsx
      <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-2.5 text-sm md:gap-y-2">
```

Both `Link`s in that function carry the same class string:

```tsx
                className="rounded bg-secondary px-2 py-0.5 hover:bg-accent"
```

Replace **both** occurrences with:

```tsx
                className="inline-flex min-h-9 items-center rounded bg-secondary px-2.5 py-1.5 hover:bg-accent md:min-h-0 md:px-2 md:py-0.5"
```

`min-h-9` is 36px; `md:min-h-0` plus the original padding restores today's 25px chip at desktop.
No font size changes — `text-sm` on the `ul` is untouched, per the typography rule.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
E2E_PORT=15173 pnpm e2e mobile.spec.ts 2>&1 | tail -20
```

Expected: PASS (12 passed).

- [ ] **Step 5: Commit**

```bash
cd ../../..
git add frontend/apps/aion2/src/features/wiki/TypeHub.tsx \
        frontend/apps/aion2/e2e/mobile.spec.ts
git commit -m "fix(aion2): touch-size the wiki type-hub section chips

Measured 25px tall with 5px vertical gaps -- 96 of them on /wiki/item,
dense enough to mis-tap. Padding and min-height only, md+ unchanged."
git log -1 --format='%G?'
```

---

## Task 9: Final verification and review

**Files:** none — verification only.

- [ ] **Step 1: Full suite, compared against the baseline**

```bash
cd frontend/apps/aion2
E2E_PORT=15173 pnpm e2e 2>&1 | tail -40
```

Expected: the 25 originally-passing tests plus 12 new mobile/desktop assertions all passing,
with the embedded-map POI test still the *only* failure.
**Any other failure is a regression from this work. Fix it before proceeding, and never call the
suite green while something unexpected is red.**

- [ ] **Step 2: Lint, typecheck, build**

```bash
pnpm lint && pnpm exec tsc -b --noEmit && pnpm build
```

Expected: all three succeed.

- [ ] **Step 3: Confirm the shared packages were not touched**

```bash
cd ../../..
git diff --stat master -- frontend/packages/
```

Expected: **empty output.** If `packages/ui/src/site-footer.tsx` appears because Task 5 Step 4
needed a `className` prop, that is the one permitted exception — verify palworld and meta still
build (`cd frontend && pnpm -r build`).

- [ ] **Step 4: Confirm palworld and meta are untouched**

```bash
git diff --stat master -- frontend/apps/palworld/ frontend/apps/meta/
```

Expected: empty output.

- [ ] **Step 5: Visual pass over every route at 390×844**

With the dev server running, load each of these at 390×844 and confirm no clipped text, no
horizontal scroll, and nothing hidden behind the tab bar:

- `/` — map fills width, FABs above the tab bar
- `/wiki` — mobile header, single-column groups
- `/wiki/quest` — search box and chips tappable
- `/wiki/npc`
- `/wiki/item` — chips are the taller variant
- `/wiki/quest/2101010` — detail cards stack, the embedded map fits

- [ ] **Step 6: Desktop regression pass at 1280×800**

Load `/` and `/wiki`. The sidebar, top bar, language/theme/contact menus and floating search panel
must look exactly as they do on `master`. Compare against `git stash` / `master` if unsure.

- [ ] **Step 7: Review the finished diff**

```bash
git diff master --stat
```

Then have Codex review the full diff as a second opinion (the user explicitly requested this for
this task). Verify each finding independently against the code before acting on it — do not apply
review suggestions unexamined, and push back on any that are wrong.

- [ ] **Step 8: Report honestly**

State the final suite result with real numbers from the run, and name the embedded-map POI
failure explicitly as pre-existing — having reproduced it on the base commit, not merely
asserted it. List anything deferred.

---

## Deferred (explicitly out of scope)

- Wiki group lists show raw map ids (`World_D_Starter`) instead of localized map names, and item
  rows render without icons. Both are pre-existing data/content gaps, unrelated to viewport width.
- Palworld's bottom tab bar and the `meta` app are untouched.
- No WeChat mini-program work; the palworld spec's section E still stands unchanged.
