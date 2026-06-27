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

## Notes
- `frontend/public/UI` is a junction into `images/` (see Phase 0 plan). Do not commit it.
- Old web admin repo: `C:\Users\liuyh\WebstormProjects\aion2-interactive-map-webadmin`
  (to be ported into `frontend/` in Phase 2, then archived).

See `docs/superpowers/specs/2026-06-27-aion2-map-reconstruction-design.md` for the full design.
