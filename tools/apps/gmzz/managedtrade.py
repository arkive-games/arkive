"""Emit the trade-war (贸易战) dataset into ``data-gmzz``.

Run from ``tools/``::

    uv run python -m gmzz.managedtrade

The client calls the mode ``ManagedTrade`` and its constants ``TRADEWAR_*``;
the guild caravan board players know as 贸易战 is this, not ``TrainTrade``
(铁路大亨), which is an unrelated single-player run.

Field names are the client's own, as in ``gmzz.traintrade``. One thing about
them a reader *will* get wrong: ``Sell*``/``Buy*`` on a goods row are named from
the **station's** side. The client grades the price a player pays against
``SellMin..SellMax`` and the price a player is paid against ``BuyMin..BuyMax``
(``ManagedTradeSystem.GetStationGoods{Sell,Buy}PriceLevel``), and the service's
own NetDef says the selling side's midpoint is ``SellMid``.

Live prices, stock, rumors and price history are **not** here and cannot be:
they live in the service's ``siteTradeInfo`` (``SERVER_ONLY``) and reach a
client only as a per-station snapshot it asks for.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .common import ordered_rows, write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

OUT_SUBDIR = "managedtrade"

#: Client table -> output file.
#:
#: ``ManagedTradeEventData`` is deliberately absent. Its 21 market events name
#: goods ids 1001-4101, and the live goods table holds 5101-5403 only: every
#: event points at a good that no longer exists, so emitting it would publish a
#: list of promotions the game cannot run.
TABLES = {
    "ManagedTradeGoodsData": "goods.json",
    "ManagedTradeSiteData": "sites.json",
    "ManagedTradeRouteData": "routes.json",
    "ManagedTradeCaravanData": "caravans.json",
    "ManagedTradeCaravanPartData": "caravan_parts.json",
    "ManagedTradeCaravanPropData": "caravan_props.json",
    "ManagedTradeQuestData": "commissions.json",
    "ManagedTradeConstData": "constants.json",
}

#: The two ``FormulaData`` rows the client runs for the taxed price
#: (``CalcStationGoods{Sell,Buy}PriceWithTax``). Shipped verbatim so the page's
#: calculator can be checked against the game's own expression.
FORMULAS = ("TradeWar_BuyPrice", "TradeWar_SellPrice")


def formulas(excel: Path) -> dict[str, dict]:
    """``{Name: FormulaData row}`` for the trade-war price formulas.

    Raises if either is missing: the calculator encodes them, and a patch that
    renamed or dropped one is exactly the change it must not miss.
    """
    table = load_table(excel, "FormulaData")
    rows = table.values() if isinstance(table, dict) else table
    found = {row["Name"]: row for row in rows if row.get("Name") in FORMULAS}
    missing = sorted(set(FORMULAS) - set(found))
    if missing:
        raise RuntimeError(f"FormulaData has no {missing} — did the trade-war tax change?")
    return found


def check_references(payload: dict[str, object]) -> None:
    """Every goods and site id another table names must exist.

    The event table is dropped for failing exactly this; the check keeps the
    tables that are shipped from drifting the same way unnoticed.
    """
    goods = {row["Id"] for row in payload["goods.json"]}
    weightless = [row["Id"] for row in payload["goods.json"] if not row.get("Weight")]
    if weightless:
        # The page ranks goods by margin per unit of load.
        raise RuntimeError(f"goods with no Weight: {weightless}")
    sites = {row["Id"] for row in payload["sites.json"]}
    bad: list[str] = []
    for site in payload["sites.json"]:
        bad += [f"site {site['Id']} specialty {g}" for g in site["SpecialtyGoods"] if g not in goods]
    for route in payload["routes.json"]:
        bad += [f"route {route['RouteId']} site {s}" for s in (route["SiteA"], route["SiteB"]) if s not in sites]
    for quest in payload["commissions.json"]:
        if quest["GoodsId"] not in goods:
            bad.append(f"commission {quest['QuestId']} goods {quest['GoodsId']}")
    if bad:
        raise RuntimeError(f"{len(bad)} dangling reference(s), e.g. {bad[:5]}")


def build(excel: Path, data_out: Path) -> dict[str, int]:
    strings = load_strings(excel)
    print(f"strings: {len(strings)} zh-CN entries")

    payload: dict[str, object] = {}
    for table, filename in TABLES.items():
        rows = resolve_text(ordered_rows(load_table(excel, table)), strings)
        missing = unresolved_ids(rows)
        if missing:
            raise RuntimeError(
                f"{table}: {len(missing)} text id(s) had no zh-CN string, "
                f"e.g. {sorted(missing)[:3]} — is a StringDB shard missing from the export?"
            )
        payload[filename] = rows
    payload["formulas.json"] = formulas(excel)
    check_references(payload)

    counts: dict[str, int] = {}
    for filename, rows in payload.items():
        write_json(data_out / OUT_SUBDIR / filename, rows)
        counts[filename] = len(rows)
        print(f"  -> {OUT_SUBDIR}/{filename:20s} {len(rows)} rows")
    return counts


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None, help="override the exported Data/Excel dir")
    parser.add_argument("--out", type=Path, default=None, help="override GMZZ_DATA_OUT")
    args = parser.parse_args(argv)

    excel = args.excel or excel_dir()
    data_out = args.out or require_dir("GMZZ_DATA_OUT")
    build(excel, data_out)
    stamp_version(data_out)


if __name__ == "__main__":
    main()
