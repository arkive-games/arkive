# Custom domains on EdgeOne Pages, automated

How every Arkive host is bound to its EdgeOne Pages project, pointed at by
DNS, and given a certificate, without clicking through the console once per
site. It was built to move the platform from `tc-imba.com` to `arkive.games`
(2026-10-27). The whole procedure is `scripts/edgeone_domains.py`; this page
records why it works and what it cannot do.

## Why not the CLI

Neither official tool can manage a Pages project's custom domains:

- `edgeone makers` (checked on v1.6.46) offers `init`, `dev`, `env`, `link`,
  `deploy`, `claim` and `create`, nothing for domains, and its bundle contains
  no domain API call.
- `tccli teo` has no Pages actions at all.

## What the console actually calls

The console's domain page posts to its `cgi/capi` proxy with one of two TEO
actions (version `2022-09-01`): **`CreatePagesResources`** for reads and
creates, **`DeletePagesResources`** for deletes. Both are generic gateways;
the real operation travels in their parameters.

```json
{
  "Interface": "pages:CreatePagesZoneCustomDomain",
  "Payload": "{\"ProjectId\":\"makers-…\",\"Domain\":\"www.arkive.games\",\"Env\":\"Production\"}",
  "ZoneId": "zone-…"
}
```

`Payload` is a JSON **string**, and so is the `Result` that comes back.

Neither action is in the public API reference or in tccli, but both accept an
ordinary TC3 API-key signature. Any Tencent Cloud SDK's generic client can call
them with the same credentials tccli uses, and the browser session cookies are
never needed. Confirmed interfaces:

| Action | `Interface` | `Payload` | Returns |
|---|---|---|---|
| Create | `pages:DescribePagesProjects` | `{"Limit": 100}` | projects with `ProjectId`, `Name`, `ZoneId`, `CustomDomains`, plus `TotalCount` |
| Create | `pages:DescribePagesZoneCustomDomains` | `{"ProjectId"}` | `PagesDomains[]`: `Domain`, `Status` (`process` → `online`), `Cname` (the target to point DNS at), `CurrentCname` (what EdgeOne currently sees in DNS, empty until it detects the record), `OwnershipVerification` |
| Create | `pages:CreatePagesZoneCustomDomain` | `{"ProjectId","Domain","Env":"Production"}` | `{"Domain","Id"}` |
| Delete | `pages:DeletePagesProjectCustomDomains` | `{"ProjectId","CustomDomains":[…]}` | nothing; unbinds the hosts |
| Delete | `pages:DeletePagesProject` | `{"ProjectId"}` | nothing; deletes the project |

Some details that matter:

- **The project list returns 20 by default.** `Offset` returns nothing, and
  `Limit` is capped at 100, so the script asks for 100 and stops if
  `TotalCount` is larger.
- **An unknown interface fails with a bare `InternalError`.** Guessed names
  such as `DescribePagesCustomDomains`, `DeletePagesZoneCustomDomain` or
  `DeletePagesProjects` all fail this way, so don't try to discover names by
  trial. Capture the console's request in DevTools instead.
- **`ZoneId` is required on every call**, including the account-wide project
  list. It is the id of the account's hidden Pages zone, which the public
  `DescribeZones` lists as `ZoneName: default-pages-zone`, `Type: pages`. The
  script looks it up there rather than hardcoding it.

## The procedure

```sh
uv run scripts/edgeone_domains.py sync                    # plan: what would be bound or moved
uv run scripts/edgeone_domains.py sync --apply            # do it, then verify every host
uv run scripts/edgeone_domains.py sync --apply --only aion2.tc-imba.com
uv run scripts/edgeone_domains.py redirects               # (re)deploy the redirect projects
```

The script needs Tencent Cloud credentials from `~/.tccli/default.credential`
(or `TENCENTCLOUD_SECRET_ID`/`TENCENTCLOUD_SECRET_KEY`) and a logged-in
`aliyun` CLI. If the CLI login has expired (`failed to refresh token`), re-run
`aliyun configure --profile <name> --mode OAuth` first. `redirects` also needs
the `edgeone` CLI to be logged in.

**`HOSTS` at the top of the script is the desired end state.** It maps every
host on both domains to the project that must own it:

- the six app projects and the ten Git-connected `data-<game>` /
  `resource-<game>` projects serve the `arkive.games` hosts;
- the redirect projects own the old `tc-imba.com` site hosts and
  `www.arkive.games`;
- the `tc-imba.com` data and resource hosts stay on the data projects, so
  builds and Toy bundles made before the move keep loading.

Projects are resolved **by name**, and the script stops on a name it cannot
find rather than guess. Every step is idempotent, so re-running `sync --apply`
is also how you check the current state:

