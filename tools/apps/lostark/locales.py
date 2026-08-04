"""EFTable_GameMsg -> display names per locale.

The extracted CN client ships two languages and no English: ``EFTable_GameMsg.db``
holds exactly ``GameMsg_Chinese`` and ``GameMsg_Korean``. en-US needs an NAEU
extraction, which ``lostark-explorer`` supports but has not been run here.

Game strings carry presentational markup (``<font>``, ``<img>``) and templating
(``<$CALC …>``, ``<$TABLE_COMBATEFFECT …/>``). Markup is stripped; templates are
detectable via :func:`has_template` so callers can refuse to ship raw directives
as if they were display text.
"""

from __future__ import annotations

import re

from .db import Tables
from .templates import Resolver, strip_markup

LOCALES = {"zh-CN": "GameMsg_Chinese", "ko-KR": "GameMsg_Korean"}

_TEMPLATE = re.compile(r"<\$[A-Z_]+")

# SQLite's default parameter limit is 999; stay well inside it.
_CHUNK = 500


def has_template(text: str) -> bool:
    """True when the string needs runtime table lookups this pipeline cannot resolve."""
    return bool(_TEMPLATE.search(text))


def resolve(
    tables: Tables, keys: list[str], missing: str = "raise"
) -> dict[str, dict[str, str]]:
    """Resolve ``keys`` in every locale, markup stripped.

    ``missing="raise"`` (the default) raises :class:`KeyError` naming absent keys,
    so a renamed key surfaces here rather than as a blank label in the UI.
    ``missing="skip"`` omits them, for callers probing optional keys.
    """
    wanted = list(dict.fromkeys(keys))
    out: dict[str, dict[str, str]] = {}

    with tables.connect("GameMsg") as con:
        for locale, table in LOCALES.items():
            # Descriptions embed their numbers as template directives, so each
            # value goes through the resolver rather than being stripped raw.
            resolver = Resolver(tables, locale_table=table)
            found: dict[str, str] = {}
            for start in range(0, len(wanted), _CHUNK):
                chunk = wanted[start : start + _CHUNK]
                placeholders = ",".join("?" * len(chunk))
                for key, msg in con.execute(
                    f'SELECT KEY, MSG FROM "{table}" WHERE KEY IN ({placeholders})', chunk
                ):
                    found[key] = strip_markup(resolver.resolve(msg or ""))

            # Some tables store their GameMsg key in a different case than the
            # catalogue does — Ability.Name has tip.name.ability_URGENTRESCUE1
            # where GameMsg keys it lowercase — and SQL IN is case-sensitive, so
            # an exact-match-only pass silently loses those rows.
            absent = [k for k in wanted if k not in found]
            if absent:
                lowered = {k.lower(): k for k in absent}
                for start in range(0, len(absent), _CHUNK):
                    chunk = [k.lower() for k in absent[start : start + _CHUNK]]
                    placeholders = ",".join("?" * len(chunk))
                    for key, msg in con.execute(
                        f'SELECT KEY, MSG FROM "{table}" WHERE LOWER(KEY) IN ({placeholders})',
                        chunk,
                    ):
                        original = lowered.get(key.lower())
                        if original:
                            found[original] = strip_markup(resolver.resolve(msg or ""))

            absent = [k for k in wanted if k not in found]
            if absent and missing == "raise":
                raise KeyError(f"{locale}: {len(absent)} key(s) absent, e.g. {absent[:5]}")
            out[locale] = {k: found[k] for k in wanted if k in found}
    return out
