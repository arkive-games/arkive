# Multi-level Top Nav (dropdown nav items) — Shell Feature

**Date:** 2026-07-08
**Scope:** Make the shared `ShellTopBar` (in `frontend/packages/map-shell`) support
**multi-level navigation**: a top-level nav item may declare child items, in which case it
renders as a **dropdown** instead of a plain link. Demonstrate it in the palworld app by
grouping the catalog routes under a "Database" dropdown. aion2 untouched (the change is
additive and backward-compatible).

## Goal

Any consumer of `ShellTopBar` can mark a nav item as a dropdown by giving it `children`.
The item then renders a trigger (label + chevron) that opens a menu of the child links.
Items without `children` behave exactly as today. The palworld desktop top nav uses this to
collapse Items / Buildings / Technology / Quests into one "Database" dropdown, keeping Map,
Paldeck, and Breeding as top-level links.

## Non-goals

- No aion2 changes (its `ShellTopBar` usage keeps working unchanged).
- No nested/second-level submenus. Children are leaf links (one dropdown level only). The type
  is not designed for recursion.
- No change to the mobile bottom tab bar / More sheet (a separate component); the desktop top
  nav is `hidden md:flex`, so dropdowns are desktop-only.

## Design

### Data model (`ShellTopBar.tsx`)

Extend the existing `ShellNavItem`:

```ts
export interface ShellNavItem {
  key: string
  label: ReactNode
  active?: boolean
  /**
   * When present and non-empty, this item renders as a dropdown: `label` (+ a
   * chevron) is the trigger, and each child renders as a menu item via
   * `renderItem`. Children are leaf links — nested `children` are ignored.
   */
  children?: ShellNavItem[]
}
```

Backward compatible: existing callers pass no `children`, so nothing changes for them.

### Rendering

In `ShellTopBar`, the left nav area maps each item:

- **No children** → unchanged: `nav.renderItem(item, navItemClass(item.active))` wrapped in a
  `<span>`.
- **Has children** → a `DropdownMenu` (from `@gamemap/ui`, already imported here):
  - `DropdownMenuTrigger asChild` wraps a `<button>` styled with the same nav-item classes,
    plus `inline-flex items-center gap-1` and a `ChevronDown` icon. `data-testid="nav-dropdown-<key>"`.
  - The trigger uses the **active** styling when `item.active` OR any child is `active`
    (so the group highlights while you're on one of its pages).
  - `DropdownMenuContent align="start"` (z-index above the map) lists each child as
    `DropdownMenuItem asChild` wrapping `nav.renderItem(child, childClass(child.active))`.
    `asChild` makes the routed link the focusable menu row (keyboard nav, focus ring).

Factor the current inline class logic into a helper so plain items and dropdown triggers style
identically:

```ts
const navItemClass = (active?: boolean) =>
  cn(
    "text-sm transition-colors",
    active
      ? cn("font-semibold text-primary", nav.classNames?.itemActive)
      : cn("text-foreground/70 hover:text-foreground", nav.classNames?.item),
  )
```

Child menu-item link class: `cn("w-full", child.active ? "font-semibold text-primary" : "text-foreground")`.

The dropdown-rendering lives in a small internal `NavDropdown` component inside
`ShellTopBar.tsx` (keeps `ShellTopBar` readable; not exported).

### Consumer (palworld `TopNav.tsx`)

Group the four catalog routes under one dropdown; keep the rest top-level:

- Map (`/`), Paldeck (`/pals`), **Database ▾** { Items (`/items`), Buildings (`/buildings`),
  Technology (`/technology`), Quests (`/quests`) }, Breeding (`/breeding`).
- Parent "Database" item: `key: 'database'`, `label: t('nav.database')`, `children: [...]`,
  each child with its existing `active` computation. The `NavKey`/`active` prop stays the
  source of truth for which child is active.
- Add a localized `nav.database` label (new i18n key, merged for all 17 locales via a label
  map, same mechanism as the `more`/`filter` keys already added).

`renderItem` is unchanged — it still wraps `item.label` in a TanStack `Link` to `item.key`.
For the parent (`key: 'database'`) there is no route; it never reaches `renderItem` because the
shell renders it as a trigger, not a link.

### Error handling / edge cases

- Empty `children: []` → treated as no dropdown (renders as a plain item). Guard with
  `children && children.length > 0`.
- `active` on the parent is optional; the shell derives group-active from children, so the app
  need not compute it (but may set `active` explicitly to force-highlight).

## Testing

- **Unit (`map-shell/src/ShellTopBar.test.tsx`, new)** with vitest + RTL/jsdom:
  - Renders a plain item as a link (via `renderItem`).
  - Renders an item with `children` as a dropdown trigger (`nav-dropdown-<key>` present; no
    direct link for the parent).
  - Trigger shows active styling when a child is active.
  (Radix open-on-click is covered by e2e, not asserted in jsdom.)
- **E2E (palworld `e2e/nav.spec.ts`, new, desktop viewport)**: on `/`, the Database dropdown
  trigger is visible; clicking it reveals the Items link; clicking Items navigates to `/items`;
  the Database trigger shows the active state on `/items`.
- **Regression**: existing smoke + mobile e2e still pass; `pnpm build:palworld`,
  `lint:palworld`, `check:shell`, and package typechecks pass.

## Rollout

Work on `master` in the main tree (consistent with the current session); focused commits with
explicit paths. Additive shell API + one consumer change; desktop-only surface.
