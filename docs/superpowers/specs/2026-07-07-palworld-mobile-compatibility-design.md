# Palworld App + Map-Shell — Mobile Phone Compatibility

**Date:** 2026-07-07
**Scope:** Make every page of the `palworld` app usable on a phone, and make the shared
`map-shell` package responsive. **Defer aion2** (leave untouched). Keep a future **WeChat
mini-program** in mind (responsive web only for now; document, don't scaffold).

## Goal

All palworld pages (map, pals list/detail, items list/detail, buildings list/detail,
technology, quests list/detail, breeding) render and function well on phones (target 375px
wide, e.g. iPhone SE) without breaking the existing desktop (≥ md / 768px) layout.

## Non-goals

- No aion2 changes.
- No WeChat mini-program scaffolding (no Taro/uni-app port). We only make choices that keep a
  future port viable and note them.
- No new heavy dependencies (no `vaul`/drag libraries). Sheets use the Radix Dialog primitive
  already present in `packages/ui`.

## Decisions (confirmed with user)

1. **WeChat target:** "keep it in mind" — responsive web only now; flag WeChat pitfalls in this
   spec for a later effort.
2. **Mobile navigation:** bottom tab bar with 4 primary tabs + a **More** sheet for the rest.
3. **Map controls on mobile:** full-screen map with **bottom sheets** (slide-up) for filters and
   search, opened via floating action buttons.

## Breakpoint

- **Mobile = viewport width < 768px** (Tailwind `md`). Tablet and up keep the current desktop
  layout. A single `useIsMobile()` hook backed by `matchMedia('(max-width: 767px)')` is the
  source of truth for JS-driven layout switches; CSS uses Tailwind `md:` prefixes.

## Approach

**Incremental responsive layer** (chosen over adopting `vaul`, and over a full layout/token
refactor). Add the two missing mobile primitives, a bottom-tab nav, responsive map-shell with
slide-up sheets, and per-page polish. Reuse the Tailwind responsive utilities already used
across the app.

### Component / change inventory

#### A. Shared primitives — `frontend/packages/ui`

- **`sheet.tsx`** — shadcn Sheet on the existing `@radix-ui/react-dialog` dep. Supports
  `side="bottom" | "left" | "right" | "top"`, overlay, close button, slide transition.
  Exported from `packages/ui`.
- **`use-is-mobile.ts`** (or `use-media-query.ts`) — `useIsMobile()` returning boolean from
  `matchMedia('(max-width: 767px)')`; SSR/first-render safe (defaults false, subscribes on
  mount). Exported from `packages/ui`.
- **Safe-area & viewport:**
  - `frontend/apps/palworld/index.html` — set
    `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`.
  - Add safe-area padding utilities/classes (via `env(safe-area-inset-*)`) usable by the bottom
    bar and bottom sheets. Implemented as small CSS in `index.css` (e.g. a `.pb-safe` helper) or
    inline `style` with `env()`.
  - Replace shell root heights `h-screen` (100vh) with `h-dvh` (100dvh) so the mobile browser
    chrome does not clip content. Applies to `ShellLayout` and the content-page wrapper.

#### B. App navigation — `frontend/apps/palworld`

- **`components/BottomTabBar.tsx`** (new) — fixed bottom bar, `md:hidden` → visible only
  `< md` (shown by default, hidden at `md+`). Four primary tabs: **Map** (`/`), **Pals** (`/pals`), **Items** (`/items`),
  **Buildings** (`/buildings`). Fifth item **More** opens a bottom `Sheet` containing:
  Technology (`/technology`), Quests (`/quests`), Breeding (`/breeding`), plus the **language
  switcher** and **theme toggle** (which live in the top bar on desktop). Active-route
  highlighting mirrors `TopNav`'s `active` prop. Honors `safe-area-inset-bottom`.
- **`components/TopNav.tsx`** — on `md+` unchanged (desktop top bar). On mobile it collapses to a
  compact header (app title + optionally a single menu affordance); primary navigation is the
  bottom bar. Language/theme controls are reachable via the More sheet on mobile.
- **`components/ContentPage.tsx`** (new shared wrapper) — the content pages currently duplicate:
  ```tsx
  <div className="flex h-screen flex-col bg-background text-foreground">
    <TopNav active="/route" />
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-{W} px-4 py-6">{children}</div>
    </div>
  </div>
  ```
  Consolidate into `ContentPage` with props `active` and `maxWidth`. It renders `TopNav`, the
  scroll area, the max-width container, the mobile `BottomTabBar`, and adds **bottom padding on
  mobile** so content clears the tab bar (+ safe area). Uses `h-dvh`. Desktop output is
  unchanged. Migrate pals/items/buildings/quests/technology/breeding list + detail pages to it.

#### C. Map page — `frontend/apps/palworld/src/App.tsx` + `frontend/packages/map-shell`

- **`ShellLayout.tsx`** — becomes responsive:
  - `md+`: current sidebar + content side-by-side (unchanged).
  - `< md`: map fills the screen; the sidebar is not rendered inline. Two floating action
    buttons overlay the map (filter ⚙ and search 🔍). Each opens a **bottom `Sheet`**:
    - Filter sheet hosts the `FilterPanel` content and the `ShellMapSelect` (map switcher) in its
      header.
    - Search sheet hosts the `SearchPanel` content full-width.
  - `ShellLayout` gains props/slots so the app can pass the same sidebar/search content into
    either the desktop panels or the mobile sheets (single source of content).
- **`SearchPanel.tsx`** — remove hardcoded desktop-only `w-[290px]` assumption when rendered
  inside the mobile sheet (full width there); keep desktop overlay behavior on `md+`.
- **`ShellMapSelect.tsx`** — ensure it works at narrow widths (used inside the filter sheet).
- **`App.tsx`** — wire the mobile FAB → sheet flow via `useIsMobile()` and the new `ShellLayout`
  props; desktop path unchanged. Bottom tab bar also present on the map page.

#### D. Content-page polish

- **Detail pages** (Pal/Item/Building/Quest): already stack `< md`. Verify the `320px` sidebars
  don't overflow narrow phones — cap with `w-full`/`max-w-full`, images `max-w-full h-auto`.
- **Tables** (`PalTable` and any other wide table): wrap in `overflow-x-auto` so columns scroll
  horizontally on mobile rather than squashing.
- **TechnologyPage**: already `grid-cols-1` `< md`; verify tap usability and horizontal scroll of
  the tree if needed.
- **Touch targets**: interactive controls reach ~44px effective touch height on mobile (bump
  `sm`-sized buttons/inputs at the mobile breakpoint where they'd otherwise be < 40px).
- **Filters / search inputs / category selects**: full-width on mobile (most already are — verify).
- **List grids**: confirm each list drops to 1–2 columns at mobile and cards remain legible.

#### E. WeChat-friendliness (now + documented)

Done now (cheap, also good for mobile web):
- `viewport-fit=cover` + safe-area insets.
- `h-dvh` instead of `h-screen`.
- No hover-only affordances for essential actions — ensure `HoverCard`/tooltip content is
  supplementary, not the only way to reach information/actions on touch.

Documented for a future port (not built now):
- A WeChat mini-program cannot run React/DOM or Leaflet directly. A future Taro/uni-app port
  would need: a map component swap (Leaflet → WeChat `map` component or a canvas renderer),
  DOM-free data/logic layers (the `lib/` loaders and formatting are already portable), and
  platform adapters for routing/storage. The WebView-wrapper option (host this responsive H5 in
  a `<web-view>`) remains available and needs no code changes beyond what this spec delivers.

## Data flow

No data-flow changes. All data loading (`lib/`), routing (TanStack Router), and the
`data-contract` types are unchanged. This work is presentation/layout only.

## Error handling

No new error surfaces. `useIsMobile()` defaults to `false` before mount (desktop-first) to avoid
layout flash on first paint; the `matchMedia` listener corrects it on mount. Sheets close on
route change and on overlay tap.

## Testing

- Run the existing Vite dev server; drive with the browser (Playwright) at **375px** and
  **768px** widths.
- For each page verify: golden path renders, nav works (bottom bar + More sheet), no content is
  hidden behind the tab bar, no horizontal overflow of the page body, tap targets are usable.
- Map page: FABs open filter/search sheets; filtering and search still work; map is full-screen.
- Regression check at desktop width (≥ 768px): layout is visually unchanged from before.
- aion2 app is not modified.

## Rollout / isolation

- Do the work in a git worktree per project convention; integrate back with rebase.
- Desktop behavior must remain unchanged (guarded by `md:` prefixes and `useIsMobile()` returning
  false above the breakpoint).
