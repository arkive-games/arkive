"""Encyclopedia stage: emit the STS2 card and character datasets.

Input is a gdex export (``STS2_RAW``): ``models.json`` mined from the game's
managed assembly, beside the mirrored ``res/`` pack tree. The two halves are
complementary and neither is sufficient alone — the assembly holds the numbers
(cost, rarity, damage magnitudes) and the pack holds the text and the art. They
join on the model id.

Card text is a template with ``{VarName:diff()}`` placeholders that resolve
against the card's dynamic variables, so the numbers and the strings must ship
together for a description to render at all.

Outputs:
  data-sts2/cards.json                        {cards: [Card], filters: {...}}
  data-sts2/characters.json                   {characters: [Character]}
  data-sts2/locales/<tag>/cards.json          {cardId: {name, description}}
  data-sts2/locales/<tag>/characters.json     {charId: {name, description, ...}}
  data-sts2/locales/<tag>/keywords.json       {keyword: {name, description}}
  resource-sts2/icons/card_<id>.webp          (one per card with art)
  resource-sts2/icons/character_<id>.webp     (character select portraits)

Run: ``uv run python -m sts2.encyclopedia`` (from the ``tools`` dir).
"""

from __future__ import annotations

import shutil
from pathlib import Path

from .common import models_by_group, read_json, write_json
from .env import require_dir

# Game locale folder -> arkive language tag. The game ships no Traditional
# Chinese, so zh-TW falls back in the frontend rather than being machine
# converted from zh-CN.
#
# `esp` and `spa` are both Spanish and differ throughout (`esp` conjugates in
# the second person: "Obtienes"/"Robas"; `spa` uses imperatives: "Gana"/"Roba").
# Which regional variant is which is not stated anywhere in the export, so the
# mapping below is a reasonable reading, not a verified fact.
LANG_TAGS = {
    "eng": "en-US",
    "zhs": "zh-CN",
    "jpn": "ja-JP",
    "kor": "ko-KR",
    "deu": "de-DE",
    "fra": "fr-FR",
    "ita": "it-IT",
    "pol": "pl-PL",
    "ptb": "pt-BR",
    "rus": "ru-RU",
    "tha": "th-TH",
    "tur": "tr-TR",
    "esp": "es-ES",
    "spa": "es-MX",
}

BASE_TAG = "en-US"

# Model types that are test scaffolding or retired content, not game data.
EXCLUDED_PREFIXES = ("Mock", "Deprecated")

# Pools that are decks a character draws from, in the order the game lists them.
CHARACTER_POOLS = ("ironclad", "silent", "defect", "necrobinder", "regent")


def _entry_id(model: dict) -> str | None:
    """The model's stable id, e.g. ``ABRASIVE`` from ``ModelId {CARD, ABRASIVE}``."""
    ident = model.get("Id")
    if isinstance(ident, dict):
        entry = ident.get("Entry")
        if isinstance(entry, str) and entry:
            return entry
    return None


def _is_excluded(model: dict) -> bool:
    return str(model.get("type", "")).startswith(EXCLUDED_PREFIXES)


def _card_art_index(raw: Path) -> dict[str, tuple[str, Path]]:
    """``{card_stem: (pool, webp path)}`` from the exported portrait tree.

    The directory a portrait sits in *is* the card's pool, and therefore its
    character. Nothing in the assembly says so: ``CardModel.Pool`` needs a live
    model database and raises without one, so the art layout is the only
    association available offline.
    """
    root = Path(raw) / "res" / "images" / "packed" / "card_portraits"
    index: dict[str, tuple[str, Path]] = {}
    if not root.is_dir():
        return index

    for pool_dir in sorted(root.iterdir()):
        if not pool_dir.is_dir():
            continue
        for art in sorted(pool_dir.glob("*.webp")):
            index.setdefault(art.stem, (pool_dir.name, art))
    return index


def _dynamic_vars(model: dict) -> dict[str, dict]:
    """``{varName: {base, upgraded?}}`` — the magnitudes a description renders.

    Upgraded values are only emitted when they differ, so a consumer can show an
    upgrade arrow without comparing every value itself.
    """
    out: dict[str, dict] = {}
    for name, var in (model.get("DynamicVars") or {}).items():
        if not isinstance(var, dict):
            continue
        base = var.get("_baseValue")
        if base is None:
            continue
        entry: dict = {"base": base}
        upgraded = var.get("_enchantedValue")
        if upgraded is not None and upgraded != base:
            entry["upgraded"] = upgraded
        out[name] = entry
    return out


