# Ragnarok Online 3 — asset formats

Reference for the `ro3` pipeline. RO3 is Unity 2022.3.62f3, IL2CPP, protected by FairGuard,
published by bilibili. Nothing about its storage is standard, so this records what the formats
are, how they were established, and — as importantly — which plausible readings turned out to be
**wrong**, so they are not re-attempted.

Everything below is measured against the shipped client. Where a number appears, it is a count
that was actually run, not an estimate.

## 1. The `RO3V` container

Content lives in `ro3_Data/StreamingAssets/VFS` — 23,445 files, 24 GB, hash-named
(`<16hex>.bundle`) and sharded into `00/`..`ff/`. Most are not bare Unity bundles: an `RO3V`
container wraps one or more of them behind a **trailing** index.

```
0x00  char[4]  "RO3V"
0x04  uint32   version (observed 1)
0x08  uint64   indexOffset
0x10  uint64   indexLength        # indexOffset + indexLength == file size
...            sub-file payloads, the first starting at 0x18
@indexOffset:
      uint32   count
      count *  { uint64 id; uint64 offset }
      uint64   backPointer        # == indexOffset
```

So `indexLength == 4 + count*16 + 8`, and sub-file *i* spans `[offset_i, offset_{i+1})` with the
last ending at `indexOffset`.

What makes this reading certain rather than merely self-consistent: every embedded `UnityFS`
sub-file's own declared size equals the extent the index implies — **187,734 out of 187,734, no
mismatches**, across 4,852 containers.

Implemented by `tools/apps/ro3/vfs.py`.

The same tree also holds ~15.7k `HPY\0` files, which are **not** Unity bundles and must be
skipped rather than fed to a bundle reader, plus 627 bare `UnityFS` files with no wrapper.
Localisation is per-language *bundle variants* named `<hash>.bundle.<language>`
(chinesesimplified / chinesetraditional / english / korean / thai / vietnamese / indonesian),
not text catalogues.

## 2. Block-0 obfuscation (solved)

Inside each `UnityFS` sub-file, **only block index 0** is obfuscated, and within it **only the
first `min(blockLength, 1280)` bytes**. Blocks 1..N are ordinary LZ4 — 6,768 of them decompress
to their exact declared size with zero failures. The boundary is exact: per-offset zero-byte
frequency runs 0.0065 at offset 1279, 0.0547 at 1280, 0.2489 at 1281.

The transform is a byte-wise XOR keystream:

- `keystream[0:32]` is the constant `0xA6`, globally valid across all 41,246 sub-files.
- `keystream[32:n]`, `n = min(blockLength, 0x500)`, is five chunks — for `n = 1280`: 96, 288,
  288, 288, 288 at offsets 32 / 128 / 416 / 704 / 992. Each chunk is **RC4** with a 4-byte key
  (fresh KSA per chunk, same key), with the twist `out = rol8(rc4_byte, 1) - 0x61`, followed by
  an SSE pass XORing a repeating 4-byte word over whole 16-byte lanes only — so a short trailing
  lane keeps a different residual.
- The 24 bytes of key material (the RC4 key plus the five words) are a function of **both** the
  32-byte block-0 head **and** `n`; the same head at a different `n` yields a different key.

The generator lives in `FairGuardProtect.dll`, which is force-loaded because `UnityPlayer.dll`'s
import directory was rewritten to import a single symbol, `myfun`, from it. `myfun` is just
`xor eax,eax; ret` — the import exists only to get the DLL mapped. **`UnityPlayer.dll` itself is
unpatched.** FairGuard installs a trampoline that calls Unity's read and then
`deobfuscate(buffer, min(size, 0x500))`.

Verified end to end: 102,448/102,448 known keystream bytes, 9,347/9,347 full reconstructions, and
**3,638/3,638 sub-files over 1,400 bundles (100.00%)** decompressing to exactly their declared
uncompressed size after decryption.

### Wrong turns, recorded so they are not repeated

- **"The key is per-bundle."** Inferred from `C1^C2` being ~0.7% zero, near the 1/256 baseline.
  Unsound: `P1^P2` over two *misaligned* LZ4 streams is near-random too, so this measured a
  region difference, not key independence.
- **"The key is one global 1280-byte pad."** Inferred from 158 groups of sub-files where the
  encrypted middle was byte-identical. Circular — those groups were *defined* by having
  identical plaintext, and identical plaintext gives identical ciphertext under any
  deterministic keying. Falsified directly: `cipher[32:36] ^ "2f3\0"` (known plaintext, since
  the head decodes to a literal run carrying the version string) yields **6,596 distinct
  values** where a global pad requires one.
- **"The key derives from `(metadataSize, fileSize)`."** Counterexample at `ms=4141, fs=4588`,
  where two different LZ4 framings of the same head give different keystreams.
