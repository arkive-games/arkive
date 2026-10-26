# /// script
# requires-python = ">=3.11"
# dependencies = ["tencentcloud-sdk-python-common>=3.0.1200"]
# ///
"""Bind a custom domain to EdgeOne Pages projects and point Aliyun DNS at them.

See docs/edgeone-custom-domains.md for the why. In short: neither the `edgeone`
CLI nor tccli can add a custom domain to a Pages project, but the console does
it through the TEO action `CreatePagesResources`, which accepts an ordinary
API-key signature. This script drives that action, then writes the CNAMEs with
the `aliyun` CLI and checks HTTPS on every host.

    uv run scripts/edgeone_domains.py --zone-domain arkive.games            # plan only
    uv run scripts/edgeone_domains.py --zone-domain arkive.games --apply

Credentials: Tencent Cloud from ~/.tccli/default.credential (or the
TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY env vars); Aliyun from the
`aliyun` CLI's own configured profile.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import ssl
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

from tencentcloud.common import credential
from tencentcloud.common.common_client import CommonClient
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile

# EdgeOne project name -> host label under the zone domain. "@" is the apex.
# Mirrors the matrix in .github/workflows/deploy.yml.
SITES: dict[str, list[str]] = {
    "arkive-meta": ["@", "www"],
    "arkive-aion2": ["aion2"],
    "arkive-palworld": ["palworld"],
    "arkive-vrising": ["vrising"],
    "arkive-ro3": ["ro3"],
    "arkive-gmzz": ["gmzz"],
    # The Git-connected data/resource repos, one pair per game.
    **{f"{kind}-{game}": [f"{kind}-{game}"]
       for game in ("aion2", "palworld", "vrising", "ro3", "gmzz")
       for kind in ("data", "resource")},
}

ALIYUN_REGION = "cn-hangzhou"  # alidns is global; the CLI just needs some region.
TTL = 600


def teo_client() -> CommonClient:
    sid = os.environ.get("TENCENTCLOUD_SECRET_ID")
    skey = os.environ.get("TENCENTCLOUD_SECRET_KEY")
    if not (sid and skey):
        stored = json.loads((pathlib.Path.home() / ".tccli" / "default.credential").read_text())
        sid, skey = stored["secretId"], stored["secretKey"]
    profile = ClientProfile(httpProfile=HttpProfile(endpoint="teo.tencentcloudapi.com"))
    return CommonClient("teo", "2022-09-01", credential.Credential(sid, skey), "ap-guangzhou", profile=profile)


def pages(cli: CommonClient, interface: str, payload: dict, zone_id: str | None = None) -> dict:
    """One call to the console's Pages gateway. `Result` comes back as a JSON string."""
    params = {"Interface": f"pages:{interface}", "Payload": json.dumps(payload)}
    if zone_id:
        params["ZoneId"] = zone_id
    response = cli.call_json("CreatePagesResources", params)["Response"]
    return json.loads(response["Result"])


def pages_zone_id(cli: CommonClient) -> str:
    """Pages projects live in one hidden zone of Type "pages" ("default-pages-zone").
    Every gateway call needs its id, even the account-wide project list."""
    zones = cli.call_json("DescribeZones", {"Limit": 1000})["Response"]["Zones"]
    found = [z["ZoneId"] for z in zones if z.get("Type") == "pages"]
    if len(found) != 1:
        sys.exit(f"expected exactly one Pages zone, found {found}")
    return found[0]


def project_domains(cli: CommonClient, project: dict) -> list[dict]:
    return pages(cli, "DescribePagesZoneCustomDomains", {"ProjectId": project["ProjectId"]}, project["ZoneId"])["PagesDomains"]


def aliyun(*args: str) -> dict:
    out = subprocess.run(["aliyun", "alidns", *args, "--region", ALIYUN_REGION], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"aliyun alidns {args[0]} failed: {out.stderr.strip() or out.stdout.strip()}")
    return json.loads(out.stdout)


def dns_records(zone: str) -> dict[str, list[dict]]:
    records = aliyun("DescribeDomainRecords", "--DomainName", zone, "--PageSize", "500")["DomainRecords"]["Record"]
    by_rr: dict[str, list[dict]] = {}
    for record in records:
        by_rr.setdefault(record["RR"], []).append(record)
    return by_rr


