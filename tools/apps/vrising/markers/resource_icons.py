"""Reviewed resource-kind-to-item-icon mappings from the shipped game assets."""

from __future__ import annotations


# Resource marker icons intentionally use the same item sprites the game assigns
# to the corresponding inventory items. The source names come from the shipped
# assets and are kept explicit so an export update cannot silently remap a kind.
RESOURCE_ICON_SOURCES: dict[str, str] = {
    "copper": "Poneti_Icon_Mining_05_ironore",
    "crystal": "Item_Nethershard_t01",
    "emery": "Stunlock_Icon_Item_Ingredient_Emery",
    "gem": "FantasyIcon_Gems (23)",
    "iron": "Poneti_Icon_Mining_06_clearironore",
    "mechanical": "Stunlock_Icon_TechScrap",
    "quartz": "Poneti_Icon_Mining_50_great_white_crystal",
    "silver": "Poneti_Icon_Mining_10_mangan",
    "sulfur": "Poneti_Icon_Mining_09_biggoldore",
}

RESOURCE_ICONS: dict[str, str] = {
    kind: f"ResourceIcon_{kind.title()}" for kind in RESOURCE_ICON_SOURCES
}


def resource_icon(kind: str) -> str | None:
    """Return the reviewed marker-icon stem for a public resource kind."""
    return RESOURCE_ICONS.get(kind)


__all__ = ["RESOURCE_ICONS", "RESOURCE_ICON_SOURCES", "resource_icon"]