1. **Bind or move:** bind each host that has no owner. A host owned by a
   different project is first unbound with `DeletePagesProjectCustomDomains`
   (see "Moving a host" below).
2. **Wait for targets:** poll `DescribePagesZoneCustomDomains` until each host
   has a `Cname`. This takes seconds for a new host and minutes for a moved
   one. The target's `dnsoeN` shard differs per host and per binding, so it
   cannot be predicted. Any `OwnershipVerification` demand is printed.
3. **DNS:** add or update the Aliyun `CNAME` for each host (TTL 600), on
   whichever of the two zones the host belongs to. A host that already has an
   `A`/`AAAA` record is reported and left alone.
4. **Certificate:** request EdgeOne's free certificate for every host still on
   `ApplyType: "none"` (see below; skipping this leaves HTTPS broken).
5. **Verify:** wait for every host to be `online`, then fetch each one over
   HTTPS without following redirects. It prints the status, any `Location`,
   and the certificate's CN. Sites should return 200. Data and resource roots
   have no index page, so 404 is expected. Redirect hosts should return 301.

## Moving a host between projects

A host belongs to exactly one project, so moving it means unbind and rebind,
and **the host is down in between**. Each of the eight moves in the
`tc-imba.com` cutover took a few minutes:

- **After an unbind, EdgeOne refuses to bind the host anywhere else.** The
  first error is "the domain is already connected to EdgeOne", then "the
  resource is being released, retry in 5 minutes". The script retries every
  20 s for up to 10 minutes.
- **A moved host gets a new `Cname`**, often on a different `dnsoeN` shard,
  and it may take several minutes to appear. Step 3 rewrites the DNS record
  when it differs.
- **The certificate does not follow the host.** It returns to
  `ApplyType: "none"` and needs a new request (step 4).

Move one host first and check it before doing the rest.

## Redirect projects (no edge functions)

The retired `tc-imba.com` site hosts answer with a 301 from small
direct-upload projects, `arkive-redirect-{meta,aion2,palworld,vrising,ro3,gmzz}`.
Each project is only an `edgeone.json` with two rules, written and deployed
by `redirects`:

```json
{ "redirects": [
  { "source": "/",  "destination": "https://aion2.arkive.games/",       "statusCode": 301 },
  { "source": "/*", "destination": "https://aion2.arkive.games/:splat", "statusCode": 301 }
]}
```

These are static platform rules. Unlike an edge function, they are not billed
per request. What they can do was measured on a throwaway project:

- Only `/*` with `:splat` matches at every depth. The Vercel-style
  `/:path*`, `/(.*)` and `/:path(.*)` sources never match.
- **Rules cannot match on the host.** There is no `has` condition, so one
  project cannot send different hosts to different places. That is why there
  is one redirect project per site.
- **The query string is always dropped.** `?:query` doesn't match at all, and
  `$query` comes out as literal text. A `#fragment` survives, because the
  browser keeps it across a redirect.

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
dialog) covered every later subdomain. Every host the script bound afterwards
came back with `OwnershipVerification: null` and went straight to a CNAME.

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

Locally, Windows caches DNS answers, including NXDOMAIN, from before a record
existed or changed. A `getaddrinfo failed` or a curl exit 6 is often just that
cache. Check against a public resolver (`nslookup <host> 8.8.8.8`) or run
`ipconfig /flushdns` before trusting the error.

## Beyond EdgeOne: the rest of the move

Binding hosts only makes a domain *serve*. The builds still decide where pages
fetch from, so the move to `arkive.games` also changed (PR #158):

- **Build-time hosts:** the data and resource base URLs in
  `.github/workflows/deploy.yml`, which Vite inlines into each build.
- **In-code production defaults:** the API origin
  (`packages/auth/src/config.ts`), the home and footer links, the hub's game
  links (`apps/meta/src/sites.ts`), and the shared font stylesheet
  (`frontend/vite/arkive-font-assets.ts`).
- **The API:** `api.arkive.games` is a separate nginx vhost with a Let's
  Encrypt certificate on the API server. It sits behind the same `:443` SNI
  router as `api-arkive.tc-imba.com` and proxies to the same backend.
  - The server's `.env` sets `AUTH_COOKIE_DOMAIN=.arkive.games` and the new
    `RESET_URL_TEMPLATE`.
  - `ALLOWED_ORIGINS` lists both domains.

Moving the cookie domain signs everyone out once. A session cookie scoped to
one registrable domain can't be read on the other, and no handoff was built.
`api-arkive.tc-imba.com` still answers, so pages cached before the move keep
working until they reload.
