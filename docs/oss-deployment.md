# Order of the Sinking Star Deployment

The frontend is a static Vite app in `frontend/apps/oss`. It uses the
direct-upload EdgeOne Makers project `arkive-oss` and the intended production
host `oss.arkive.games`. The local app port is 15181; PBZ owns 15180.

## Required Artifacts

The frontend cannot render a map without the separate exported datasets:

- `data-oss`: `map-display.json`, `tile-overrides.json`,
  `collections.json`, and `props-ground-26006400.json`.
- `resource-oss`: every tile referenced by those documents, including the
  expanded base layers and any tile overrides.

These artifacts are not in the monorepo. PR #200 describes them as prepared
locally by its contributor. On November 3, 2026, neither artifact repository
existed in the GitHub organization, neither artifact project existed in the
configured EdgeOne account, and no local OSS artifact checkout was available.
Publishing the frontend alone therefore publishes its shell and changelog,
not a working interactive map. Keep the homepage card marked coming soon
until all artifact requests and rendered layers have been verified.

When the exports are available, publish them separately with cross-origin
GET access for the frontend. Bind `data-oss.arkive.games` and
`resource-oss.arkive.games` to their projects. Use the organization artifact
repositories and Git-connected EdgeOne projects, as for the other games;
do not commit exported game data or tiles to the monorepo.

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

After the domain is bound, set the OSS deployment matrix's `domain` to
`oss.arkive.games` so subsequent deployments run deep-link smoke checks.
Remove the homepage's OSS `comingSoon` flag only after the map checks pass.

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
- Activation remains incomplete: custom-domain DNS/HTTPS is pending and
  artifact publication is blocked until the contributor's exported data
  and tiles are available. Keep the homepage card marked coming soon.
