# /// script
# requires-python = ">=3.11"
# dependencies = ["tencentcloud-sdk-python-common>=3.0.1200"]
# ///
"""Keep every Arkive host bound to the right EdgeOne Pages project, with DNS and HTTPS.

See docs/edgeone-custom-domains.md for the why. In short: neither the `edgeone`
CLI nor tccli can manage a Pages project's custom domains, but the console does
it through the TEO actions `CreatePagesResources` / `DeletePagesResources`,
which accept an ordinary API-key signature. This script drives them, writes
the CNAMEs with the `aliyun` CLI, requests certificates, and checks HTTPS.

    uv run scripts/edgeone_domains.py sync                  # plan only
    uv run scripts/edgeone_domains.py sync --apply          # bind, move, DNS, certs, verify
    uv run scripts/edgeone_domains.py sync --apply --only aion2.tc-imba.com
    uv run scripts/edgeone_domains.py redirects             # (re)deploy the redirect projects

Credentials: Tencent Cloud from ~/.tccli/default.credential (or the
TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY env vars); Aliyun from the
`aliyun` CLI's own configured profile; the `edgeone` CLI's login for `redirects`.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from tencentcloud.common import credential
from tencentcloud.common.common_client import CommonClient
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile

GAMES = ("aion2", "palworld", "vrising", "ro3", "gmzz")
# Games launched after the 2026-10-27 cutover: no tc-imba.com host ever served
# them, so they get no redirect project and their data/resource hosts exist
# under arkive.games only. A game belongs here once its data-<game> and
# resource-<game> repositories have Git-connected EdgeOne projects to bind to.
NEW_GAMES = ("pbz",)

# Static redirect projects: project name -> the host every request is sent to.
# Each one is nothing but an edgeone.json of two redirect rules (see
# deploy_redirects); EdgeOne serves them without any billed function.
REDIRECTS: dict[str, str] = {
    "arkive-redirect-meta": "arkive.games",
    **{f"arkive-redirect-{game}": f"{game}.arkive.games" for game in GAMES},
}

# The desired end state: every host -> the EdgeOne project that must own it.
# arkive.games is canonical (2026-10-27). The old tc-imba.com site hosts and
# www.arkive.games belong to the redirect projects; the tc-imba.com data and
# resource hosts keep serving from the data projects, so builds and Toy bundles
# made before the move keep loading.
HOSTS: dict[str, str] = {
    "arkive.games": "arkive-meta",
    "www.arkive.games": "arkive-redirect-meta",
    "tc-imba.com": "arkive-redirect-meta",
    "www.tc-imba.com": "arkive-redirect-meta",
    **{f"{game}.arkive.games": f"arkive-{game}" for game in GAMES + NEW_GAMES},
    **{f"{game}.tc-imba.com": f"arkive-redirect-{game}" for game in GAMES},
    **{f"{kind}-{game}.{domain}": f"{kind}-{game}"
       for game in GAMES for kind in ("data", "resource") for domain in ("arkive.games", "tc-imba.com")},
    **{f"{kind}-{game}.arkive.games": f"{kind}-{game}" for game in NEW_GAMES for kind in ("data", "resource")},
}

ALIYUN_REGION = "cn-hangzhou"  # alidns is global; the CLI just needs some region.
TTL = 600
# A host unbound from one project cannot be bound to another for a few minutes
# ("resource is being released, retry in 5 minutes"); measured at up to ~5 min.
RELEASE_WAIT = 20
RELEASE_TRIES = 30


def teo_client() -> CommonClient:
    sid = os.environ.get("TENCENTCLOUD_SECRET_ID")
    skey = os.environ.get("TENCENTCLOUD_SECRET_KEY")
    if not (sid and skey):
        stored = json.loads((pathlib.Path.home() / ".tccli" / "default.credential").read_text())
        sid, skey = stored["secretId"], stored["secretKey"]
    profile = ClientProfile(httpProfile=HttpProfile(endpoint="teo.tencentcloudapi.com"))
    return CommonClient("teo", "2022-09-01", credential.Credential(sid, skey), "ap-guangzhou", profile=profile)


class Pages:
    """The console's Pages gateway. Reads and creates go through
    CreatePagesResources, deletes through DeletePagesResources; the real
    operation is `Interface`, its arguments a JSON-string `Payload`, and every
    call needs the hidden Pages zone's id."""

    def __init__(self, cli: CommonClient):
        self.cli = cli
        zones = cli.call_json("DescribeZones", {"Limit": 100})["Response"]["Zones"]
        found = [z["ZoneId"] for z in zones if z.get("Type") == "pages"]
        if len(found) != 1:
            sys.exit(f"expected exactly one Pages zone, found {found}")
        self.zone_id = found[0]

    def call(self, interface: str, payload: dict, action: str = "CreatePagesResources") -> dict:
        params = {"Interface": f"pages:{interface}", "Payload": json.dumps(payload), "ZoneId": self.zone_id}
        result = self.cli.call_json(action, params)["Response"].get("Result")
        return json.loads(result) if result else {}

    def projects(self) -> dict[str, dict]:
        # Returns 20 by default and `Offset` returns nothing (measured), so ask
        # for the maximum (100) at once and refuse a truncated list.
        listing = self.call("DescribePagesProjects", {"Limit": 100})
        if len(listing["Projects"]) != listing["TotalCount"]:
            sys.exit(f"project list truncated: {len(listing['Projects'])} of {listing['TotalCount']}")
        return {p["Name"]: p for p in listing["Projects"]}

    def domains(self, project_id: str) -> list[dict]:
        return self.call("DescribePagesZoneCustomDomains", {"ProjectId": project_id})["PagesDomains"]

    def bind(self, project_id: str, host: str) -> None:
        self.call("CreatePagesZoneCustomDomain", {"ProjectId": project_id, "Domain": host, "Env": "Production"})

    def unbind(self, project_id: str, host: str) -> None:
        self.call("DeletePagesProjectCustomDomains", {"ProjectId": project_id, "CustomDomains": [host]},
                  action="DeletePagesResources")


