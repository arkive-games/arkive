"""Emit stage: the wiki datasets (weapons, Phantom Edges, accessories, medicines,
items and archives, the enemy gallery, and the skill tree).

Every dataset is split the way the other wiki sites split theirs: a structure file
(``wiki/<name>.json``: ids, numbers, icon names) and one text file per site locale
(``locales/<locale>/wiki/<name>.json``: ``{id: {name, ...}}``). The labels for
categories, rarities and button prompts are the game's own strings, collected in
``locales/<locale>/wiki/labels.json``.

Text falls back zh-TW -> zh-CN and en-US -> zh-CN where the game ships no
translation (a few hundred keys): the source culture is Simplified Chinese, and
showing it beats an empty name. Rows whose name has no source text at all are
placeholders or cut content and are not emitted.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from ..common import read_json, write_json
from .text import CULTURES, Text, load_cultures

CONTENT = Path("ProjectPBZ/Content")
DT = CONTENT / "PBZContent/DataTable"
TABLES = {
    "weapons": DT / "UI/DT_WeaponData.json",
    "phantomEdges": DT / "UI/DT_ShaqiWeaponData.json",
    "accessories": DT / "UI/DT_Accessory.json",
    "medicines": DT / "UI/DT_MedicineTable.json",
    "inventory": DT / "Item/DT_InventoryData.json",
    "enemies": DT / "DT_CodexEnemyDataTable.json",
    "skills": DT / "UI/DT_AbilityNodesTable.json",
    "maps": DT / "UI/DT_MapData.json",
    "keys": DT / "UI/DT_KeyBindingConfig.json",
    "params": DT / "UI/DT_UITextParams.json",
    "richIcons": DT / "UI/DT_RichIcon.json",
}

# Inline icons worth serving: the Phantom Edge charge (暗源), Pure Sha-Chi, the elements,
# and dust (the currency).
RICH_ICONS = ("SpiritShadow", "jingchunFire", "Fire", "Ice", "Thunder", "Dust_Black", "Dust_Grey", "Dust_Red")

FALLBACK = {"zh-TW": "zh-CN", "en-US": "zh-CN"}

# Enum value -> the game's own label key (UI_Character_* / UI_Literature_* / UI_Inventory_*).
LABELS = {
    "weaponType": {"Blade": "UI_Character_06", "DoubleBlade": "UI_Character_07", "GreatBlade": "UI_Character_08"},
    "edgeType": {"Damage": "UI_Character_15", "Stunt": "UI_Character_16", "CombatSkills": "UI_Character_17",
                 "MagicTricks": "UI_Character_18", "Summon": "UI_Character_19"},
    "accessoryType": {"Attack": "UI_Character_62", "Survival": "UI_Character_63", "Support": "UI_Character_64"},
    "medicineType": {"Health": "UI_Character_20", "Functional": "UI_Character_21"},
    "rarity": {"Common": "UI_Character_24", "Rare": "UI_Character_25", "Epic": "UI_Character_26",
               "Legendary": "UI_Character_27"},
    "enemyType": {"Animal": "UI_Literature_31", "GuaiMian": "UI_Literature_32", "DragonModified": "UI_Literature_33",
                  "HumanMaster": "UI_Literature_34", "Puppet": "UI_Literature_35"},
    "itemCategory": {
        "WeaponUpgradeMaterial": "UI_Inventory_09", "ShaChiWeaponUpgradeMaterial": "UI_Inventory_16",
        "AccessoryUpgradeMaterial": "UI_Inventory_17", "MedicineUpgradeMaterial": "UI_Inventory_18",
        "WeaponSnapSoulMaterial": "UI_Inventory_19", "ShaChiWeaponSnapSoulMaterial": "UI_Inventory_20",
        "CoreProgressionMaterial": "UI_Inventory_28", "Material": "UI_Inventory_01",
        "AddAttribute": "UI_Inventory_25", "Treasures": "UI_Inventory_26", "NarrativeItem": "UI_Inventory_29",
        "AccessoryFragment": "UI_Inventory_30", "Book": "UI_Literature_02", "MemoryFlower": "UI_Literature_03",
    },
    "skillBranch": {"HeiShi": "Item_Common_001", "ShaChiHupo": "Item_Common_002", "MemoryFlower": "Tutorial_Guide_2",
                    "Banyan": "Item_Common_003"},
    "section": {"weapons": "UI_Character_01", "phantomEdges": "UI_Character_02", "accessories": "UI_Character_03",
                "medicines": "UI_Character_04", "items": "UI_Inventory_07", "enemies": "UI_Literature_26",
                "soulTemper": "UI_Inventory_14", "attack": "UI_Character_10"},
}

# <key id="..."/> prompt ids -> the key-binding row naming that action. Only pairs
# whose meaning is unambiguous; anything else renders as its bare id.
PROMPTS = {
    "LightAttack": "IA_LightAttack", "HeavyAttack": "IA_HeavyAttack", "Execution": "IA_Execute",
    "Stance": "IA_Guard", "Dodge": "IA_Dodge", "Dash": "IA_Dodge", "Jump": "IA_Jump", "Crouch": "IA_Crouch",
    "SpecialAttack": "IA_UltimateSkill", "Interaction": "IA_Interact", "Lock": "IA_LockTarget", "Map": "IA_OpenMapMenu",
    "option": "IA_OpenCharacterMenu", "ShaChiAttack": "IA_ShadowArm", "ChangeShaChiWeapon": "IA_SwitchShadowArm",
    "ChangeWeapon": "IA_SwitchWeapon", "TopMedicine": "IA_UseTopItem", "BottomMedicine": "IA_UseBottomItem",
}


def _enum(value: str) -> str:
    return value.split("::", 1)[-1] if value else ""


def _asset(ref) -> str:
    """Texture name from a soft object path (``/Game/.../T_X.T_X`` -> ``T_X``), or ""."""
    path = (ref or {}).get("AssetPathName", "") if isinstance(ref, dict) else ""
    return path.rsplit(".", 1)[-1] if path else ""


def _asset_path(ref) -> str:
    path = (ref or {}).get("AssetPathName", "") if isinstance(ref, dict) else ""
    return path.rsplit(".", 1)[0] if path else ""


# Upgrade tables spell item ids with their own casing ("weapon_Material_04" for the
# inventory's "Weapon_Material_04"); UE names compare case-insensitively, so the
# emitted ids are put back into the inventory's spelling.
_CANONICAL_IDS: dict[str, str] = {}


def _materials(pairs) -> list[list]:
    return [[_CANONICAL_IDS.get(p["Key"].lower(), p["Key"]), p["Value"]] for p in pairs or []]


def _rows(raw: Path, name: str) -> dict:
    return next(x for x in read_json(Path(raw) / TABLES[name]) if "Rows" in x)["Rows"]


class _Emitter:
    def __init__(self, raw: Path):
        self.raw = Path(raw)
        _CANONICAL_IDS.clear()
        _CANONICAL_IDS.update({v["ItemId"].lower(): v["ItemId"] for v in _rows(raw, "inventory").values()})
        self.icons: dict[str, str] = {}  # served name -> /Game texture path, for the icons stage
        params = {k: str(v["Value"]) for k, v in _rows(raw, "params").items() if v.get("Value")}
        rich_icons = _rows(raw, "richIcons")
        for ident in RICH_ICONS:
            path = (rich_icons.get(ident, {}).get("Brush", {}).get("ResourceObject") or {}).get("ObjectPath", "")
            if path:
                self.icons[f"rich_{ident}"] = path.rsplit(".", 1)[0]
        served = {k.removeprefix("rich_") for k in self.icons}
        self.text = Text(load_cultures(raw), params, served)
        self.locale_out: dict[str, dict[str, dict]] = {loc: {} for loc in CULTURES}

    # -- text -------------------------------------------------------------
    def t(self, ftext, locale: str, *, plain: bool = False) -> str:
        value = self.text.get(ftext, locale, plain=plain)
        if not value and locale in FALLBACK:
            value = self.text.get(ftext, FALLBACK[locale], plain=plain)
        return value

    def put(self, dataset: str, ident: str, build) -> None:
        """Store ``build(locale)`` as the text of one row in every locale."""
        for loc in CULTURES:
            self.locale_out[loc].setdefault(dataset, {})[ident] = {
                k: v for k, v in build(loc).items() if v not in ("", [], None)
            }

    def icon(self, ref) -> str:
        name = _asset(ref)
        if name:
            self.icons[name] = _asset_path(ref)
        return name

    # -- datasets ---------------------------------------------------------
    def weapons(self) -> list[dict]:
        out = []
        for key, v in _rows(self.raw, "weapons").items():
            # Story-only variants ("黑伤(马车战)") repeat a real weapon's name; skip them.
            if "(" in key or "（" in key or not self.text.has(v["WeaponName"]):
                continue
            ident = v["ItemId"]
            soul = v.get("WeaponSnapSoulData") or {}
            out.append({
                "id": ident, "type": _enum(v["WeaponType"]), "rarity": _enum(v["WeaponLevel"]),
                "icon": self.icon(v.get("White")) or self.icon(v.get("Icon")),
                "render": self.icon(v.get("RenderIcon")),
                "stats": [round(a["DefaultValue"], 1) for a in v.get("UIAttributeDatas", [])],
                "levels": [[lv["AttackMultipliers"], lv["ConsumeDust"], _materials(lv["Materials"])]
                           for lv in v.get("WeaponUpLevelDatas", [])],
                "soul": {"dust": soul.get("ConsumeDust", 0), "materials": _materials(soul.get("Materials"))}
                if soul.get("Materials") else None,
            })
            self.put("weapons", ident, lambda loc, v=v, soul=soul: {
                "name": self.t(v["WeaponName"], loc, plain=True),
                "flavor": self.t(v.get("Simple"), loc),
                "desc": self.t(v.get("EquipDescription"), loc),
                "intro": self.t(v.get("ShortIntroduction"), loc),
                "stats": [self.t(a["GEDescription"], loc, plain=True) for a in v.get("UIAttributeDatas", [])],
                "moves": [[self.t(m["WeaponTitle"], loc, plain=True), self.t(m["WeaponDesc"], loc)]
                          for m in v.get("WeaponAbilityDesc", []) if self.text.has(m["WeaponDesc"])],
                "soul": [[self.t(g.get("WeaponTitle"), loc, plain=True), self.t(g.get("FlowLocText"), loc)]
                         for g in soul.get("GameplayEffectDatas", []) if self.text.has(g.get("FlowLocText"))],
            })
        return out

    def phantom_edges(self) -> list[dict]:
        out, seen = [], set()
        for v in _rows(self.raw, "phantomEdges").values():
            ident = v["ItemId"]
            if ident in seen or not self.text.has(v["WeaponName"]):
                continue
            seen.add(ident)
            soul = v.get("ShaChiWeaponSnapSoulData") or {}
            out.append({
                "id": ident, "type": _enum(v["ShaChiWeaponType"]), "rarity": _enum(v["WeaponLevel"]),
                "icon": self.icon(v.get("WhiteIcon")) or self.icon(v.get("Icon")),
                "stats": [round(a["DefaultValue"], 1) for a in v.get("UIAttributeDatas", [])],
                "levels": [[lv["AttackMultipliers"], lv["ConsumeDust"], _materials(lv["Materials"])]
                           for lv in v.get("ShaChiWeaponUpLevelData", [])],
                "soul": {"dust": soul.get("ConsumeDust", 0), "materials": _materials(soul.get("Materials"))}
                if soul.get("Materials") else None,
            })
            self.put("phantomEdges", ident, lambda loc, v=v, soul=soul: {
                "name": self.t(v["WeaponName"], loc, plain=True),
                "flavor": self.t(v.get("SimpleDesc"), loc),
                "desc": self.t(v.get("EquipDescription"), loc),
                "intro": self.t(v.get("ShortIntroduction"), loc),
                "stats": [self.t(a["GEDescription"], loc, plain=True) for a in v.get("UIAttributeDatas", [])],
                "moves": [[self.t(m["WeaponTitle"], loc, plain=True), self.t(m["WeaponDesc"], loc)]
                          for m in v.get("WeaponAbilityDesc", []) if self.text.has(m["WeaponDesc"])],
                "soul": [[self.t(g.get("WeaponTitle"), loc, plain=True), self.t(g.get("FlowLocText"), loc)]
                         for g in soul.get("GameplayEffectDatas", []) if self.text.has(g.get("FlowLocText"))],
            })
        return out

    def accessories(self) -> list[dict]:
        out = []
        for v in _rows(self.raw, "accessories").values():
            if not self.text.has(v["AccessoryName"]):
                continue
            ident = v["ItemId"]
            out.append({
                "id": ident, "type": _enum(v["AccessoryType"]),
                "icon": self.icon(v.get("WhiteIcon")) or self.icon(v.get("Icon")),
                "picture": self.icon(v.get("HighPrecisionTexture")),
                "refine": [[lv["NeedDust"], _materials(lv["NeedItems"])] for lv in v.get("AccessoryLevelDatas", [])],
                "cycle": [[lv["NeedDust"], _materials(lv["NeedItems"])]
                          for lv in v.get("HighCycleAccessoryLevelDatas", [])],
                "buy": v.get("BuyPrice", 0) if v.get("bCanBuy") else None,
            })

            def text(loc, v=v):
                base = [self.t(g["FlowLocText"], loc) for g in v.get("DefaultAccessoryData", [])]
                return {
                    "name": self.t(v["AccessoryName"], loc, plain=True),
                    "desc": self.t(v.get("AccessoryDesc"), loc),
                    "lore": self.t(v.get("IPDesc"), loc),
                    "intro": self.t(v.get("ShortIntroduction"), loc),
                    "refine": [[self.t(lv.get("AccessoryName"), loc, plain=True),
                                " ".join(self.t(g["FlowLocText"], loc) for g in lv.get("GEData", []))]
                               for lv in v.get("AccessoryLevelDatas", [])],
                    "cycle": [" ".join(self.t(g["FlowLocText"], loc) for g in lv.get("GEData", []))
                              for lv in v.get("HighCycleAccessoryLevelDatas", [])],
                    "base": " ".join(base),
                }
            self.put("accessories", ident, text)
        return out

    def medicines(self) -> list[dict]:
        out = []
        for v in _rows(self.raw, "medicines").values():
            if not self.text.has(v["Name"]):
                continue
            ident = v["ItemId"]
            out.append({
                "id": ident, "type": _enum(v["UseMedicineType"]), "rarity": _enum(v["MedicineLevel"]),
                "icon": self.icon(v.get("SoftTexture")) or self.icon(v.get("SmallRenderIcon")),
                "uses": (v.get("DefaultMedicineData") or {}).get("UseTimes", 0),
                "levels": [[lv["ConsumeDust"], _materials(lv["ConsumeMaterials"]), lv.get("UseTimes", 0)]
                           for lv in v.get("MedicineLevelData", [])],
                "buy": v.get("BuyPrice", 0) if v.get("bCanBuy") else None,
            })
            self.put("medicines", ident, lambda loc, v=v: {
                "name": self.t(v["Name"], loc, plain=True),
                "desc": self.t(v.get("Desc"), loc),
                "effect": self.t(((v.get("DefaultMedicineData") or {}).get("UseItemDataPath") or {}).get("EffectDesc"), loc),
                "levels": [self.t((lv.get("UseItemDataPath") or {}).get("EffectDesc"), loc)
                           for lv in v.get("MedicineLevelData", [])],
            })
        return out

    def items(self) -> list[dict]:
        rows = list(_rows(self.raw, "inventory").values())
        pages: dict[str, list[dict]] = {}
        for v in rows:
            if _enum(v["ItemType"]) == "BookPage" and v.get("IntegrationItemID") not in (None, "None"):
                pages.setdefault(v["IntegrationItemID"], []).append(v)
        out = []
        for v in rows:
            kind = _enum(v["ItemType"])
            if kind not in ("Item", "Book", "MemoryFlower") or not self.text.has(v["ItemName"]):
                continue
            if kind == "Item":
                detail, material = _enum(v["ItemDetailType"]), _enum(v["MaterialType"])
                category = material if material not in ("", "None") else detail
                if category in ("", "None"):
                    continue
            else:
                category = kind
            ident = v["ItemId"]
            book = sorted(pages.get(ident, []), key=lambda p: p["SequentialIndex"])
            out.append({
                "id": ident, "category": category, "rarity": _enum(v["ItemLevel"]),
                "icon": self.icon(v.get("WhiteIcon")) or self.icon(v.get("ItemIcon")),
                "picture": self.icon(v.get("HighPrecisionTexture")),
                "sell": v.get("SellPrice", 0) if v.get("bCanSell") else None,
                "order": v.get("InventoryDisplayOrder", 0),
                "pages": len(book) or None,
            })
            self.put("items", ident, lambda loc, v=v, book=book: {
                "name": self.t(v["ItemName"], loc, plain=True),
                "desc": self.t(v.get("ItemDescription"), loc),
                "lore": self.t(v.get("IPDescription"), loc),
                "use": self.t(v.get("FunctionalDescription"), loc),
                "pages": [self.t(p.get("ItemDescription"), loc) for p in book],
            })
        return out

    def enemies(self) -> list[dict]:
        out = []
        for key, v in _rows(self.raw, "enemies").items():
            if not self.text.has(v["EnemyName"]):
                continue
            out.append({
                "id": key, "map": v.get("OwnMapID", ""), "order": v.get("DisplayOrder", 0),
                "type": _enum(v["EnemyType"]), "boss": bool(v.get("bIsBoss")),
                "icon": self.icon(v.get("WhiteIcon")),
                "picture": self.icon(v.get("HighPrecisionTexture")),
                "bust": self.icon(v.get("HalfBodyTexture")),
            })
            self.put("enemies", key, lambda loc, v=v: {
                "name": self.t(v["EnemyName"], loc, plain=True),
                "desc": self.t(v.get("EnemyDesc"), loc),
            })
        return out

    def skills(self) -> list[dict]:
        out = []
        for v in _rows(self.raw, "skills").values():
            if not self.text.has(v["AbilityNodeName"]):
                continue
            ident = v["AbilityNodeItemID"]
            branch = _enum(v["NodeType"])
            out.append({
                "id": ident,
                "branch": "Banyan" if "RongShu" in branch else branch,
                "row": "top" if branch.startswith("Top") else "bottom" if branch.startswith("Bottom") else None,
                "column": v.get("Column", 0),
                "parents": v.get("ParentNodes_RongShuZhiXin") or [],
                "ultimate": bool(v.get("IsUltimateNode")),
                "maxLevel": v.get("MaxLevel", 1),
                "dust": v.get("ConsumeDust", 0),
                "materials": _materials(v.get("NeedMaterials")),
                "icon": self.icon(v.get("AbilityNodeIcon_Activated")),
            })
            self.put("skills", ident, lambda loc, v=v: {
                "name": self.t(v["AbilityNodeName"], loc, plain=True),
                "desc": self.t(v.get("AbilityNodeDesc"), loc),
            })
        return out

    def labels(self) -> None:
        maps = _rows(self.raw, "maps")
        keys = {v["MappingName"]: v["DisplayName"] for v in _rows(self.raw, "keys").values()}
        for loc in CULTURES:
            groups = {g: {k: self.t(key, loc, plain=True).replace(" ", "") if loc != "en-US"
                          else self.t(key, loc, plain=True)
                          for k, key in table.items()}
                      for g, table in LABELS.items()}
            groups["map"] = {v["MapID"]: self.t(v["MapName"], loc, plain=True) for v in maps.values()}
            # The gallery files enemies under the area row's key, which differs from its MapID in places.
            groups["map"].update({k: self.t(v["MapName"], loc, plain=True) for k, v in maps.items()})
            groups["prompt"] = {pid: self.t(keys[row], loc, plain=True)
                                for pid, row in PROMPTS.items() if row in keys}
            self.locale_out[loc]["labels"] = groups


def run_emit(raw: Path, data_out: Path) -> dict[str, str]:
    """Write the wiki datasets; returns the texture names the ``icons`` stage converts."""
    em = _Emitter(raw)
    datasets = {
        "weapons": em.weapons(),
        "phantomEdges": em.phantom_edges(),
        "accessories": em.accessories(),
        "medicines": em.medicines(),
        "items": em.items(),
        "enemies": em.enemies(),
        "skills": em.skills(),
    }
    em.labels()
    # Item ids referenced as upgrade materials must resolve to an item page or a plain name.
    names = {loc: {k: v["name"] for k, v in em.locale_out[loc].get("items", {}).items()} for loc in CULTURES}
    for name, rows in datasets.items():
        write_json(Path(data_out) / "wiki" / f"{name}.json", {name: rows})
    for loc, tables in em.locale_out.items():
        for name, table in tables.items():
            write_json(Path(data_out) / "locales" / loc / "wiki" / f"{name}.json", table)
    _report(datasets, names)
    return em.icons


def _report(datasets: dict[str, list], names: dict[str, dict]) -> None:
    counts = ", ".join(f"{len(rows)} {name}" for name, rows in datasets.items())
    print(f"wiki: {counts}")
    unresolved = Counter()
    for name in ("weapons", "phantomEdges", "accessories", "medicines"):
        for row in datasets[name]:
            for mats in _material_lists(row):
                for item, _ in mats:
                    if item not in names["zh-CN"]:
                        unresolved[item] += 1
    if unresolved:
        print(f"wiki: {len(unresolved)} material ids with no item text: {', '.join(sorted(unresolved)[:12])}")


def _material_lists(row: dict):
    for lv in row.get("levels") or []:
        yield next((x for x in lv if isinstance(x, list)), [])
    for lv in row.get("refine") or []:
        yield lv[1]
    for lv in row.get("cycle") or []:
        yield lv[1]
    if row.get("soul"):
        yield row["soul"]["materials"]
