"""Base raids / invaders (deferred-systems plan §7).

``DT_PalInvader`` (240 rows) defines the base-raid waves: rows group by
``GroupName`` into one raid event; each row is a wave with up to five enemy
slots (``CharactorID_A..E`` — a pal or human NPC id, ``no`` = empty — with a
level band, a head-count and an optional ``Otomo_X`` companion pal), gated by
``BiomeID`` and a base-camp ``InvadeGrade`` range, drawn by ``Weight``.
``DT_PalInvaderReward`` (76 rows, keyed by the same GroupName) lists the
clear-reward item slots. ``ConditionBuildObjectId`` marks raids only triggered
by a specific placed building (currently the gold Factory_Money).

Emits ``data-palworld/invaders.json``:

  {raids: [{id, biome, gradeMin, gradeMax, weight, condition?, waves:
      [{wave, exp?, enemies: [{char, otomo?, lvMin, lvMax, count}]}],
    rewards: [{item, rate, min, max}]},
   humans: {char: {icon?}}}

``char`` may be a roster pal id (frontend links it) or a human-NPC codename.
Human NPCs get a display identity via ``humans`` (portrait stem from
``DT_PalCharacterIconDataTable``, converted into resource ``icons/``) plus
per-locale names in ``locales/<tag>/humans.json``
(``DT_PalHumanParameter.OverrideNameTextID`` → ``DT_HumanNameText_Common``,
e.g. Hunter_Bat → "Syndicate Thug"). Biome names are app-side labels.

Run: ``uv run python -m palworld.invaders`` (from the ``tools`` dir).
"""

from __future__ import annotations

from pathlib import Path

from .encyclopedia import _all_tags, _text_by_lang
from .env import require_dir
from .maps.common import read_rows, write_json

_NONE = {None, "None", "", "no"}
_BIOME = "EPalBiomeType::"


def run_invaders(raw: Path, data_out: Path, res_out: Path | None = None) -> dict:
    raw, data_out = Path(raw), Path(data_out)
    wave_rows = read_rows(raw / "DataTable/Invader/DT_PalInvader.json")
    reward_rows = read_rows(raw / "DataTable/Invader/DT_PalInvaderReward.json")

    grouped: dict[str, list[dict]] = {}
    for r in wave_rows.values():
        grouped.setdefault(r.get("GroupName", ""), []).append(r)

    raids = []
    for gid, rows in grouped.items():
        if not gid:
            continue
        rows.sort(key=lambda r: r.get("Wave", 0))
        first = rows[0]
        raid: dict = {
            "id": gid,
            "biome": (first.get("BiomeID") or "").replace(_BIOME, ""),
            # a few groups vary the grade band per wave — keep the widest span.
            "gradeMin": min(r.get("InvadeGradeMin", 0) for r in rows),
            "gradeMax": max(r.get("InvadeGradeMax", 0) for r in rows),
            "weight": first.get("Weight", 1),
        }
        cond = first.get("ConditionBuildObjectId")
        if cond not in _NONE:
            raid["condition"] = cond
        waves = []
        for r in rows:
            enemies = []
            for slot in ("A", "B", "C", "D", "E"):
                char = r.get(f"CharactorID_{slot}")
                count = r.get(f"Number_{slot}", 0) or 0
                if char in _NONE or count <= 0:
                    continue
                enemy: dict = {
                    "char": char,
                    "lvMin": r.get(f"LevelMin_{slot}", 0),
                    "lvMax": r.get(f"LevelMax_{slot}", 0),
                    "count": count,
                }
                otomo = r.get(f"Otomo_{slot}")
                if otomo not in _NONE:
                    enemy["otomo"] = otomo
                enemies.append(enemy)
            if not enemies:
                continue
            wave: dict = {"wave": r.get("Wave", 0), "enemies": enemies}
            if r.get("Exp", 0):
                wave["exp"] = r["Exp"]
            waves.append(wave)
        raid["waves"] = waves
        rewards = []
        rw = reward_rows.get(gid) or {}
        for i in range(1, 11):
            item = rw.get(f"ItemId{i}")
            rate = rw.get(f"Rate{i}", 0) or 0
            if item in _NONE or rate <= 0:
                continue
            rewards.append({
                "item": item, "rate": rate,
                "min": rw.get(f"min{i}", 0), "max": rw.get(f"Max{i}", 0),
            })
        raid["rewards"] = rewards
        raids.append(raid)

    # Stable order: biome (table order), then grade band, then id.
    biome_order = {b: i for i, b in enumerate(dict.fromkeys(
        (r.get("BiomeID") or "").replace(_BIOME, "") for r in wave_rows.values()
    ))}
    raids.sort(key=lambda x: (biome_order.get(x["biome"], 99), x["gradeMin"], x["id"]))

    # ---- Human NPC enemies: display identity -------------------------------
    # Non-pal `char`/`otomo` ids are human NPCs (rows in DT_PalHumanParameter).
    # Emit their portrait stem (converted below like pal portraits) and, per
    # locale, the OverrideNameTextID string ("Syndicate Thug", …) so the
    # frontend never has to show the raw codename.
    chars = {e["char"] for x in raids for w in x["waves"] for e in w["enemies"]}
    chars |= {
        e["otomo"] for x in raids for w in x["waves"] for e in w["enemies"] if e.get("otomo")
    }
    human_rows = read_rows(raw / "DataTable/Character/DT_PalHumanParameter.json")
    icon_rows = read_rows(raw / "DataTable/Character/DT_PalCharacterIconDataTable.json")
    humans: dict[str, dict] = {}
    for c in sorted(chars & set(human_rows)):
        icon_path = ((icon_rows.get(c) or {}).get("Icon") or {}).get("AssetPathName") or ""
        stem = icon_path.rsplit(".", 1)[-1]
        humans[c] = {"icon": stem} if stem else {}

    name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_HumanNameText_Common.json", "")
    for tag in _all_tags():
        tnames = name_by_lang[tag]
        loc = {}
        for c in humans:
            key = human_rows[c].get("OverrideNameTextID") or ""
            name = tnames.get(key, "")
            if name:
                loc[c] = name
        write_json(data_out / "locales" / tag / "humans.json", loc)

    converted = 0
    if res_out is not None:
        from PIL import Image  # heavy dep, only needed with res_out

        icons_dir = Path(res_out) / "icons"
        icons_dir.mkdir(parents=True, exist_ok=True)
        for stem in sorted({h["icon"] for h in humans.values() if h.get("icon")}):
            dest = icons_dir / f"{stem}.webp"
            if dest.exists():
                continue
            src = next((raw / "Texture/PalIcon").rglob(f"{stem}.png"), None)
            if src is None:
                print(f"invaders: WARNING icon source missing for {stem}")
                continue
            with Image.open(src) as img:
                img = img.convert("RGBA") if img.mode not in ("RGB", "RGBA") else img
                img.save(dest, "WEBP", quality=90, method=6)
            converted += 1

    write_json(data_out / "invaders.json", {"raids": raids, "humans": humans})
    print(
        f"invaders: {len(raids)} raids, {sum(len(x['waves']) for x in raids)} waves, "
        f"{len(humans)} human NPCs, {converted} icons converted"
    )
    return {"raids": raids, "humans": humans}


if __name__ == "__main__":
    from .version import stamp_version

    run_invaders(
        require_dir("PALWORLD_RAW"),
        require_dir("PALWORLD_DATA_OUT"),
        require_dir("PALWORLD_RES_OUT"),
    )
    stamp_version(require_dir("PALWORLD_DATA_OUT"))
