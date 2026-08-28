"""Tests for the Lua 5.4 deobfuscator.

Almost everything here runs without the game: the four layers are all length-preserving
and individually invertible, so a stock chunk produced by Lua's own ``string.dump`` can be
put *through* the obfuscation here and then recovered, which exercises the same code paths
the shipped chunks do.

The two tests that read shipped chunks are skipped when ``RO3_GAME`` is unset.
"""

from __future__ import annotations

import struct

import pytest

from ro3 import lua
from ro3.env import optional_dir, require_dir  # importing it also loads tools/.env


def lua_runtime(*, binary: bool = False):
    """A Lua 5.4 state. ``binary`` returns Lua strings as bytes rather than decoding them,
    which a chunk dump requires -- ``LUAC_DATA`` alone is not valid UTF-8."""
    lupa = pytest.importorskip("lupa.lua54")
    return lupa.LuaRuntime(
        unpack_returned_tuples=False, **({"encoding": None} if binary else {})
    )


def stock_chunk(source: str) -> bytes:
    """A genuine, unobfuscated Lua 5.4 dump of ``source``."""
    runtime = lua_runtime(binary=True)
    dump = runtime.eval(
        'function(src) local f = assert(load(src, "@fixture.lua")) return string.dump(f) end'
    )
    # A str would arrive as a Python object under encoding=None; bytes become a Lua string.
    return bytes(dump(source.encode("utf-8")))


def obfuscate(data: bytes) -> bytes:
    """Apply all four layers -- the inverse of :func:`lua.full`.

    Only tests need this direction, and having it is the point: a round trip proves the
    reader inverts the writer rather than merely producing something that parses.
    """
    parts = lua.layout(data)
    out = bytearray(data)
    for offset, count in parts.codes:
        for i in range(count):
            at = offset + 4 * i
            out[at] = (out[at] & 0x80) | lua.OP_ENC[out[at] & 0x7F]
    encoded = bytes(out)
    out = bytearray(encoded)
    for offset, length in parts.strings:
        out[offset : offset + length] = lua.encrypt_string(encoded[offset : offset + length])
    for offset, count in parts.codes:
        if not count:
            continue
        key = lua.code_key(count)
        words = struct.unpack_from(f"<{count}I", encoded, offset)
        struct.pack_into(f"<{count}I", out, offset, *[w ^ key for w in words])
    return lua.SIG_GAME + bytes(out)[4:]


# --- layer 2: the string chain ---------------------------------------------------------


def test_string_chain_is_keyed_by_the_string_length():
    plain = b"@fixture.lua"
    cipher = lua.encrypt_string(plain)
    assert cipher[0] == plain[0] ^ (len(plain) & 0xFF)
    for i in range(1, len(plain)):
        assert cipher[i] == plain[i] ^ cipher[i - 1]
    assert lua.decrypt_string(cipher) == plain


def test_string_chain_round_trips_at_every_length_that_changes_the_key():
    for length in (1, 2, 3, 16, 255, 256, 257, 512):
        plain = bytes((i * 7 + 3) & 0xFF for i in range(length))
        assert lua.decrypt_string(lua.encrypt_string(plain)) == plain


def test_the_same_plaintext_at_two_lengths_differs_by_the_length_xor():
    # The observation that exposed the layer: pad a string and only the first byte of the
    # keystream changes, by exactly the xor of the two lengths.
    a = lua.encrypt_string(b"ABCD")
    b = lua.encrypt_string(b"ABCDE")
    assert a[0] ^ b[0] == (len(b"ABCD") ^ len(b"ABCDE")) & 0xFF


def test_empty_string_is_left_alone():
    assert lua.encrypt_string(b"") == b""
    assert lua.decrypt_string(b"") == b""


# --- layer 3: the instruction key ------------------------------------------------------


def test_code_key_is_the_instruction_count_replicated_into_both_halves():
    assert lua.code_key(1) == 0x0001_0001
    assert lua.code_key(0x1234) == 0x1234_1234
    # Above 0xffff the halves overlap, which is why the main proto is keyed off its known
    # first instruction instead of off this closed form.
    assert lua.code_key(0x1_0000) == 0x0001_0000
    assert lua.code_key(0x1_0001) & 0xFFFF_FFFF == lua.code_key(0x1_0001)


# --- layer 4: the opcode rotation ------------------------------------------------------


def test_opcode_rotation_is_a_permutation_and_inverts():
    assert len(lua.OP_ENC) == lua.NUM_OPCODES == 83
    assert sorted(lua.OP_ENC) == list(range(83))
    for stock in range(83):
        assert lua.OP_DEC[lua.OP_ENC[stock]] == stock


def test_opcode_rotation_moves_only_the_documented_range():
    assert lua.OP_ENC[0] == 0
    for stock in range(54, 83):
        assert lua.OP_ENC[stock] == stock
    rotated = {lua.OP_ENC[stock] for stock in range(1, 54)}
    assert rotated == set(range(1, 54))
    assert lua.OP_ENC[1] == 21  # ((1 + 19) % 53) + 1
    assert lua.OP_ENC[34] == 1  # ((34 + 19) % 53) + 1
    assert lua.OP_ENC[53] == 20


# --- all four layers, over a real Lua dump ---------------------------------------------

FIXTURE = """
local t = {m_kCount = 3, m_kValues = {}}
for i = 1, 3 do
  t.m_kValues[i] = {_iID = i, _kName = "row " .. i}
end
local function helper(a, b) return a + b, a - b end
t.sum = helper(2, 3)
return t
"""


