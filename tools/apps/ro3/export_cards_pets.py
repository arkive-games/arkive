"""Emit Ragnarok Online 3's card and pet tables, and export their art.

Where the rows come from
------------------------
The client's Lua config tables, read with :mod:`.lua_tables` — the chunks are executed in
a real Lua 5.4 state and the table they return is read back, so nothing here is
pattern-matched out of bytecode. Text is resolved against the seven ``Localization_*``
tables through :mod:`.localization`, which also renders the ``${n}`` / ``^{n}`` / ``@{n}``
placeholder families.

Multiverse variants
-------------------
Every ``Config/DataConfig/<Name>.lua`` also ships under ``LuaMultiverse/M101/`` and
``LuaMultiverse/M102/``, so a stem resolves to up to three chunks. The base
``LuaScript/`` copy wins; a multiverse copy is used only where the base ships the table
empty (``PetFloorConfig``, ``FlashCardOutputConfig``) or not at all
(``CardBindingConfig``). Which copy each table came from is recorded in the output under
``sources``, and any table whose variants disagree is listed under ``variantsDiffer``
rather than silently collapsed.

Joins this module makes, and what each is grounded in
-----------------------------------------------------
``CardConfig`` is a *tier* table: 968 rows are 242 cards times their tiers, keyed by
``_iCardID``, which is an ``ItemConfig`` row id — that is where a card's name, description,
quality, slot (``_iCardPart``) and portrait live. A tier's ``_kBasicAttribute`` pairs are
``AttributeConfig`` ids; its ``_kSkillAttribute`` / ``_kFlashAttribute`` ids are
``SpecialEffectConfig`` rows, whose text is either their own ``_iEffectDesc`` or, when
``_kOtherDesc`` is set, the ``BuffConfig`` row it points at. ``PetStarConfig`` skill ids
are ``SkillConfig`` rows. Each join was verified to be total before it was made; the
residuals are reported in ``counts``.

Output
------
Six files in ``data-ro3``, split so no single one is unwieldy in a browser::

    cards.json          242 cards with their 968 tiers, bindings, adventure cards
    cards-upgrade.json  the 720-row per-slot upgrade ladder
    pets.json           the 56-pet roster, exp curve, incubation, emoticons
    pets-star.json      the 1,176-row per-star skill and attribute table
    pets-skills.json    the SkillConfig rows pets-star.json names
    pets-floors.json    the 230 floors of the pet tower

and two art directories in ``resource-ro3``: ``icons/cards`` and ``icons/pets``.

Usage::

    uv run python -m ro3.export_cards_pets              # data only
    uv run python -m ro3.export_cards_pets --art        # data, and export the icons first
    uv run python -m ro3.export_cards_pets --art-only
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from collections import defaultdict
from pathlib import Path

from . import localization as loc
from .catalog import CATALOG, load as load_catalog
from .common import write_json
from .env import require_dir
from .lua_tables import Runner, iter_chunks
from .unpack import stage_dir, vfs_root

#: ``Localization_<code>`` chunk suffix -> the locale tag the dataset uses. The client also
#: ships ``th``, ``id`` and ``vi``; those are left out because the site serves these four and
#: carrying seven would roughly double the size of every text field. Nothing else
#: distinguishes them — all seven are read the same way, and ``OTHER_LANGUAGES`` is named in
#: the output so the omission is visible rather than implied.
LANGUAGES = {
    "zh_CN": "zh-CN",
    "zh_TW": "zh-TW",
    "en": "en-US",
    "ko": "ko-KR",
}

#: Shipped by the client, not emitted here.
OTHER_LANGUAGES = ("th", "id", "vi")

#: Config tables this module reads. Everything else in the game's Lua is left alone.
TABLES = (
    # cards
    "CardConfig", "CardUpgradeConfig", "CardBindingConfig", "CardReturnCostConfig",
    "AdventureCardConfig", "AdventureGroupCardConfig",
    "FlashCardPoolConfig", "FlashCardOutputConfig",
    "CardHoleConfig", "CardLevelConfig", "CardStartConfig",
    # pets
    "PetBaseConfig", "PetStarConfig", "PetExpConfig", "PetAttrChangeConfig",
    "PetSetLimitConfig", "PetEmoticonsConfig", "PetFloorConfig",
    "PetIncubationRoomConfig", "PetIncubationSlotConfig", "PetIncubationResultConfig",
    # joined against
    "ItemConfig", "AttributeConfig", "SpecialEffectConfig", "BuffConfig", "SkillConfig",
)

#: Tables whose every row is the authoring template rather than content: their string
#: columns hold the literal ``xx``. Counted and named in the output, never emitted as data.
STUB_MARKER = "xx"


# --------------------------------------------------------------------------- loading

def _variant_rank(script: str) -> int:
    """Base ``LuaScript/`` copy first, then the multiverse copies in name order."""
    return 0 if script.startswith("LuaScript/") else 1


def load_tables(vfs: Path, names) -> tuple[dict[str, list], dict[str, dict], dict[str, dict]]:
    """``(rows by table, provenance by table, per-table variant disagreements)``.

    Rows come back as a list in row-id order, with the row id merged in as ``_iID`` when
    the table keys its rows by something the row itself does not carry.

    A disagreement is reported as the **row ids** that differ, not just the table name:
    ``ItemConfig``'s multiverse copies do diverge, but on rows no card refers to, and a bare
    "these differ" would read as a warning about the card data when it is not one.
    """
    wanted = set(names)
    chunks: dict[str, list] = defaultdict(list)
    for chunk in iter_chunks(vfs, lambda s: s is not None and _keep(s, wanted)):
        chunks[Path(chunk.script).stem].append(chunk)

    runner = Runner()
    rows: dict[str, list] = {}
    sources: dict[str, dict] = {}
    differ: dict[str, dict] = {}
    for name in sorted(wanted):
        variants = []
        for chunk in sorted(chunks.get(name, []), key=lambda c: _variant_rank(c.script)):
            table = runner.run(chunk.data)
            values = table.get("m_kValues")
            variants.append((chunk, _as_rows(values)))
        if not variants:
            continue
        best = next((v for v in variants if v[1]), variants[0])
        rows[name] = best[1]
        sources[name] = {
            "script": best[0].script,
            "container": best[0].container,
            "rows": len(best[1]),
            "variants": [c.script for c, _ in variants],
        }
        against = {_row_id(r): json.dumps(r, sort_keys=True) for r in best[1]}
        for chunk, other in variants:
            if chunk.script == best[0].script or not other:
                continue
            here = {_row_id(r): json.dumps(r, sort_keys=True) for r in other}
            ids_ = sorted(
                (k for k in set(here) | set(against) if here.get(k) != against.get(k)),
                key=lambda v: (isinstance(v, str), v),
            )
            if ids_:
                differ.setdefault(name, {})[chunk.script] = ids_
    return rows, sources, differ


def _row_id(row: dict):
    return row.get("_iID", row.get("_iId", row.get("_iCardID")))


def _keep(script: str, wanted: set[str]) -> bool:
    stem = Path(script).stem
    if stem.startswith("Localization_"):
        return stem.removeprefix("Localization_") in LANGUAGES
    return "/DataConfig/" in script and stem in wanted


def _as_rows(values) -> list[dict]:
    """A config table's ``m_kValues`` as a list of rows, in row-id order."""
    if isinstance(values, list):
        return [r for r in values if isinstance(r, dict)]
    if not isinstance(values, dict):
        return []
    out = []
    for key, row in sorted(values.items(), key=lambda kv: _num(kv[0])):
        if not isinstance(row, dict):
            continue
        if "_iID" not in row and "_iId" not in row:
            row = {"_iID": _num(key), **row}
        out.append(row)
    return out


