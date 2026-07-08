# Multi-level Top Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `ShellTopBar` render a nav item as a dropdown when it has `children`, and use it in palworld to group the catalog routes under a "Database" dropdown.

**Architecture:** Extend `ShellNavItem` with an optional `children` array. In `ShellTopBar`, an item with children renders via a small internal `NavDropdown` (Radix `DropdownMenu` from `@gamemap/ui`) instead of a plain link; items without children are unchanged. palworld's `TopNav` supplies the grouped items and a localized label.

**Tech Stack:** React 19, TypeScript, `radix-ui` DropdownMenu (via `@gamemap/ui`), lucide-react, Tailwind v4, vitest + @testing-library/react (map-shell unit), Playwright (palworld e2e, Desktop Chrome, port 5188).

**Working directory for commands:** `E:\arkive-games\arkive\frontend`. Paths below are repo-root-relative.

**Constraints:** `map-shell` must not import i18n/router/`import.meta.env`/`localStorage`/`fetch`/`@/` (root `check:shell`). DropdownMenu + lucide are fine. The desktop top nav is `hidden md:flex`, so this is desktop-only; the mobile bottom bar is a separate component and is not touched.

---

## Task 1: Dropdown support in `ShellTopBar`

**Files:**
- Modify: `frontend/packages/map-shell/src/ShellTopBar.tsx`
- Test: `frontend/packages/map-shell/src/ShellTopBar.test.tsx` (create)

- [ ] **Step 1: Write the failing unit test**

Create `frontend/packages/map-shell/src/ShellTopBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ShellTopBar, type ShellNavItem } from "./ShellTopBar"

afterEach(cleanup)

const renderItem = (item: ShellNavItem, className: string) => (
  <a href={`#${item.key}`} className={className} data-testid={`link-${item.key}`}>
    {item.label}
  </a>
)

