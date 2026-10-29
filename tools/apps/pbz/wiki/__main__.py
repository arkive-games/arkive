"""CLI: ``python -m pbz.wiki <emit|icons|all>``.

Paths come from env vars / ``tools/.env`` (see ``pbz.env``):
  PBZ_RAW       uex export root
  PBZ_DATA_OUT  data-pbz repo
  PBZ_RES_OUT   resource-pbz repo

The raw export these stages read is::

  uex export --profile pbz --only \\
    ProjectPBZ/Content/PBZContent/DataTable ProjectPBZ/Content/Localization/Game \\
    ProjectPBZ/Content/PBZContent/UI/UINew ProjectPBZ/Content/PBZContent/UI/Hud \\
    ProjectPBZ/Content/PBZContent/UI/InGame ProjectPBZ/Content/PBZContent/UI/AbilityWidget

``emit`` writes ``wiki/*.json`` and ``locales/<locale>/wiki/*.json`` into the data
repo; ``icons`` converts every texture those files name into ``wiki/<name>.webp`` in
the resource repo. Both live beside the map pipeline's output and touch none of it.
"""

from __future__ import annotations

import argparse

from ..env import require_dir


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pbz.wiki")
    ap.add_argument("stage", choices=["emit", "icons", "all"])
    args = ap.parse_args()

    raw = require_dir("PBZ_RAW")
    from .emit import run_emit
    data_out = require_dir("PBZ_DATA_OUT")
    textures = run_emit(raw, data_out)
    from ..version import stamp_version
    stamp_version(data_out)
    if args.stage in ("icons", "all"):
        from .icons import run_icons
        run_icons(raw, require_dir("PBZ_RES_OUT"), textures)


if __name__ == "__main__":
    main()