def _num(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return value


def load_languages(vfs: Path) -> dict[str, dict[str, str]]:
    """``locale tag -> {string id: text}``, with the untranslated marker dropped."""
    runner = Runner()
    out: dict[str, dict[str, str]] = {}
    for chunk in iter_chunks(
        vfs, lambda s: s is not None and Path(s).stem.startswith("Localization_")
    ):
        code = Path(chunk.script).stem.removeprefix("Localization_")
        tag = LANGUAGES.get(code)
        if tag is None:
            continue
        table = runner.run(chunk.data)
        out[tag] = loc.text_table(table.get("m_kValues") or {})
    return out


# ------------------------------------------------------------------------ text fields

class Text:
    """Resolves one localized field into every language that actually has it."""

    def __init__(self, languages: dict[str, dict[str, str]]):
        self.languages = languages
        self.fields = 0
        self.localized = 0
        self.leftover: dict[str, int] = defaultdict(int)

    def __call__(self, field, desc_data=None) -> dict[str, str] | None:
        if not isinstance(field, list) or not field or not field[0]:
            return None
        self.fields += 1
        out = {}
        for tag, table in self.languages.items():
            text = loc.lookup(table, field, desc_data)
            if text is not None:
                out[tag] = text
                if loc.unresolved(text):
                    self.leftover[tag] += 1
        if not out:
            return None
        self.localized += 1
        return out


# ------------------------------------------------------------------------- small bits

def pairs(value) -> list[list]:
    """A config column that is a list of ``[id, value]`` pairs; ``{}`` means empty."""
    if not isinstance(value, list):
        return []
    return [list(e) for e in value if isinstance(e, list)]


def ids(value) -> list:
    """A config column that is a flat list of ids; ``{}`` means empty."""
    if not isinstance(value, list):
        return []
    return [e for e in value if not isinstance(e, (list, dict))]


def text_or_none(value) -> str | None:
    return value if isinstance(value, str) and value else None


def stem(pic) -> str | None:
    """A config picture reference (``pet_icon_head_32004.png``) as a bare object name."""
    name = text_or_none(pic)
    return name.removesuffix(".png") if name else None


def is_stub(rows) -> bool:
    return bool(rows) and any(
        v == STUB_MARKER for row in rows for v in row.values() if isinstance(v, str)
    )


# ------------------------------------------------------------------------------- art

def art_names(rows: dict[str, list]) -> tuple[dict[str, str], dict[str, list[str]]]:
    """``(object name -> output directory, unexpanded template -> its variants)``.

    Two binding columns name their sprite with a ``${1}`` where the size suffix goes.
    Nothing in the row supplies that argument — it is chosen by whichever widget draws the
    icon — so the template is not rendered. Every catalogued object whose name matches the
    template with *some* suffix is exported instead, and the caller is told which.
    """
    want: dict[str, str] = {}
    templates: dict[str, list[str]] = {}

    def add(pic, out):
        name = stem(pic)
        if not name:
            return
        if "${" in name:
            templates.setdefault(name, [])
        else:
            want.setdefault(name, out)

    items = {r["_iID"]: r for r in rows.get("ItemConfig", [])}
    for row in rows.get("CardConfig", []):
        item = items.get(row.get("_iCardID"))
        if item:
            add(item.get("_kPic"), "icons/cards")
    for row in rows.get("AdventureCardConfig", []):
        image = row.get("_kImage")
        if isinstance(image, list) and image:
            add(image[-1], "icons/cards")
    for row in rows.get("AdventureGroupCardConfig", []):
        for key in ("_kBigPicture", "_kBigPicture01", "_kMediumPicture", "_kSmallPicture"):
            add(row.get(key), "icons/cards")
    for row in rows.get("CardBindingConfig", []):
        for key in ("_kBindPic", "_kBindTypePic"):
            add(row.get(key), "icons/cards")
    for row in rows.get("PetBaseConfig", []):
        for key in PET_ART:
            add(row.get(key), "icons/pets")
    return want, templates


#: ``PetBaseConfig`` picture columns, and the shorter key each becomes in the output.
PET_ART = {
    "_kHeadPic": "head",
    "_kStarHeadPic": "starHead",
    "_kHandbookPic": "handbook",
    "_kFightListPic": "fightList",
    "_kFightFieldPic": "fightField",
    "_kEncyclopediaPic": "encyclopedia",
    "_kGachaPic": "gacha",
    "_kGachaAwardPic": "gachaAward",
    "_kTipsPic": "tips",
    "_kBgPic": "bg",
}


def export_art(rows: dict[str, list], stage: Path, work: Path, res_out: Path,
               *, quality: int = 90, dry_run: bool = False) -> dict:
    """Cut every card and pet image out of the bundles and write it as WebP.

    Reuses :mod:`.art` for the Unity side: an object that ships as a ``Texture2D`` is
    decoded whole, and one that ships only as a ``Sprite`` is cut out of its atlas.
    """
    from . import art

    want, templates = art_names(rows)
    catalog = stage / CATALOG

    # One pass over the 26 MB catalogue: everything downstream is a lookup.
    prefixes = {t: t.split("${")[0] for t in templates}
    index: dict[str, list[tuple[str, str]]] = defaultdict(list)   # name -> [(bundle, class)]
    atlases: list[tuple[str, str]] = []                            # (bundle, atlas name)
    textures: dict[tuple[str, int], str] = {}                      # (container, pathId) -> name
    for bundle, obj in load_catalog(catalog):
        if bundle.endswith(art.VARIANT_SUFFIXES):
            continue
        if obj["class"] == "SpriteAtlas":
            atlases.append((bundle, obj["name"]))
            continue
        if obj["class"] not in ("Texture2D", "Sprite"):
            continue
        index[obj["name"]].append((bundle, obj["class"]))
        if obj["class"] == "Texture2D":
            textures[(Path(bundle).name, obj["pathId"])] = obj["name"]
        for template, prefix in prefixes.items():
            if obj["name"].startswith(prefix) and obj["name"] != prefix:
                if obj["name"] not in templates[template]:
                    templates[template].append(obj["name"])
    for template, found in templates.items():
        for name in found:
            want.setdefault(name, "icons/cards")

    # A config's picture column does not always match the object's casing
    # (``pet_icon_gacha_101.png`` against ``pet_icon_Gacha_101``), so the fall-back join is
    # case-insensitive and the mismatches are named rather than dropped.
    folded = {name.lower(): name for name in index}
    plan: dict[str, tuple[str, str, str]] = {}   # object name -> (bundle, class, out dir)
    missing: list[str] = []
    case_fixed: dict[str, str] = {}
    for wanted_name, out in sorted(want.items()):
        name = wanted_name if wanted_name in index else folded.get(wanted_name.lower())
        if name is None:
            missing.append(wanted_name)
            continue
        if name != wanted_name:
            case_fixed[wanted_name] = name
        entries = index[name]
        # Prefer the whole texture; fall back to the atlas route when only a Sprite ships.
        bundle, klass = next((e for e in entries if e[1] == "Texture2D"), entries[0])
        plan[name] = (bundle, klass, out)

    report = {
        "requested": len(want),
        "planned": len(plan),
        "missingFromCatalog": missing,
        "caseMismatched": case_fixed,
        "templates": {k: sorted(v) for k, v in sorted(templates.items())},
        "written": 0,
        "unresolved": [],
    }
    print(f"art: {len(want)} objects wanted, {len(plan)} in the catalogue, "
          f"{len(missing)} missing")
    if dry_run:
        return report

    bundles = sorted({b for b, _, _ in plan.values()})
    # Atlases are only needed for the sprites that ship without a texture of their own; a
    # sprite names its atlas by tag, and the atlas usually lives in another bundle.
    needs_atlas = any(k == "Sprite" for _, k, _ in plan.values())
    atlas_bundles = sorted({b for b, _ in atlases}) if needs_atlas else []
    selection = art.stage_selection(stage, work, sorted(set(bundles) | set(atlas_bundles)))
    pages = work / "pages"
    if pages.exists():
        shutil.rmtree(pages)
    config = art.write_profile(work, selection, work / "unex-out")

    started = time.time()
    with art.Serve(config) as serve:
        atlas_maps: dict[str, dict] = {}
        for bundle, name in (atlases if needs_atlas else []):
            container = Path(bundle).name
            vfs = f"bundles/{container}/SpriteAtlas/{name}"
            try:
                atlas_maps[vfs] = art.atlas_render_data(serve, vfs)
            except Exception as exc:                              # noqa: BLE001
                report["unresolved"].append(f"atlas {name}: {exc}")
        pathid_to_texture = textures

        done = 0
        for name, (bundle, klass, out) in plan.items():
            container = Path(bundle).name
            try:
                if klass == "Texture2D":
                    image = art._page(serve, container, name, None, pages)
                else:
                    image = art._sprite_image(
                        serve, f"bundles/{container}/Sprite/{name}",
                        atlas_maps, {}, pathid_to_texture, pages,
                    )
            except Exception as exc:                              # noqa: BLE001
                report["unresolved"].append(f"{name}: {type(exc).__name__}: {exc}")
                continue
            target = res_out / out / f"{art.safe_name(name)}.webp"
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, "WEBP", quality=quality, method=6)
            report["written"] += 1
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(plan)}  {time.time() - started:.0f}s")
    print(f"art: {report['written']} WebP written, {len(report['unresolved'])} unresolved")
    return report


