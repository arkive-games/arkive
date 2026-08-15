"""Reader for the client's ``.loa`` binary records.

``.loa`` turns up in two unrelated shapes. :mod:`lostark.icons` already parses
``IconInfo.loa``; this module covers the ``MapData/<mapId>/`` files, which are
plainer than the name suggests: little-endian, no compression and no crypto,
unlike the ``.upk`` packages the art comes out of.

The layout is a stream of length-prefixed strings with numeric payloads between
them: ``int32 length``, then that many ASCII bytes ending in NUL. Nothing
declares where a record starts, so callers anchor on a string they expect (a
texture name, an actor class) and read the fixed payload that follows it.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass

# A length field wide enough for a path but not for a stray large int32; the
# NUL terminator and the printable-ASCII check reject the rest.
_MIN_LEN = 2
_MAX_LEN = 256


def strings(data: bytes) -> list[tuple[int, str]]:
    """Every length-prefixed string, as ``(offset_of_length_field, text)``.

    Used to survey an unfamiliar file. Parsers that know what they are looking
    for should anchor on the name instead, which is both faster and immune to
    a false positive elsewhere in the stream.
    """
    out: list[tuple[int, str]] = []
    i, n = 0, len(data)
    while i + 4 <= n:
        length = struct.unpack_from("<i", data, i)[0]
        if _MIN_LEN <= length <= _MAX_LEN and i + 4 + length <= n:
            raw = data[i + 4: i + 4 + length]
            if raw.endswith(b"\x00"):
                body = raw[:-1]
                if body and all(32 <= c < 127 for c in body):
                    out.append((i, body.decode("ascii")))
                    i += 4 + length
                    continue
        i += 1
    return out


def floats_at(data: bytes, offset: int, count: int) -> tuple[float, ...] | None:
    """``count`` little-endian float32 at ``offset``; ``None`` past the end.

    Values are returned as-is: a caller reading at a guessed offset can and does
    land on non-float bytes, so :func:`finite` exists to filter rather than this
    silently substituting zeros.
    """
    if offset + 4 * count > len(data):
        return None
    return struct.unpack_from(f"<{count}f", data, offset)


def finite(*values: float) -> bool:
    """True when every value is a real, plausibly-in-world number.

    Bytes that are not actually floats decode to NaN, infinities or absurd
    magnitudes; a coordinate beyond +/-1e7 is far outside any Lost Ark level.
    """
    return all(math.isfinite(v) and abs(v) < 1e7 for v in values)


@dataclass(frozen=True)
class Bounds:
    """An axis-aligned world box, as the minimap volume records store it."""

    min_x: float
    min_y: float
    min_z: float
    max_x: float
    max_y: float
    max_z: float

    @property
    def width(self) -> float:
        return self.max_x - self.min_x

    @property
    def height(self) -> float:
        return self.max_y - self.min_y

    def union(self, other: Bounds) -> Bounds:
        return Bounds(
            min(self.min_x, other.min_x),
            min(self.min_y, other.min_y),
            min(self.min_z, other.min_z),
            max(self.max_x, other.max_x),
            max(self.max_y, other.max_y),
            max(self.max_z, other.max_z),
        )

    def contains(self, x: float, y: float) -> bool:
        return self.min_x <= x <= self.max_x and self.min_y <= y <= self.max_y
