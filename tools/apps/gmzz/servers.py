"""Emit the list of player servers (区服) a saved character can belong to.

Run from ``tools/``::

    uv run python -m gmzz.servers

Writes ``data-gmzz/servers/servers.json``: ``[{"id", "name"}]`` in id order.

``ServerData`` lists every server the client knows, and most of them are not
for players: local and private servers, QA and stress-test servers, mirrors,
weekly-build servers, review servers, the cross-server hubs, and forty rows
named 战略服. What sets the player servers apart is ``SchemeRecommendGroup``:
only they carry a recommendation group below 100 (1..7). Internal servers that
recommend at all use 100 and up (本地私服 102, 偷跑服 101, 周版本 100), and the
cross-server and test rows carry none.

**The list is the client's, so it can lag the game.** The login screen's server
list comes from the login service at run time; a server opened after this
client build is absent until the next export. Characters store the server's
``id``, never its name, so a rename or a merge only changes what is displayed.

``ServerOpenTime`` is not emitted: in this build every row carries the same
2026-08-21 08:01, so it says nothing per server.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .common import write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

TABLE = "ServerData"
OUT_DIR = "servers"
#: Recommendation groups at or above this belong to internal servers.
INTERNAL_RECOMMEND_GROUP = 100


def _rows(table):
    return table.values() if isinstance(table, dict) else table


def build_servers(table) -> list[dict]:
    """The player servers in a ``ServerData`` table, as ``{id, name}`` by id."""
    servers = []
    seen = set()
    for row in _rows(table):
        group = row.get("SchemeRecommendGroup")
        if not isinstance(group, int) or not 1 <= group < INTERNAL_RECOMMEND_GROUP:
            continue
        server_id = int(row["ID"])
        if server_id in seen:
            raise ValueError(f"Duplicate server id {server_id}")
        seen.add(server_id)
        name = str(row.get("Name") or "").strip()
        if not name:
            raise ValueError(f"Player server {server_id} has no name")
        servers.append({"id": server_id, "name": name})
    if not servers:
        raise ValueError("No player servers found; the filter no longer matches the table")
    return sorted(servers, key=lambda server: server["id"])


def build(excel: Path, data_out: Path) -> int:
    servers = build_servers(resolve_text(load_table(excel, TABLE), load_strings(excel)))
    missing = unresolved_ids(servers)
    if missing:
        raise RuntimeError(f"{len(missing)} text id(s) had no zh-CN string, e.g. {sorted(missing)[:3]}")
    write_json(Path(data_out) / OUT_DIR / "servers.json", servers)
    print(f"servers: {len(servers)} player servers -> {OUT_DIR}/servers.json")
    return len(servers)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None, help="override the exported Data/Excel dir")
    parser.add_argument("--out", type=Path, default=None, help="override GMZZ_DATA_OUT")
    args = parser.parse_args(argv)

    data_out = args.out or require_dir("GMZZ_DATA_OUT")
    build(args.excel or excel_dir(), data_out)
    stamp_version(data_out)


if __name__ == "__main__":
    main()
