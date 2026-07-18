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

  {spots: [{id, area?, spotDifficulty, fish: [{pal, shadow, size, sharePct,
            lvMin, lvMax, night?, difficulty, king?, boss?, rare?,
            itemLottery?}]}],
   baits: [{item, hitBar?, missFight?, successFight?, attract?,
            startProgress?, palDropBonus?, itemDropBonus?}]}

``area`` is the blueprint-sources area key of the spot's item pool (same
classifier as the item pages, so the frontend reuses the localized area
labels). ``baits`` is ``DT_FishingBaitItem`` — the minigame modifiers each
bait item grants (only non-default values emitted). Pal / item names come from
the existing pals / items locales (fish ARE pals); this stage emits ids only,
language-independent.

Run: ``uv run python -m palworld.fishing`` (from the ``tools`` dir).
"""

from __future__ import annotations

from pathlib import Path

import re
from collections import Counter

from .env import require_dir
from .item_sources import _classify
from .maps.common import read_rows, round2, write_json

_NIGHT = "EPalOneDayTimeType::Night"
_DIFF = "EPalFishingSpotDifficultyType::"
_SIZE = "EPalFishShadowSizeType::"
_NONE = {None, "None", ""}
# BOSS_-shadow rows are the alpha-variant catches of the base species — emit
# the base roster id (so pal links/names resolve) plus an ``alpha`` flag.
_VARIANT_PREFIX = re.compile(r"^(boss_|raid_|gym_)", re.I)


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
        base = _VARIANT_PREFIX.sub("", pal)
        total = totals.get(name, 0) or 1
        entry: dict = {
            "pal": base,
            **({"alpha": True} if base != pal else {}),
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

    def _spot_area(fish: list) -> str | None:
        """The spot's blueprint-sources area key, from its most common item
        pool (Grass01_Fishing → Grass) — same classifier as the item pages."""
        for lot, _n in Counter(f["itemLottery"] for f in fish if f.get("itemLottery")).most_common():
            c = _classify(lot)
            if c and c[0] == "fishing":
                return c[1]
        return None

    spots = []
    for name, fish in sorted(grouped.items()):
        area = _spot_area(fish)
        spots.append({
            "id": name,
            **({"area": area} if area else {}),
            **({"spotDifficulty": spot_tier[name]} if spot_tier.get(name) else {}),
            "fish": sorted(fish, key=lambda f: (-f["sharePct"], f["pal"])),
        })

    # bait minigame modifiers (DT_FishingBaitItem, keyed by bait item id);
    # rates default to 1, percents to 0 — only deviations are emitted.
    bait_rows = read_rows(raw / "DataTable/Item/DT_FishingBaitItem.json")
    _BAIT_FIELDS = (
        ("HitBarSizeRate", "hitBar", 1),
        ("MissFightAmountRate", "missFight", 1),
        ("SuccessFightAmountRate", "successFight", 1),
        ("SearchProbabilityRate", "attract", 1),
        ("StartProgressAmountPercent", "startProgress", 0),
        ("EnemyAddDropPercent", "palDropBonus", 0),
        ("ItemLotteryAddDropPercent", "itemDropBonus", 0),
    )
    baits = []
    for iid, r in bait_rows.items():
        b: dict = {"item": iid}
        for src, dst, default in _BAIT_FIELDS:
            v = round2(r.get(src, default) or default)
            if v != default:
                b[dst] = v
        baits.append(b)

    write_json(data_out / "fishing.json", {"spots": spots, "baits": baits})
    n_fish = sum(len(s["fish"]) for s in spots)
    print(f"fishing: {len(spots)} spots, {n_fish} fish entries, {len(baits)} baits")
    return {"spots": spots, "baits": baits}


if __name__ == "__main__":
    from .version import stamp_version

    run_fishing(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
    stamp_version(require_dir("PALWORLD_DATA_OUT"))
