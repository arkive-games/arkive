# Order of the Sinking Star Deployment

The frontend is a static Vite app in `frontend/apps/oss`. It uses the
direct-upload EdgeOne Makers project `arkive-oss` and the production
host `oss.arkive.games`. The local app port is 15181; PBZ owns 15180.

## Required Artifacts

The frontend cannot render a map without the separate exported datasets:

- `data-oss`: `map-display.json`, `tile-overrides.json`,
  `collections.json`, and `props-ground-26006400.json`.
- `resource-oss`: every tile referenced by those documents, including the
  expanded base layers and any tile overrides.

These artifacts are published in the private organization repositories
`arkive-games/data-oss` and `arkive-games/resource-oss`, on `master`.
Their HTTPS hosts are `data-oss.arkive.games` and `resource-oss.arkive.games`;
both serve the exported files with cross-origin GET access for the frontend.

Keep future exports in these separate artifact repositories and their
Git-connected EdgeOne projects. Publish referenced images before the data
that uses them; do not commit exported game data or tiles to the monorepo.

## Credentials and Tools

Use the existing authenticated Windows CLIs: `tccli`, `edgeone.cmd`, and
`aliyun`. Never put credentials, API tokens, or signed temporary preview
URLs in this document. EdgeOne deployment commands need
`$env:PAGES_SOURCE = 'skills'`.

## Build and Upload

From `frontend/` in PowerShell:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd lint:oss
$env:VITE_DATA_BASE_URL = 'https://data-oss.arkive.games'
$env:VITE_RESOURCE_BASE_URL = 'https://resource-oss.arkive.games'
pnpm.cmd build:oss
Copy-Item apps/oss/edgeone.json apps/oss/dist/edgeone.json
$env:PAGES_SOURCE = 'skills'
edgeone.cmd makers deploy apps/oss/dist -n arkive-oss --json
```

Check the CLI's final JSON result and retain the deployment ID in the
execution record below. A project with this name must be a direct-upload
project; the CLI cannot deploy over a Git-connected project.

## Domain, DNS, and HTTPS

Read `docs/edgeone-custom-domains.md` for the existing domain automation.
The public Tencent CLI discovers the Pages zone and requests its certificate:

```powershell
tccli teo DescribeZones --Limit 100
uv run scripts/edgeone_domains.py sync --only oss.arkive.games
uv run scripts/edgeone_domains.py sync --apply --only oss.arkive.games
```

The domain script resolves `arkive-oss` by name, binds the custom domain
through the signed Tencent Pages gateway, creates the Aliyun CNAME with
TTL 600, requests the free HTTPS certificate, and verifies HTTPS. The script
uses the same Tencent credentials as `tccli` and invokes `aliyun alidns`
for DNS. Limit it to this host so unrelated production hosts are untouched.

The equivalent certificate request, using the Pages zone ID from discovery:

```powershell
tccli teo ModifyHostsCertificate --ZoneId <pages-zone-id> --Hosts '["oss.arkive.games"]' --Mode eofreecert
aliyun alidns DescribeDomainRecords --DomainName arkive.games --RRKeyWord oss --region cn-hangzhou
```

## Verification and Activation

Verify HTTPS on `/` and a fresh `/changelog?check=1` request, the About
dialog and its two history links, mobile navigation, and account/settings.
For the actual map, require successful cross-origin fetches for all four
data files, visible tiles on all three layers, working search and collection
filters, and no uncaught browser errors. An HTTP 200 for the frontend alone
does not establish that the map works.

The OSS deployment matrix now names `oss.arkive.games`, enabling deep-link
smoke checks and the shared SEO tests. The homepage configuration no longer
marks OSS as coming soon. Those configuration changes take effect on the
public homepage and deployment workflow only after they land and deploy.

## Execution Record

- November 3, 2026: authenticated CLI access, Pages zone discovery, and Aliyun
  DNS read access verified. No OSS DNS record or Pages project existed.
- Frontend upload succeeded using EdgeOne CLI 1.6.46, Tencent CLI
  3.1.145.1, and Aliyun CLI 3.4.11. The uploaded source was merged commit
  `eb7bfa086ca281a4a932dd17da19b360e40adf5a`.
- Direct-upload project: `arkive-oss` (`makers-4ldl4flg7nfb`), global area;
  deployment: `dppaqfoajhva`. The authenticated preset preview served the
  changelog, including its About section and history links. No uncaught
  browser errors were observed. The map displayed its load-error state
  because the required artifact hosts are unavailable.
- Tencent accepted the custom-domain binding for `oss.arkive.games` in
  Pages zone `zone-3k1hxa0oacos`. Certificate request
  `749078fc-9276-4f20-b5b5-5e5dcb69f890` was accepted. The domain remained
  without an assigned CNAME even after its status changed from `process`
  to `online`; HTTPS was still in `apply`.
  Aliyun confirmed that no OSS DNS record exists; no target was guessed.
  Rerun the scoped domain sync command above after provisioning completes,
  then verify HTTPS before enabling the deployment matrix domain.
- GitHub run `41660142159` also uploaded OSS successfully. Its overall
  result was failure because the unrelated PBZ job received HTTP 522 from
  `DescribePagesProjects`, then attempted to create its existing project.
- November 3, 2026 status: activation was incomplete while custom-domain
  DNS/HTTPS and artifact publication were pending.
- November 5, 2026: both private artifact repositories were created and
  populated. Published heads: data `fba1a193bb03f9ee10935fb8ad84271e2bf3e42e`,
  resources `e4b44f3630bacb6717ac2de5feeb9a0aea3df7d8`.
- November 15, 2026: all three production hosts resolved and served HTTPS.
  Browser verification followed the corrected production-build homepage
  shortcut to the live map, loaded all four data files, and switched among
  ground, upper, and underground canvases with successful tile responses.
  Collection toggling, search, `/changelog?check=oss-launch`, and the mobile
  homepage shortcut passed. No uncaught page errors or failed artifact
  requests were observed in the completed check.
- The homepage visibility and deployment-domain fixes are prepared locally;
  they still require a PR, merge, and deployment to activate publicly.
