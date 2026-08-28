# Ragnarok Online 3 — pipeline notes

How to run this pipeline and what it produced. The **formats** — the `RO3V` container, the
block-0 cipher, the Lua and IL2CPP layers, and the readings that turned out wrong — are
recorded once in [`docs/ro3-asset-formats.md`](../../../docs/ro3-asset-formats.md); this
file does not repeat them.

## Order

```bash
uv run python -m ro3.unpack --workers 6      # VFS -> decrypted standard bundles (RO3_STAGE)
uv run python -m ro3.catalog --workers 10    # -> catalog.jsonl beside those bundles
uv run python -m ro3.art                     # -> WebP in RO3_RES_OUT, art.json in RO3_DATA_OUT
uv run python -m ro3.export_data             # -> the asset-side tables in RO3_DATA_OUT
uv run python -m ro3.export_config           # -> skills, job skills, npcs, locales
```

Both export stages stamp `version.json` from the directory's contents, so whichever runs
last leaves it correct. `export_config` needs neither `unpack` nor `catalog` -- it reads the
`.bytes` containers directly, and only its icon join wants `RO3_RES_OUT` populated by `art`.
`containers.py` reads the game directly and depends on none of the above.

`unpack` is the integration seam: after it, the staging directory holds 188,361 **ordinary
Unity bundles**. Each output file is byte-identical to its input except for the first
`min(len(block0), 1280)` bytes of block 0, so nothing downstream — unex, AssetStudio,
AssetRipper — needs to know that either RO3V or FairGuard exists.

## Measured, on build 0.0.1.14

| stage | result |
|---|---|
| `unpack` | 4,852 containers + 627 bare bundles -> **188,361** bundles, **172,482** LZ4-verified, **0 failures**, 11.7 GB |
| `unex doctor` | mounted 188,361; **188,361/188,361 loaded**; type tree present on all 188,514 bundle sub-files; 52 sub-file failures |
| `catalog` | 174,725 named objects, 0 failures: 53,594 Texture2D, 51,733 Material, 21,774 MonoBehaviour, 19,895 Sprite, 17,930 Mesh, 8,653 AnimationClip, 710 TextAsset, 434 SpriteAtlas, 2 Font |
| `art` | 3,180 WebP written, **0 unresolved** |
| `export_data` | 1,106 skill icons, 184 talents, 123 boss models, 294 monster portraits, 108 scenes (17 dungeons), 6 jobs |
| `lua` | 14,479/14,479 chunks deobfuscated, 0 failures, 0 structural defects, all accepted by a stock Lua 5.4 loader |
| `export_config` | 8,348 skill level rows (3,387 skills), 3,160 job-skill rows, 3,944 NPC rows, 7 language tables (33,514 ids) |

`unex doctor --profile ro3` reports one failure, **"no AssetBundle objects"**. That check
encodes a V Rising fact — V Rising's bundles contain none — while RO3's contain one each.
It is a profile mismatch rather than a defect, and those objects are the reason RO3 has any
bundle-level naming at all.

## Why there is both a catalogue and unex

Building unex's virtual filesystem over the whole stage deserializes every object in the
game. Measured: still running after 35 minutes and past 2 GB resident, nowhere near done.
`catalog.py` reads only the object table — class id and `m_Name`, no field data — and covers
the same 188,361 bundles in **2 minutes**. The catalogue then picks the ~400 bundles an
export actually needs, and *those* are mounted, in seconds.

So the two are not redundant. `catalog.py` is the index; unex is the decoder, and stays the
only thing here that deserializes a Unity object or decodes a texture format.

## The Lua tables

`lua.py` undoes RO3's four-layer Lua obfuscation and `lua_tables.py` runs the chunks, so the
game's own `Config/DataConfig` tables are readable. The formats doc has the layers; what matters
when running this is:

* **A table ships once per multiverse.** `LuaScript/Config/DataConfig/SkillConfig.lua` holds the
  7,355 rows every variant shares, `LuaMultiverse/M101` adds 623 and `M102` adds 370, all three
  declare `m_kCount = 8348`, and 7,355 + 623 + 370 = 8,348. The shared rows are byte-identical
  across the copies (0 conflicts, asserted in the tests) and each row's own `_kMultiverseArray`
  says which copy it belongs to — `[0]`, `[101]` or `[102]`. So the union is the whole authored
  table, and `union_rows` reports the arithmetic in every file it writes.
