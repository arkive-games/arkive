# Custom domains on EdgeOne Pages, automated

How a second domain (here `arkive.games`, alongside `tc-imba.com`) was bound to
every EdgeOne Pages project and pointed at by DNS, without clicking through the
console once per site. The whole procedure is `scripts/edgeone_domains.py`;
this page records why it works and what it cannot do.

## Why not the CLI

Neither official tool can attach a custom domain to a Pages project:

- `edgeone makers` (checked on v1.6.46) offers `init`, `dev`, `env`, `link`,
  `deploy`, `claim` and `create`, nothing for domains, and its bundle contains
  no domain API call.
- `tccli teo` has no Pages actions at all.

## What the console actually calls

The console's domain page posts to its `cgi/capi` proxy with the TEO action
**`CreatePagesResources`** (version `2022-09-01`). It is a generic gateway: the
real operation travels in its parameters.

```json
{
  "Interface": "pages:CreatePagesZoneCustomDomain",
  "Payload": "{\"ProjectId\":\"makers-…\",\"Domain\":\"www.arkive.games\",\"Env\":\"Production\"}",
  "ZoneId": "zone-…"
}
```

`Payload` is a JSON **string**, and so is the `Result` that comes back.

The action is absent from the public API reference and from tccli, but it
accepts an ordinary TC3 API-key signature. So any Tencent Cloud SDK's generic
client can call it with the same credentials tccli uses, and the browser
session cookies are never needed. Interfaces confirmed to work:

| `Interface` | `Payload` | Returns |
|---|---|---|
| `pages:DescribePagesProjects` | `{}` | every project: `ProjectId`, `Name`, `ZoneId`, `CustomDomains` |
| `pages:DescribePagesZoneCustomDomains` | `{"ProjectId"}` | `PagesDomains[]`: `Domain`, `Status` (`process` → `online`), `Cname` (the target to point DNS at), `CurrentCname` (what EdgeOne currently sees in DNS, empty until it detects the record), `OwnershipVerification` |
| `pages:CreatePagesZoneCustomDomain` | `{"ProjectId","Domain","Env":"Production"}` | `{"Domain","Id"}` |

The guessed names `DescribePagesCustomDomains` and `DescribePagesDomains`
return `InternalError`, which is what an unknown interface looks like.

**`ZoneId` is mandatory on every call**, including the account-wide project
list. It is the id of the account's hidden Pages zone, which the public
`DescribeZones` lists as `ZoneName: default-pages-zone`, `Type: pages`. The
script finds it there instead of hardcoding it.

## The procedure

```sh
uv run scripts/edgeone_domains.py --zone-domain arkive.games          # plan: what would be bound
uv run scripts/edgeone_domains.py --zone-domain arkive.games --apply  # do it
```

The script needs Tencent Cloud credentials from `~/.tccli/default.credential`
(or `TENCENTCLOUD_SECRET_ID`/`TENCENTCLOUD_SECRET_KEY`) and a logged-in
`aliyun` CLI. If the CLI login has expired (`failed to refresh token`),
re-run `aliyun configure --profile <name> --mode OAuth` first.

The project-to-host mapping is the `SITES` table at the top of the script. It
covers the six app projects in the matrix of `.github/workflows/deploy.yml`
plus the ten Git-connected `data-<game>`/`resource-<game>` projects, so every
site keeps the same label under each domain. Projects are resolved
**by name**, and the script stops on a name it cannot find rather than guess.
Every step is idempotent, so re-running it is how you check the state:

1. **Bind:** call `CreatePagesZoneCustomDomain` for each host not yet bound to
   its project.
2. **Wait for targets:** poll `DescribePagesZoneCustomDomains` until each host
   has a `Cname`. This takes seconds; the target's `dnsoeN` shard differs per
   host and cannot be predicted. Any `OwnershipVerification` demand is printed.
3. **DNS:** add or update the Aliyun `CNAME` for each host (TTL 600). A host
   that already has an `A`/`AAAA` record is reported and left alone.
