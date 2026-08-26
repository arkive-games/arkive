"""Execute the client's data tables and resolve their localized text.

A table file is a chunk that builds one big Lua table and returns it. Reading
the bytecode's constants is not enough: LuaJIT stores a table constructor as a
*template* whose non-constant fields are ``nil`` placeholders, filled in by the
instructions that follow. In ``TrainTradeGoodsData`` that is every localized
field (``GoodsDesc``, ``GoodsNameTextID``, ``GoodsDescStation``), so a
constants-only reader silently returns rows with no names.

So the chunk is run instead, on the LuaJIT that ships inside ``lupa``, with the
client's globals stubbed. The one call the tables make is
``Game.TableDataManager:GetLangStr(id)``; the stub records the id and
:func:`resolve_text` substitutes the string afterwards from the
``StringDB_CN_Data_*`` shards, which are themselves tables of the same kind.
"""

from __future__ import annotations

import re
from pathlib import Path

from .luac import decrypt_file

EXCEL_DIR = "C7/Content/ScriptOPCode/Data/Excel"
LANGUAGE_DIR = "LanguageData"
STRING_DB_GLOB = "StringDB_CN_Data*.luac"

# The stub formats ids with %d, never tostring(): tostring() is %.14g, which
# silently truncates the client's 16-digit text ids and makes every lookup miss.
_PRELUDE = rb"""
local function fmt(id)
  if type(id) == "number" then return string.format("%d", id) end
  return tostring(id)
end
local function langstr(_, id) return "@LANG:" .. fmt(id) end
local function langsplit(_, id) return "@LANG:" .. fmt(id) end
Game = { TableDataManager = { GetLangStr = langstr, GetLangStrSplit = langsplit } }
-- Any other client global resolves to something inert and callable, so a table
-- that touches an unrelated subsystem still loads instead of erroring.
local function inert()
  return setmetatable({}, {
    __index = function() return inert() end,
    __call = function() return nil end,
  })
end
setmetatable(Game.TableDataManager, {__index = function() return function() return nil end end})
setmetatable(_G, {__index = function() return inert() end})
"""

_LANG_MARKER = re.compile(r"^@LANG:(\d+)$")


def _lua_runtime():
    # Imported lazily so the pure-logic tests need no native LuaJIT build.
    from lupa.luajit21 import LuaRuntime

    runtime = LuaRuntime(encoding=None)
    runtime.execute(_PRELUDE)
    return runtime


def _to_python(value, runtime_seen: frozenset[int] = frozenset()):
    from lupa.luajit21 import lua_type

    kind = lua_type(value)
    if kind is None:
        if isinstance(value, bytes):
            return value.decode("utf-8")
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return value
    if kind != "table":
        raise ValueError(f"unexpected Lua {kind} in table data")
    if id(value) in runtime_seen:
        raise ValueError("cyclic table in table data")
    runtime_seen = runtime_seen | {id(value)}
    keys = list(value.keys())
    if keys and all(isinstance(k, int) for k in keys) and sorted(keys) == list(range(1, len(keys) + 1)):
        return [_to_python(value[k], runtime_seen) for k in sorted(keys)]
    out = {}
    for key in keys:
        name = key.decode("utf-8") if isinstance(key, bytes) else key
        if isinstance(name, float) and name.is_integer():
            name = int(name)
        out[str(name)] = _to_python(value[key], runtime_seen)
    return out


def load_table(excel: Path, name: str, subdir: str = "") -> dict:
    """Run one table file and return its ``data`` payload as plain Python.

    ``excel`` is the exported ``.../Data/Excel`` directory; ``name`` is the
    table's stem (``TrainTradeGoodsData``).
    """
    path = Path(excel) / subdir / f"{name}.luac"
    dump = decrypt_file(path)
    runtime = _lua_runtime()
    loader = runtime.eval(b"function(b) return assert(loadstring(b))() end")
    result = _to_python(loader(dump))
    if not isinstance(result, dict):
        raise ValueError(f"{path}: chunk returned {type(result).__name__}, expected a table")
    # Tables wrap their rows in `data`; a few return the rows directly.
    return result.get("data", result)


def load_strings(excel: Path) -> dict[str, str]:
    """Every ``zh-CN`` string in the client, merged across all shards.

    Sharding is by subsystem (``traingame``, ``itemnormal``, …) but ids are
    global and a table freely references another subsystem's text, so the whole
    set is loaded rather than just the shard a table names.
    """
    directory = Path(excel) / LANGUAGE_DIR
    strings: dict[str, str] = {}
    for path in sorted(directory.glob(STRING_DB_GLOB)):
        strings.update(load_table(excel, path.stem, LANGUAGE_DIR))
    if not strings:
        raise FileNotFoundError(f"no {STRING_DB_GLOB} under {directory}")
    return strings


def resolve_text(value, strings: dict[str, str]):
    """Replace ``@LANG:<id>`` markers with their ``zh-CN`` text, recursively.

    An id with no string is left as its marker rather than blanked, so a missing
    shard shows up in the output instead of turning into an empty label.
    """
    if isinstance(value, str):
        match = _LANG_MARKER.match(value)
        return strings.get(match.group(1), value) if match else value
    if isinstance(value, dict):
        return {k: resolve_text(v, strings) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_text(v, strings) for v in value]
    return value


def unresolved_ids(value, found: set[str] | None = None) -> set[str]:
    """Text ids still unresolved in ``value`` — the pipeline's own check."""
    found = set() if found is None else found
    if isinstance(value, str):
        match = _LANG_MARKER.match(value)
        if match:
            found.add(match.group(1))
    elif isinstance(value, dict):
        for item in value.values():
            unresolved_ids(item, found)
    elif isinstance(value, list):
        for item in value:
            unresolved_ids(item, found)
    return found
