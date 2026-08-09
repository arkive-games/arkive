"""Official V Blood names from the localization files shipped with the game."""

from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
from typing import Iterable


LOCALIZATION_RELATIVE = Path("VRising_Data/StreamingAssets/Localization")
LOCALIZATION_FILES = {
    "en-US": "English.json",
    "zh-CN": "SChinese.json",
    "zh-TW": "TChinese.json",
}

# The community metadata used to identify V Blood prefabs retains ten legacy
# or annotated English labels. Resolve those to the current shipped English
# localization before following the shared GUID into Chinese. The mapping is
# explicit so a future rename cannot silently select a similarly named entry.
BOSS_NAME_ALIASES = {
    "Albert The Duke of Balaton (Frog)": "Albert the Duke of Balaton",
    "Alpha Wolf": "Alpha the White Wolf",
    "Ben The Old Wanderer": "Ben the Old Wanderer",
    "Gaius The Cursed Champion": "Gaius the Cursed Champion",
    "Lord Styx the Night Champion (Bat)": "Lord Styx the Night Champion",
    "Quincey the Bandit King (Quincy)": "Quincey the Bandit King",
    "Raziel the Sheperd": "Raziel the Shepherd",
    "Talzur The Winged Horror": "Talzur the Winged Horror",
    "Ungora the Spider Queen (Spider)": "Ungora the Spider Queen",
    "Willfred the Village Elder (Wilfred)": "Willfred the Werewolf Chief",
}


def _read_nodes(path: Path) -> list[tuple[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(f"V Rising localization file is missing: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    nodes = payload.get("Nodes", payload.get("nodes"))
    if not isinstance(nodes, list):
        raise ValueError(f"{path}: localization nodes must be an array")
    result: list[tuple[str, str]] = []
    for node in nodes:
        guid = node.get("Guid", node.get("guid"))
        text = node.get("Text", node.get("text"))
        if not isinstance(guid, str) or not isinstance(text, str):
            raise ValueError(f"{path}: malformed localization node")
        result.append((guid.lower(), text))
    return result


def load_localized_guid_texts(
    localization_dir: Path,
    guids: Iterable[str],
) -> dict[str, dict[str, str]]:
    """Load an exact set of localization GUIDs in every supported locale."""
    localization_dir = Path(localization_dir)
    requested = {guid.lower() for guid in guids}
    nodes = {
        locale: dict(_read_nodes(localization_dir / filename))
        for locale, filename in LOCALIZATION_FILES.items()
    }
    result: dict[str, dict[str, str]] = {}
    for guid in sorted(requested):
        localized: dict[str, str] = {}
        for locale in LOCALIZATION_FILES:
            text = nodes[locale].get(guid)
            if not text:
                raise ValueError(f"localization GUID {guid} has no {locale} text")
            localized[locale] = text
        result[guid] = localized
    return result


def load_boss_localized_names(
    localization_dir: Path,
    display_names: Iterable[str],
) -> dict[str, dict[str, str]]:
    """Resolve source English names to the game's current en/zh GUID entries."""
    localization_dir = Path(localization_dir)
    nodes = {
        locale: _read_nodes(localization_dir / filename)
        for locale, filename in LOCALIZATION_FILES.items()
    }
    english_by_text: dict[str, list[str]] = defaultdict(list)
    for guid, text in nodes["en-US"]:
        english_by_text[text].append(guid)
    text_by_guid = {
        locale: {guid: text for guid, text in locale_nodes}
        for locale, locale_nodes in nodes.items()
        if locale != "en-US"
    }

    result: dict[str, dict[str, str]] = {}
    for source_name in sorted(set(display_names)):
        official_english = BOSS_NAME_ALIASES.get(source_name, source_name)
        guids = english_by_text.get(official_english, [])
        if len(guids) != 1:
            raise ValueError(
                f"expected one localization GUID for {source_name!r} "
                f"via {official_english!r}, found {len(guids)}"
            )
        guid = guids[0]
        localized = {"en-US": official_english}
        for locale in ("zh-CN", "zh-TW"):
            text = text_by_guid[locale].get(guid)
            if not text:
                raise ValueError(
                    f"{source_name!r} ({guid}) has no {locale} localization"
                )
            localized[locale] = text
        result[source_name] = localized
    return result


def localize_fixed_bosses(records: list[dict], game_root: Path) -> list[dict]:
    """Attach shipped localized names without mutating extracted records."""
    names = load_boss_localized_names(
        Path(game_root) / LOCALIZATION_RELATIVE,
        (record["boss"]["displayName"] for record in records),
    )
    return [
        {
            **record,
            "boss": {
                **record["boss"],
                "localizedNames": names[record["boss"]["displayName"]],
            },
        }
        for record in records
    ]


__all__ = [
    "BOSS_NAME_ALIASES",
    "LOCALIZATION_FILES",
    "LOCALIZATION_RELATIVE",
    "load_boss_localized_names",
    "load_localized_guid_texts",
    "localize_fixed_bosses",
]
