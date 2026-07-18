"""Fishing stage: emit the fishing-spot dataset.

The game ships a full fishing model that never reached the site (see the
2026-07-17 data audit). Two tables drive it:

  * ``DT_PalFishingSpotLotteryDataTable`` — one row per (spot-lottery ×
    fish-shadow): the shadow that can appear, its draw ``Weight`` within the
    spot, the catch ``MinLevel``/``MaxLevel`` band, day/night restriction
    (``OnlyTime``), minigame ``Difficulty`` + ``FishingSpotDifficulty`` tier,
    and the ``GainItemLotteryName`` (the item pool reeled in alongside the fish,
    already surfaced as an item source via item_sources.py).
  * ``DT_PalFishShadowDataTable`` — maps a ``FishShadowId`` to the actual
    ``PalId`` you catch, its shadow ``FishShadowSize``, and the King/Boss/Rare
    passive roll rates.

We join them into ``data-palworld/fishing.json``:

  {spots: [{id, spotDifficulty, fish: [{pal, shadow, size, sharePct, lvMin,
            lvMax, night?, difficulty, king?, boss?, rare?, itemLottery?}]}]}

Pal / item names come from the existing pals / items locales (fish ARE pals);
this stage emits ids only, language-independent.

Run: ``uv run python -m palworld.fishing`` (from the ``tools`` dir).
"""

from __future__ import annotations

from pathlib import Path

from .env import require_dir
from .maps.common import read_rows, round2, write_json

_NIGHT = "EPalOneDayTimeType::Night"
_DIFF = "EPalFishingSpotDifficultyType::"
_SIZE = "EPalFishShadowSizeType::"
_NONE = {None, "None", ""}


def run_fishing(raw: Path, data_out: Path) -> dict:
    raw, data_out = Path(raw), Path(data_out)
    spot_rows = read_rows(raw / "DataTable/Fishing/DT_PalFishingSpotLotteryDataTable.json")
    shadow_rows = read_rows(raw / "DataTable/Fishing/DT_PalFishShadowDataTable.json")

    # FishShadowId -> catchable pal + shadow size + rarity roll rates.
    shadow: dict[str, dict] = {}
    for sid, r in shadow_rows.items():
        shadow[sid] = {
            "pal": r.get("PalId"),
            "size": (r.get("FishShadowSize") or "").replace(_SIZE, ""),
            "king": r.get("KingPassiveRate", 0) or 0,
            "boss": r.get("BossPassiveRate", 0) or 0,
            "rare": r.get("RarePassiveRate", 0) or 0,
        }

    # spot lottery total weight (for per-fish share %), and a representative
    # spot-difficulty tier (uniform within a lottery in the data).
    totals: dict[str, float] = {}
    spot_tier: dict[str, str] = {}
    for r in spot_rows.values():
        name = r["LotteryName"]
        totals[name] = totals.get(name, 0) + (r.get("Weight", 0) or 0)
        spot_tier.setdefault(name, (r.get("FishingSpotDifficulty") or "").replace(_DIFF, ""))

    grouped: dict[str, list] = {}
    for r in spot_rows.values():
        name = r["LotteryName"]
        sh = shadow.get(r.get("FishShadowId")) or {}
        pal = sh.get("pal")
        if pal in _NONE:
            continue
        total = totals.get(name, 0) or 1
        entry: dict = {
            "pal": pal,
            "shadow": r.get("FishShadowId"),
            "size": sh.get("size"),
            "sharePct": round(( (r.get("Weight", 0) or 0) / total) * 100),
            "lvMin": r.get("MinLevel", 0),
            "lvMax": r.get("MaxLevel", 0),
            "difficulty": r.get("Difficulty", 0),
        }
        if r.get("OnlyTime") == _NIGHT:
            entry["night"] = True
        for k, src in (("king", "king"), ("boss", "boss"), ("rare", "rare")):
            if sh.get(src):
                entry[k] = round2(sh[src])
        gain = r.get("GainItemLotteryName")
        if gain not in _NONE:
            entry["itemLottery"] = gain
        grouped.setdefault(name, []).append(entry)

    spots = [
        {
            "id": name,
            **({"spotDifficulty": spot_tier[name]} if spot_tier.get(name) else {}),
            "fish": sorted(fish, key=lambda f: (-f["sharePct"], f["pal"])),
        }
        for name, fish in sorted(grouped.items())
    ]
    write_json(data_out / "fishing.json", {"spots": spots})
    n_fish = sum(len(s["fish"]) for s in spots)
    print(f"fishing: {len(spots)} spots, {n_fish} fish entries")
    return {"spots": spots}


if __name__ == "__main__":
    from .version import stamp_version

    run_fishing(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
    stamp_version(require_dir("PALWORLD_DATA_OUT"))
