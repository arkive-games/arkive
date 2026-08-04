"""Resolve the template directives embedded in GameMsg strings.

Game text stores its numbers by reference rather than inline, e.g.

    暴击时对敌人造成的伤害增加<$CALC %2 <$TABLE_COMBATEFFECT Action0ArgA 608111000/>/100/>%

which means "look up ``Action0ArgA`` on ``CombatEffect`` row 608111000, divide
by 100, print with 2 decimals". Shipping that raw would put ``/100/>`` in the
UI, so this module evaluates them.

Directive forms seen in the ark grid corpus:

* ``<$TABLE_<Name> <Column> <PrimaryKey> [SecondaryKey] />`` — table lookup.
  **Table names are case-insensitive**: both ``TABLE_COMBATEFFECT`` and
  ``TABLE_ArkGridCoreOption`` occur, so matching only ``[A-Z_]+`` silently
  truncates the latter and leaves fragments behind.
* ``<$CALC [%<digits>] <arithmetic> />`` and ``<$CALC_COMMA …>`` — evaluate and
  format. The precision prefix is optional. CALC_COMMA groups thousands.

``<$MACRO …>`` and ``<$PLAYER_INFO …>`` depend on runtime state and are left
untouched rather than guessed at.
"""

from __future__ import annotations

import re
from functools import lru_cache

from .db import Tables

_TABLE = re.compile(r"<\$TABLE_(\w+)\s+(\w+)\s+(\d+)(?:\s+(\d+))?\s*/>", re.IGNORECASE)
_CALC = re.compile(r"<\$(CALC|CALC_COMMA)\s+(?:%(\d+)\s+)?([^<>]*?)\s*/>", re.IGNORECASE)

# The client colours its own text — green for numbers, purple for "命运", yellow
# for durations — so those spans are preserved rather than re-derived. Deriving
# them from our own rules would miss cases the game marks up and we would not
# think of.
_FONT_COLOUR = re.compile(r"<FONT\s+COLOR='(#[0-9a-fA-F]{6})'\s*>", re.IGNORECASE)
_FONT_CLOSE = re.compile(r"</FONT\s*>", re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t]+")
_SAFE_EXPR = re.compile(r"^[\d\s+\-*/().]+$")

_MAX_PASSES = 6


def strip_markup(text: str) -> str:
    """Drop presentational tags but keep the game's literal-hex colour spans.

    Emits ``<c #rrggbb>…</c>``, a deliberately tiny markup the frontend renders
    as spans. Done as a single pass over every tag rather than
    substitute-then-restore, which needed sentinel control characters that did
    not survive being written through a shell.

    Colour spans whose value is a template placeholder (``<font color='{0}'>``,
    which core names use) are dropped along with their close: there is no colour
    to render.
    """
    out: list[str] = []
    depth = 0  # open <c> spans, so a close is only emitted when one is owed
    pos = 0
    for tag in _TAG.finditer(text):
        out.append(text[pos : tag.start()])
        pos = tag.end()
        raw = tag.group(0)
        # Keep unresolved directives intact. Dropping the marker but leaving its
        # arithmetic tail produced strings like "*(300690/10000)+((1247+1524)/2))/>"
        # -- mangled, and no longer detectable as needing runtime state.
        if raw.startswith("<$"):
            out.append(raw)
            continue
        colour = _FONT_COLOUR.fullmatch(raw)
        if colour:
            out.append(f"<c {colour.group(1).lower()}>")
            depth += 1
        elif _FONT_CLOSE.fullmatch(raw) and depth:
            out.append("</c>")
            depth -= 1
        # Anything else — <img>, <br>, a placeholder-coloured <font> — is dropped.
    out.append(text[pos:])
    return _WS.sub(" ", "".join(out)).strip()


class Resolver:
    """Resolves GameMsg keys into display text with every number filled in."""

    def __init__(self, tables: Tables, locale_table: str = "GameMsg_Chinese") -> None:
        self.tables = tables
        self.locale_table = locale_table
        # Real table names, indexed lowercase so directives can use any casing.
        self._by_lower = {
            p.stem[len("EFTable_") :].lower(): p.stem[len("EFTable_") :]
            for p in tables.root.glob("EFTable_*.db")
        }

    @lru_cache(maxsize=None)
    def _row(self, table: str, primary: int, secondary: int | None) -> tuple | None:
        real = self._by_lower.get(table.lower())
        if real is None:
            return None
        try:
            with self.tables.connect(real) as con:
                cols = [r[1] for r in con.execute(f'PRAGMA table_info("{real}")')]
                if secondary is not None and "SecondaryKey" in cols:
                    sql = f'SELECT * FROM "{real}" WHERE PrimaryKey=? AND SecondaryKey=?'
                    row = con.execute(sql, (primary, secondary)).fetchone()
                else:
                    sql = f'SELECT * FROM "{real}" WHERE PrimaryKey=?'
                    row = con.execute(sql, (primary,)).fetchone()
                return (tuple(cols), tuple(row)) if row else None
        except Exception:
            return None

    def _lookup(self, table: str, column: str, primary: int, secondary: int | None):
        found = self._row(table, primary, secondary)
        if not found:
            return None
        cols, row = found
        lower = {c.lower(): v for c, v in zip(cols, row)}
        return lower.get(column.lower())

    def _sub_tables(self, text: str) -> str:
        def one(m: re.Match) -> str:
            value = self._lookup(
                m.group(1),
                m.group(2),
                int(m.group(3)),
                int(m.group(4)) if m.group(4) else None,
            )
            # Leave the directive in place when the row is missing, so the
            # caller can see it failed rather than reading a silent zero.
            return m.group(0) if value is None else str(value)

        return _TABLE.sub(one, text)

    def _sub_calc(self, text: str) -> str:
        def one(m: re.Match) -> str:
            digits = int(m.group(2)) if m.group(2) else 0
            expr = m.group(3).strip()
            if not _SAFE_EXPR.match(expr):
                return m.group(0)
            try:
                value = eval(expr, {"__builtins__": {}}, {})  # noqa: S307 - guarded
            except Exception:
                return m.group(0)
            grouped = m.group(1).upper() == "CALC_COMMA"
            out = f"{value:,.{digits}f}" if grouped else f"{value:.{digits}f}"
            # 4.00 -> 4, 0.55 -> 0.55
            if "." in out:
                out = out.rstrip("0").rstrip(".")
            return out or "0"

        return _CALC.sub(one, text)

    def resolve(self, text: str) -> str:
        """Evaluate directives until the text stops changing."""
        for _ in range(_MAX_PASSES):
            nxt = self._sub_calc(self._sub_tables(text))
            if nxt == text:
                break
            text = nxt
        return text

    def text(self, key: str) -> str | None:
        """Resolved display text for a GameMsg key, colour spans preserved."""
        with self.tables.connect("GameMsg") as con:
            row = con.execute(
                f'SELECT MSG FROM "{self.locale_table}" WHERE KEY=?', (key,)
            ).fetchone()
        if not row or not row[0]:
            return None
        return strip_markup(self.resolve(row[0]))
