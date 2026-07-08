# Passive Skills Page + Pals Nav Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/passives` page listing every passive skill (name + description) with a search, and group Paldeck/Breeding/Passive Skills under a "Pals" dropdown in the top nav.

**Architecture:** The page reuses `loadPals(lng)` (which already returns `passives`, `passivesById`, `passiveText`) + `fillPassiveDesc` and the existing `PassiveRow`/`PalPageLoading` components, wrapped in `ContentPage`. The nav uses the shell's existing multi-level `ShellNavItem.children` feature. Reuses existing localized strings (`pal.section.passives`, `search`, `resultsCount`); only a `nav.pals` group label is new.

**Tech Stack:** React 19, TanStack Router, react-i18next, Tailwind v4, Playwright (palworld e2e, port 5188).

**Working directory:** `E:\arkive-games\arkive\frontend`. Paths are repo-root-relative.

---

## Task 1: `PassivesPage` + route

**Files:**
- Create: `frontend/apps/palworld/src/features/pals/PassivesPage.tsx`
- Modify: `frontend/apps/palworld/src/main.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/apps/palworld/src/features/pals/PassivesPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadPals, fillPassiveDesc, type PalsBundle } from '../../lib/pals'
import { PalPageLoading, PassiveRow } from './components'

export default function PassivesPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadPals(lng)
      .then((b) => {
        if (!cancelled) setBundle(b)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const list = useMemo(() => {
    if (!bundle) return []
    const ids = new Set<string>()
    for (const p of bundle.passives) ids.add(p.id)
    for (const id of Object.keys(bundle.passiveText)) ids.add(id)
    const rows = [...ids].map((id) => ({
      id,
      name: bundle.passiveText[id]?.name ?? id,
      description: fillPassiveDesc(bundle.passiveText[id]?.description, bundle.passivesById.get(id)),
    }))
    const q = query.trim().toLowerCase()
    const filtered = q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q),
        )
      : rows
    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [bundle, query])

  return (
    <ContentPage active="/passives" title={t('pal.section.passives')} maxWidth="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="max-w-sm"
          data-testid="passive-search"
        />
        {bundle ? (
          <span className="text-sm text-muted-foreground">
            {t('resultsCount', { count: list.length })}
          </span>
        ) : null}
      </div>

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PalPageLoading />
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border bg-card px-4">
          {list.map((r) => (
            <div key={r.id} data-testid="passive-row">
              <PassiveRow name={r.name} description={r.description} />
            </div>
          ))}
        </div>
      )}
    </ContentPage>
  )
}
```

Note: `active="/passives"` requires the `NavKey` union to include `'/passives'` (Task 2 Step 1). If typecheck runs before Task 2, it will error on that literal — do Task 2 Step 1 first if building in isolation, or accept the transient error until Task 2. (Executing in order: Task 2 Step 1 adds the NavKey; do it before the first `build`.)

- [ ] **Step 2: Register the route**

Edit `frontend/apps/palworld/src/main.tsx`.

(2a) Add the import beside the other page imports:

```tsx
import PassivesPage from './features/pals/PassivesPage'
```

(2b) Add the route definition after `palDetailRoute` (or near the other pal routes):

```tsx
const passivesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/passives',
  component: PassivesPage,
})
```

(2c) Add `passivesRoute` to the `rootRoute.addChildren([...])` array.

- [ ] **Step 3: (defer build to Task 2)** — the NavKey literal `'/passives'` needs Task 2 Step 1 first.

---

## Task 2: Pals nav group + i18n + mobile More

**Files:**
- Modify: `frontend/apps/palworld/src/components/TopNav.tsx`
- Modify: `frontend/apps/palworld/src/i18n.ts`
- Modify: `frontend/apps/palworld/src/components/BottomTabBar.tsx`

- [ ] **Step 1: Extend `NavKey` and regroup the top nav**

Edit `frontend/apps/palworld/src/components/TopNav.tsx`.

(1a) Extend the exported `NavKey` union to add `'/passives'`:

```tsx
export type NavKey = '/' | '/pals' | '/breeding' | '/passives' | '/items' | '/buildings' | '/technology' | '/quests'
```

(1b) Replace the `items` array (currently Map, Paldeck, Database dropdown, Breeding) with a
Pals group + Database group:

```tsx
  const items: ShellNavItem[] = [
    { key: '/', label: t('breeding.navMap'), active: active === '/' },
    {
      key: 'pals',
      label: t('nav.pals'),
      children: [
        { key: '/pals', label: t('pal.title'), active: active === '/pals' },
        { key: '/breeding', label: t('breeding.navBreeding'), active: active === '/breeding' },
        { key: '/passives', label: t('pal.section.passives'), active: active === '/passives' },
      ],
    },
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
  ]
```

- [ ] **Step 2: Add the `nav.pals` group label**

Edit `frontend/apps/palworld/src/i18n.ts`.

(2a) After `DATABASE_LABELS`, add:

```ts
// Top-nav dropdown group label for pal-related pages (Paldeck/Breeding/Passives).
export const PALS_GROUP_LABELS: Record<Language, string> = {
  'en-US': 'Pals', 'de-DE': 'Pals', 'es-ES': 'Pals', 'es-MX': 'Pals', 'fr-FR': 'Pals',
  'id-ID': 'Pals', 'it-IT': 'Pals', 'ja-JP': 'パル', 'ko-KR': '팰', 'pl-PL': 'Pals',
  'pt-BR': 'Pals', 'ru-RU': 'Палы', 'th-TH': 'Pals', 'tr-TR': 'Pals', 'vi-VN': 'Pals',
  'zh-CN': '帕鲁', 'zh-TW': '帕魯',
}
```