def https_check(host: str) -> str:
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=10) as sock, ctx.wrap_socket(sock, server_hostname=host) as tls:
            subject = dict(item[0] for item in tls.getpeercert()["subject"])
        try:
            status = urllib.request.urlopen(f"https://{host}/", timeout=15).status
        except urllib.error.HTTPError as err:  # data/resource hosts have no index page
            status = err.code
        return f"HTTP {status}, cert CN={subject.get('commonName')}"
    except Exception as exc:  # noqa: BLE001 - reported, not handled
        return f"FAIL {type(exc).__name__}: {exc}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--zone-domain", required=True, help="registrable domain, e.g. arkive.games")
    parser.add_argument("--apply", action="store_true", help="make changes; without it only the plan is printed")
    parser.add_argument("--only", nargs="*", help="restrict to these EdgeOne project names")
    args = parser.parse_args()
    zone = args.zone_domain

    cli = teo_client()
    zone_id = pages_zone_id(cli)
    projects = {p["Name"]: p for p in pages(cli, "DescribePagesProjects", {}, zone_id)["Projects"]}
    wanted = {name: labels for name, labels in SITES.items() if not args.only or name in args.only}
    missing = [name for name in wanted if name not in projects]
    if missing:
        sys.exit(f"no EdgeOne project named {missing}; refusing to guess")

    # 1. Bind each host to its project (skipped when already bound).
    targets: dict[str, tuple[str, str]] = {}  # fqdn -> (project, label)
    for name, labels in wanted.items():
        bound = {d["Domain"] for d in project_domains(cli, projects[name])}
        for label in labels:
            fqdn = zone if label == "@" else f"{label}.{zone}"
            targets[fqdn] = (name, label)
            if fqdn in bound:
                print(f"bound     {fqdn} -> {name}")
            elif args.apply:
                pages(cli, "CreatePagesZoneCustomDomain",
                      {"ProjectId": projects[name]["ProjectId"], "Domain": fqdn, "Env": "Production"},
                      projects[name]["ZoneId"])
                print(f"BIND      {fqdn} -> {name}")
            else:
                print(f"would bind {fqdn} -> {name}")
    if not args.apply:
        print("plan only; rerun with --apply")
        return

    # 2. Wait for EdgeOne to assign each host its CNAME target (seconds to a minute).
    cnames: dict[str, str] = {}
    for _ in range(40):
        for name in wanted:
            for d in project_domains(cli, projects[name]):
                if d["Domain"] in targets and d.get("Cname"):
                    cnames[d["Domain"]] = d["Cname"].rstrip(".")
                if d["Domain"] in targets and d.get("OwnershipVerification"):
                    print(f"VERIFY    {d['Domain']}: {json.dumps(d['OwnershipVerification'], ensure_ascii=False)}")
        if len(cnames) == len(targets):
            break
        time.sleep(15)
    pending = sorted(set(targets) - set(cnames))
    if pending:
        sys.exit(f"no CNAME assigned yet for {pending}; ownership verification may be outstanding (see docs)")

    # 3. Point Aliyun DNS at the targets: add, update, or leave alone.
    existing = dns_records(zone)
    for fqdn, target in cnames.items():
        label = targets[fqdn][1]
        records = existing.get(label, [])
        cname = next((r for r in records if r["Type"] == "CNAME"), None)
        clash = [r for r in records if r["Type"] in ("A", "AAAA")]
        if clash:
            print(f"SKIP      {fqdn}: has {clash[0]['Type']} {clash[0]['Value']}; resolve by hand")
        elif cname and cname["Value"].rstrip(".") == target:
            print(f"dns ok    {fqdn} CNAME {target}")
        elif cname:
            aliyun("UpdateDomainRecord", "--RecordId", cname["RecordId"], "--RR", label, "--Type", "CNAME", "--Value", target, "--TTL", str(TTL))
            print(f"DNS FIX   {fqdn} CNAME {cname['Value']} -> {target}")
        else:
            aliyun("AddDomainRecord", "--DomainName", zone, "--RR", label, "--Type", "CNAME", "--Value", target, "--TTL", str(TTL))
            print(f"DNS ADD   {fqdn} CNAME {target}")

    # 4. Request the free certificate. The console does this as part of adding a
    # domain; the gateway call does not, leaving the host on ApplyType "none" and
    # the edge presenting its default *.cdn.myqcloud.com certificate forever.
    # One host per call: a batch is refused when the hosts' current states differ.
    settings = cli.call_json("DescribeHostsSetting", {
        "ZoneId": zone_id, "Limit": 1000,
        "Filters": [{"Name": "host", "Values": sorted(targets)}],
    })["Response"]["DetailHosts"]
    for host in settings:
        if host["Https"]["ApplyType"] == "none":
            cli.call_json("ModifyHostsCertificate", {"ZoneId": zone_id, "Hosts": [host["Host"]], "Mode": "eofreecert"})
            print(f"CERT      {host['Host']}: requested EdgeOne free certificate")
        else:
            print(f"cert ok   {host['Host']}")

    # 5. Wait for every host to go online, then prove each one serves HTTPS.
    for _ in range(40):
        statuses = {fqdn: d["Status"] for name in wanted for d in project_domains(cli, projects[name]) if d["Domain"] in targets for fqdn in [d["Domain"]]}
        if all(s == "online" for s in statuses.values()):
            break
        time.sleep(15)
    for fqdn in sorted(targets):
        print(f"{statuses.get(fqdn, '?'):8}  {fqdn:28} {https_check(fqdn)}")


if __name__ == "__main__":
    main()