- **Byte-scanning the binaries for `0xA6` and `0x500`.** Both constants exist, but never as
  literals: `0xA6` is an xmmword in `.rdata` and `0x500` appears only as `min(size, 0x500)`.
  FairGuard's `.text` is not obfuscated at all and held the answer in the clear the whole time.
- **Recovering the keystream by shift-aligning bundle pairs.** 48M candidates, 205,291 relations
  passing a 32-byte anchor plus a 160-byte forward-agreement check, and not one pad byte reached
  80% consensus. LZ4 streams converge only in the shared string-buffer region and diverge before
  it, so forward alignment never extends backward into `[32,1280)`.

## 3. Unencrypted data containers

The 38 `*.bytes` files under the same VFS root are `RO3V` containers carrying **no obfuscation at
all**, and they hold the game's data rather than its scenes:

- `MG_Define.proto` (package `romsg`) — the full protobuf schema, naming **83 `Asset_*` config
  tables** (`Asset_SkillGrowth`, `Asset_MultiDungeon`, `Asset_GrowthClass`, `Asset_Genre`, …)
- JSON client settings, scene placement, and a scene export manifest
- the class/job name table
- the Lua set, including one 116 MB container with 13,515 compiled chunks

Lua bytecode is stock **Lua 5.4** put through **four length-preserving transforms**. All four
are undone by `tools/apps/ro3/lua.py`, whose `full()` turns a shipped chunk into a chunk a stock
5.4 `load(..., "b")` accepts. Measured on build 0.0.1.14: **14,479/14,479 chunks** decode, with
zero structural defects (every jump in range, every constant index in bounds, every proto ending
in a return, every string valid UTF-8) and every one accepted by a real loader.

1. **The signature byte.** `\x1eLua` where Lua writes `\x1bLua`. Every following header field
   (version `0x54`, `LUAC_DATA`, the 4/8/8 sizes, `LUAC_INT` `0x5678`, `LUAC_NUM` 370.5) is
   unmodified, which is why the chunk can be scanned for structure while still obfuscated.
2. **String constants — a CBC-style XOR chain keyed by the string's own length.**
   `C[0] = P[0] ^ (len & 0xff)`, then `C[i] = P[i] ^ C[i-1]`. The length is what exposed it: the
   per-file ciphertext delta between two dumps of the same plaintext is a constant equal to
   `len_a ^ len_b`, and `C[0] ^ len` recovers the leading `@` of a chunk name. Ruled out
   before that: repeating XOR keys of any period ≤ 24, and `g(i) = a*i`, `a*i²`, `a^i` for all
   256 values of `a` scored over 40 chunks at once.
3. **The instruction stream — XOR by the proto's own instruction count**, replicated into both
   halves of the 32-bit word: `key = sizecode ^ (sizecode << 16)`. Above `0xffff` the halves
   overlap and that closed form stops reproducing the key, so the *main* proto is keyed off its
   known first instruction instead (`VARARGPREP 0`, opcode `0x51`, which every main proto
   starts with). No nested proto in the corpus exceeds 2,029 instructions.
4. **The OpCode enum is rotated.** `OP_MOVE` (0) and everything from `OP_CLOSE` (54) up keep
   their stock number; the 53 opcodes in `[1..53]` are rotated by +20, so
   `encoded = ((stock + 19) % 53) + 1`. That is a permutation of the range, so it inverts
   exactly.

Layer 2 is why the chunks are also *selectable* cheaply: a chunk's source name is the first
string in the dump and is keyed only by its own length, so `lua.peek_source` reads it without
touching the rest — which is how an export picks a few dozen chunks out of 14,479 without
decoding them all.

The chunks decode to the game's real config tables. Each `Config/DataConfig/<Name>.lua` returns
`{m_kCount = N, m_kValues = {...}}`, with the rows sharing their column defaults through an
`__index` template, so reading one means *running* it — `tools/apps/ro3/lua_tables.py` does that
in a sandboxed Lua 5.4 state over `lupa`. **4,412 config tables execute**, including
`SkillConfig` (8,348 rows across its three multiverse copies), `NPCConfig`, `ItemConfig`,
`BuffConfig` and the seven `Localization_*` string tables (33,514 ids).

## 4. IL2CPP metadata

`global-metadata.dat` on disk is encrypted end to end — entropy 8.00 across all 23 MB, printable
ratio 0.37, with only the 4-byte sanity magic preserved and the version field reading
`1813808443`. Il2CppDumper cannot read it.

`GameAssembly.dll` itself is **not** packed: the `il2cpp` section is 69 MB at entropy 6.51,
ordinary x86-64. So the only thing missing for static analysis was names.

The C# side does not decrypt anything — `VFSLoader.LoadBundleFromVFS` resolves an offset and
calls `AssetBundle.LoadFromFile_Internal(path, 0, offset)`, leaving the read to Unity:

```csharp
// HappyEngine.Runtime.NewRuntimeSystem
class VFSLoader {
    FastGetVfsData(vfsFullPath, vfsName, bundleName) -> Ro3VFSData   // pure cache
    LoadBundleFromVFS(BundleFileMeta) -> AssetBundle
}
class Ro3VFSData { _bundleOffset; _bundleSize; _totalSize; GetBundleOffset(...); }
```

A dumper gotcha worth keeping: in Il2CppDumper's `script.json`, `ScriptMethod[].Address` is the
real function **RVA + 0x50**. Measured against the PE `.pdata` RUNTIME_FUNCTION table (309,530
entries), `a - 0x50` is an exact function start for 165,886 of 199,842 methods (83.0%) versus
16.0% for `a` itself. Disassembling at the reported address lands mid-prologue and decodes
garbage.

## 5. Addressing inside the bundles: names only, and icons only via atlases

With block 0 decrypted, the bundles are ordinary — but they carry **no asset paths**. Every
`AssetBundle` object's `m_Container` holds exactly one entry, whose key is the literal string
`asset`, and its `m_AssetBundleName` is just the bundle's own VFS-relative file name
(`eb/eb8688201f8e6b45.bundle`). There is no `Assets/...` anywhere: a scan for that prefix over
the decompressed payloads returns nothing.

So the only handle on an object is its `m_Name`, and those are descriptive enough to work with:
`icon_skill_acolyte_blessing`, `Model_Boss_BloodyKnightHigh_LOD0`, `headicon_monster_baphomet`,
`sm_sc_gvg_lingtuzhan_001_inst50_h`. Indexing all 188,361 bundles by name
(`tools/apps/ro3/catalog.py`) yields **174,725 named objects**: 53,594 Texture2D, 51,733
Material, 21,774 MonoBehaviour, 19,895 Sprite, 17,930 Mesh, 8,653 AnimationClip, 710 TextAsset,
434 SpriteAtlas, 2 Font.

**Every UI icon is packed into a sprite atlas, and cannot be read from its own Sprite.** A
`Sprite`'s `m_RD.texture` is a null `PPtr`, because Unity resolves the pixels at runtime through
the atlas; unex reports this honestly as `Sprite's m_RD.texture is null`. The join that does
work is:

```
Sprite.m_RenderDataKey  ->  SpriteAtlas.m_RenderDataMap[key].texture + .textureRect
```

The atlas is usually in a **different bundle** from the sprite (the 967 skill icons are in
`32/32e2c67eab5442bd.bundle`; their `Skill_Icon` atlas pages are in `b7/b73bec9b159e0cdf.bundle`),
and the sprite names it only by tag, in `m_AtlasTags`. 168 distinct atlases ship, each in three
bundles — the base plus `.hd` and `.ld` resolution variants of the same art.

`textureRect` is in Unity texture space, whose origin is the **bottom** left; bit 3 of
`settingsRaw` marks a sprite the packer rotated 90 degrees to make it fit.

Two consequences for tooling. First, an index built from the object table alone (class id plus
`m_Name`) covers the whole game in **2 minutes**, where building a full deserializing VFS over
the same bundles was still running after 35 minutes and past 2 GB resident — so selection and
decoding want to be separate steps. Second, **no config table exists in any bundle**: the 710
`TextAsset`s are Spine `.atlas`/`.skel` and GPU-skinning data, and the 20,948 named
`MonoBehaviour`s are scene, render and Spine settings. That is a fact about the *bundles* only, and for a
while it was read as a fact about the client: with §4's metadata encrypted too, "the `Asset_*`
rows are not in the client" looked like the conclusion. It was wrong. The rows are in the Lua
(§3), behind four layers rather than two, and the tables have been read since. What survives is
the narrower statement: **no config table is a Unity object**, so no amount of bundle work would
ever have found one.

## 6. Practical notes

- **Header endianness.** A Unity v22 SerializedFile header's extended fields are **big-endian**,
  like the legacy fields above them — the `m_Endianess` byte describes the asset data, not the
  header. Reading them little-endian rejects every valid file. Anchors: `version == 22` at
  `+0x08` BE, legacy `metadataSize`/`fileSize`/`dataOffset` all zero, endianness byte at `+0x10`,
  `unityVersion` string at `+0x30`, then `targetPlatform == 19` as a **little**-endian int32.
- `ro3_Data/level0` is a plain, unencrypted SerializedFile and is useful as known-good plaintext.
  `resources.assets`, `sharedassets0.assets` and `globalgamemanagers.assets` are not — they carry
  no version string at all.
- Unity keeps no contiguous copy of a SerializedFile after loading; it retains parsed metadata
  plus native object representations. Carving whole `.assets` files out of process memory
  therefore recovers object tables and type trees but never the data section, no matter how much
  address space is dumped.
