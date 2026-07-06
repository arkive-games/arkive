# Arkive

**Interactive maps and encyclopedias for many games** — one platform for exploring
game worlds on tiled maps and looking up their creatures, items, quests, buildings,
and more, all cross-linked and multi-language. Currently covers **AION2** and
**Palworld**, built to add more.

Arkive is a **polyglot monorepo**: the web client, the backend service, and the
data pipeline live here together. The large derived datasets and image sets are
kept in **separate artifact repos** and served over HTTP.

## Layout

| Path | What it is |
|------|-----------|
| `frontend/` | pnpm workspace — the web client. `apps/{aion2,palworld}` (React 19 · Vite · Tailwind · shadcn · Leaflet) built on shared `packages/{ui, map-engine, map-shell, data-contract}`. |
| `backend/` | One **shared** FastAPI + PostgreSQL + S3 service for dynamic/user data (auth, comments, uploads, contributor & artifact voting) — not per-game. Python (uv). |
| `tools/` | Data pipeline. `apps/{aion2,palworld}` extractors on a shared `packages/` framework; turns the raw game export into the `data-*` / `resource-*` artifacts. Python (uv). |
| `docs/` | Design specs and implementation plans. |

### Artifact repos (separate, served over HTTP — not in this monorepo)

| Repo | Contents |
|------|----------|
| `resource-aion2`, `resource-palworld` | Derived WebP image sets under a `UI/` root — map tiles and icons. |
| `data-aion2`, `data-palworld` | Derived datasets — markers, regions, tables, and locales. |

The pipeline in `tools/` generates these; the client reads them over HTTP (prod) or
from local checkouts (dev).

## Develop — web client

```bash
cd frontend
pnpm install
pnpm dev:aion2          # aion2 dev server        (pnpm dev:palworld for palworld)
pnpm build:aion2        # production build         (pnpm build:palworld)
pnpm test               # unit tests (vitest)
```

Commands are game-specific — there is no bare default. In dev the server serves
images and data from your local checkouts of the artifact repos; point it at them
with env vars (absolute paths are simplest):

```bash
RESOURCE_UI_DIR=/e/arkive-games/resource-aion2/UI \
DATA_DIR=/e/arkive-games/data-aion2 \
pnpm dev:aion2
```

For production the client fetches from CDN/API base URLs (`VITE_RESOURCE_BASE_URL`,
`VITE_API_BASE_URL`).

## Develop — backend & tools

```bash
# backend (FastAPI service; see backend/ for docker-compose + migrations)
cd backend && uv sync

# tools (data pipeline)
cd tools && uv sync && uv run pytest
uv run python -m apps.aion2.tools.maps.emit_frontend --map World_L_A   # example
```

## Coordinate transform

World coordinates map to map pixels via a pure linear transform read from the
game's `WorldMap` bounds; see `docs/` and `tools/apps/aion2/tools/maps/`
(`WorldMapTransform`) for details and per-map verification notes.

## License

Copyright (c) 2025 Yihao Liu (tc-imba)

| Component | Path | License |
|-----------|------|---------|
| Source code | `frontend/`, `backend/`, `tools/` | GPL-3.0 |
| Data & assets | `data-*` / `resource-*` artifact repos | CC BY-NC 4.0 |

### 🧠 Code — GPL-3.0

The source code in this repository is Free/Libre Open Source Software under the GNU
General Public License v3.

This program is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version. It is
distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the `LICENSE` file for details.

> Full text: https://www.gnu.org/licenses/gpl-3.0.html

### 📦 Data — CC BY-NC 4.0

The game data and assets (served from the `data-*` and `resource-*` repos: images,
datasets, metadata, and other content) are licensed under Creative Commons
**Attribution-NonCommercial 4.0**. You may reuse them for **non-commercial**
purposes with attribution.

> Full text: https://creativecommons.org/licenses/by-nc/4.0/

If you require commercial rights to the data, please contact the author.
