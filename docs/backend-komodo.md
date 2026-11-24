# Backend releases with Komodo

GitHub Actions builds `backend-go` after successful `master` CI and publishes a
`git-<revision>` image tag. It advances the registry's `:komodo` channel to that
digest only while the backend revision is still current on `master`. Komodo
polls that channel and pulls the image on the deployment host. GitHub needs no
access to that host, Komodo, or production credentials.

## Configure publishing

1. Choose a registry reachable from both GitHub-hosted runners and the production
   Docker host. Verify a pull from the host before opting in. GHCR works with the
   workflow's `GITHUB_TOKEN`; use a nearby registry such as Tencent TCR if GHCR
   is unreliable. Retain the `git-*` tags and their manifests for rollback.
2. Create the GitHub environment `backend-registry`. For a registry other than
   GHCR, set its `BACKEND_REGISTRY_USERNAME` variable and
   `BACKEND_REGISTRY_PASSWORD` secret to a publisher restricted to this image.
   For GHCR, grant this repository Actions write access if using an existing
   package. Decide whether images are public or require an authenticated pull.
3. Set the repository variable `BACKEND_IMAGE_REPOSITORY` to the fully qualified
   image name without a tag, for example `ghcr.io/arkive-games/backend-go`. This
   enables publishing, not deployment. Leave it unset until ready. The workflow
   currently targets `linux/amd64`; confirm that the production host is x86-64.
4. After the setup has landed on `master`, trigger a new master CI run or rerun
   CI for the current master push. Once publishing succeeds, record the
   `image@sha256:...` from the Actions job summary. A rerun can reuse an existing
   release image without rebuilding.

## Stage and adopt the stack

1. Install [Komodo Core and Periphery](https://komo.do/docs/setup) using a pinned
   release (the settings below target 2.3.2). Keep the dashboard and agent on
   a private management network. Periphery can control Docker on the host, so
   restrict administrator access and back up Komodo's database. Use Docker Compose
   v2.24.4 or newer. If the registry is private, assign the Komodo stack a
   registry account with pull-only access.
2. Create a Compose Stack using **Files on the host**. Stage the two Compose
   files from the same reviewed checkout together in its run directory. If
   Periphery is containerized, mount that directory at the same absolute path.
   Set the file list in this order: `docker-compose.prod.yml`,
   `docker-compose.komodo.yml`. Apply future Compose changes deliberately from a
   reviewed revision; registry polling updates images, not these files.
3. Put deployment settings in the existing restricted host `.env` outside Git;
   configure it as an additional env file with tracking disabled (`track: false`).
   The Compose overlay contains the literal `:komodo` image channel so Komodo can
   parse its registry digest before generating its env file. Do not put the
   production credentials into GitHub.
4. Enable **Auto Pull**. Leave **Run Build** and **Destroy Before Deploy** off.
   Set Compose extra args to `--pull never --wait --wait-timeout 180`. Komodo
   pulls before Compose starts; `--pull never` makes Compose use that local
   image. Keep Stack alerts enabled.
5. For staging, use a different Compose project name, loopback port, separate
   database and credentials, and a nonproduction storage bucket. Deploy a pinned
   digest, verify the core logs show successful migrations and core is healthy, then
   redeploy a previous digest and verify it can serve against the upgraded
   staging database. Test registry polling in staging before switching it on in
   production.
6. At production cutover, first back up the database and record the currently
   running API image and original Compose command. Use Compose project name
   `arkive-backend` (verify the live name first) and the current `SERVER_PORT`,
   so Komodo adopts the existing API rather than creating a competing listener.
   Deploy the tested pinned digest manually. The shared PostgreSQL/Redis
   project and nginx stay in place. Never run `down` on the legacy project.
7. Verify `/healthz` on the backend's loopback port and a database-backed read
   through nginx, such as `GET https://api.arkive.games/api/v1/core/forum/posts`.
   Configure an external availability check and Komodo alert delivery, then
   restore the literal `:komodo` image reference in the overlay. Deploy once and
   enable **Auto Update** and **Auto Update All Services**. Set Komodo's
   **Global Auto Update** procedure to run every five minutes. Its default is
   daily; the Core resource polling interval does not set the procedure's
   schedule. Verify a successful procedure run and the live image revision
   after publishing, rather than treating a registry push as a deploy. Do not
   add a Git push webhook.

## Upgrade from the separate migration service

Pause Auto Update while replacing the host overlay with the reviewed version.
Clear `migrate` from the Stack's ignored services and redeploy. After the new
core is healthy, confirm that `arkive-backend-migrate-1` is an exited container
from the `arkive-backend` project with Compose service label `migrate`. Remove
only that container with `docker rm arkive-backend-migrate-1`, if present, and
restore Auto Update.

## Failure and rollback

The API runs goose migrations on startup before opening its HTTP listener.
`/healthz` becomes available only after migrations succeed. This is a
single-instance Compose rollout: the API can be unavailable while migrations
run. A failed migration is visible in the core logs and fails the rollout;
Compose does not restore the previous API automatically. The standalone
`arkive migrate` command remains available for manual use.

Disable **Auto Update** first, then temporarily change the overlay's image to
the previous known-good `git-<revision>` tag or digest and deploy it from
Komodo. Check the API and the nginx URL again, then restore `:komodo`. Leave
automatic updates off until a corrected release is tested. An image rollback
does not roll back goose migrations. Use backward-compatible schema changes for
routine releases, and require a manual rollout and a recovery plan for
incompatible ones. Do not run destructive down migrations as part of automatic
rollback.