4. **Certificate:** request EdgeOne's free certificate for every host still on
   `ApplyType: "none"` (see below; skipping this leaves HTTPS broken).
5. **Verify:** wait for every host to be `online`, then fetch each one over
   HTTPS and print the status and the certificate's CN. Data and resource
   hosts have no index page, so `HTTP 404` with a matching CN is a pass there.

## Ownership verification (the one manual step)

Binding the first host under `arkive.games` asked for a TXT record named
`edgeonereclaim.<host>` with a `reclaim-…` value, rather than going straight
to a CNAME as new `tc-imba.com` hosts do. A registrable domain new to the
account has to prove ownership once; `tc-imba.com` did so long ago and still
carries the `_dnsauth` TXT record from it.

Completing the apex verification also created a `partial` EdgeOne site for
`arkive.games` (`DescribeZones`, status `pending`), so it did not exist when
the first prompt appeared and is not what triggered it.

Verifying the **apex** once (TXT `edgeonereclaim` at `@`, through the console
dialog) covered every later subdomain. The four hosts the script bound
afterwards came back with `OwnershipVerification: null` and went straight to a
CNAME.

The API has no call to trigger that verification, so for a new registrable
domain:

1. Add the apex in the console and choose DNS verification.
2. Create the TXT record it shows:
   `aliyun alidns AddDomainRecord --DomainName <zone> --RR edgeonereclaim --Type TXT --Value reclaim-…`
3. Click verify, then run the script for everything else.

Leave the `edgeonereclaim` TXT records in place; EdgeOne may re-check them.

## Certificates must be requested

**A domain bound through the gateway gets no certificate.** The console
requests one as part of adding a domain; `CreatePagesZoneCustomDomain` does
not. The host goes `online`, plain `http://` serves the right project, and
`https://` presents Tencent's default `CN=*.cdn.myqcloud.com` certificate
indefinitely. It does not resolve itself: these hosts waited 35 minutes.

`DescribeHostsSetting` on the Pages zone shows the cause as
`Https.ApplyType: "none"`, where a console-added host shows `"apply"`.

The fix is the public action that switches a host to EdgeOne's free
certificate. It was issued within about a minute:

```sh
tccli teo ModifyHostsCertificate --ZoneId <pages-zone> --Hosts '["www.arkive.games"]' --Mode eofreecert
```

Send **one host per call**. A batch is refused with
`HostsCertificateInconsistency` as soon as the hosts' current certificate
states differ.

Avoid `ApplyFreeCertificate`; both of its verification methods went nowhere:

- `http_challenge` fails because nothing serves its
  `/.well-known/pki-validation/` file.
- `dns_challenge` asks for a `_dnsauth.<host>` CNAME to `<host>.eoacme0.com`,
  then kept reporting that record as undetected long after it resolved.

Locally, Windows also caches the NXDOMAIN answers from any lookup made before
the records existed. Check against a public resolver
(`nslookup <host> 8.8.8.8`) or run `ipconfig /flushdns` before trusting a
`getaddrinfo failed`.

## What a second domain does not change

Both domains serve the **same build**, so the URLs Vite inlined at build time
still point at `tc-imba.com`:

- data and resource hosts (`VITE_DATA_BASE_URL`, `VITE_RESOURCE_BASE_URL`).
  The `arkive.games` copies are live and byte-identical, with
  `Access-Control-Allow-Origin: *`, but a page only uses them once the build
  is pointed at them;
- the hub's game links (`frontend/apps/meta/src/sites.ts`) and the
  `homeUrl` defaults;
- the API origin (`api-arkive.tc-imba.com`), whose session cookie is scoped
  to `.tc-imba.com`.

Signing in from an `arkive.games` page is therefore a cross-site request. A
fully independent second domain needs host-relative URLs in the frontend, a
backend CORS entry, and an API host under the same registrable domain.
