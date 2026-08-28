"""Execute Ragnarok Online 3's Lua config tables and read them back as Python data.

Every ``Config/DataConfig/<Name>Config.lua`` chunk is a module that returns one table of
the shape::

    { m_kCount = 7725, m_kValues = { [1110601] = { _iSkillID = 11106, ... }, ... } }

so the honest way to read it is to *run* it, in a Lua 5.4 interpreter, with a sandboxed
environment. That is what this module does, over :mod:`lupa`. Nothing is pattern-matched
out of the bytecode.

Two details make the rows readable:

* **Rows share their defaults through a metatable.** Each row's ``__index`` points at a
  template holding every field whose value is the column default, and only the differing
  fields are stored on the row itself. Reading a row with ``next`` therefore misses most of
  its columns; :func:`load_table` merges the template in (``merge_defaults=True``).
* **``require`` must not resolve.** A config chunk pulls in engine modules that are not
  present and would not run headless anyway. The sandbox answers every ``require`` with a
  table whose ``__index`` mints a no-op function on demand, so a chunk that calls into the
  engine while building its table gets ``nil``-free silence instead of an error.

The serialization hop is deliberate: converting a 7,725-row table field by field across the
Python/Lua boundary costs minutes, while Lua writing JSON and Python parsing it once costs
seconds. Key order out of Lua's ``next`` is hash order, so :func:`load_table` sorts every
object's keys on the way in and the result is byte-stable across runs.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator

from . import lua
from .containers import data_containers, iter_payloads

#: Serializes the table a config chunk returns, in Lua, to a JSON string.
#:
#: Written as Lua rather than Python because it runs once per row instead of once per
#: field-crossing. ``string.char`` builds the quote and backslash literals so this source
#: needs no escaping of its own when embedded here.
_SERIALIZE_LUA = r"""
local QUOTE = string.char(34)
local SLASH = string.char(92)
local ESCAPE = {
  [QUOTE] = SLASH .. QUOTE,
  [SLASH] = SLASH .. SLASH,
  [string.char(8)]  = SLASH .. 'b',
  [string.char(12)] = SLASH .. 'f',
  [string.char(10)] = SLASH .. 'n',
  [string.char(13)] = SLASH .. 'r',
  [string.char(9)]  = SLASH .. 't',
}
local CONTROL = '[%c' .. QUOTE .. SLASH .. ']'
local UESCAPE = SLASH .. 'u%04X'

local function jsonstring(v)
  return QUOTE .. (v:gsub(CONTROL, function(c)
    return ESCAPE[c] or string.format(UESCAPE, c:byte())
  end)) .. QUOTE
end

local function scalar(v)
  local t = type(v)
  if t == 'string' then return jsonstring(v) end
  if t == 'boolean' then return tostring(v) end
  if t == 'number' then
    if math.type(v) == 'integer' then return tostring(v) end
    if v ~= v or v == math.huge or v == -math.huge then return 'null' end
    return string.format('%.17g', v)
  end
  return 'null'
end

-- A stub module: every field read yields a no-op function, and that function returns the
-- stub, so a chained engine call (Lua_DBManager.GetInstance():Register(...)) resolves
-- instead of indexing nil. Measured: emitting the tables with a nil-returning stub and
-- with this one gives byte-identical output, so the extra permissiveness changes no
-- branch any config chunk actually takes.
local STUB = setmetatable({}, {__index = function(t, k)
  local noop = function() return t end
  rawset(t, k, noop)
  return noop
end})

return function(chunk, merge_defaults, max_depth)
  local env = setmetatable({require = function() return STUB end}, {__index = _G})
  local fn, err = load(chunk, "=ro3", "b", env)
  if not fn then return nil, "load: " .. tostring(err) end
  local ok, result = pcall(fn)
  if not ok then return nil, "run: " .. tostring(result) end
  if type(result) ~= 'table' then return nil, "returned " .. type(result) end

  local buf, n = {}, 0
  local function emit(s)
    n = n + 1
    buf[n] = s
  end

  -- Raw fields plus anything inherited from the row's __index template.
  local function fields(t)
    if not merge_defaults then
      local count = 0
      for _ in next, t do count = count + 1 end
      return t, count
    end
    local merged, count = {}, 0
    local mt = getmetatable(t)
    local base = mt and rawget(mt, '__index')
    if type(base) == 'table' then
      for k, v in next, base do merged[k] = v end
    end
    for k, v in next, t do merged[k] = v end
    for _ in next, merged do count = count + 1 end
    return merged, count
  end

  local function serialize(v, depth)
    if type(v) ~= 'table' then emit(scalar(v)) return end
    if depth > max_depth then emit(QUOTE .. '<depth>' .. QUOTE) return end
    local t, count = fields(v)
    if count > 0 and #t == count then
      emit('[')
      for i = 1, count do
        if i > 1 then emit(',') end
        serialize(t[i], depth + 1)
      end
      emit(']')
    else
      emit('{')
      local first = true
      for k, x in next, t do
        if not first then emit(',') end
        first = false
        emit(jsonstring(tostring(k)))
        emit(':')
        serialize(x, depth + 1)
      end
      emit('}')
    end
  end

  local done, serr = pcall(serialize, result, 0)
  if not done then return nil, "serialize: " .. tostring(serr) end
  return table.concat(buf), nil
