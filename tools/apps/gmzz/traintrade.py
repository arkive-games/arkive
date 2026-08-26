"""Emit the train-trade (铁路大亨) dataset into ``data-gmzz``.

Run from ``tools/``::

    uv run python -m gmzz.traintrade

Field names are the client's own. The pipeline resolves text and orders rows
but does not rename or reinterpret columns: a wiki that has to guess what
``LeftOverSellPrice`` means is better off guessing from the real name than from
one we invented.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .common import write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

OUT_SUBDIR = "traintrade"

#: Client table -> output file. Every train-trade table the client ships.
TABLES = {
    "TrainTradeGoodsData": "goods.json",
    "TrainTradeGoodsTypeNameData": "goods_types.json",
    "TrainTradeGoodsPriceData": "prices.json",
    "TrainTradeContractData": "contracts.json",
    "TrainTradeQuestData": "quests.json",
    "TrainTradeConstData": "constants.json",
}

#: The subsystem shard whose strings the train-trade UI itself uses. Emitted
#: alongside the tables so the frontend can render labels the tables don't carry.
UI_STRING_SHARD = "StringDB_CN_Data_traingame"


def _ordered(payload):
    """Rows keyed by a numeric id become a list sorted by that id.

    The client stores them in a hash table, so iteration order is arbitrary and
    would otherwise churn the content digest on every run.
    """
    if isinstance(payload, dict) and payload and all(k.lstrip("-").isdigit() for k in payload):
        return [payload[k] for k in sorted(payload, key=int)]
    return payload


def build(excel: Path, data_out: Path) -> dict[str, int]:
    strings = load_strings(excel)
    print(f"strings: {len(strings)} zh-CN entries")

    counts: dict[str, int] = {}
    for table, filename in TABLES.items():
        payload = resolve_text(_ordered(load_table(excel, table)), strings)
        missing = unresolved_ids(payload)
        if missing:
            raise RuntimeError(
                f"{table}: {len(missing)} text id(s) had no zh-CN string, "
                f"e.g. {sorted(missing)[:3]} — is a StringDB shard missing from the export?"
            )
        write_json(data_out / OUT_SUBDIR / filename, payload)
        counts[filename] = len(payload)
        print(f"  {table:32s} -> {OUT_SUBDIR}/{filename:16s} {len(payload)} rows")

    ui = load_table(excel, UI_STRING_SHARD, "LanguageData")
    write_json(data_out / "locales" / "zh-CN" / "traintrade.json", ui)
    counts["locales/zh-CN/traintrade.json"] = len(ui)
    print(f"  {UI_STRING_SHARD:32s} -> locales/zh-CN/traintrade.json {len(ui)} strings")
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