def test_full_recovers_the_stock_chunk_byte_for_byte():
    stock = stock_chunk(FIXTURE)
    assert lua.full(obfuscate(stock)) == stock


def test_layers_one_to_three_leave_exactly_the_opcodes_wrong():
    """``deobfuscate`` alone is not enough, and what it leaves wrong is only the opcodes."""
    stock = stock_chunk(FIXTURE)
    obfuscated = obfuscate(stock)
    assert obfuscated != stock
    assert obfuscated[:4] == lua.SIG_GAME

    partial = lua.deobfuscate(obfuscated)
    assert partial != stock
    assert len(partial) == len(stock)

    opcode_bytes = {
        offset + 4 * i for offset, count in lua.layout(stock).codes for i in range(count)
    }
    differing = {i for i in range(len(stock)) if partial[i] != stock[i]}
    assert differing, "the fixture must contain at least one rotated opcode"
    assert differing <= opcode_bytes
    assert lua.unmap_opcodes(partial) == stock


def test_the_recovered_chunk_actually_runs():
    runtime = lua_runtime()
    recovered = lua.full(obfuscate(stock_chunk(FIXTURE)))
    result = runtime.eval('function(b) return assert(load(b, "=t", "b"))() end')(recovered)
    assert result["m_kCount"] == 3
    assert result["m_kValues"][2]["_kName"] == "row 2"


def test_source_is_readable_before_and_after_deobfuscation():
    stock = stock_chunk(FIXTURE)
    obfuscated = obfuscate(stock)
    assert lua.peek_source(obfuscated) == "@fixture.lua"
    assert lua.chunk_source(lua.full(obfuscated)) == "@fixture.lua"


# --- the structural scanner ------------------------------------------------------------


def test_layout_rejects_a_chunk_that_is_not_a_lua_dump():
    with pytest.raises(ValueError, match="signature"):
        lua.layout(b"\x1bLup" + bytes(32))


def test_layout_rejects_trailing_bytes():
    stock = stock_chunk("return 1")
    with pytest.raises(ValueError, match="trailing"):
        lua.layout(stock + b"\x00")


def test_layout_finds_one_code_buffer_per_proto():
    # The fixture has the main proto plus `helper` and the loop body is inline, so at least
    # two protos, and the main proto is always first.
    parts = lua.layout(stock_chunk(FIXTURE))
    assert len(parts.codes) >= 2
    assert parts.codes[0][0] < parts.codes[1][0]
    assert parts.strings, "the source name is always dumped"


# --- script_path -----------------------------------------------------------------------


def test_script_path_trims_both_build_roots():
    game = (
        "@E:/workspaces/build/UnSafeDepot/Client_Editor/Assets/Script/"
        "LuaMultiverse/M102/Config/DataConfig/SkillConfig.lua"
    )
    assert lua.script_path(game) == "LuaMultiverse/M102/Config/DataConfig/SkillConfig.lua"
    editor = (
        "@E:/workspaces/build/Client_Editor/Assets/Editor/Language/Resources/"
        "ChineseSimplified/Script/LuaScript/Localization_zh_CN.lua"
    )
    assert lua.script_path(editor) == (
        "Language/Resources/ChineseSimplified/Script/LuaScript/Localization_zh_CN.lua"
    )


def test_script_path_reports_an_unrecognised_source_rather_than_guessing():
    assert lua.script_path(None) is None
    assert lua.script_path("@/tmp/scratch.lua") is None


# --- shipped chunks --------------------------------------------------------------------

needs_game = pytest.mark.skipif(
    optional_dir("RO3_GAME") is None,
    reason="RO3_GAME is unset: the game is not installed here",
)

SAMPLE_CHUNKS = 40


@needs_game
def test_shipped_chunks_decode_and_load():
    """Decode real chunks and hand each to a stock Lua 5.4 loader.

    Capped at the first :data:`SAMPLE_CHUNKS` so this stays a test rather than a full
    corpus audit; ``python -m ro3.lua_tables`` is the way to sweep all 14,479.
    """
    from ro3.containers import data_containers, iter_payloads

    runtime = lua_runtime()
    load = runtime.eval('function(b) return (load(b, "=c", "b")) ~= nil end')
    root = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    seen = 0
    for container in data_containers(root):
        for payload in iter_payloads(container):
            if payload.kind != "lua-bytecode":
                continue
            source = lua.peek_source(payload.data)
            assert source and source.startswith("@"), f"unreadable source in {payload.name}"
            chunk = lua.full(payload.data)
            assert chunk[:4] == lua.SIG_REAL
            assert load(chunk), f"stock Lua 5.4 rejected {payload.name}"
            seen += 1
            if seen >= SAMPLE_CHUNKS:
                return
    pytest.fail("no Lua chunk found under RO3_GAME")


@needs_game
def test_shipped_chunk_sources_are_build_paths():
    from ro3.containers import data_containers, iter_payloads

    root = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    scripts = []
    for container in data_containers(root):
        for payload in iter_payloads(container):
            if payload.kind != "lua-bytecode":
                continue
            scripts.append(lua.script_path(lua.peek_source(payload.data)))
            if len(scripts) >= SAMPLE_CHUNKS:
                break
        if len(scripts) >= SAMPLE_CHUNKS:
            break
    assert scripts, "no Lua chunk found under RO3_GAME"
    assert all(s and s.endswith(".lua") for s in scripts)
