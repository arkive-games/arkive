# Arkive Games — Meta Site Design

**Date:** 2026-07-09
**Status:** Approved (pending spec review)

## Goal

A small landing site branded **"Arkive Games"** that links out to the two existing
game sites. It is a new app in the frontend pnpm workspace, built on the same web
stack as the sub-apps. Deployment (DNS, hosting, CI) is explicitly **out of scope** —
the owner will set that up later. The meta site is intended for the root domain
(`www.tc-imba.com` / `tc-imba.com`); the two cards link to `aion2.tc-imba.com` and
`pal.tc-imba.com`.

## Scope

**In scope**
- New workspace app `frontend/apps/meta` (package name `meta`, dev port `15175`).
- One page: an "Arkive Games" header with a theme toggle and a language switcher,
  and two link cards (AION2, Palworld), each showing a game logo + one-line
  description, the whole card linking to the game's site.
- Light/dark theme via the shared `@gamemap/map-shell` `ThemeProvider` / `ThemeToggle`,
  persisted to `localStorage` under `meta.theme`.
- Full 17-locale i18n parity with the sub-apps (`i18n.ts` in the same pattern).
- Workspace scripts (`dev:meta`, `build:meta`, `lint:meta`, `preview:meta`) in
  `frontend/package.json`.

**Out of scope**
- Any hosting, DNS, nginx, or CI/CD changes. No edits to `.github/workflows/deploy.yml`.
- Leaflet / map-engine / data-contract (the meta site renders no map and loads no data).
- A tagline (deferred — header shows just "Arkive Games" for now).

## Approach

Chosen: **new single-page app, no router** (mirrors palworld/aion2 setup minus
TanStack Router, since there is exactly one page). Rejected alternatives: including
TanStack Router (a router for zero routes — YAGNI); a shared landing package
(over-engineered for two hard-coded cards).

## Architecture

`frontend/apps/meta/` mirrors `apps/palworld` structure, trimmed:

```
apps/meta/
  index.html
  package.json            # name "meta"; deps: react, react-dom, i18next stack,
                          #   @gamemap/ui, @gamemap/map-shell (NOT map-engine,
                          #   NOT data-contract, NOT leaflet)
  vite.config.ts          # react + tailwindcss plugins; server.port 15175,
                          #   strictPort, host 0.0.0.0, allowedHosts true;
                          #   '@' alias -> src. No static-dir middleware.
  tsconfig*.json          # copied from palworld
  eslint.config.js        # copied from palworld
  env.d.ts                # add VITE_AION2_URL / VITE_PAL_URL typings
  public/
    aion2.webp            # copied from apps/aion2/public/aion2.webp
    palworld-logo.webp    # copied from apps/palworld/public/images/palworld-logo.webp
  src/
    main.tsx              # createRoot -> ThemeProvider -> App (no RouterProvider)
    App.tsx               # header (wordmark + ThemeToggle + language switcher) + 2 cards
    index.css             # Tailwind v4 + neutral slate theme tokens + html font-size
    i18n.ts               # 17-locale strings (card descriptions + "Open site" label)
    sites.ts              # site metadata (id, name, logo, url-from-env, description key)
```

### Components / data flow

- `sites.ts` exports an array of two site descriptors:
  ```ts
  { id: 'aion2', name: 'AION2', logo: '/aion2.webp',
    url: import.meta.env.VITE_AION2_URL ?? 'https://aion2.tc-imba.com',
    descKey: 'site.aion2.desc' }
  { id: 'palworld', name: 'Palworld', logo: '/palworld-logo.webp',
    url: import.meta.env.VITE_PAL_URL ?? 'https://pal.tc-imba.com',
    descKey: 'site.palworld.desc' }
  ```
  Card URLs come from env vars with the production subdomains as defaults, so the
  owner can override per deployment without code changes.
- `App.tsx` maps over `sites.ts` to render cards from `@gamemap/ui` `Card`. Each card
  is a full-card `<a href={url}>` (target `_self`; these are top-level navigations).
- Language switcher: reuse the same UI primitive the sub-apps use (a `@gamemap/ui`
  Select/Command popover listing `LANGUAGE_LABELS`), writing the chosen locale through
  i18next; detection via `i18next-browser-languagedetector` (same as sub-apps).

### Theme

Own `index.css` with a **neutral slate/zinc** palette (distinct from aion2 teal and
palworld colors) using the same token structure (`:root` + `.dark` + `@theme inline`),
`@source` globs pointing at `packages/ui/src` and `packages/map-shell/src`, and an
`html { font-size }` base consistent with the sub-apps. `ThemeProvider` from map-shell
toggles the `.dark` class; `ThemeToggle` in the header; storage key `meta.theme`.

### i18n

`i18n.ts` follows the sub-app pattern (`LANGUAGES`, `LANGUAGE_LABELS`, i18next init with
language detector). Translated string set is intentionally tiny:
- `site.aion2.desc` — one line describing the AION2 interactive map.
- `site.palworld.desc` — one line describing the Palworld map & database.
- `action.open` — the card/button "Open site" label.

All 17 locales (`en-US, de-DE, es-ES, es-MX, fr-FR, id-ID, it-IT, ja-JP, ko-KR, pl-PL,
pt-BR, ru-RU, th-TH, tr-TR, vi-VN, zh-CN, zh-TW`) get values. Game names ("AION2",
"Palworld") and the brand ("Arkive Games") stay untranslated.

## Testing

- `pnpm --filter meta build` succeeds (tsc + vite).
- `pnpm --filter meta lint` passes.
- Manual: `pnpm dev:meta`, load `http://localhost:15175` — two cards render with
  logos; theme toggle flips light/dark and persists across reload; language switch
  changes the descriptions; each card navigates to the correct subdomain.
- No automated e2e for this app (single static page); parity with sub-apps' Playwright
  setup is not warranted.

## Risks / notes

- Translation quality for 17 locales is machine-assisted; strings are short and
  low-stakes (marketing descriptions), acceptable for a personal hub.
- The two logo assets are copied into `apps/meta/public` because the meta site is a
  separate deployment and cannot reach the sub-apps' public dirs at runtime.