def _string_list(value) -> list[str]:
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


def build_cards(raw: Path, art: dict[str, tuple[str, Path]]) -> list[dict]:
    cards: list[dict] = []

    for model in models_by_group(raw, "Cards"):
        if _is_excluded(model):
            continue
        card_id = _entry_id(model)
        if card_id is None:
            continue

        stem = card_id.lower()
        pool = art.get(stem, (None, None))[0]

        entry = {
            "id": card_id,
            "type": model.get("Type"),
            "rarity": model.get("Rarity"),
            "cost": model.get("CanonicalEnergyCost"),
            "target": model.get("TargetType"),
            **({"pool": pool} if pool else {}),
            **({"keywords": kw} if (kw := _string_list(model.get("Keywords"))) else {}),
            **({"tags": tags} if (tags := _string_list(model.get("Tags"))) else {}),
            **({"vars": dv} if (dv := _dynamic_vars(model)) else {}),
            **({"icon": f"card_{stem}"} if stem in art else {}),
        }
        if model.get("ShouldShowInCardLibrary") is False:
            entry["hiddenInLibrary"] = True

        cards.append(entry)

    cards.sort(key=lambda c: c["id"])
    return cards


def build_characters(raw: Path, cards: list[dict]) -> list[dict]:
    """Playable characters, joined to their card pool's theme colour."""
    pools = {}
    for model in models_by_group(raw, "CardPools"):
        title = model.get("Title")
        if isinstance(title, str) and title:
            pools[title] = model

    card_counts: dict[str, int] = {}
    for card in cards:
        if pool := card.get("pool"):
            card_counts[pool] = card_counts.get(pool, 0) + 1

    characters: list[dict] = []
    for model in models_by_group(raw, "Characters"):
        if _is_excluded(model):
            continue
        char_id = _entry_id(model)
        if char_id is None:
            continue

        pool_name = char_id.lower()
        pool = pools.get(pool_name, {})

        entry = {
            "id": char_id,
            "playable": bool(model.get("IsPlayable")),
            **({"pool": pool_name} if pool_name in card_counts else {}),
            **({"cardCount": card_counts[pool_name]} if pool_name in card_counts else {}),
            "startingHp": model.get("StartingHp"),
            "startingGold": model.get("StartingGold"),
            "maxEnergy": model.get("MaxEnergy"),
            "orbSlots": model.get("BaseOrbSlotCount"),
            **({"gender": g} if isinstance(g := model.get("Gender"), str) else {}),
            **({"color": c} if isinstance(c := pool.get("DeckEntryCardColor"), str) else {}),
        }
        characters.append({k: v for k, v in entry.items() if v is not None})

    order = {name: i for i, name in enumerate(CHARACTER_POOLS)}
    characters.sort(key=lambda c: (
        not c["playable"],
        order.get(c.get("pool", ""), len(order)),
        c["id"],
    ))
    return characters


def _locale_dir(raw: Path, folder: str) -> Path:
    return Path(raw) / "res" / "localization" / folder


def _split_keyed(table: dict, suffixes: tuple[str, ...]) -> dict[str, dict]:
    """Regroup a flat ``{"ID.field": text}`` table into ``{ID: {field: text}}``."""
    out: dict[str, dict] = {}
    for key, value in table.items():
        if not isinstance(value, str):
            continue
        head, _, field = key.rpartition(".")
        if not head or field not in suffixes:
            continue
        out.setdefault(head, {})[field] = value
    return out