* **Rows inherit their defaults through `__index`.** Read a row with `next` and you get only the
  columns that differ from its column template; the merge is what makes a row complete.
* **`require` has to be stubbed, chainably.** Config chunks call into engine modules while
  building their table. The stub answers every field with a no-op that returns the stub, so
  `Lua_DBManager.GetInstance():Register(...)` resolves. Verified equivalent to a nil-returning
  stub: both produce byte-identical output over all 68 emitted files.
* **`m_kValues` can come back as a JSON array.** Row ids that happen to be a dense `1..N` run
  make the Lua table a *sequence*, which serializes as an array; `lua_tables.rows` re-keys it
  from 1, which is exact rather than a guess.
* **Serialize inside Lua, parse once in Python.** Crossing the lupa boundary per field costs
  minutes on a 7,725-row table; Lua writing JSON and Python parsing it costs about a second.
  Object keys are sorted on the way in, so a re-run is byte-stable despite Lua's hash order.

## What is not in the client

**This section used to say skill text and numbers were not shipped. That was wrong, and the
reason it was wrong is worth keeping.** Every observation below is still true; the inference
drawn from them was not. The tables are in the Lua, and the fourth line below — "the Lua string
constants are separately encrypted" — was the open problem, not a closed door.

* `MG_Define.proto` declares 83 `Asset_*` config-table message types (`Asset_SkillGrowth`,
  `Asset_MultiDungeon`, `Asset_GrowthClass`, ...) and **no rows ship with them**.
* No bundle holds a config table either. Of 188,361: the 710 `TextAsset` objects are all
  Spine `.atlas`/`.skel` and GPU-skinning data, and the 20,948 named `MonoBehaviour`
  objects are scene, render and Spine settings (`sc_*` 17,952 of them, `Model_*` 1,673,
  `GfxLodConfig`, `SkeletonData`, ...).
* The Lua string constants and `global-metadata.dat` are both separately encrypted — see
  sections 3 and 4 of the formats doc. **The Lua side is now solved** (`lua.py`); the IL2CPP
  metadata still is not, and turned out not to matter.
* The localization bundles (`<hash>.bundle.korean`, `.english`, ...) are **text rendered as
  images**: 158 objects, every one a Texture2D or Sprite. They are not string tables.

What the **asset** side holds is the identifier space: skill *icons* and the family token their
names carry, job icons, boss models and their LODs, monster portraits, the scene manifest. Those
rows are keyed by a name the game itself uses and carry no display name, description or number —
that is a property of the bundles, not of the client. `export_config` supplies the names, the
descriptions and the numbers, and joins them to this art by icon name.

## Traps

* **`keystream(head, n)` depends on `n` as well as the head.** A block shorter than 1,280
  bytes is not a prefix of the 1,280-byte case; the key material is entirely different.
* **Unity texture space counts from the bottom.** An atlas `textureRect` at `y = 0` is the
  *bottom* row of the page. Cropping without the flip gives icons that look plausible and
  are wrong.
* **`.hd` / `.ld` bundles are the same art at another resolution.** Three bundles carry each
  atlas; exporting all three writes the same icon name three times at three sizes.
* **337 bare bundles ship under other extensions** (`.hd`, `.ld`, `.korean`, ...). They are
  real UnityFS images, and a suffix-driven reader walks straight past them, so `unpack.py`
  gives every output a `.bundle` name.
* **A stray control byte in the docs.** `\x1eLua` written through a Python replacement in a
  non-raw string becomes the literal 0x1E byte, which renders as nothing and silently deletes
  the point being made. Escape the backslash, or build the literal with `chr(92)`.
* **Unicorn provokes a *handled* access violation while mapping memory on Windows.**
  Python's faulthandler, which pytest enables, prints a full traceback for it before Unicorn
  recovers. `fairguard.py` suppresses faulthandler around exactly that block, and nowhere
  else.