class ArtIndex:
    """The WebP files in the two directories we own, looked up by object name.

    Case-insensitive on purpose: ``PetBaseConfig`` asks for ``pet_icon_gacha_101.png``
    while the object in the bundle is ``pet_icon_Gacha_101``, and the file on disk keeps the
    object's own casing.
    """

    #: ``icons/skills`` is read but never written: pet skills point into the existing skill
    #: icon export rather than duplicating it, and a path is only emitted once the file is
    #: known to be there.
    DIRS = ("icons/cards", "icons/pets", "icons/skills")

    def __init__(self, res_out: Path):
        self.by_name: dict[str, str] = {}
        for sub in self.DIRS:
            for path in sorted((res_out / sub).glob("*.webp")):
                self.by_name[path.stem.lower()] = f"{sub}/{path.name}"

    def __len__(self) -> int:
        return len(self.by_name)

    def get(self, name: str | None) -> str | None:
        return self.by_name.get(name.lower()) if name else None

    def variants(self, template: str | None) -> list[str]:
        """Every exported file matching a ``...${1}...`` picture template.

        Two ``CardBindingConfig`` columns name their sprite with a ``${1}`` where a size
        suffix goes, and nothing in the row supplies that argument — the widget drawing the
        icon picks it. So the template is not rendered; the files that answer to it are
        listed, and the caller can choose.
        """
        if not template or "${" not in template:
            return []
        prefix = template.split("${")[0].lower()
        return sorted(path for stem_, path in self.by_name.items()
                      if stem_.startswith(prefix) and stem_ != prefix)


# ------------------------------------------------------------------------ card export

