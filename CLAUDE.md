# AION2 Interactive Map — Workspace

This folder co-locates five **independent** git repos. It is NOT a monorepo: each
sub-repo keeps its own remote and history; this root repo tracks only shared meta
(this file, `.claude/skills/`, `docs/`).

## Repos
- `frontend/` — unified map + admin app (React 19 / Vite / Tailwind / shadcn / Leaflet).
- `backend/`  — FastAPI + PostgreSQL + S3; dynamic/user data only.
- `tools/`    — Python; transforms the raw game export into `data/` + `images/`.
- `images/`   — derived WebP image set, served over HTTP.
- `data/`     — derived parsed dataset (markers, regions, tables, locales), served over HTTP.

## Data-flow contract
Raw game export (`G:\NCSoft\Export\Exports\AION2\Content\`, Perforce later)
  --tools-->  data/ (text)      --HTTP-->  frontend
  --tools-->  images/ (WebP)    --HTTP-->  frontend
backend  --HTTP (auth, comments, feedback, contributors, progress, uploads, artifact voting)-->  frontend

## Coordinate transform (world → map pixels)
The game uses 3D world coords (`MapData.json` X,Y); the map PNG/tiles are an N×N pixel grid
(`tilesCount × tileSize`, e.g. World_L_A = 8192×8192). The transform is a **pure linear map**
from the map's `WorldBoundBox` to pixels, read from `Data/WorldMap/<Map>.json`
(`Min`/`Max` and `SectorSize × SectorPlaneSize` = pixel size):

```
px = (worldX - Min.X) / (Max.X - Min.X) * pixelWidth      # X → pixel-x, no flip
py = (worldY - Min.Y) / (Max.Y - Min.Y) * pixelHeight     # Y → pixel-y, no flip
```

**Orientation (verified against `World_L_A.png` 2026-06-27): `px_from=X, flip_x=False,
flip_y=False`** — i.e. the formula above as-is. Ground truth used: Eternal Isle = lower-left,
Dawn Legion Base = upper-left. This matches the raw **map image** (image Y increases downward).

**Caveat — two Y conventions, one flip apart:**
- **Map image / PNG / tiles** (this transform): `flip_y=False` (Y down). Use for drawing on the
  map PNG and for the canonical dataset emitted by `tools`.
- **Current frontend `regions.yaml` (Leaflet `CRS.Simple`, Y up):** `flip_y=True`
  (`py' = pixelHeight - py`). The 1A calibration matched this space. The Phase 2 frontend
  should standardize on the image-space (no-flip) convention to remove the discrepancy.

The orientation is expected to hold for all maps (same engine), but **re-verify per map** via
landmarks/overlay. Implementation: `tools/aion2/tools/maps/` (`WorldMapTransform`).

## Notes
- `frontend/public/UI` is a junction into `images/` (see Phase 0 plan). Do not commit it.
- Old web admin repo: `C:\Users\liuyh\WebstormProjects\aion2-interactive-map-webadmin`
  (to be ported into `frontend/` in Phase 2, then archived).

See `docs/superpowers/specs/2026-06-27-aion2-map-reconstruction-design.md` for the full design.