end
"""

#: Nesting limit. The deepest real config nesting measured is 5; the cap only stops a
#: self-referential table from recursing forever.
MAX_DEPTH = 12

#: Rebuild the Lua state every N chunks. A single state accumulates every string constant
#: of every chunk it has run, which for the whole corpus is gigabytes.
STATE_CHUNKS = 200


class LuaError(RuntimeError):
    """A chunk failed to load, run, or serialize."""


@dataclass(frozen=True, slots=True)
class Chunk:
    """One compiled Lua chunk, already deobfuscated."""

    container: str
    index: int
    script: str | None
    data: bytes

    @property
    def name(self) -> str:
        """The script's file stem, or a container-relative id when the source is unreadable."""
        if self.script:
            return Path(self.script).stem
        return f"{self.container}_{self.index:05d}"


class Runner:
    """A recycled Lua 5.4 state that executes config chunks and returns Python data."""

    def __init__(self) -> None:
        self._runtime = None
        self._serialize = None
        self._used = 0

    def _state(self):
        if self._serialize is None or self._used >= STATE_CHUNKS:
            from lupa import lua54

            self._runtime = lua54.LuaRuntime(unpack_returned_tuples=True)
            self._serialize = self._runtime.execute(_SERIALIZE_LUA)
            self._used = 0
        self._used += 1
        return self._serialize

    def run(self, chunk: bytes, *, merge_defaults: bool = True):
        """Execute one deobfuscated chunk and return the table it returns.

        Object keys are sorted, so the same input always produces the same structure.
        """
        payload, error = self._state()(chunk, merge_defaults, MAX_DEPTH)
        if payload is None:
            raise LuaError(error if isinstance(error, str) else str(error))
        return json.loads(payload, object_pairs_hook=lambda kv: dict(sorted(kv)))


def iter_chunks(
    vfs_root: Path, keep: Callable[[str | None], bool] | None = None
) -> Iterator[Chunk]:
    """Every Lua chunk in the data containers, in container order.

    ``keep`` is applied to the chunk's script path *before* it is deobfuscated -- the
    source name is readable on its own (see :func:`.lua.peek_source`), so a selective walk
    pays for the structural scan of all 14,479 chunks but decodes only the wanted ones.
    """
    for container in data_containers(vfs_root):
        for payload in iter_payloads(container):
            if payload.kind != "lua-bytecode":
                continue
            script = lua.script_path(lua.peek_source(payload.data))
            if keep is not None and not keep(script):
                continue
            yield Chunk(payload.container, payload.index, script, lua.full(payload.data))


def collect_chunks(vfs_root: Path, keep: Callable[[str], bool]) -> dict[str, list[Chunk]]:
    """The chunks whose script path satisfies ``keep``, grouped by file stem.

    An export wants a few dozen of the 14,479 chunks, so it says which by predicate rather
    than reading them all. A stem maps to several chunks -- the client ships each
    ``Config/DataConfig/<Name>.lua`` again under every ``LuaMultiverse/M1xx/`` variant --
    so the value is a list, in container order.
    """
    found: dict[str, list[Chunk]] = {}
    for chunk in iter_chunks(vfs_root, lambda s: s is not None and keep(s)):
        found.setdefault(chunk.name, []).append(chunk)
    return found


def rows(table) -> dict[str, dict]:
    """The ``m_kValues`` map of a config table, keyed by its own row id as a string.

    Raises when the table is not shaped like a config table, rather than guessing -- a
    chunk that returns something else is not a table this pipeline knows how to read.
    """
    if not isinstance(table, dict) or "m_kValues" not in table:
        raise LuaError("not a config table: no m_kValues")
    values = table["m_kValues"]
    if isinstance(values, list):
        # Row ids that happen to be a dense 1..N run make the table a Lua *sequence*, and
        # a sequence serializes as a JSON array. Lua sequence keys start at 1, so the ids
        # are recoverable exactly; this is a re-keying, not a guess.
        return {str(i): row for i, row in enumerate(values, 1)}
    if not isinstance(values, dict):
        raise LuaError(f"m_kValues is {type(values).__name__}, not a map")
    return values