def aliyun(*args: str) -> dict:
    out = subprocess.run(["aliyun", "alidns", *args, "--region", ALIYUN_REGION], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"aliyun alidns {args[0]} failed: {out.stderr.strip() or out.stdout.strip()}")
    return json.loads(out.stdout)


def split_host(host: str) -> tuple[str, str]:
    """('aion2.arkive.games') -> ('arkive.games', 'aion2'); the apex's label is '@'."""
    zone = ".".join(host.split(".")[-2:])
    return zone, host[: -len(zone) - 1] or "@"


def https_check(host: str) -> str:
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=10) as sock, ctx.wrap_socket(sock, server_hostname=host) as tls:
            subject = dict(item[0] for item in tls.getpeercert()["subject"])
        request = urllib.request.Request(f"https://{host}/")
        opener = urllib.request.build_opener(NoRedirect)
        try:
            response = opener.open(request, timeout=15)
            status, location = response.status, response.headers.get("Location")
        except urllib.error.HTTPError as err:  # 404 on data/resource roots, 301 on redirect hosts
            status, location = err.code, err.headers.get("Location")
        moved = f" -> {location}" if location else ""
        return f"HTTP {status}{moved}, cert CN={subject.get('commonName')}"
    except Exception as exc:  # noqa: BLE001 - reported, not handled
        return f"FAIL {type(exc).__name__}: {exc}"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # report the 301 instead of following it
        return None