(2b) In the `addResourceBundle` loop, extend the `nav` object:

```ts
      nav: { database: DATABASE_LABELS[lng], pals: PALS_GROUP_LABELS[lng] },
```

- [ ] **Step 3: Add Passive Skills to the mobile More sheet**

Edit `frontend/apps/palworld/src/components/BottomTabBar.tsx`.

(3a) Add `Sparkles` to the lucide import (verify it exists; if not, use `Star`):

```tsx
import { Map, PawPrint, Package, Hammer, Menu, FlaskConical, ScrollText, Heart, Sparkles } from 'lucide-react'
```

(3b) In `activeKey`, add before the `/breeding` check:

```tsx
  if (pathname.startsWith('/passives')) return '/passives'
```

(3c) Add Passive Skills to the `more` array:

```tsx
  const more: Tab[] = [
    { key: '/technology', label: t('tech.title'), icon: FlaskConical },
    { key: '/quests', label: t('quest.title'), icon: ScrollText },
    { key: '/breeding', label: t('breeding.navBreeding'), icon: Heart },
    { key: '/passives', label: t('pal.section.passives'), icon: Sparkles },
  ]
```

- [ ] **Step 4: Build + lint**

Run: `pnpm build:palworld && pnpm lint:palworld`
Expected: both pass (NavKey now includes `/passives`, so `PassivesPage`'s `active="/passives"` typechecks; route registered; no unused imports). Fix any lucide icon import error by swapping to a present icon.

- [ ] **Step 5: Commit (Tasks 1+2 together — they interlock via NavKey)**

```bash
git add apps/palworld/src/features/pals/PassivesPage.tsx apps/palworld/src/main.tsx apps/palworld/src/components/TopNav.tsx apps/palworld/src/i18n.ts apps/palworld/src/components/BottomTabBar.tsx
git commit -m "feat(palworld): Passive Skills page + Pals nav dropdown group"
```

---

## Task 3: E2E + verify + finish

**Files:**
- Modify: `frontend/apps/palworld/e2e/nav.spec.ts`

- [ ] **Step 1: Extend the nav e2e**

Append to `frontend/apps/palworld/e2e/nav.spec.ts`:

```ts
test('Pals dropdown navigates to the Passive Skills page and search filters it', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-dropdown-pals').click()
  const passivesLink = page.getByRole('menuitem', { name: 'Passive Skills' })
  await expect(passivesLink).toBeVisible()
  await passivesLink.click()
  await expect(page).toHaveURL(/\/passives$/)

  const rows = page.getByTestId('passive-row')
  const total = await rows.count()
  expect(total).toBeGreaterThan(0)

  // Typing a query that can't match anything drops the list to zero.
  await page.getByTestId('passive-search').fill('zzzzzzzzzz')
  await expect(rows).toHaveCount(0)
  // Clearing restores rows.
  await page.getByTestId('passive-search').fill('')
  await expect(rows.first()).toBeVisible()
})
```

Note: the menu item name `Passive Skills` is the en-US value of `pal.section.passives`; the e2e
runs in the default (en-US) locale.

- [ ] **Step 2: Run the nav e2e**

Run: `pnpm e2e:palworld nav.spec.ts`
Expected: all nav tests pass (the two existing Database tests + the new Pals/Passives test). If
the "Items" menuitem in the existing Database test now needs the dropdown opened first, it
already does that — unaffected.

- [ ] **Step 3: Full regression**

Run: `pnpm e2e:palworld`
Expected: all pass **except** the known pre-existing `smoke.spec.ts` ko-KR heading test.

- [ ] **Step 4: Full gate**

Run: `pnpm --filter @gamemap/map-shell check && pnpm check:shell && pnpm build:palworld && pnpm lint:palworld`
Expected: all pass.

- [ ] **Step 5: Manual browser check (1280px)**

With the dev server running, using the Playwright MCP browser at 1280×800: open the **Pals**
dropdown → confirm Paldeck / Breeding / Passive Skills; click Passive Skills → confirm the page
lists passives with descriptions; type in the search → confirm the list narrows; confirm the
Pals trigger is highlighted while on `/passives`. No console errors beyond the favicon 404.

- [ ] **Step 6: Commit + finish**

```bash
git add apps/palworld/e2e/nav.spec.ts
git commit -m "test(palworld): e2e for Pals dropdown + Passive Skills page search"
```

Confirm the working tree is clean; summarize. Do not push unless asked.

---

## Self-Review

- **Spec coverage:** page lists all passives via union of `passives` + `passiveText` ids
  (Task 1) ✓; search over name/description/id (Task 1) ✓; reuses `PassiveRow`/`PalPageLoading`
  (Task 1) ✓; route (Task 1) ✓; Pals dropdown group (Task 2) ✓; `nav.pals` label (Task 2) ✓;
  mobile More entry + activeKey (Task 2) ✓; e2e for nav + search (Task 3) ✓; no new page i18n
  beyond `nav.pals` ✓.
- **Placeholder scan:** none; icon fallback (`Sparkles`→`Star`) is explicit.
- **Type consistency:** `NavKey` gains `/passives` (Task 2 Step 1) used by `PassivesPage`
  `active` and `BottomTabBar`; `PassiveRow` prop names (`name`, `description`) match
  `atoms.tsx`; `fillPassiveDesc(desc, passive)` signature matches `lib/pals.ts`; `nav.pals`
  defined (Task 2 Step 2) and read (Task 2 Step 1).
