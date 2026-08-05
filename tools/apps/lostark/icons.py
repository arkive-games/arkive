"""``IconInfo.loa`` — the client's atlas sprite table, and the only icon address.

Every ``Icon`` / ``IconIndex`` pair in the 780 game tables is a **sprite file
name**, not a coordinate: ``Icon='Buff'`` with ``IconIndex=71`` means the sprite
``Buff_71.png``. ``IconInfo.loa`` (shipped in ``data3``, beside ``TooltipInfo.loa``
and ``UIProperties.loa``) is the table that turns that name into an atlas page and
a rectangle. It holds **44,121 sprites over 1,147 pages** — exactly the 1,147
``Texture2D`` exports the 22 ``EFUI_ICONATLAS_*`` packages contain, so it covers
the whole UI icon set with nothing left over.

Why this matters: the obvious model — "``IconIndex`` is a flat row-major cell
index over ``<group>_0``, ``<group>_1``, … at 64x64" — is wrong, and wrong in a
way that *looks* right. Three separate assumptions in it fail:

* **Sprites are not laid out in index order.** ``Buff_61`` and ``Buff_62`` do not
  sit between ``Buff_60`` and ``Buff_63`` on ``Buff_0``; they live at the top-left
  of ``Buff_3``. Index 60 lands on cell 60 and index 63 lands on cell 61, so
  everything past 62 on that page reads two cells late. That is the whole origin
  of the "-2 offset" the art seemed to ask for — a local artefact of two
  relocated sprites, not a rule. Further relocations move the apparent offset to
  -4 at 213, -5 at 224, -14 at 237 and beyond.
* **Page order is not the numeric suffix.** ``Ability_0.png`` is on page
  ``Ability_1``; ``Ability_207.png`` is on page ``Ability_0``.
* **The cell size is not fixed.** 22,605 sprites are 64x64 and 14,944 are
  128x128, with 100-odd other sizes for banners and portraits. Seven engravings
  resolve to 128x128 sprites on the ``Achieve_*`` pages.

The format is a flat record stream::

    float32 scale (1.0)   int32 (39)   int32 (0)   int32 count
    count x { fstring name; fstring page; int32 x, y, w, h; int32 reserved[3] }

where ``fstring`` is an int32 byte length (terminator included) followed by ASCII.
Parsing consumes the file exactly, count records and zero bytes left over, which
is the check :func:`sprite_table` keeps.

Two independent confirmations that this is the client's real rule, not a
plausible-looking one:

* **The official CDN.** Stove and AWS publish the same sprites, cut by the game's
  own tooling, at ``…/EFUI_IconAtlas/<Group>/<Group>_<index>.png``. Matching 409
  downloaded KR sprites against every cell of the extracted pages by pixel
  distance agrees with this table on **333 of 339** identifiable Buff sprites and
  **262 of 262** Ability sprites. The six Buff exceptions are cells whose art the
  CN client also carries a second copy of (on the legacy ``Buff_2`` page), where a
  nearest-pixel match cannot choose between the copies.
* **Semantics.** Reading the resolved engraving icons: 和平之光 (Peacemaker) is a
  revolver, 捕食者 (Predator) a snarling wolf, 第二个伙伴 (Loyal Companion) a
  hawk, 绵绵细雨 a green umbrella, 月声 a crescent moon, 王后恩赐 / 国王圣谕 the
  Arcanist queen and king, 尖刺重锤 a spiked mace, 愤怒之锤 a war hammer.
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass
from pathlib import Path

# Sprite names are "<group>_<index>.png"; the group itself may end in digits
# (Ark_Passive_01, GL_Skill_01), so only the last run of digits is the index.
_SPRITE_NAME = re.compile(r"(?P<group>.+)_(?P<index>\d+)\.png$", re.IGNORECASE)

_HEADER = struct.Struct("<fiii")
_RECT = struct.Struct("<7i")


@dataclass(frozen=True)
class Sprite:
    """One sprite: the page texture it lives on and its rectangle in pixels."""

    page: str
    x: int
    y: int
    width: int
    height: int

    @property
    def box(self) -> tuple[int, int, int, int]:
        """The crop box PIL wants."""
        return self.x, self.y, self.x + self.width, self.y + self.height


def _fstring(data: bytes, offset: int) -> tuple[str, int]:
    (length,) = struct.unpack_from("<i", data, offset)
    offset += 4
    if length < 1 or offset + length > len(data):
        raise ValueError(f"bad string length {length} at offset {offset - 4}")
    return data[offset : offset + length - 1].decode("latin1"), offset + length


def sprite_table(icon_info: Path) -> dict[tuple[str, int], Sprite]:
    """Parse ``IconInfo.loa`` into ``{(group_lowercased, index): Sprite}``.

    Keys are lowercased because the tables spell a group inconsistently
    (``Ability.Icon`` has both ``Buff`` and ``achieve_08``) while the sprite table
    uses the artist's casing. The record count and the file length are both
    asserted, so a format change fails here instead of silently yielding a short
    table and mysteriously missing icons.
    """
    data = Path(icon_info).read_bytes()
    _scale, _unknown, _zero, count = _HEADER.unpack_from(data, 0)
    offset = _HEADER.size

    sprites: dict[tuple[str, int], Sprite] = {}
    unnamed = 0
    for _ in range(count):
        name, offset = _fstring(data, offset)
        page, offset = _fstring(data, offset)
        x, y, width, height, *_reserved = _RECT.unpack_from(data, offset)
        offset += _RECT.size
        match = _SPRITE_NAME.match(name)
        if match is None:
            # 15 of the 44,121 are named without a trailing index (page-sized
            # backdrops); no table can reference them, so they are counted, not kept.
            unnamed += 1
            continue
        key = (match.group("group").lower(), int(match.group("index")))
        sprites[key] = Sprite(page, x, y, width, height)

    if offset != len(data):
        raise ValueError(f"{icon_info}: {count} records ended at {offset} of {len(data)} bytes")
    if len(sprites) + unnamed != count:
        raise ValueError(f"{icon_info}: {count} records collapsed to {len(sprites)} sprites")
    return sprites


def pages(atlas_root: Path) -> dict[str, Path]:
    """``{page_name_lowercased: png}`` over a ``laex textures`` output tree.

    One directory per package, page names unique across all of them — asserted,
    since a collision would silently pick one package's art for another's sprite.
    """
    found: dict[str, Path] = {}
    for path in sorted(Path(atlas_root).rglob("*.png")):
        key = path.stem.lower()
        if key in found:
            raise ValueError(f"two atlas pages named {key}: {found[key]} and {path}")
        found[key] = path
    return found


def locate(
    sprites: dict[tuple[str, int], Sprite],
    atlas_root_pages: dict[str, Path],
    group: str,
    index: int,
) -> tuple[Path, tuple[int, int, int, int]] | None:
    """Resolve ``(group, index)`` to a page file and a crop box, or ``None``.

    ``None`` means either the sprite table has no such sprite or its page was not
    among the extracted textures. Both are real states (``IconInfo`` leaves 8 gaps
    inside the Buff index range alone), and neither is an error here — the caller
    decides whether a missing icon is fatal.
    """
    sprite = sprites.get((group.lower(), index))
    if sprite is None:
        return None
    page = atlas_root_pages.get(sprite.page.lower())
    if page is None:
        return None
    return page, sprite.box
