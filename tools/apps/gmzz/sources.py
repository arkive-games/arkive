"""Discover the client assets needed by the LOM equipment database.

The installed client exposes cooked asset paths through
``Manifest_UFSFiles_Win64.txt`` even when the payload remains in Pak/IoStore
containers. This module turns that manifest into a small, deterministic export
plan. It never reads account files, logs, or the container payload itself.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path

EXCEL_ROOT = "C7/Content/ScriptOPCode/Data/Excel/"

# Tables that define identity, pools, and the text/effect link graph. Auxiliary
# tables are discovered by prefixes below, but these are the minimum useful
# export for the first normalized database build.
REQUIRED_TABLES = frozenset(
    {
        "EquipmentData",
        "EquipmentWordInitRandomGroupData",
        "EquipmentWordRandomClassData",
        "EquipmentWordRandomGroupData",
        "EquipmentWordRandomWordData",
        "SealedExtraEffectData",
        "SealedInfoAttrData",
        "SealedInfoData",
        "SealedRisk",
        "SpecialSealedData",
        "XtraMatInfoData",
        "XtraMatRandomClassData",
        "XtraMatRandomGroupData",
        "XtraMatRandomWordData",
        "BuffDataNew",
        "PassiveSkillData",
        "StringConstData",
        "StringLuaData",
    }
)

EQUIPMENT_PREFIXES = (
    "Equipment",
    "EquipRandom",
    "EquipBadWord",
)
SEALED_PREFIXES = (
    "Sealed",
    "SpecialSealed",
    "PresetSealed",
    "Relics",
    "XtraMat",
)
EFFECT_PREFIXES = (
    "BuffData",
    "BuffGroup",
    "PassiveSkill",
    "DamageData",
    "SkillDataNew",
)
TEXT_TABLES = {"StringConstData", "StringLuaData"}
LANGUAGE_KEYWORDS = ("item", "buff", "skill", "equip", "sealed", "xtramat")


@dataclass(frozen=True, slots=True)
class SourceAsset:
    """One cooked client asset requested by the focused export plan."""

    table_name: str
    category: str
    role: str
    asset_path: str
    required: bool


def _table_name(asset_path: str) -> str:
    return Path(asset_path).stem


def _role(asset_path: str) -> str:
    if "/Annotation/" in asset_path:
        return "annotation"
    if "/LanguageData/" in asset_path:
        return "localization"
    return "data"


def _category(asset_path: str, table_name: str) -> str | None:
    if "/LanguageData/" in asset_path:
        lowered = table_name.lower()
        if table_name.startswith("StringDB_CN_Data_") and any(
            keyword in lowered for keyword in LANGUAGE_KEYWORDS
        ):
            return "localization"
        return None

    bare_name = table_name.removeprefix("Anno_")
    if bare_name in TEXT_TABLES:
        return "localization"
    if bare_name.startswith(SEALED_PREFIXES):
        return "sealed"
    if bare_name.startswith(EQUIPMENT_PREFIXES):
        return "equipment"
    if bare_name.startswith(EFFECT_PREFIXES):
        return "effect"
    return None


def discover_sources(manifest: Path) -> list[SourceAsset]:
    """Return the focused export plan recorded by a UFS manifest."""

    assets: dict[str, SourceAsset] = {}
    with Path(manifest).open(encoding="utf-8-sig", errors="replace") as handle:
        for line in handle:
            asset_path = line.split("\t", 1)[0].strip().replace("\\", "/")
            if not asset_path.startswith(EXCEL_ROOT) or not asset_path.lower().endswith(".luac"):
                continue
            table_name = _table_name(asset_path)
            category = _category(asset_path, table_name)
            if category is None:
                continue
            bare_name = table_name.removeprefix("Anno_")
            assets[asset_path] = SourceAsset(
                table_name=table_name,
                category=category,
                role=_role(asset_path),
                asset_path=asset_path,
                required=bare_name in REQUIRED_TABLES,
            )
    role_order = {"data": 0, "annotation": 1, "localization": 2}
    return sorted(
        assets.values(),
        key=lambda item: (item.category, role_order[item.role], item.asset_path),
    )


def missing_required_tables(sources: list[SourceAsset]) -> list[str]:
    present = {
        source.table_name.removeprefix("Anno_")
        for source in sources
        if source.role == "data"
    }
    return sorted(REQUIRED_TABLES - present)


def write_extraction_plan(manifest: Path, output: Path) -> dict:
    """Write a reviewable JSON plan and return its in-memory representation."""

    sources = discover_sources(manifest)
    payload = {
        "manifest": str(Path(manifest).resolve()),
        "assetCount": len(sources),
        "missingRequiredTables": missing_required_tables(sources),
        "assets": [asdict(source) for source in sources],
    }
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(output).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload
