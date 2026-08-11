"""Official map-marker text resolved from the localization shipped by V Rising."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .localization import LOCALIZATION_FILES, load_localized_guid_texts


@dataclass(frozen=True)
class OfficialTextRef:
    name_guid: str
    description_guid: str | None = None


# These GUIDs point at the game's own resource/item strings. Several authored
# scene objects (mine carts and containers) have no localized display name, so
# their markers use the official name of the resource they yield.
RESOURCE_TEXT_REFS = {
    "copper": OfficialTextRef("37f33a05-a18e-4445-947c-a9ccb192e984"),
    "emery_container": OfficialTextRef(
        "826ebdba-e5f7-4303-b172-5b6a85a042c4",
        "cde14b8b-b6a8-42d6-9931-b031d600f90e",
    ),
    "iron": OfficialTextRef("bb6fb6cd-5125-4225-81bf-10dd69b6f16e"),
    "iron_mine_cart": OfficialTextRef("bb6fb6cd-5125-4225-81bf-10dd69b6f16e"),
    "mechanical_resource": OfficialTextRef(
        "b3e66c75-1f29-4835-829b-cab41bec8fd8",
        "5e17b367-910f-4fae-8eef-6d6fdb4030fd",
    ),
    "quartz": OfficialTextRef(
        "32e3bcee-8c19-4ffd-9998-5441c1faf888",
        "6c73162b-3397-4663-9c1c-29f88e1c5967",
    ),
    "random_mech_spawn": OfficialTextRef(
        "b3e66c75-1f29-4835-829b-cab41bec8fd8",
        "5e17b367-910f-4fae-8eef-6d6fdb4030fd",
    ),
    "rift_crystal": OfficialTextRef(
        "9baee9b1-0e14-4b39-8b91-5f88f7436d2b",
        "90f482a4-3f5d-4de2-a6fe-eca073e49414",
    ),
    "silver": OfficialTextRef(
        "3df4d93f-282b-409f-901b-2622a8f513e3",
        "690baab6-ebed-45d2-a2be-58aa603b667e",
    ),
    "silver_mine_cart": OfficialTextRef(
        "3df4d93f-282b-409f-901b-2622a8f513e3",
        "690baab6-ebed-45d2-a2be-58aa603b667e",
    ),
    "sulfur": OfficialTextRef(
        "13dda5db-1dd2-4020-b1bd-c1a53a0bdac9",
        "b6551fa9-974e-416f-bfc4-6a830147789d",
    ),
}

# This pair is the world-map POI text, not the buildable castle-waygate text.
WAYGATE_TEXT_REF = OfficialTextRef(
    "0896f140-8c61-451a-9531-a2cd2905a4c5",
    "695ade36-67df-45ee-948c-99723ae01e3e",
)

CAVE_PASSAGE_TEXT_REF = OfficialTextRef(
    "5336ed66-0eb9-419f-9979-74c40df9f1a3"
)

# Taxonomy labels that are also taken verbatim from the shipped localization.
# Most subtype name GUIDs are already present in the marker refs above.
TYPE_NAME_GUIDS = frozenset({"1ef6d67a-f40d-4de0-95ed-a5960c0d9812"})


def _localized_ref(
    ref: OfficialTextRef,
    texts: dict[str, dict[str, str]],
) -> dict[str, dict[str, str]]:
    names = texts[ref.name_guid]
    result = {"localizedNames": names}
    if ref.description_guid:
        result["localizedDescriptions"] = texts[ref.description_guid]
    return result


def load_official_marker_texts(localization_dir: Path) -> dict:
    """Load every official string used by published map markers.

    All supported locales are required by ``load_localized_guid_texts``. A game
    update that removes or partially localizes a pinned GUID therefore blocks
    emission instead of silently falling back to authored copy.
    """
    refs = [*RESOURCE_TEXT_REFS.values(), WAYGATE_TEXT_REF, CAVE_PASSAGE_TEXT_REF]
    guids = TYPE_NAME_GUIDS | {
        guid
        for ref in refs
        for guid in (ref.name_guid, ref.description_guid)
        if guid is not None
    }
    texts = load_localized_guid_texts(localization_dir, guids)
    return {
        "byGuid": texts,
        "resources": {
            detail: _localized_ref(ref, texts)
            for detail, ref in RESOURCE_TEXT_REFS.items()
        },
        "waygate": _localized_ref(WAYGATE_TEXT_REF, texts),
        "cavePassage": _localized_ref(CAVE_PASSAGE_TEXT_REF, texts),
    }


def validate_localized_text(text: dict[str, str]) -> None:
    missing = set(LOCALIZATION_FILES) - set(text)
    if missing or any(not text[locale] for locale in LOCALIZATION_FILES):
        raise ValueError(f"official marker text is missing locales: {sorted(missing)}")


__all__ = [
    "OfficialTextRef",
    "CAVE_PASSAGE_TEXT_REF",
    "RESOURCE_TEXT_REFS",
    "WAYGATE_TEXT_REF",
    "TYPE_NAME_GUIDS",
    "load_official_marker_texts",
    "validate_localized_text",
]
