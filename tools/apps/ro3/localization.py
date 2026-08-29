"""Render Ragnarok Online 3's localized strings.

A localized field in a config row is a list whose head is an id into the language table
and whose tail is that field's own arguments::

    _iName        = {10110201810}
    _iDescription = {10110301006, "<color=#cc762a>", "</color>"}
    _kDescData    = {"55", "60", "5", "3", "5"}

The template behind the id carries three placeholder families, and they draw from two
different argument lists:

============  ===============================================================
``${n}``      the **row's** ``_kDescData[n]`` -- the numbers a skill's own level
              contributes, so the same template serves every level of a skill
``^{n}``      the **field's** own argument ``n``
``@{n}``      the **field's** own argument ``carets + n``, where ``carets`` is the
              highest ``^`` index the template uses
============  ===============================================================

That split is why ``^`` and ``@`` never collide: the exporter writes the markup arguments
first and the numeric ones after, and the template addresses each run from 1. Measured over
build 0.0.1.14's ``SkillConfig``: of the 4,887 name and description fields whose template
carries any placeholder, **4,887 satisfy** ``max(^) + max(@) == len(own arguments)``, and
none addresses an argument that was not supplied.

An id that resolves to the literal ``"None"`` is an untranslated slot, not a translation --
the CN build ships ~19,300 of them in each of ``en``, ``ko``, ``th`` and ``id``. It reads
as missing here, so nothing presents it as text.

A placeholder with no argument behind it is **left verbatim**. A caller that wants to know
whether a string came out complete asks :func:`unresolved`.
"""

from __future__ import annotations

import re

#: Language table (``Localization_<code>``) -> the tag the dataset keys its text by.
#:
#: **One definition for the whole pipeline.** Every stage that emits a ``{tag: text}`` map or
#: a ``locales/<tag>.json`` file reads it from here rather than declaring its own, because a
#: dataset that shipped ``name.en`` in one file and ``name["en-US"]`` in the next would force
#: a consumer to special-case its own halves. The tags are BCP 47 and match the rest of the
#: platform (``en-US``/``zh-CN``/``zh-TW`` are what the frontend's changelog locales use).
LOCALE_TAGS = {
    "zh_CN": "zh-CN",
    "zh_TW": "zh-TW",
    "en": "en-US",
    "ko": "ko-KR",
    "th": "th-TH",
    "id": "id-ID",
    "vi": "vi-VN",
}

#: The three placeholder families. Nothing else in the corpus uses ``<sigil>{digits}``.
PLACEHOLDER = re.compile(r"([$^@])\{(\d+)\}")

#: A language table entry with this text is an untranslated slot.
UNTRANSLATED = "None"


def caret_span(template: str) -> int:
    """The highest ``^{n}`` index the template uses -- the offset ``@`` counts from."""
    return max(
        (int(m.group(2)) for m in PLACEHOLDER.finditer(template) if m.group(1) == "^"),
        default=0,
    )


def render(template: str, own_args: list, desc_data: list | None = None) -> str:
    """Substitute every placeholder the arguments cover, leaving the rest verbatim."""
    own = [_as_text(a) for a in own_args]
    shared = [_as_text(a) for a in (desc_data or [])]
    offset = caret_span(template)

    def pick(sigil: str, i: int) -> str | None:
        if sigil == "$":
            source, index = shared, i
        elif sigil == "^":
            source, index = own, i
        else:
            source, index = own, i + offset
        return source[index - 1] if 1 <= index <= len(source) else None

    def replace(m: re.Match[str]) -> str:
        value = pick(m.group(1), int(m.group(2)))
        return m.group(0) if value is None else value

    return PLACEHOLDER.sub(replace, template)


def unresolved(text: str) -> list[str]:
    """The placeholders still standing in a rendered string."""
    return [m.group(0) for m in PLACEHOLDER.finditer(text)]


def _as_text(value) -> str:
    if isinstance(value, bool):  # bool is an int; never render one as 0/1
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def lookup(table: dict, field, desc_data: list | None = None) -> str | None:
    """Resolve one localized field against one language table.

    ``table`` maps a string id to its text (see :func:`text_table`). Returns ``None`` when
    the field is not a localized reference, when the language has no entry, or when the
    entry is the untranslated marker -- all three are absences, and an absence must not be
    dressed up as a string.
    """
    if not isinstance(field, list) or not field:
        return None
    template = table.get(str(field[0]))
    if template is None or template == UNTRANSLATED or template == "":
        return None
    return render(template, list(field[1:]), desc_data)


def text_table(rows: dict) -> dict[str, str]:
    """Flatten a ``Localization_*`` config table to ``id -> text``, dropping the untranslated."""
    out: dict[str, str] = {}
    for key, row in rows.items():
        text = row.get("_kDes") if isinstance(row, dict) else None
        if isinstance(text, str) and text not in (UNTRANSLATED, ""):
            out[key] = text
    return out
