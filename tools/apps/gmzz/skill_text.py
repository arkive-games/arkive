"""Render offline skill text without exposing client formula tokens."""

import re

FORMULA_MARK = "\u2026"
FORMULA = re.compile(r"[A-Za-z]*disc\(\*id\)|\*(?:id|[dfs])(?![A-Za-z0-9_])")
PRODUCT = re.compile(r"mul\([^()]*\)")


def skill_text(text: str) -> str:
    """Keep literal percentages; mark values that require the running client."""
    text = FORMULA.sub(FORMULA_MARK, text).replace("**", "%")
    # A product containing an unavailable operand is also unavailable. Collapse
    # inside out so the client's nested arithmetic never appears as UI prose.
    while True:
        rendered = PRODUCT.sub(lambda match: FORMULA_MARK if FORMULA_MARK in match[0] else match[0], text)
        if rendered == text:
            return text
        text = rendered


def has_formula(*texts: str) -> bool:
    return any(FORMULA.search(text) for text in texts)