def build_cards(rows, text: Text, icons: dict[str, str]) -> tuple[dict, dict]:
    items = {r["_iID"]: r for r in rows.get("ItemConfig", [])}
    attributes = {r["_iID"]: r for r in rows.get("AttributeConfig", [])}
    effects = {r["_iID"]: r for r in rows.get("SpecialEffectConfig", [])}
    buffs = {r["_iID"]: r for r in rows.get("BuffConfig", [])}

    tiers_by_card: dict[int, list] = defaultdict(list)
    used_attributes: set[int] = set()
    used_effects: set[int] = set()
    for row in rows.get("CardConfig", []):
        basic = pairs(row.get("_kBasicAttribute"))
        used_attributes |= {p[0] for p in basic}
        special = ids(row.get("_kSkillAttribute"))
        flash_special = ids(row.get("_kFlashAttribute"))
        used_effects |= set(special) | set(flash_special)
        tier = {
            "configId": row["_iID"],
            "tier": row.get("_iTier"),
            "level": row.get("_iLevel"),
            "power": row.get("_iPower"),
            "cost": pairs(row.get("_kCost")),
            "attributes": basic,
            "specialEffects": special,
            "showLibrary": bool(row.get("_iShowLibrary")),
            "open": bool(row.get("_iIsOpen")),
        }
        if flash_special or row.get("_iFlashPower") or row.get("_iFlashWeight"):
            tier["flash"] = {
                "power": row.get("_iFlashPower"),
                "weight": row.get("_iFlashWeight"),
                "specialEffects": flash_special,
                "resource": text_or_none(row.get("_kFlashCardResource")),
            }
        tiers_by_card[row["_iCardID"]].append(tier)

    cards = []
    with_icon = 0
    for card_id, tiers in sorted(tiers_by_card.items()):
        item = items.get(card_id, {})
        pic = stem(item.get("_kPic"))
        icon = icons.get(pic) if pic else None
        with_icon += icon is not None
        cards.append({
            "id": card_id,
            "name": text(item.get("_iName")),
            "description": text(item.get("_iDescription")),
            "quality": item.get("_iQuality"),
            "part": item.get("_iCardPart"),
            "isElementCard": bool(item.get("_iIsEleCard")),
            "stackLimit": item.get("_iStackLimit"),
            "tradable": bool(item.get("_iTrade")),
            "decompose": pairs(item.get("_kDecompose")),
            "pic": pic,
            "icon": icon,
            "tiers": sorted(tiers, key=lambda t: (t["tier"] or 0, t["configId"])),
        })

    bindings = []
    binding_text_ids: set[int] = set()
    for row in rows.get("CardBindingConfig", []):
        for key in ("_IBindName", "_iBindTypeName"):
            field = row.get(key)
            if isinstance(field, list) and field and field[0]:
                binding_text_ids.add(field[0])
        used_attributes |= {
            p[0]
            for key in ("_kUseBasicAttribute", "_kCollectBasicAttribute")
            for p in pairs(row.get(key))
        }
        bindings.append({
            "id": row["_iID"],
            "bindId": row.get("_iBindID"),
            "bindTier": row.get("_iBindTier"),
            "bindType": row.get("_iBindType"),
            "name": text(row.get("_IBindName")),
            "typeName": text(row.get("_iBindTypeName")),
            "quality": row.get("_iQuality"),
            "cards": ids(row.get("_kCards")),
            "usePower": row.get("_iUsePower"),
            "collectPower": row.get("_iCollectPower"),
            "useAttributes": pairs(row.get("_kUseBasicAttribute")),
            "collectAttributes": pairs(row.get("_kCollectBasicAttribute")),
            "useSkillAttribute": row.get("_kUseSkillAttribute") or [],
            "collectSkillAttribute": row.get("_kCollectSkillAttribute") or [],
            "bindPic": text_or_none(row.get("_kBindPic")),
            "bindPicVariants": icons.variants(text_or_none(row.get("_kBindPic"))),
            "bindTypePic": text_or_none(row.get("_kBindTypePic")),
            "bindTypePicVariants": icons.variants(text_or_none(row.get("_kBindTypePic"))),
        })

    adventure = []
    adventure_icons = 0
    for row in rows.get("AdventureCardConfig", []):
        image = row.get("_kImage")
        pic = stem(image[-1]) if isinstance(image, list) and image else None
        icon = icons.get(pic) if pic else None
        adventure_icons += icon is not None
        adventure.append({
            "id": row.get("_iCardId"),
            "name": text(row.get("_iCardName")),
            "brief": text(row.get("_iBriefDescription")),
            "description": text(row.get("_iFullDescription")),
            "quality": row.get("_iCardQuality"),
            "level": row.get("_iCardLv"),
            "group": row.get("_iCardGroup"),
            "poolId": row.get("_iPoolId"),
            "archetype": row.get("_iArchetype"),
            "targetType": row.get("_iTargetType"),
            "weight": row.get("_iWeight"),
            "effect": [list(e) for e in (row.get("_kEffect") or []) if isinstance(e, list)],
            "prerequisite": ids(row.get("_kPrerequisite")),
            "postCondition": ids(row.get("_kPostCondition")),
            "incompatible": ids(row.get("_kIncompatible")),
            "stack": row.get("_kStack") or [],
            "pic": pic,
            "icon": icon,
        })

    adventure_groups = []
    for row in rows.get("AdventureGroupCardConfig", []):
        art_files = {
            key.removeprefix("_k")[0].lower() + key.removeprefix("_k")[1:]: icons.get(stem(row.get(key)))
            for key in ("_kBigPicture", "_kBigPicture01", "_kMediumPicture", "_kSmallPicture")
            if stem(row.get(key))
        }
        adventure_groups.append({
            "id": row["_iID"],
            "name": text(row.get("_iName")),
            "description": text(row.get("_iDesc")),
            "priority": row.get("_iPriority"),
            "defaultUnlock": bool(row.get("_iDefaultUnlock")),
            "unlock": row.get("_kUnlock"),
            "icons": art_files,
        })

    special_effects = []
    for effect_id in sorted(used_effects):
        row = effects.get(effect_id)
        if row is None:
            continue
        desc = text(row.get("_iEffectDesc"), row.get("_kDescData"))
        via = None
        other = row.get("_kOtherDesc")
        if desc is None and isinstance(other, list) and len(other) > 1:
            buff = buffs.get(other[1])
            if buff is not None:
                desc = text(buff.get("_iDescription"), buff.get("_kDescData"))
                via = other[1]
        # A _kSpecialEffect tuple leads with a family marker. Measured over the 145 the cards
        # use: 1 is [1, AttributeConfig id, value] (6 ids, all present), 2 is [2, BuffConfig
        # id] (145, all present), 3 is [3, SkillConfig id] (6, all present), and 8 leads with
        # AttributeConfig id 109. Only the attribute ids are pulled in here; the shape is
        # reported rather than renamed, because nothing in the client labels these families.
        for tuple_ in (row.get("_kSpecialEffect") or []):
            if isinstance(tuple_, list) and len(tuple_) > 1 and tuple_[0] in (1, 8):
                used_attributes.add(tuple_[1])
        special_effects.append({
            "id": effect_id,
            "groupId": row.get("_iGroupID"),
            "power": row.get("_iPower"),
            "rare": row.get("_iRare"),
            "name": text(row.get("_iEffectName"), row.get("_kDescData")),
            "description": desc,
            "descriptionFromBuff": via,
            "effects": [list(e) for e in (row.get("_kSpecialEffect") or [])
                        if isinstance(e, list)],
        })

    upgrade = []
    for row in rows.get("CardUpgradeConfig", []):
        used_attributes |= {p[0] for p in pairs(row.get("_iAttr"))}
        upgrade.append({
            "id": row["_iID"],
            "part": row.get("_iParts"),
            "quality": row.get("_iQuality"),
            "level": row.get("_iLevel"),
            "power": row.get("_iPower"),
            "seasonPower": row.get("_iSeasonPower"),
            "cost": pairs(row.get("_iCost")),
            "attributes": pairs(row.get("_iAttr")),
        })

    attribute_rows = build_attributes(used_attributes, attributes, text)
    counts = {
        "cards": len(cards),
        "tiers": sum(len(c["tiers"]) for c in cards),
        "cardsWithName": sum(1 for c in cards if c["name"]),
        "cardsWithDescription": sum(1 for c in cards if c["description"]),
        "cardsWithIcon": with_icon,
        "bindings": len(bindings),
        "bindingsWithName": sum(1 for b in bindings if b["name"]),
        "bindingStringIdsMissingFromEveryLanguage": sorted(binding_text_ids),
        "adventureCards": len(adventure),
        "adventureCardsWithIcon": adventure_icons,
        "adventureGroups": len(adventure_groups),
        "specialEffects": len(special_effects),
        "specialEffectsWithDescription": sum(1 for e in special_effects if e["description"]),
        "attributes": len(attribute_rows),
        "upgradeRows": len(upgrade),
    }

    cards_doc = {
        "source": "Config/DataConfig/*.lua config tables in the client's Lua, executed and read back",
        "text": TEXT_NOTE,
        "note": (
            "CardConfig is a tier table: its 968 rows are 242 cards times their tiers, keyed by "
            "_iCardID, which is an ItemConfig row id - that is where a card's name, description, "
            "quality, slot (part) and portrait come from. A tier's `attributes` are "
            "[AttributeConfig id, value] pairs and its `specialEffects` are SpecialEffectConfig "
            "ids, both resolved below - a special effect's `effects` tuples lead with a family "
            "marker the client never labels, so they are left as they ship: measured over the "
            "145 the cards use, 1 is [1, attribute id, value], 2 is [2, buff id], 3 is "
            "[3, skill id] and 8 leads with attribute id 109, and every id in those families "
            "resolves. `part` is the game's _iCardPart with no name attached, "
            "because the client ships no label for a card slot. `bindings` is the card-bond "
            "table and it is nameless on purpose: it ships only as a LuaMultiverse copy, and "
            "all 48 of its name fields point at nine string ids that exist in none of the seven "
            "language tables - unreleased content rather than a lookup this exporter got wrong. "
            "Its two picture columns carry a ${1} the row does not supply (a widget-chosen size "
            "suffix), so the template is kept verbatim and the files that answer to it are "
            "listed alongside it."
        ),
        "counts": counts,
        "attributes": attribute_rows,
        "specialEffects": special_effects,
        "cards": cards,
        "bindings": bindings,
        "adventureCards": adventure,
        "adventureGroups": adventure_groups,
        "flashCardPools": [
            {
                "id": row["_iID"],
                "groupId": row.get("_iGroupID"),
                "weight": row.get("_iWeight"),
                "cards": ids(row.get("_kCardList")),
            }
            for row in rows.get("FlashCardPoolConfig", [])
        ],
        "flashCardOutput": [
            {
                "id": row["_iID"],
                "quality": row.get("_iQuality"),
                "openDay": row.get("_iOpenDay"),
                "pools": ids(row.get("_kOutputPool")),
                "multiverse": ids(row.get("_kMultiverseArray")),
            }
            for row in rows.get("FlashCardOutputConfig", [])
        ],
        "returnCost": [
            {"quality": row.get("_iQuality"), "cost": pairs(row.get("_iCost"))}
            for row in rows.get("CardReturnCostConfig", [])
        ],
    }

    upgrade_doc = {
        "source": cards_doc["source"],
        "note": (
            "CardUpgradeConfig: the per-slot upgrade ladder. One row per (part, quality, level); "
            "`cost` is [item id, count] and `attributes` is [AttributeConfig id, value]. Split "
            "out of cards.json because it is a wide numeric ladder nothing else needs."
        ),
        "counts": {"rows": len(upgrade)},
        "attributes": build_attributes(
            {p[0] for r in upgrade for p in r["attributes"]}, attributes, text
        ),
        "upgrade": upgrade,
    }
    cards_doc["_usedRowIds"] = {
        "CardConfig": {t["configId"] for c in cards for t in c["tiers"]},
        "ItemConfig": set(tiers_by_card),
        "SpecialEffectConfig": used_effects,
        "BuffConfig": {e["descriptionFromBuff"] for e in special_effects
                       if e["descriptionFromBuff"]},
        "AttributeConfig": used_attributes,
        "CardBindingConfig": {b["id"] for b in bindings},
        "AdventureCardConfig": {a["id"] for a in adventure},
        "AdventureGroupCardConfig": {g["id"] for g in adventure_groups},
    }
    upgrade_doc["_usedRowIds"] = {
        "CardUpgradeConfig": {u["id"] for u in upgrade},
        "AttributeConfig": {p[0] for r in upgrade for p in r["attributes"]},
    }
    return cards_doc, upgrade_doc


