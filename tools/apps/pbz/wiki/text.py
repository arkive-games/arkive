"""Display text for the wiki: per-culture string tables and the game's rich-text markup.

Every name and description in the DataTables is an FText key; the strings live in
each culture's ``Game.json`` (or the raw ``Game.locres`` of an older export, see
``pbz.locres.read_culture``).

The strings use UMG rich-text tags (``<Character_Yellow_Decorator2>…</>``, closed by a
bare ``</>``) and inline button prompts (``<InputAction id="HeavyAttack" …/>``). The
site gets a small closed vocabulary instead, which it renders without ``innerHTML``:

* ``<hl>…</hl>``   the game's yellow highlight (keywords, mechanics)
* ``<up>…</up>``   green numbers and bonuses
* ``<warn>…</warn>`` red text
* ``<b>…</b>``     bold
* ``<key id="X"/>`` a button prompt; the labels file names each id per locale
* ``<icon id="X"/>`` an inline game icon (the Sha-Chi charge, an element), served as
  ``wiki/rich_<X>.webp``

``<dtv id="X021"/>`` is a tuning number the game substitutes from ``DT_UITextParams``;
it is substituted here too. Any other tag (particle widgets, layout) is dropped,
keeping the text inside it.
"""

from __future__ import annotations

import re
from pathlib import Path

from ..locres import read_culture

LOCALIZATION_DIR = Path("ProjectPBZ/Content/Localization/Game")

# Site locale -> the game's culture directory (the same pairs the map pipeline uses).
CULTURES = {"en-US": "en-US", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant"}


def load_cultures(raw: Path) -> dict[str, dict[str, str]]:
    """``{site_locale: {key: text}}`` from the ``Default`` namespace of each culture."""
    return {locale: read_culture(Path(raw) / LOCALIZATION_DIR / culture).get("Default", {})
            for locale, culture in CULTURES.items()}


# Tag name -> site tag. Matched by prefix so the game's numbered variants
# (``Character_Yellow_Decorator2``, ``Tutorial_Body_Yellow``) all land somewhere.
_STYLE_RULES = (
    (re.compile(r"(Yellow|Purple)"), "hl"),
    (re.compile(r"Green"), "up"),
    (re.compile(r"(Red|^red$)"), "warn"),
    (re.compile(r"Bold"), "b"),
)
_PROMPT_TAGS = {"InputAction", "UIRowName"}
_ICON_TAG = "img"
# The animated flame stands for Pure Sha-Chi ("精纯杀气<Niagara id="Fire"/>已满"), whose static
# icon the game's own rich-icon table lists as "jingchunFire". (Not "SpiritShadow": that is
# the Phantom Edge charge, 暗源.)
_WIDGET_ICONS = {("Niagara", "Fire"): "jingchunFire"}
_PARAM_TAG = "dtv"
_TAG = re.compile(r"<(/?)([A-Za-z_][A-Za-z_0-9]*)?([^<>]*?)(/?)>")
_ID = re.compile(r'\bid="([^"]+)"')
_RUNTIME_ARG = re.compile(r"\{\d+\}")


def _style(tag: str) -> str | None:
    for pattern, site in _STYLE_RULES:
        if pattern.search(tag):
            return site
    return None


def rich(text: str | None, params: dict[str, str] | None = None, icons: set[str] | None = None) -> str:
    """The game's rich text rewritten into the site's tag vocabulary (see module doc).

    ``params`` resolves ``<dtv>`` numbers; ``icons`` is the set of inline icon ids the
    site can serve (others are dropped).
    """
    if not text:
        return ""
    out: list[str] = []
    stack: list[str | None] = []  # site tag (or None for dropped) per open game tag
    pos = 0
    for m in _TAG.finditer(text):
        out.append(text[pos:m.start()])
        pos = m.end()
        closing, name, attrs, self_closing = m.group(1), m.group(2) or "", m.group(3), m.group(4)
        if closing:
            site = stack.pop() if stack else None
            if site:
                out.append(f"</{site}>")
            continue
        ident = _ID.search(attrs)
        if name in _PROMPT_TAGS:
            if ident:
                out.append(f'<key id="{ident.group(1)}"/>')
            continue
        if name == _PARAM_TAG:
            if ident and params and ident.group(1) in params:
                out.append(f"<up>{params[ident.group(1)]}</up>")
            continue
        if name == _ICON_TAG or (name, ident and ident.group(1)) in _WIDGET_ICONS:
            icon = _WIDGET_ICONS.get((name, ident.group(1)), ident.group(1)) if ident else None
            if icon and icons is not None and icon in icons:
                out.append(f'<icon id="{icon}"/>')
            continue
        if self_closing:
            continue  # inline images and widgets carry no text
        site = _style(name)
        stack.append(site)
        if site:
            out.append(f"<{site}>")
    out.append(text[pos:])
    # A string that leaves a tag open still renders in game; close it here.
    out.extend(f"</{site}>" for site in reversed(stack) if site)
    # "{0}" is a value the game formats in at runtime; there is nothing to put there.
    return _RUNTIME_ARG.sub("X", "".join(out)).replace("\r\n", "\n").strip()


class Text:
    """Resolves FText references against every site locale at once."""

    def __init__(self, cultures: dict[str, dict[str, str]], params: dict[str, str] | None = None,
                 icons: set[str] | None = None):
        self.cultures, self.params, self.icons = cultures, params or {}, icons or set()

    def get(self, ftext, locale: str, *, plain: bool = False) -> str:
        key = ftext.get("Key") if isinstance(ftext, dict) else ftext
        value = self.cultures[locale].get(key or "", "")
        return value.strip() if plain else rich(value, self.params, self.icons)

    def has(self, ftext) -> bool:
        """True when the key resolves in the game's source culture (zh-Hans)."""
        key = ftext.get("Key") if isinstance(ftext, dict) else ftext
        return bool(key and self.cultures["zh-CN"].get(key, "").strip())
