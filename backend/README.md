# backend/ — RETIRED

**This service is not deployed and must not be redeployed.** It is kept as a
read-only reference. The Go service in [`backend-go/`](../backend-go/) replaced it
and is the only backend running.

## What happened

Retired on 2026-08-16. On the server the `core` container was removed from the
`aion2-interactive-map-backend` compose project and its published port 9000 closed;
the service definition is commented out in that project's `docker-compose.yml`
rather than deleted, so its environment and port mapping stay on record.

The evidence for retiring it, in case anyone wonders whether it was still needed:

- The last genuine API request was **2026-08-09 05:06** — a browser fetching
  `/api/v1/export/data/types.yaml` and an Abyss artifacts list. Everything after
  that in five months of logs is vulnerability scanners probing `/`, `/metrics`,
  `/mcp` and similar.
- No frontend calls it. Every app resolves its API to `ARKIVE_PRODUCTION_API_URL`
  (`api-arkive.tc-imba.com`, the Go service), and no frontend code references port
  9000. The aion2 map data it used to serve moved to the `data/` artifact host,
  which is why that traffic stopped.

## What broke with it

The aion2 upload and sync tools under `tools/apps/aion2/` targeted this service and
no longer work — nine modules reaching it through `backend-client`, among them
`servers/update.py`, `artifact/update.py`, `pets/update.py` and `occupation/upload.py`,
authenticating with `AION2_BACKEND_USERNAME` / `AION2_BACKEND_PASSWORD` from
`tools/.env`.

They had already fallen out of use — the log evidence above is what says so, since a
run would have left requests after 2026-08-09 — but a connection refused is not
self-explanatory. If you need one of them, the work is to port its endpoint to
`backend-go` rather than to restart this service.

## What is still live, and must stay that way

The PostgreSQL and Redis containers in the same compose project are **not** retired.
`backend-go` runs on them — its `arkive` database is on that PostgreSQL instance, and
its rate limiting and Altcha replay protection use that Redis. Bringing that compose
project down as a whole takes Arkive down with it. Only the `core` service was removed.

Both are now published on `127.0.0.1` rather than `0.0.0.0`. They had been reachable
from the internet behind their password alone; `backend-go` reaches them by service
name over the shared docker network, so the change costs it nothing.

The legacy `aion2` database is kept. It holds the markers, abyss artifacts, comments
and marker feedback this service managed, none of which has been ported yet.

## Why the source is kept

These are the only implementations of the parts `backend-go` does not have yet:

- `aion2/backend/services/abyss_artifacts.py` — artifact states, votes, contributors
- `aion2/backend/services/markers.py` — marker feedback and contributions
- `aion2/backend/models/` — the schema behind both, and `user_marker_progress`

Whoever ports those will want to read how they worked, and the shape of the data
already in the `aion2` database. Deleting the directory would leave only git history
to find them in, and nobody reading the tree would know to look.