def build_attributes(used, attributes, text: Text) -> list[dict]:
    """The ``AttributeConfig`` rows a document references, and nothing else."""
    out = []
    for attr_id in sorted(used):
        row = attributes.get(attr_id)
        if row is None:
            continue
        out.append({
            "id": attr_id,
            "key": text_or_none(row.get("_kVariable")),
            "name": text(row.get("_iName")),
            "type": row.get("_iAttributeType"),
            "dataType": row.get("_iDataType"),
        })
    return out


# ------------------------------------------------------------------------- pet export

def build_pets(rows, text: Text, icons) -> tuple[dict, dict, dict, dict]:
    attributes = {r["_iID"]: r for r in rows.get("AttributeConfig", [])}
    skills = {r["_iID"]: r for r in rows.get("SkillConfig", [])}

    # PetStarConfig names each pet again, from a different string-id family (12860xxxxx
    # against the roster's 10450xxxxx) - and it is the one the client translates: the roster
    # id is Chinese-only for all 56 pets while this one carries en and ko. It is constant
    # across a pet's star rows (verified: 0 of 56 pets disagree), so it belongs on the roster
    # row and is not repeated 1,176 times.
    star_names = {}
    for row in rows.get("PetStarConfig", []):
        star_names.setdefault(row.get("_iPetID"), row.get("_iPetName"))

    pets = []
    art_hits = 0
    art_total = 0
    for row in rows.get("PetBaseConfig", []):
        art_files = {}
        for column, key in PET_ART.items():
            name = stem(row.get(column))
            if not name:
                continue
            art_total += 1
            path = icons.get(name)
            if path:
                art_hits += 1
            art_files[key] = path or name
        pets.append({
            "id": row["_iID"],
            "name": text(row.get("_iName")),
            "starTableName": text(star_names.get(row["_iID"])),
            "description": text(row.get("_iDesc")),
            "quality": row.get("_iQuality"),
            "camp": row.get("_iCamp"),
            "king": bool(row.get("_iKing")),
            "monsterId": row.get("_iMonster"),
            "followPetId": row.get("_iFollowPet"),
            "unlockStar": row.get("_iUnlockStar"),
            "activeAward": row.get("_iActiveAward"),
            "decompose": row.get("_kDecompose") or [],
            "sort": row.get("_iSort"),
            "show": bool(row.get("_iShow")),
            "showSeason": row.get("_iShowSeason"),
            "spineRes": text_or_none(row.get("_kSpineRes")),
            "art": art_files,
        })

    used_attributes: set[int] = set()
    used_skills: set[int] = set()
    stars = []
    for row in rows.get("PetStarConfig", []):
        fight = pairs(row.get("_kFightSkill"))
        collect = pairs(row.get("_kCollectAttr"))
        used_attributes |= {p[0] for p in fight} | {p[0] for p in collect}
        active = ids(row.get("_kActiveSkill"))
        scalars = [row.get(k) for k in
                   ("_iPassiveMain", "_iProtectSkill", "_iCorePassiveSkill")]
        used_skills |= set(active) | {s for s in scalars if s}
        stars.append({
            "id": row["_iID"],
            "petId": row.get("_iPetID"),
            "star": row.get("_iStar"),
            "stage": row.get("_iStage"),
            "baseAttr": row.get("_iBaseAttr"),
            "starFightStrength": row.get("_iStarFightStrength"),
            "starAssistStrength": row.get("_iStarAssistStrength"),
            "collectStrength": row.get("_iCollectStrength"),
            "fightOrAssistStrengthMultiple": row.get("_iFightOrAssistStrengthMultiple"),
            "fightAttributes": fight,
            "collectAttributes": collect,
            "assistSkill": ids(row.get("_kAssistSkill")),
            "stageSkill": ids(row.get("_kStageSkill")),
            "activeSkills": active,
            "passiveMain": row.get("_iPassiveMain") or None,
            "protectSkill": row.get("_iProtectSkill") or None,
            "corePassiveSkill": row.get("_iCorePassiveSkill") or None,
            "protectBuff": row.get("_iProtectBuff") or None,
            "coreAssistBuff": row.get("_iCoreAssistBuff") or None,
            "piece": row.get("_kPiece") or [],
        })

    skill_rows = []
    skill_icons = 0
    for skill_id in sorted(used_skills):
        row = skills.get(skill_id)
        if row is None:
            continue
        icon = icons.get(stem(row.get("_kIcon")))
        if icon:
            skill_icons += 1
        skill_rows.append({
            "id": skill_id,
            "name": text(row.get("_iName"), row.get("_kDescData")),
            "description": text(row.get("_iDescription"), row.get("_kDescData")),
            "level": row.get("_iLevel"),
            "maxLevel": row.get("_iMaxLevel"),
            "cooldown": row.get("_iCD"),
            # The bare object name is only worth carrying when no WebP answered to it.
            "iconName": None if icon else stem(row.get("_kIcon")),
            "icon": icon,
        })

    exp = [
        {
            "id": row["_iID"],
            "quality": row.get("_iQuality"),
            "level": row.get("_iLv"),
            "exp": row.get("_iExp"),
            "levelFightStrength": row.get("_iLvFightStrength"),
            "levelAssistStrength": row.get("_iLvAssistStrength"),
        }
        for row in rows.get("PetExpConfig", [])
    ]
    attr_change = []
    for row in rows.get("PetAttrChangeConfig", []):
        perc = pairs(row.get("_kAttrPerc"))
        used_attributes |= {p[0] for p in perc}
        attr_change.append({
            "id": row["_iID"],
            "quality": row.get("_iQuality"),
            "star": row.get("_iStar"),
            "stage": row.get("_iStage"),
            "attributePercent": perc,
        })

    pets_doc = {
        "source": "Config/DataConfig/*.lua config tables in the client's Lua, executed and read back",
        "text": TEXT_NOTE,
        "note": (
            "PetBaseConfig is the roster. The per-star skills and stats are in pets-star.json, "
            "the skills those rows name are in pets-skills.json, and the pet tower is in "
            "pets-floors.json. `art` maps each of the game's picture columns to its WebP in "
            "resource-ro3, or to the bare object name when no file was exported. `monsterId` and "
            "`followPetId` are the ids the game uses; no table in the client gives them a name, "
            "so none is invented here. A pet is named twice by the client, from two string-id "
            "families: `name` is PetBaseConfig._iName, which is Chinese-only for all 56 pets, "
            "and `starTableName` is PetStarConfig._iPetName, which is the translated one. They "
            "are kept apart rather than merged, because they are separate ids and two of the 56 "
            "disagree on the Chinese as well (pet 30002 and 32003 carry a short form there)."
        ),
        "counts": {
            "pets": len(pets),
            "petsWithName": sum(1 for p in pets if p["name"]),
            "petsWithStarTableName": sum(1 for p in pets if p["starTableName"]),
            "petsWithEnglishName": sum(
                1 for p in pets
                if (p["name"] or {}).get("en-US") or (p["starTableName"] or {}).get("en-US")
            ),
            "petsWithDescription": sum(1 for p in pets if p["description"]),
            "artReferences": art_total,
            "artReferencesResolved": art_hits,
            "expRows": len(exp),
            "attrChangeRows": len(attr_change),
        },
        "attributes": build_attributes(used_attributes, attributes, text),
        "pets": pets,
        "exp": exp,
        "attrChange": attr_change,
        "setLimit": [
            {
                "id": row["_iID"],
                "condition": row.get("_iCondition"),
                "condition1": row.get("_iCondition1"),
                "condition2": row.get("_iCondition2"),
                "fightAttrAddition": row.get("_iFightAttrAddition"),
                "assistAttrAddition": row.get("_iAssistAttrAddition"),
            }
            for row in rows.get("PetSetLimitConfig", [])
        ],
        "emoticons": [
            {
                "id": row["_iID"],
                "groupId": row.get("_iGroupID"),
                "ruleId": row.get("_iRuleID"),
                "triggerType": row.get("_iTriggerType"),
                "triggerParam": row.get("_kTriggerParam") or [],
                "emojiParams": pairs(row.get("_kEmojiParams")),
            }
            for row in rows.get("PetEmoticonsConfig", [])
        ],
        "incubation": {
            "rooms": [
                {
                    "id": row["_iID"],
                    "level": row.get("_iLv"),
                    "exp": row.get("_iExp"),
                    "incubateTime": row.get("_iIncubateTime"),
                    "levelUpTime": row.get("_iLvUpTime"),
                    "cost": pairs(row.get("_kCost")),
                    "unlockSlot": ids(row.get("_iUnlockSlot")),
                    "unlock": row.get("_kUnlock") or [],
                    "probability": pairs(row.get("_kProbability")),
                }
                for row in rows.get("PetIncubationRoomConfig", [])
            ],
            "slots": [
                {
                    "id": row["_iID"],
                    "slotType": row.get("_iSlotType"),
                    "activity": row.get("_iActivity"),
                    "upPetId": row.get("_iUpPetID"),
                    "material": pairs(row.get("_kMaterial")),
                    "drawIds": ids(row.get("_kDrawIds")),
                    "unlockCardPool": pairs(row.get("_kUnlockCardPool")),
                    "previewItemDrops": ids(row.get("_kPreviewItemDrops")),
                    "previewPetDrops": ids(row.get("_kPreviewPetDrops")),
                    "upBanner": row.get("_kUpBanner") or [],
                }
                for row in rows.get("PetIncubationSlotConfig", [])
            ],
            "results": [
                {"itemId": row["_iID"], "time": row.get("_iTime"), "exp": row.get("_iExp")}
                for row in rows.get("PetIncubationResultConfig", [])
            ],
        },
    }

    star_doc = {
        "source": pets_doc["source"],
        "note": (
            "PetStarConfig: one row per (pet, star, stage). `fightAttributes` and "
            "`collectAttributes` are [AttributeConfig id, value] pairs despite the game calling "
            "the first column _kFightSkill; every id in them is an AttributeConfig row and none "
            "is a SkillConfig row, which is what settles it. Skill ids resolve against "
            "pets-skills.json, and _iPetName is not repeated here - it is constant across a "
            "pet's rows and sits on the roster in pets.json as `starTableName`. Split out of "
            "pets.json because it is 1,176 rows and many times the size of the roster."
        ),
        "counts": {
            "rows": len(stars),
            "pets": len({s["petId"] for s in stars}),
        },
        "stars": stars,
    }

    skills_doc = {
        "source": pets_doc["source"],
        "text": TEXT_NOTE,
        "note": (
            "the SkillConfig rows that pets-star.json names, and nothing else - the full skill "
            "table is an order of magnitude larger and belongs to no pet. `icon` points at the "
            "existing icons/skills export in resource-ro3, whose file name is the sprite's own "
            "object name; a null means SkillConfig ships no icon for that row. Split out of "
            "pets.json because the descriptions dominated it."
        ),
        "counts": {
            "skills": len(skill_rows),
            "withName": sum(1 for s in skill_rows if s["name"]),
            "withDescription": sum(1 for s in skill_rows if s["description"]),
            "withIcon": skill_icons,
            # A template addressing an argument its row never supplies is left verbatim
            # rather than blanked, and the rows it happens on are named.
            "rowsWithAnUnrenderedPlaceholder": sorted(
                s["id"] for s in skill_rows
                if any(loc.unresolved(v) for v in (s["description"] or {}).values())
                or any(loc.unresolved(v) for v in (s["name"] or {}).values())
            ),
        },
        "skills": skill_rows,
    }

    floors = [
        {
            "id": row["_iID"],
            "floor": row.get("_iFloor"),
            "type": row.get("_iType"),
            "mapId": row.get("_iMapID"),
            "levelLimit": row.get("_iLevelLimit"),
            "timeLimit": row.get("_iTimeLimit"),
            "powerRecommend": row.get("_iPowerRecommend"),
            "powerSuppress": row.get("_iPowerSuppress"),
            "petsOnBattle": row.get("_iPetOnBattle"),
            "petsOnSupport": row.get("_iPetOnSupport"),
            "firstReward": row.get("_iFirstReward"),
            "dailyReward": row.get("_iDailyReward"),
            "serverFirstReward": row.get("_iServerFirstReward"),
            "monsterGroup": [list(e) for e in (row.get("_kMonsterGroup") or [])
                             if isinstance(e, list)],
            "monsterPreview": ids(row.get("_kMonsterPreview")),
            "difficultyDisplay": ids(row.get("_kDifficultyDisplay")),
            "dynamicDifficulty": [list(e) for e in (row.get("_kDynamicDifficulty") or [])
                                  if isinstance(e, list)],
            "multiverse": ids(row.get("_kMultiverseArray")),
        }
        for row in rows.get("PetFloorConfig", [])
    ]
    floors_doc = {
        "source": pets_doc["source"],
        "note": (
            "PetFloorConfig: the floors of the pet tower. The base LuaScript/ copy of this table "
            "ships empty; the rows are the LuaMultiverse/M101 copy, which is recorded in "
            "`sources`. `mapId`, reward ids and the monster ids in `monsterGroup` are the game's "
            "own; no table in the client names them."
        ),
        "counts": {"rows": len(floors)},
        "floors": floors,
    }
    pets_doc["_usedRowIds"] = {
        "PetBaseConfig": {p["id"] for p in pets},
        "PetExpConfig": {e["id"] for e in exp},
        "PetAttrChangeConfig": {a["id"] for a in attr_change},
        "AttributeConfig": used_attributes,
    }
    star_doc["_usedRowIds"] = {"PetStarConfig": {s["id"] for s in stars}}
    skills_doc["_usedRowIds"] = {"SkillConfig": {s["id"] for s in skill_rows}}
    floors_doc["_usedRowIds"] = {"PetFloorConfig": {f["id"] for f in floors}}
    return pets_doc, star_doc, skills_doc, floors_doc