def emit_locales(raw: Path, data_out: Path, card_ids: set[str], char_ids: set[str]) -> int:
    """Write one locale directory per shipped language. Returns the count."""
    written = 0

    for folder, tag in LANG_TAGS.items():
        src = _locale_dir(raw, folder)
        if not src.is_dir():
            continue

        cards_table = read_json(src / "cards.json") if (src / "cards.json").is_file() else {}
        chars_table = read_json(src / "characters.json") if (src / "characters.json").is_file() else {}
        keywords_table = (
            read_json(src / "card_keywords.json") if (src / "card_keywords.json").is_file() else {}
        )

        cards_loc = {
            cid: {"name": fields["title"], **({"description": d} if (d := fields.get("description")) else {})}
            for cid, fields in _split_keyed(cards_table, ("title", "description")).items()
            if cid in card_ids and "title" in fields
        }

        chars_loc = {}
        for cid, fields in _split_keyed(
            chars_table,
            ("title", "description", "cardsModifierTitle", "cardsModifierDescription"),
        ).items():
            if cid not in char_ids or "title" not in fields:
                continue
            chars_loc[cid] = {
                "name": fields["title"],
                **{k: v for k, v in fields.items() if k != "title"},
            }

        keywords_loc = {
            kid: {"name": fields["title"], **({"description": d} if (d := fields.get("description")) else {})}
            for kid, fields in _split_keyed(keywords_table, ("title", "description")).items()
            if "title" in fields
        }

        write_json(data_out / "locales" / tag / "cards.json", cards_loc)
        write_json(data_out / "locales" / tag / "characters.json", chars_loc)
        write_json(data_out / "locales" / tag / "keywords.json", keywords_loc)
        written += 1

    return written


def emit_icons(raw: Path, res_out: Path, cards: list[dict], characters: list[dict]) -> int:
    """Copy card portraits and character art into the resource repo.

    gdex already passes WebP through from the pack untouched, so these are
    copies rather than conversions — re-encoding would cost a lossy generation
    for no benefit.
    """
    art = _card_art_index(raw)
    icons = Path(res_out) / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    copied = 0

    def copy(src: Path, dest: Path) -> int:
        if dest.exists() or not src.is_file():
            return 0
        shutil.copyfile(src, dest)
        return 1

    for card in cards:
        icon = card.get("icon")
        if not icon:
            continue
        source = art.get(card["id"].lower())
        if source:
            copied += copy(source[1], icons / f"{icon}.webp")

    select_dir = Path(raw) / "res" / "images" / "packed" / "character_select"
    for character in characters:
        pool = character.get("pool")
        if not pool:
            continue
        source = select_dir / f"char_select_{pool}.webp"
        if copy(source, icons / f"character_{character['id'].lower()}.webp"):
            copied += 1
            character["icon"] = f"character_{character['id'].lower()}"
        elif (icons / f"character_{character['id'].lower()}.webp").exists():
            character["icon"] = f"character_{character['id'].lower()}"

    return copied


def _filters(cards: list[dict]) -> dict:
    """Facet values actually present, so the UI never renders a dead filter chip."""

    def distinct(key: str) -> list[str]:
        return sorted({c[key] for c in cards if isinstance(c.get(key), str)})

    return {
        "pools": [p for p in CHARACTER_POOLS if any(c.get("pool") == p for c in cards)]
        + sorted({c["pool"] for c in cards if c.get("pool") and c["pool"] not in CHARACTER_POOLS}),
        "types": distinct("type"),
        "rarities": distinct("rarity"),
        "costs": sorted({c["cost"] for c in cards if isinstance(c.get("cost"), int) and c["cost"] >= 0}),
    }


def run_encyclopedia(raw: Path, data_out: Path, res_out: Path) -> dict:
    raw, data_out, res_out = Path(raw), Path(data_out), Path(res_out)

    art = _card_art_index(raw)
    cards = build_cards(raw, art)
    characters = build_characters(raw, cards)

    copied = emit_icons(raw, res_out, cards, characters)

    write_json(data_out / "cards.json", {"cards": cards, "filters": _filters(cards)})
    write_json(data_out / "characters.json", {"characters": characters})

    langs = emit_locales(
        raw, data_out, {c["id"] for c in cards}, {c["id"] for c in characters}
    )

    print(
        f"encyclopedia: {len(cards)} cards, {len(characters)} characters, "
        f"{langs} locales, {copied} icons copied"
    )
    return {"cards": cards, "characters": characters}


if __name__ == "__main__":
    from .version import stamp_version

    run_encyclopedia(
        require_dir("STS2_RAW"),
        require_dir("STS2_DATA_OUT"),
        require_dir("STS2_RES_OUT"),
    )
    stamp_version(require_dir("STS2_DATA_OUT"))
