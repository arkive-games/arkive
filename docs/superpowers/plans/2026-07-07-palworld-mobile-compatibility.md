# Palworld Mobile Compatibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every palworld page usable on a phone (target 375px) and make the shared map-shell responsive, without changing the desktop (≥768px) layout. aion2 untouched; WeChat-friendly choices applied.

**Architecture:** Add two missing primitives to `@gamemap/ui` — a Radix-based `Sheet` and a `useIsMobile()` hook. Add a `BottomTabBar` mounted once at the router root so it appears on every page. Hide the desktop top nav on mobile and route navigation through the bottom bar + a "More" sheet. Wrap content pages in a shared `ContentPage` that adds a mobile header + bottom padding. Make the map page full-screen on mobile with floating buttons that open the filter/search panels as bottom sheets. Desktop paths stay behind `md:` prefixes and `useIsMobile()===false`.

**Tech Stack:** React 19, Vite (rolldown), Tailwind v4, `radix-ui` (unified pkg), TanStack Router, react-i18next, Leaflet (via map-engine), Playwright (e2e), Vitest (unit, root).

**Conventions found (must honor):**
- `packages/map-shell` may NOT import `react-i18next`, `react-router`, `import.meta.env`, `localStorage`, `fetch`, or `@/` (enforced by root `check:shell`). Keep i18n/router/theme logic in the app; keep matchMedia-only logic allowed.
- `packages/ui` builds shadcn-style wrappers on the unified `radix-ui` package (see `dialog.tsx`).
- Content pages currently duplicate this shell:
  ```tsx
  <div className="flex h-screen flex-col bg-background text-foreground">
    <TopNav active="/route" />
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-{W} px-4 py-6">{children}</div>
    </div>
  </div>
  ```
- Palworld e2e runs on port 5188 (`playwright.config.ts`), Desktop Chrome project. `pnpm e2e:palworld` from `frontend/`.
- Build/typecheck: `pnpm build:palworld` (runs `tsc -b && vite build`). Lint: `pnpm lint:palworld`.
- There is a pre-existing **uncommitted user edit** in `apps/palworld/src/features/buildings/BuildingListPage.tsx` (removed a building-id label span). Preserve it; when committing that file, stage it explicitly and keep the deletion.

**Working directory for all commands:** `E:\arkive-games\arkive\frontend` (the pnpm workspace root). Paths below are relative to the repo root.

---

## Task 1: `Sheet` primitive in `@gamemap/ui`

**Files:**
- Create: `frontend/packages/ui/src/sheet.tsx`
- Modify: `frontend/packages/ui/src/index.ts`

- [ ] **Step 1: Create the Sheet component**

Create `frontend/packages/ui/src/sheet.tsx`. Modeled on `dialog.tsx` (same `radix-ui` Dialog primitive) but with side-anchored content and a `side` prop. Uses the existing animation utility classes already used by `dialog.tsx`.

```tsx
"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "./utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-[3000] bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
}

type SheetSide = "top" | "bottom" | "left" | "right"

const sideClasses: Record<SheetSide, string> = {
  top: "inset-x-0 top-0 h-auto max-h-[85dvh] border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
  bottom:
    "inset-x-0 bottom-0 h-auto max-h-[85dvh] rounded-t-xl border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
  left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
  right:
    "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
}

function SheetContent({
  className,
  children,
  side = "bottom",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal data-slot="sheet-portal">
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-[3000] flex flex-col gap-2 bg-background p-4 shadow-lg outline-none duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in",
          sideClasses[side],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute top-3 right-3 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-hidden"
          >
            <XIcon className="size-5" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
```

Note: `z-[3000]` sits above the map's Leaflet panes and the desktop SearchPanel (`z-[600]`) and the bottom tab bar (`z-[2500]`, Task 3).

- [ ] **Step 2: Export from the ui barrel**

Modify `frontend/packages/ui/src/index.ts` — add after the `./separator` line:

```ts
export * from "./sheet"
```

- [ ] **Step 3: Typecheck the ui package**

Run: `pnpm --filter @gamemap/ui check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/sheet.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add Sheet primitive (radix dialog, side-anchored)"
```

---

## Task 2: `useIsMobile` hook in `@gamemap/ui`

**Files:**
- Create: `frontend/packages/ui/src/use-is-mobile.ts`
- Modify: `frontend/packages/ui/src/index.ts`