def sync(args: argparse.Namespace) -> None:
    pages = Pages(teo_client())
    projects = pages.projects()
    wanted = {h: p for h, p in HOSTS.items() if not args.only or h in args.only}
    missing = sorted({p for p in wanted.values() if p not in projects})
    if missing:
        sys.exit(f"no EdgeOne project named {missing}; refusing to guess (run `redirects` first?)")
    owner = {d["Domain"]: name for name, p in projects.items() for d in p.get("CustomDomains") or []}

    # 1. Bind each host to its project, moving it off another project if needed.
    #    A move takes the host down until the rebind succeeds and its new
    #    certificate is issued: minutes, because of the release window.
    for host, target in wanted.items():
        current = owner.get(host)
        if current == target:
            print(f"bound     {host} -> {target}")
            continue
        verb = f"move {current} ->" if current else "bind"
        if not args.apply:
            print(f"would {verb} {target}: {host}")
            continue
        if current:
            pages.unbind(projects[current]["ProjectId"], host)
        for attempt in range(RELEASE_TRIES):
            try:
                pages.bind(projects[target]["ProjectId"], host)
                break
            except TencentCloudSDKException as err:
                if attempt == RELEASE_TRIES - 1:
                    sys.exit(f"{host}: still cannot bind to {target}: {err}")
                time.sleep(RELEASE_WAIT)
        print(f"{verb.upper():9} {target}: {host}")
    if not args.apply:
        print("plan only; rerun with --apply")
        return

    # 2. Wait for each host's CNAME target. Seconds for a fresh host, up to
    #    several minutes for one just moved between projects.
    by_project: dict[str, list[str]] = {}
    for host, target in wanted.items():
        by_project.setdefault(target, []).append(host)
    cnames: dict[str, str] = {}
    for _ in range(60):
        for target, hosts in by_project.items():
            for d in pages.domains(projects[target]["ProjectId"]):
                if d["Domain"] in hosts and d.get("Cname"):
                    cnames[d["Domain"]] = d["Cname"].rstrip(".")
                if d["Domain"] in hosts and d.get("OwnershipVerification"):
                    print(f"VERIFY    {d['Domain']}: {json.dumps(d['OwnershipVerification'], ensure_ascii=False)}")
        if len(cnames) == len(wanted):
            break
        time.sleep(15)
    pending = sorted(set(wanted) - set(cnames))
    if pending:
        sys.exit(f"no CNAME assigned yet for {pending}; ownership verification may be outstanding (see docs)")

    # 3. Point Aliyun DNS at the targets: add, update, or leave alone.
    records: dict[str, dict[str, list[dict]]] = {}
    for host, target in sorted(cnames.items()):
        zone, label = split_host(host)
        if zone not in records:
            listing = aliyun("DescribeDomainRecords", "--DomainName", zone, "--PageSize", "500")["DomainRecords"]["Record"]
            records[zone] = {}
            for record in listing:
                records[zone].setdefault(record["RR"], []).append(record)
        existing = records[zone].get(label, [])
        cname = next((r for r in existing if r["Type"] == "CNAME"), None)
        clash = [r for r in existing if r["Type"] in ("A", "AAAA")]
        if clash:
            print(f"SKIP      {host}: has {clash[0]['Type']} {clash[0]['Value']}; resolve by hand")
        elif cname and cname["Value"].rstrip(".") == target:
            print(f"dns ok    {host} CNAME {target}")
        elif cname:
            aliyun("UpdateDomainRecord", "--RecordId", cname["RecordId"], "--RR", label, "--Type", "CNAME", "--Value", target, "--TTL", str(TTL))
            print(f"DNS FIX   {host} CNAME {cname['Value']} -> {target}")
        else:
            aliyun("AddDomainRecord", "--DomainName", zone, "--RR", label, "--Type", "CNAME", "--Value", target, "--TTL", str(TTL))
            print(f"DNS ADD   {host} CNAME {target}")

    # 4. Request the free certificate. The console does this as part of adding a
    #    domain; the gateway call does not, leaving the host on ApplyType "none"
    #    and the edge presenting its default *.cdn.myqcloud.com certificate. A
    #    moved host loses its certificate the same way. One host per call: a
    #    batch is refused when the hosts' current states differ.
    settings = pages.cli.call_json("DescribeHostsSetting", {
        "ZoneId": pages.zone_id, "Limit": 1000,
        "Filters": [{"Name": "host", "Values": sorted(wanted)}],
    })["Response"]["DetailHosts"]
    for host in settings:
        if host["Https"]["ApplyType"] == "none":
            pages.cli.call_json("ModifyHostsCertificate", {"ZoneId": pages.zone_id, "Hosts": [host["Host"]], "Mode": "eofreecert"})
            print(f"CERT      {host['Host']}: requested EdgeOne free certificate")
        else:
            print(f"cert ok   {host['Host']}")

    # 5. Wait for every host to go online, then prove each one serves HTTPS.
    #    Expect 200 on sites, 404 on data/resource roots, 301 on redirect hosts.
    statuses: dict[str, str] = {}
    for _ in range(40):
        statuses = {d["Domain"]: d["Status"] for target, hosts in by_project.items()
                    for d in pages.domains(projects[target]["ProjectId"]) if d["Domain"] in hosts}
        if all(s == "online" for s in statuses.values()):
            break
        time.sleep(15)
    for host in sorted(wanted):
        print(f"{statuses.get(host, '?'):8}  {host:32} {https_check(host)}")


def deploy_redirects(args: argparse.Namespace) -> None:
    """Write and deploy each redirect project: two edgeone.json rules, no functions.

    Measured on EdgeOne (2026-10-27): only the `/*` glob with `:splat` matches at
    every depth (`/:path*` and regex sources do not), and the query string is
    always dropped; neither `?:query` nor `$query` passes it through."""
    for project, target in REDIRECTS.items():
        if args.only and project not in args.only:
            continue
        with tempfile.TemporaryDirectory() as tmp:
            site = pathlib.Path(tmp) / "site"
            site.mkdir()
            (site / "edgeone.json").write_text(json.dumps({"redirects": [
                {"source": "/", "destination": f"https://{target}/", "statusCode": 301},
                {"source": "/*", "destination": f"https://{target}/:splat", "statusCode": 301},
            ]}, indent=2) + "\n")
            # Never served while the rules match; present so the upload is not empty.
            (site / "index.html").write_text(
                f'<!doctype html><meta charset="utf-8"><title>Moved</title><a href="https://{target}/">{target}</a>\n')
            out = subprocess.run(f'edgeone makers deploy "{site}" -n {project}', shell=True, capture_output=True, text=True)
            ok = "Deploy Success" in out.stdout
            print(f"{'deployed' if ok else 'FAILED  '}  {project} -> https://{target}/")
            if not ok:
                sys.exit(out.stdout[-2000:] + out.stderr[-2000:])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    sync_cmd = commands.add_parser("sync", help="bind/move hosts, DNS, certificates, HTTPS check")
    sync_cmd.add_argument("--apply", action="store_true", help="make changes; without it only the plan is printed")
    sync_cmd.add_argument("--only", nargs="*", help="restrict to these hosts")
    sync_cmd.set_defaults(run=sync)
    redirect_cmd = commands.add_parser("redirects", help="(re)deploy the static redirect projects")
    redirect_cmd.add_argument("--only", nargs="*", help="restrict to these redirect project names")
    redirect_cmd.set_defaults(run=deploy_redirects)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