TEXT_NOTE = (
    "resolved against the client's Localization_* tables. A string id whose entry is the "
    "literal 'None' is an untranslated slot in this CN build, not a translation, so a "
    "language is simply absent from a field rather than carrying it - pet names, for one, "
    "exist only in Chinese. The ${n} / ^{n} / @{n} placeholders are rendered from the row's "
    "_kDescData and the field's own arguments. The client also ships Thai, Indonesian and "
    "Vietnamese tables; they are read the same way but not emitted, because the site serves "
    "these four and seven would roughly double every text field."
)


# ------------------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=None, help="data-ro3 root")
    ap.add_argument("--res-out", type=Path, default=None, help="resource-ro3 root")
    ap.add_argument("--stage", type=Path, default=None)
    ap.add_argument("--work", type=Path, default=None)
    ap.add_argument("--art", action="store_true", help="export the icons before the data")
    ap.add_argument("--art-only", action="store_true")
    ap.add_argument("--art-dry-run", action="store_true")
    ap.add_argument("--quality", type=int, default=90)
    args = ap.parse_args()

    out = args.out or require_dir("RO3_DATA_OUT")
    res_out = args.res_out or require_dir("RO3_RES_OUT")
    stage = args.stage or stage_dir()
    work = args.work or stage.parent / f"{stage.name}-cardpet"
    vfs = vfs_root()

    started = time.time()
    rows, sources, differ = load_tables(vfs, TABLES)
    print(f"tables: {len(rows)} loaded in {time.time() - started:.0f}s")
    for name in TABLES:
        if name not in rows:
            print(f"  MISSING {name}")

    art_report = None
    if args.art or args.art_only or args.art_dry_run:
        art_report = export_art(rows, stage, work, res_out,
                                quality=args.quality, dry_run=args.art_dry_run)
        (work / "cardpet-art-report.json").parent.mkdir(parents=True, exist_ok=True)
        (work / "cardpet-art-report.json").write_text(
            json.dumps(art_report, indent=1), encoding="utf-8")
        if args.art_only or args.art_dry_run:
            return 0

    languages = load_languages(vfs)
    print(f"languages: {', '.join(f'{k} ({len(v)})' for k, v in sorted(languages.items()))}")
    text = Text(languages)

    icons = ArtIndex(res_out)
    print(f"icons on disk: {len(icons)}")

    stubs = sorted(name for name, r in rows.items() if is_stub(r))
    provenance = {"sources": {k: v for k, v in sorted(sources.items())}}
    if differ:
        print("variants differ: " + ", ".join(
            f"{t} ({sum(len(v) for v in d.values())} rows)" for t, d in differ.items()))

    cards_doc, upgrade_doc = build_cards(rows, text, icons)
    pets_doc, star_doc, skills_doc, floors_doc = build_pets(rows, text, icons)
    docs = {
        "cards.json": cards_doc,
        "cards-upgrade.json": upgrade_doc,
        "pets.json": pets_doc,
        "pets-star.json": star_doc,
        "pets-skills.json": skills_doc,
        "pets-floors.json": floors_doc,
    }
    for doc in docs.values():
        used = doc.pop("_usedRowIds", {})
        tables = tuple(used) or _tables_of(doc)
        doc["provenance"] = {
            "note": (
                "every config table also ships under LuaMultiverse/M101 and M102. The base "
                "LuaScript/ copy is used wherever it has rows; `sources` names the copy each "
                "table came from, and `variantsDiffer` reports how many rows each other copy "
                "disagrees on together with the ids of those that are actually in this file - "
                "ItemConfig and SkillConfig do diverge, but on rows no card and no pet skill "
                "here refers to, and an unqualified 'these differ' would read as a warning "
                "about this data when it is not one."
            ),
            "sources": {k: v for k, v in provenance["sources"].items() if k in tables},
            "variantsDiffer": {
                table: {
                    variant: {
                        "rows": len(row_ids),
                        "idsUsedHere": sorted(set(row_ids) & used.get(table, set())),
                    }
                    for variant, row_ids in variants.items()
                }
                for table, variants in differ.items() if table in tables
            },
        }
    cards_doc["provenance"]["stubTables"] = {
        name: "every string column of every row is the literal 'xx': an authoring template, "
              "not content" for name in stubs
    }
    for doc in docs.values():
        doc["textCoverage"] = {
            "languages": sorted(languages),
            "localizedFields": text.localized,
            "localizableFields": text.fields,
            "stringsLeftCarryingAPlaceholder": dict(sorted(text.leftover.items())),
            "scope": "counted across all six files, since one language table serves them all",
        }

    for name, doc in docs.items():
        write_json(out / name, doc)
    for name in docs:
        print(f"{name:<20} {(out / name).stat().st_size / 1024:>8.0f} KiB")
    print(f"localized fields {text.localized}/{text.fields}, "
          f"placeholders left: {dict(text.leftover) or 'none'}")
    if art_report:
        print(f"art written {art_report['written']}")
    return 0


#: Which config tables feed which output document, for the per-file provenance block.
_DOC_TABLES = {
    "cards": ("CardConfig", "CardBindingConfig", "CardReturnCostConfig",
              "AdventureCardConfig", "AdventureGroupCardConfig", "FlashCardPoolConfig",
              "FlashCardOutputConfig", "ItemConfig", "AttributeConfig",
              "SpecialEffectConfig", "BuffConfig"),
    "upgrade": ("CardUpgradeConfig", "AttributeConfig"),
    "pets": ("PetBaseConfig", "PetExpConfig", "PetAttrChangeConfig", "PetSetLimitConfig",
             "PetEmoticonsConfig", "PetIncubationRoomConfig", "PetIncubationSlotConfig",
             "PetIncubationResultConfig", "AttributeConfig"),
    "stars": ("PetStarConfig",),
    "skills": ("SkillConfig",),
    "floors": ("PetFloorConfig",),
}


def _tables_of(doc) -> tuple[str, ...]:
    for key, tables in _DOC_TABLES.items():
        if key in doc:
            return tables
    return ()


if __name__ == "__main__":
    raise SystemExit(main())