- [ ] **Step 1: Create the hook**

Create `frontend/packages/ui/src/use-is-mobile.ts`. Defaults to `false` (desktop-first) before mount to avoid a hydration/first-paint flash on desktop; corrects on mount via `matchMedia`.

```ts
import { useEffect, useState } from "react"

/** Viewport width below this (px) is treated as a phone. Matches Tailwind `md`. */
export const MOBILE_MAX_WIDTH = 767

/**
 * `true` when the viewport is a phone (< 768px). SSR/first-render safe: returns
 * `false` until mounted, then subscribes to a `matchMedia` query. Drives the
 * JS layout switches that CSS `md:` prefixes can't express (e.g. rendering a
 * Sheet instead of a sidebar).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  return isMobile
}
```

- [ ] **Step 2: Export from the ui barrel**

Modify `frontend/packages/ui/src/index.ts` — add after the `./sheet` line:

```ts
export * from "./use-is-mobile"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @gamemap/ui check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/use-is-mobile.ts packages/ui/src/index.ts
git commit -m "feat(ui): add useIsMobile hook (matchMedia, <768px)"
```

---

## Task 3: Viewport meta + safe areas + dvh groundwork

**Files:**
- Modify: `frontend/apps/palworld/index.html:5`
- Modify: `frontend/packages/map-shell/src/ShellLayout.tsx:22`

- [ ] **Step 1: Enable safe-area insets in the viewport meta**

Modify `frontend/apps/palworld/index.html` line 5 to add `viewport-fit=cover`:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: Switch the shell root to dynamic viewport height**

Modify `frontend/packages/map-shell/src/ShellLayout.tsx` line 22 — replace `h-screen` with `h-dvh` so mobile browser chrome doesn't clip the map:

```tsx
    <div className={cn("flex h-dvh w-screen overflow-hidden", className)}>
```

- [ ] **Step 3: Typecheck map-shell + confirm shell purity**

Run: `pnpm --filter @gamemap/map-shell check && pnpm check:shell`
Expected: no type errors; `check:shell` exits 0 (no forbidden imports).

- [ ] **Step 4: Commit**

```bash
git add apps/palworld/index.html packages/map-shell/src/ShellLayout.tsx
git commit -m "feat(palworld): viewport-fit=cover + dvh shell height for mobile"
```

---

## Task 4: `BottomTabBar` component + mount at router root

**Files:**
- Create: `frontend/apps/palworld/src/components/BottomTabBar.tsx`
- Modify: `frontend/apps/palworld/src/main.tsx:44` (root route component)

- [ ] **Step 1: Create the bottom tab bar**