describe("ShellTopBar nav", () => {
  it("renders a plain item as a link", () => {
    const items: ShellNavItem[] = [{ key: "/", label: "Map", active: true }]
    const { getByTestId } = render(<ShellTopBar nav={{ items, renderItem }} />)
    expect(getByTestId("link-/").textContent).toBe("Map")
  })

  it("renders an item with children as a dropdown trigger, not a link", () => {
    const items: ShellNavItem[] = [
      {
        key: "database",
        label: "Database",
        children: [
          { key: "/items", label: "Items" },
          { key: "/buildings", label: "Buildings", active: true },
        ],
      },
    ]
    const { getByTestId, queryByTestId } = render(
      <ShellTopBar nav={{ items, renderItem }} />,
    )
    // Trigger present; no direct link for the parent.
    expect(getByTestId("nav-dropdown-database")).toBeTruthy()
    expect(queryByTestId("link-database")).toBeNull()
  })

  it("marks the dropdown trigger active when a child is active", () => {
    const items: ShellNavItem[] = [
      {
        key: "database",
        label: "Database",
        children: [{ key: "/items", label: "Items", active: true }],
      },
    ]
    const { getByTestId } = render(<ShellTopBar nav={{ items, renderItem }} />)
    expect(getByTestId("nav-dropdown-database").className).toContain("text-primary")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gamemap/map-shell exec vitest run src/ShellTopBar.test.tsx`
Expected: FAIL — dropdown trigger `nav-dropdown-database` not found (current code renders every item via `renderItem`).

- [ ] **Step 3: Implement dropdown rendering**

Edit `frontend/packages/map-shell/src/ShellTopBar.tsx`.

(3a) Update the imports at the top to add `DropdownMenuContent`, `DropdownMenuItem`, and `ChevronDown`:

```tsx
import type { ReactNode } from "react"
import { CheckIcon, ChevronDown, Languages, Settings } from "lucide-react"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@gamemap/ui"
```

(3b) Extend `ShellNavItem` (add the `children` field):

```tsx
export interface ShellNavItem {
  /** Stable key, e.g. the route path. */
  key: string
  label: ReactNode
  active?: boolean
  /**
   * When present and non-empty, this item renders as a dropdown: `label` (+ a
   * chevron) is the trigger and each child renders as a menu item via
   * `renderItem`. Children are leaf links — nested `children` are ignored.
   */
  children?: ShellNavItem[]
}
```

(3c) Replace the nav-items `.map(...)` block inside the `left area` (currently the
`{nav?.items.map((item) => ( <span ...> {nav.renderItem(...)} </span> ))}`) with a version that
branches on `children`. The surrounding `{(leftSlot || nav) && (<div ...>{leftSlot} ... </div>)}`
stays; only the items map changes:

```tsx
          {nav?.items.map((item) =>
            item.children && item.children.length > 0 ? (
              <NavDropdown key={item.key} item={item} nav={nav} />
            ) : (
              <span key={item.key}>
                {nav.renderItem(item, navItemClass(item.active, nav))}
              </span>
            ),
          )}
```

(3d) Add the shared class helper and the `NavDropdown` component at the bottom of the file
(module scope, not exported):

```tsx
/** Base + active/inactive classes for a top-bar nav item (link or dropdown trigger). */
function navItemClass(active: boolean | undefined, nav: ShellTopBarNav): string {
  return cn(
    "text-sm transition-colors",
    active
      ? cn("font-semibold text-primary", nav.classNames?.itemActive)
      : cn("text-foreground/70 hover:text-foreground", nav.classNames?.item),
  )
}

function NavDropdown({ item, nav }: { item: ShellNavItem; nav: ShellTopBarNav }) {
  const children = item.children ?? []
  const groupActive = item.active || children.some((c) => c.active)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={`nav-dropdown-${item.key}`}
          className={cn(navItemClass(groupActive, nav), "inline-flex items-center gap-1")}
        >
          {item.label}
          <ChevronDown className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[2000]">
        {children.map((child) => (
          <DropdownMenuItem key={child.key} asChild>
            {nav.renderItem(
              child,
              cn("w-full", child.active ? "font-semibold text-primary" : "text-foreground"),
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gamemap/map-shell exec vitest run src/ShellTopBar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + shell purity**

Run: `pnpm --filter @gamemap/map-shell check && pnpm check:shell`
Expected: no type errors; `check:shell` exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/map-shell/src/ShellTopBar.tsx packages/map-shell/src/ShellTopBar.test.tsx
git commit -m "feat(map-shell): dropdown (multi-level) nav items in ShellTopBar"
```

---

## Task 2: Use the dropdown in palworld + i18n label

**Files:**
- Modify: `frontend/apps/palworld/src/i18n.ts`
- Modify: `frontend/apps/palworld/src/components/TopNav.tsx`

- [ ] **Step 1: Add a localized `nav.database` label**

Edit `frontend/apps/palworld/src/i18n.ts`.

(1a) After the `FILTER_LABELS` map (added previously), add:

```ts
export const DATABASE_LABELS: Record<Language, string> = {
  'en-US': 'Database', 'de-DE': 'Datenbank', 'es-ES': 'Base de datos', 'es-MX': 'Base de datos',
  'fr-FR': 'Base de données', 'id-ID': 'Basis data', 'it-IT': 'Database', 'ja-JP': 'データベース',
  'ko-KR': '데이터베이스', 'pl-PL': 'Baza danych', 'pt-BR': 'Banco de dados', 'ru-RU': 'База данных',
  'th-TH': 'ฐานข้อมูล', 'tr-TR': 'Veritabanı', 'vi-VN': 'Cơ sở dữ liệu', 'zh-CN': '数据库',
  'zh-TW': '資料庫',
}
```

(1b) In the `addResourceBundle` loop, add a `nav` sub-object alongside the existing
`more`/`filter` keys:

```ts
      more: MORE_LABELS[lng],
      filter: FILTER_LABELS[lng],
      nav: { database: DATABASE_LABELS[lng] },
```

- [ ] **Step 2: Group the catalog routes under a dropdown in `TopNav`**

Edit `frontend/apps/palworld/src/components/TopNav.tsx`. Replace the flat `items` array
(currently 7 entries) with Map, Paldeck, a `database` dropdown parent, and Breeding:

```tsx
  const items: ShellNavItem[] = [
    { key: '/', label: t('breeding.navMap'), active: active === '/' },
    { key: '/pals', label: t('pal.title'), active: active === '/pals' },
    {
      key: 'database',
      label: t('nav.database'),
      children: [
        { key: '/items', label: t('item.title'), active: active === '/items' },
        { key: '/buildings', label: t('building.title'), active: active === '/buildings' },
        { key: '/technology', label: t('tech.title'), active: active === '/technology' },
        { key: '/quests', label: t('quest.title'), active: active === '/quests' },
      ],
    },
    { key: '/breeding', label: t('breeding.navBreeding'), active: active === '/breeding' },
  ]
```

Note: `renderItem` is unchanged. It does `<Link to={item.key as NavKey}>` — only leaf items
(real routes) reach it; the `database` parent is rendered by the shell as a trigger. The
`NavKey` type already includes all four child routes, so `item.key as NavKey` stays valid for
the children.

- [ ] **Step 3: Typecheck + lint + build**

Run: `pnpm build:palworld && pnpm lint:palworld`
Expected: both pass, no unused imports.

- [ ] **Step 4: Commit**

```bash
git add apps/palworld/src/i18n.ts apps/palworld/src/components/TopNav.tsx
git commit -m "feat(palworld): group catalog routes under a Database dropdown in top nav"
```

---

## Task 3: Desktop e2e for the dropdown

**Files:**
- Create: `frontend/apps/palworld/e2e/nav.spec.ts`

- [ ] **Step 1: Write the e2e**

Create `frontend/apps/palworld/e2e/nav.spec.ts` (default desktop viewport, so the top nav is
visible):

```ts
import { test, expect } from '@playwright/test'

test('Database dropdown opens and navigates to a catalog route', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('nav-dropdown-database')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const itemsLink = page.getByRole('menuitem', { name: 'Items' })
  await expect(itemsLink).toBeVisible()
  await itemsLink.click()
  await expect(page).toHaveURL(/\/items$/)
})

test('Database trigger shows active styling on a catalog route', async ({ page }) => {
  await page.goto('/buildings')
  await expect(page.getByTestId('nav-dropdown-database')).toHaveClass(/text-primary/)
})
```

- [ ] **Step 2: Run it**

Run: `pnpm e2e:palworld nav.spec.ts`
Expected: both tests pass. If the menu item role differs, inspect and adjust the selector to
match the rendered role/name (do not weaken the navigation assertion).

- [ ] **Step 3: Regression — full e2e**

Run: `pnpm e2e:palworld`
Expected: all pass **except** the known pre-existing `smoke.spec.ts` ko-KR heading test
(fails on base commit too — unrelated). Mobile + smoke + nav otherwise green.

- [ ] **Step 4: Commit**

```bash
git add apps/palworld/e2e/nav.spec.ts
git commit -m "test(palworld): desktop e2e for Database nav dropdown"
```

---

## Task 4: Manual verification + finish

- [ ] **Step 1: Browser check (desktop 1280px)**

With the dev server running (reuse or `pnpm dev:palworld`), using the Playwright MCP browser at
1280×800: on `/`, confirm the top nav shows Map, Paldeck, **Database ▾**, Breeding; open the
Database dropdown; confirm Items/Buildings/Technology/Quests are listed; click one and confirm
navigation + that the Database trigger is highlighted while on that route. Confirm no console
errors beyond the pre-existing favicon 404.

- [ ] **Step 2: Full gate**

Run: `pnpm --filter @gamemap/ui check && pnpm --filter @gamemap/map-shell check && pnpm check:shell && pnpm build:palworld && pnpm lint:palworld`
Expected: all pass.

- [ ] **Step 3: Finish**

Confirm the working tree is clean (aside from any user-owned edits) and summarize. Do not push
unless asked.

---

## Self-Review

- **Spec coverage:** data model `children` (Task 1 Step 3b) ✓; dropdown rendering + group-active
  (Task 1) ✓; palworld grouping + `nav.database` label (Task 2) ✓; unit tests (Task 1) ✓; e2e
  (Task 3) ✓; regression + gate (Task 3/4) ✓; aion2 untouched (additive API) ✓.
- **Placeholder scan:** none; selectors and fallbacks are explicit.
- **Type consistency:** `ShellNavItem.children` defined in Task 1 and consumed in Task 2;
  `navItemClass(active, nav)` signature consistent; `NavDropdown` props match. `nav.database`
  i18n key defined in Task 2 Step 1 and read in Step 2.
