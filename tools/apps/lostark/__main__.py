"""Command line entry point: ``python -m lostark emit``."""

from __future__ import annotations

import sys

from .db import Tables
from .emit import build, write
from .env import require_dir

USAGE = "usage: python -m lostark emit"


def main(argv: list[str]) -> int:
    if argv[1:2] != ["emit"]:
        print(USAGE, file=sys.stderr)
        return 2

    tables = Tables(require_dir("LOSTARK_TABLES"))
    out = require_dir("LOSTARK_DATA_OUT")

    dataset = build(tables)
    write(dataset, out, source=tables.root)

    version = dataset["version.json"]
    counts = version["counts"]
    print(f"wrote {len(dataset)} files to {out}")
    print(
        f"  item levels={counts['itemLevels']} "
        f"ark cores={counts['arkCores']} locale keys={counts['localeKeys']}"
    )
    for role, dropped in version["droppedArkCoreValues"].items():
        if dropped:
            print(f"  dropped {dropped} {role} ark-core values with no ArkGridCore definition")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