Create `frontend/apps/palworld/src/components/BottomTabBar.tsx`. Fixed to the viewport bottom, `md:hidden`, honors `safe-area-inset-bottom`. Four primary tabs + a "More" sheet holding the remaining routes plus language and theme controls. Active state derives from the current path via `useLocation`.

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from '@tanstack/react-router'
import { Map, PawPrint, Package, Hammer, Menu, FlaskConical, ScrollText, Heart } from 'lucide-react'
import {
  cn,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@gamemap/ui'
import { ThemeToggle } from '@gamemap/map-shell'
import { LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import type { NavKey } from './TopNav'

type Tab = { key: NavKey; label: string; icon: typeof Map }

/** Map a pathname (basepath already stripped by the router) to a NavKey. */
function activeKey(pathname: string): NavKey {
  if (pathname === '/' || pathname === '') return '/'
  if (pathname.startsWith('/pals')) return '/pals'
  if (pathname.startsWith('/items')) return '/items'
  if (pathname.startsWith('/buildings')) return '/buildings'
  if (pathname.startsWith('/technology')) return '/technology'
  if (pathname.startsWith('/quests')) return '/quests'
  if (pathname.startsWith('/breeding')) return '/breeding'
  return '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const { pathname } = useLocation()
  const active = activeKey(pathname)
  const [moreOpen, setMoreOpen] = useState(false)

  const primary: Tab[] = [
    { key: '/', label: t('breeding.navMap'), icon: Map },
    { key: '/pals', label: t('pal.title'), icon: PawPrint },
    { key: '/items', label: t('item.title'), icon: Package },
    { key: '/buildings', label: t('building.title'), icon: Hammer },
  ]
  const more: Tab[] = [
    { key: '/technology', label: t('tech.title'), icon: FlaskConical },
    { key: '/quests', label: t('quest.title'), icon: ScrollText },
    { key: '/breeding', label: t('breeding.navBreeding'), icon: Heart },
  ]
  const moreActive = more.some((m) => m.key === active)

  const itemCls = (isActive: boolean) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors',
      isActive ? 'text-primary' : 'text-muted-foreground',
    )

  return (
    <>
      <nav
        data-testid="bottom-tab-bar"
        className="fixed inset-x-0 bottom-0 z-[2500] flex border-t border-border bg-card text-card-foreground md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primary.map(({ key, label, icon: Icon }) => (
          <Link key={key} to={key} className={itemCls(active === key)} data-testid={`tab-${key}`}>
            <Icon className="size-5" />
            <span className="max-w-full truncate px-0.5">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          data-testid="tab-more"
          onClick={() => setMoreOpen(true)}
          className={itemCls(moreActive)}
        >
          <Menu className="size-5" />
          <span className="px-0.5">{t('more')}</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          data-testid="more-sheet"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <SheetHeader>
            <SheetTitle>{t('more')}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2">
            {more.map(({ key, label, icon: Icon }) => (
              <Link
                key={key}
                to={key}
                onClick={() => setMoreOpen(false)}
                data-testid={`more-${key}`}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border border-border p-3 text-xs font-medium',
                  active === key ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground',
                )}
              >
                <Icon className="size-5" />
                <span className="text-center leading-tight">{label}</span>
              </Link>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap gap-1">
              {LANGUAGES.map((code) => (
                <button
                  key={code}
                  type="button"
                  data-testid={`more-lang-${code}`}
                  onClick={() => void i18n.changeLanguage(code)}
                  className={cn(
                    'rounded px-2 py-1 text-xs',
                    lng === code ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {LANGUAGE_LABELS[code]}
                </button>
              ))}
            </div>
            <ThemeToggle labels={{ auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') }} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

Notes:
- `t('more')` is a new i18n key added in Step 2.
- Verify the lucide icon names exist in `lucide-react@1.21`; if any import errors in Step 4's typecheck, substitute a present icon (e.g. `Boxes` for Package, `Wrench` for Hammer). Fix at typecheck time, do not leave a broken import.

- [ ] **Step 2: Add the `more` i18n key**

Find the i18n resource files (Step: `git grep -l "themeAuto" apps/palworld/src`). For **each** locale resource object that defines `themeAuto`, add a sibling key `more` with the translated word for "More" (English: `"more": "More"`; for other locales use the obvious translation, or English as a safe fallback if unsure). Keep JSON/TS valid.

- [ ] **Step 3: Mount BottomTabBar once at the router root**

Modify `frontend/apps/palworld/src/main.tsx`. Add import near the other component imports:

```tsx
import { BottomTabBar } from './components/BottomTabBar'
```

Replace line 44:

```tsx
const rootRoute = createRootRoute({ component: () => <Outlet /> })
```

with:

```tsx
const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <BottomTabBar />
    </>
  ),
})
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm build:palworld`
Expected: `tsc -b` passes and vite build succeeds. If a lucide icon import fails, swap it for a valid icon and re-run.
Run: `pnpm lint:palworld`
Expected: no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add apps/palworld/src/components/BottomTabBar.tsx apps/palworld/src/main.tsx apps/palworld/src/i18n
git commit -m "feat(palworld): mobile bottom tab bar with More sheet"
```

(If i18n resources live outside `src/i18n`, stage their explicit paths instead.)

---

## Task 5: Hide desktop TopNav on mobile + create `ContentPage` wrapper

**Files:**
- Modify: `frontend/apps/palworld/src/components/TopNav.tsx:29`
- Create: `frontend/apps/palworld/src/components/ContentPage.tsx`

- [ ] **Step 1: Hide the desktop top bar on phones**

Modify `frontend/apps/palworld/src/components/TopNav.tsx` line 29 — prepend `hidden` and add `md:flex` so the desktop nav only shows at `md+` (bottom bar handles mobile). tailwind-merge resolves the display conflict in favor of `hidden` at base and `flex` at `md`:

```tsx
      classNames={{ root: 'hidden border-b border-border bg-card text-card-foreground md:flex' }}
```

- [ ] **Step 2: Create ContentPage**

Create `frontend/apps/palworld/src/components/ContentPage.tsx`. Encapsulates the repeated page shell, adds a mobile-only header (title) and bottom padding so content clears the fixed bottom tab bar (Task 4). Desktop output matches the old markup (top bar + scroll area + max-width), just with `h-dvh`.

```tsx
import type { ReactNode } from 'react'
import { cn } from '@gamemap/ui'
import { TopNav, type NavKey } from './TopNav'

export interface ContentPageProps {
  /** Active nav key, drives desktop top-nav highlight + is used by tests. */
  active: NavKey
  /** Page title shown in the mobile-only header. */
  title: ReactNode
  /** Tailwind max-width class for the centered content column (e.g. "max-w-5xl"). */
  maxWidth?: string
  children: ReactNode
}

export function ContentPage({ active, title, maxWidth = 'max-w-5xl', children }: ContentPageProps) {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopNav active={active} />
      {/* Mobile-only compact header; desktop uses TopNav above. */}
      <header
        className="flex h-12 shrink-0 items-center border-b border-border bg-card px-4 text-base font-semibold text-card-foreground md:hidden"
        data-testid="mobile-header"
      >
        {title}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn('mx-auto w-full px-4 py-6', maxWidth)}
          // Clear the fixed bottom tab bar (h-14 = 3.5rem) + safe area on mobile.
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
```

Note: the inline `paddingBottom` applies on all widths; that's harmless on desktop (extra bottom scroll space) and simplest. If undesired on desktop, gate with a class instead — but keep it simple here.

- [ ] **Step 3: Typecheck**

Run: `pnpm build:palworld`
Expected: passes (ContentPage not yet imported anywhere; it just compiles).

- [ ] **Step 4: Commit**

```bash
git add apps/palworld/src/components/TopNav.tsx apps/palworld/src/components/ContentPage.tsx
git commit -m "feat(palworld): hide desktop nav on mobile; add ContentPage wrapper"
```

---

## Task 6: Migrate content pages to `ContentPage`

Each page currently opens with the duplicated shell (see Conventions). Replace that shell with `<ContentPage>` and remove the now-unused `TopNav` import. The transformation for every page is identical in shape:

**Before** (top of the returned JSX):
```tsx
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopNav active="/ROUTE" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-WIDTH px-4 py-6">
          {/* page body */}
        </div>
      </div>
    </div>
```

**After:**
```tsx
    <ContentPage active="/ROUTE" title={t('TITLE_KEY')} maxWidth="max-w-WIDTH">
      {/* page body */}
    </ContentPage>
```

Import change in every migrated file:
- Remove: `import { TopNav } from '../../components/TopNav'` (list pages) or `'../../components/TopNav'` path as present.
- Add: `import { ContentPage } from '../../components/ContentPage'`

**Per-file parameters** (route key, title i18n key, and the existing max-width to preserve):

| File | `active` | `title` key | `maxWidth` |
|------|----------|-------------|------------|
| `apps/palworld/src/features/pals/PalListPage.tsx` | `/pals` | `pal.title` | `max-w-6xl` |
| `apps/palworld/src/features/pals/PalDetailPage.tsx` | `/pals` | pal name (use existing detail heading text; fall back to `pal.title`) | (its existing outer max-width) |
| `apps/palworld/src/features/items/ItemListPage.tsx` | `/items` | `item.title` | `max-w-5xl` |
| `apps/palworld/src/features/items/ItemDetailPage.tsx` | `/items` | item name (fall back `item.title`) | (existing) |
| `apps/palworld/src/features/buildings/BuildingListPage.tsx` | `/buildings` | `building.title` | `max-w-5xl` |
| `apps/palworld/src/features/buildings/BuildingDetailPage.tsx` | `/buildings` | building name (fall back `building.title`) | (existing) |
| `apps/palworld/src/features/quests/QuestListPage.tsx` | `/quests` | `quest.title` | `max-w-3xl` |
| `apps/palworld/src/features/quests/QuestDetailPage.tsx` | `/quests` | quest name (fall back `quest.title`) | (existing) |
| `apps/palworld/src/features/technology/TechnologyPage.tsx` | `/technology` | `tech.title` | `max-w-6xl` |
| `apps/palworld/src/features/breeding/BreedingPage.tsx` | `/breeding` | `breeding.navBreeding` | `max-w-4xl` |

Rules for migration:
- **Read each file first** to confirm its exact outer wrapper and max-width, then apply the swap preserving the inner body untouched.
- For **detail pages**, the current heading likely already renders the entity name inside the body; pass that same value/expression as `title` (or the fallback key if the name isn't available at the wrapper level — in that case pass the section title key). Do not fabricate new data lookups.
- Keep every page's `loadError` / loading branches; if a page returns an early error/loading `<div className="flex h-screen ...">`, wrap those in `ContentPage` too **or** leave them if they already render standalone — prefer wrapping so the mobile chrome persists. Preserve `data-testid`s.
- **BuildingListPage.tsx** has a pending uncommitted user edit (removed id-label span). Preserve that deletion while migrating.

- [ ] **Step 1: Migrate the list pages** — PalListPage, ItemListPage, BuildingListPage, QuestListPage, TechnologyPage, BreedingPage per the table.

- [ ] **Step 2: Typecheck after list pages**

Run: `pnpm build:palworld`
Expected: passes. Fix any unused-import or type errors before continuing.

- [ ] **Step 3: Migrate the detail pages** — PalDetailPage, ItemDetailPage, BuildingDetailPage, QuestDetailPage per the table.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm build:palworld && pnpm lint:palworld`
Expected: both pass, no unused `TopNav` imports remaining.

- [ ] **Step 5: Commit**

```bash
git add apps/palworld/src/features
git commit -m "feat(palworld): route content pages through ContentPage for mobile chrome"
```

---

## Task 7: Map page — mobile full-screen with filter/search bottom sheets

**Files:**
- Modify: `frontend/packages/map-shell/src/SearchPanel.tsx` (add a layout `variant`)
- Modify: `frontend/apps/palworld/src/App.tsx`

### 7a. SearchPanel: support an inline (sheet) layout

Currently the root is hard-coded to a floating overlay (`absolute top-3 right-3 bottom-3 w-[290px]`). Add a `variant` prop so it can also fill a sheet container.

- [ ] **Step 1: Add `variant` to SearchPanelProps**

Modify `frontend/packages/map-shell/src/SearchPanel.tsx`. In `SearchPanelProps` (after `classNames`), add:

```tsx
  /**
   * "floating" (default): the desktop right-side absolute overlay.
   * "inline": fills its container (used inside a mobile bottom sheet).
   */
  variant?: "floating" | "inline"
```

- [ ] **Step 2: Destructure and apply it**

In the function signature add `variant = "floating",` alongside the other params. Change the outer container (currently lines ~208-215) to:

```tsx
  return (
    <div
      className={cn(
        variant === "floating"
          ? "pointer-events-auto absolute top-3 right-3 bottom-3 z-[600] flex w-[290px] flex-col gap-2"
          : "flex h-full min-h-0 w-full flex-col gap-2",
        classNames?.root,
      )}
      data-testid="search-panel"
    >
```

The rest of the component is unchanged (the results panel already uses `min-h-0 flex-1`, so it fills either container).

- [ ] **Step 3: Typecheck map-shell + purity**

Run: `pnpm --filter @gamemap/map-shell check && pnpm check:shell`
Expected: no errors; `check:shell` exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/map-shell/src/SearchPanel.tsx
git commit -m "feat(map-shell): SearchPanel inline variant for mobile sheets"
```

### 7b. App.tsx: mobile branch with FABs + sheets

The desktop render (sidebar + overlay search) must stay unchanged on `md+`. On mobile, render the map full-screen with two floating buttons that open the filter panel and the search panel as bottom sheets. Reuse the exact same `FilterPanel` and `SearchPanel` element content — only the container changes.

- [ ] **Step 1: Add imports + mobile state**

Modify `frontend/apps/palworld/src/App.tsx`. Extend the `@gamemap/ui` import (currently none in this file) — add:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, useIsMobile } from '@gamemap/ui'
import { SlidersHorizontal, Search as SearchIcon } from 'lucide-react'
```

Inside `App()`, near the other `useState` calls, add:

```tsx
  const isMobile = useIsMobile()
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [searchSheetOpen, setSearchSheetOpen] = useState(false)
```

- [ ] **Step 2: Extract the FilterPanel and SearchPanel into variables**

To avoid duplicating their (large) prop lists across desktop/mobile, build them once. Just above the `return (` of the component, create:

```tsx
  const filterPanel = (
    <FilterPanel
      categories={filterCategories}
      onToggleSubtype={onToggle}
      onSetCategory={onSetCategory}
      defaultCollapsedCategoryIds={PAL_COLLAPSED_CATEGORIES}
      categoryToggleLabels={{ show: t('showAll'), hide: t('hideAll') }}
      controls={[
        { id: 'show-all', label: t('showAll'), onClick: () => setVisible(new Set(staticData.types.subtypes.map((s) => s.id))) },
        { id: 'hide-all', label: t('hideAll'), onClick: () => setVisible(new Set()) },
        { id: 'show-tooltip', label: t('showTooltip'), onClick: () => setShowLabels((v) => !v), active: showLabels },
      ]}
      classNames={{
        controlButton: 'bg-secondary text-secondary-foreground',
        controlButtonActive: 'bg-primary text-primary-foreground',
        subtypeButton: 'bg-secondary text-secondary-foreground',
        subtypeButtonActive: 'bg-primary text-primary-foreground',
      }}
    />
  )

  const mapSelect = (
    <ShellMapSelect
      classNames={{ wrapper: 'mb-3' }}
      maps={staticData.maps.map((m) => ({
        id: m.id,
        label: staticData.mapsL10n[m.id]?.shortName ?? staticData.mapsL10n[m.id]?.name ?? m.id,
      }))}
      activeMapId={mapId}
      onSelectMap={setMapId}
      barStyle={{
        background: 'linear-gradient(90deg, rgba(53,208,232,0) 0%, rgba(53,208,232,0.35) 54%, rgba(53,208,232,0) 100%)',
        borderImage: 'linear-gradient(90deg, rgba(53,208,232,0), rgba(53,208,232,0.9), rgba(53,208,232,0)) 1',
      }}
    />
  )

  const searchPanel = (variant: 'floating' | 'inline') => (
    <SearchPanel
      items={searchItems}
      onSelect={setSelectedMarkerId}
      onFlyTo={setSelectedPosition}
      onResultsChange={setSearchResultIds}
      initialQuery={initialQuery}
      labels={searchLabels}
      displayCoords={displayCoords}
      searchFields={['name', 'idLabel']}
      resolveSearchOptions={palIdLookup}
      searchOptions={PAL_SEARCH_OPTIONS}
      variant={variant}
    />
  )
```

- [ ] **Step 3: Replace the return with a responsive layout**

Replace the entire `return ( <ShellLayout ...> ... </ShellLayout> )` block with the following. Desktop (`!isMobile`) reuses the existing structure via the extracted variables; mobile renders full-screen map + FABs + sheets.

```tsx
  const mapView = (
    <GameMapView
      mapRef={mapRef}
      map={map}
      markers={engineMarkers}
      regions={[]}
      visibleSubtypes={visible}
      showLabels={showLabels}
      showBorders={false}
      lodEnabled={false}
      selectedMarkerId={selectedMarkerId}
      forceShowIds={forceShowIds}
      selectedPosition={selectedPosition}
      onToggleMarker={onToggleMarker}
      subzoneAt={subzoneAt}
      displayCoords={displayCoords}
      flyToDuration={0.5}
      assets={palworldAssets}
      theme={palworldTheme}
      exposeTestHandle={import.meta.env.DEV}
      renderPopupContent={renderPopupContent}
      labels={labels}
    />
  )

  if (isMobile) {
    return (
      <div className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
        <main className="absolute inset-0">{mapView}</main>

        {/* Floating actions; sit above the bottom tab bar (h-14) + safe area. */}
        <div
          className="absolute right-3 z-[700] flex flex-col gap-2"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}
        >
          <button
            type="button"
            data-testid="map-fab-search"
            aria-label={t('search')}
            onClick={() => setSearchSheetOpen(true)}
            className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <SearchIcon className="size-5" />
          </button>
          <button
            type="button"
            data-testid="map-fab-filter"
            aria-label={t('filter')}
            onClick={() => setFilterSheetOpen(true)}
            className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg"
          >
            <SlidersHorizontal className="size-5" />
          </button>
        </div>

        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent side="bottom" data-testid="filter-sheet" className="max-h-[85dvh]">
            <SheetHeader>{mapSelect}</SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">{filterPanel}</div>
          </SheetContent>
        </Sheet>

        <Sheet open={searchSheetOpen} onOpenChange={setSearchSheetOpen}>
          <SheetContent side="bottom" data-testid="search-sheet" className="h-[70dvh]">
            <SheetTitle className="sr-only">{t('search')}</SheetTitle>
            {searchPanel('inline')}
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <ShellLayout
      className="bg-background text-foreground"
      topBar={<TopNav active="/" />}
      sidebar={
        <ShellSidebar
          collapseLabel={t('collapse')}
          expandLabel={t('expand')}
          classNames={{
            root: 'border-r border-border bg-gradient-to-b from-card to-background text-sm text-card-foreground',
            collapseButton: 'bg-secondary text-secondary-foreground',
            content: 'px-3 pt-3',
          }}
          headerSlot={
            <div className="mb-3 px-1">
              <img
                src={`${import.meta.env.BASE_URL}images/palworld-logo.webp`}
                alt="Palworld"
                className="h-auto w-full object-contain invert dark:invert-0"
              />
            </div>
          }
          mapSelectorSlot={mapSelect}
        >
          {filterPanel}
        </ShellSidebar>
      }
    >
      <main className="relative flex min-w-0 flex-1 overflow-hidden">
        {mapView}
        {searchPanel('floating')}
      </main>
    </ShellLayout>
  )
```

Notes:
- `t('filter')` is a new i18n key. Add it (English `"filter": "Filters"`) the same way as `more` in Task 4 Step 2. If a suitable existing key already means "Filters", reuse it instead of adding a duplicate.
- The FABs use `z-[700]` (above the desktop search overlay's `z-[600]`, below sheets' `z-[3000]`). They render only in the mobile branch so they never appear on desktop.
- Confirm `SlidersHorizontal` and `Search` exist in `lucide-react@1.21`; if not, substitute present icons (e.g. `Filter`, `Search`). Fix at typecheck.

- [ ] **Step 4: Typecheck + lint + shell purity**

Run: `pnpm build:palworld && pnpm lint:palworld && pnpm check:shell`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/palworld/src/App.tsx apps/palworld/src/i18n
git commit -m "feat(palworld): full-screen mobile map with filter/search bottom sheets"
```

---

## Task 8: Content-page polish (tables, tap targets, detail widths)

**Files:**
- Modify: `frontend/apps/palworld/src/features/pals/components/PalTable.tsx`
- Modify: detail pages if a fixed-width sidebar can overflow narrow phones (verify first)

- [ ] **Step 1: Make the pal table horizontally scrollable on mobile**

Read `PalTable.tsx`. Wrap its root `<table>` in a scroll container so columns scroll instead of squashing on phones. If the table is rendered by the caller (`PalListPage`), wrap at the render site instead. Concretely, ensure the table is inside:

```tsx
<div className="w-full overflow-x-auto">
  {/* <table> ... */}
</div>
```

- [ ] **Step 2: Verify detail-page sidebars don't overflow**

Read `PalDetailPage.tsx`, `ItemDetailPage.tsx`, `BuildingDetailPage.tsx`, `QuestDetailPage.tsx`. They use `md:grid-cols-[minmax(0,1fr)_320px]` (or similar) which already collapses to one column `<md`. Confirm images use `max-w-full h-auto` and no element has a fixed pixel width wider than ~320px without `max-w-full`. Apply `max-w-full` where a fixed width could overflow. Make **only** the minimal change needed; if a page is already safe, leave it.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm build:palworld && pnpm lint:palworld`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/palworld/src/features
git commit -m "fix(palworld): horizontal-scroll tables + overflow-safe detail pages on mobile"
```

---

## Task 9: Playwright mobile e2e

**Files:**
- Create: `frontend/apps/palworld/e2e/mobile.spec.ts`

- [ ] **Step 1: Write the mobile e2e spec**

Create `frontend/apps/palworld/e2e/mobile.spec.ts`. Uses a phone viewport for the whole file. Covers: bottom bar visible + hides the desktop nav, tab navigation, More sheet navigation, and the map FAB → filter/search sheets.

```ts
import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('bottom tab bar is visible and desktop nav is hidden on mobile', async ({ page }) => {
  await page.goto('/pals')
  await expect(page.getByTestId('bottom-tab-bar')).toBeVisible()
  // Desktop top bar (map-shell header) is hidden < md.
  await expect(page.getByTestId('lang-menu')).toBeHidden()
})

test('bottom tabs navigate between sections', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-/items').click()
  await expect(page).toHaveURL(/\/items$/)
  await page.getByTestId('tab-/buildings').click()
  await expect(page).toHaveURL(/\/buildings$/)
})

test('More sheet opens and navigates to a secondary route', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-more').click()
  await expect(page.getByTestId('more-sheet')).toBeVisible()
  await page.getByTestId('more-/technology').click()
  await expect(page).toHaveURL(/\/technology$/)
})

test('map page shows FABs that open filter and search sheets', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.getByTestId('map-fab-filter').click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()
  // Close (Escape) then open search.
  await page.keyboard.press('Escape')
  await page.getByTestId('map-fab-search').click()
  await expect(page.getByTestId('search-sheet')).toBeVisible()
  await expect(page.getByTestId('marker-search')).toBeVisible()
})
```

- [ ] **Step 2: Run the mobile e2e**

Run: `pnpm e2e:palworld -- mobile.spec.ts`
(Playwright auto-starts the dev server on port 5188 per `playwright.config.ts`.)
Expected: all four tests pass. If a selector misses, fix the component's `data-testid` or the test to match reality (do not weaken an assertion to force a pass).

- [ ] **Step 3: Run the full e2e suite (desktop regression)**

Run: `pnpm e2e:palworld`
Expected: the pre-existing `smoke.spec.ts` tests still pass (desktop layout unchanged) plus the new mobile tests.

- [ ] **Step 4: Commit**

```bash
git add apps/palworld/e2e/mobile.spec.ts
git commit -m "test(palworld): mobile e2e for bottom nav + map sheets"
```

---

## Task 10: Manual browser verification + finish

- [ ] **Step 1: Verify in a real browser at phone + desktop widths**

Ensure a dev server is running (`pnpm dev:palworld`, or reuse an existing one — check ports 5173+ and 5188). Using the Playwright MCP browser, at **390×844**:
- Visit `/`, `/pals`, `/pals/<some id>`, `/items`, `/buildings`, `/technology`, `/quests`, `/breeding`.
- Confirm: no horizontal page overflow, content isn't hidden behind the bottom bar, bottom nav + More sheet work, map is full-screen with working filter/search sheets, tables scroll rather than squash, tap targets are comfortable.
Then at **1280×800**: confirm the layout is visually unchanged from before (desktop top nav present, sidebar + overlay search on the map, no bottom bar, no mobile header).

Record what was checked. If the UI can't be driven, say so explicitly rather than claiming success.

- [ ] **Step 2: Full verification gate**

Run: `pnpm build:palworld && pnpm lint:palworld && pnpm check:shell && pnpm e2e:palworld`
Expected: all pass. Also run `pnpm --filter @gamemap/ui check && pnpm --filter @gamemap/map-shell check`.

- [ ] **Step 3: Finish the development branch**

Use superpowers:finishing-a-development-branch to decide integration (this work was done on `master` in the main tree per the plan preamble; if a branch/worktree was used instead, integrate with rebase per repo convention). Confirm the user's pre-existing BuildingListPage edit is intact in the final diff.

---

## Self-Review (completed during planning)

- **Spec coverage:** Sheet + useIsMobile (Task 1–2) ✓; viewport/safe-area/dvh (Task 3) ✓; bottom tab nav + More with lang/theme (Task 4) ✓; hide desktop nav + ContentPage (Task 5) ✓; page migration (Task 6) ✓; map full-screen + bottom sheets, SearchPanel inline variant (Task 7) ✓; tables/tap-targets/detail widths (Task 8) ✓; WeChat notes captured in the spec (no build) ✓; testing at 375/768 (Task 9–10) ✓; aion2 untouched ✓.
- **Placeholder scan:** No TBD/TODO. Icon-name and i18n-key uncertainties are flagged with explicit fallback instructions, not left open.
- **Type consistency:** `NavKey` reused from `TopNav`; `variant: "floating" | "inline"` defined in SearchPanelProps (Task 7a) and consumed in App (Task 7b); `useIsMobile`, `Sheet*` exports match the ui barrel additions.
