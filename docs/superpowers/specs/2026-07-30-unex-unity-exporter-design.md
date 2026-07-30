# unex — Unity asset export & exploration tool (design)

**Date:** 2026-07-30
**Status:** approved, ready for implementation planning
**Repo:** `E:/arkive-games/unex` (new sibling repo, not part of the arkive monorepo)
**Example game:** V Rising (`D:/SteamLibrary/steamapps/common/VRising`)

## 1. Goal

A headless Unity asset exporter and explorer, third member of a family of
engine-specific extraction tools that feed the arkive game-wiki pipeline:

| tool   | engine  | reader foundation            | example game       |
|--------|---------|------------------------------|--------------------|
| `uex`  | Unreal  | CUE4Parse (NuGet)            | AION2, Palworld    |
| `gdex` | Godot   | hand-written `.pck` reader   | Slay the Spire 2   |
| `unex` | Unity   | AssetsTools.NET (NuGet)      | **V Rising**       |

unex covers two distinct payloads:

1. **Classic Unity assets** — `UnityFS` bundles and serialized files → JSON, textures → PNG.
2. **Unity DOTS entity scenes** — `DOTSBIN!` `.entities` files → JSON, as far as they can be
   generically decoded, with honest coverage reporting.

Interpretation of the extracted data is explicitly *not* unex's job; that belongs to a
downstream `tools/` pipeline, exactly as uex's output feeds `tools/apps/palworld`.

## 2. Decisions

| decision | choice |
|---|---|
| Name | `unex` (Unity EXport) |
| Language / runtime | C# on .NET 10 |
| Reader foundation | `AssetsTools.NET` (MIT) |
| License | Apache-2.0 (family consistency; all dependencies are MIT) |
| Scope | Classic asset extraction **and** DOTS `.entities` parsing |
| DOTS ambition | Tiered, capped at blittable components ("strategy C") |
| DOTS success metric | Generic coverage, not any named dataset |
| Output layout | AssetStudio convention; type-first, GUID-qualified on collision |
| IL2CPP support | Optional and fail-soft, isolated in one file |
| Prefab name bridge | Optional profile field, `null` by default |

### 2.1 Why C#

The decisive argument is the DOTS tier. Reading values out of `.entities` means walking
2.15 GiB of packed native structs in 16 KiB archetype chunks — `Span<byte>`,
`MemoryMarshal`, `BinaryPrimitives`, explicit `StructLayout`, blittable reinterpret casts.
C# does that natively and at near-native speed; Python would need `struct.unpack` in a hot
loop or a native extension. The riskiest half of the project is the half C# suits best.

Supporting reasons: uex and gdex are already .NET 10 C# with the same skeleton, so unex
copies a proven structure rather than inventing one; `AssetsTools.NET.Cpp2IL` provides
in-process IL2CPP type templates with no subprocess; and AssetsTools.NET v3 does streaming
LZ4 block decompression, which matters across 4,409 bundles.

The counter-argument considered and rejected: the downstream `tools/` pipeline is Python
(uv), and `UnityPy` is more actively maintained. But the boundary between unex and `tools/`
is JSON on disk, so a language seam there costs nothing — that is already how uex feeds the
pipeline.

Also rejected: hand-writing the readers, as gdex did for Godot. Godot's `.pck` is a header
plus a file table; `UnityFS` bundles + serialized files + TypeTree + a built-in class
database is a far larger format surface that a mature MIT library already covers correctly.

### 2.2 Licensing constraint

`AssetRipper` core is **GPL-3.0**, and its `AssetRipper.SourceGenerated` Unity class model
is GPL-or-later on NuGet. It cannot be linked. Its satellite packages
(`AssetRipper.TextureDecoder`, `AssetRipper.Primitives`, `AssetRipper.Tpk`,
`AssetRipper.Conversions.*`) are separately MIT-licensed and separately published, and
those are used.

`Odjit/KindredExtract` (a V Rising runtime data dumper) is AGPL-3.0 — its source is not
linkable. Its *output* is game data and may be consumed.

## 3. Verified findings (Phase 0)

Everything in this section was measured, not assumed. Evidence locations in §12.

### 3.1 Game facts

- Unity **2022.3.58f1**, IL2CPP, build GUID `f68b60fd5e314b67bfa69034a4542378`.
  Confirmed three independent ways: `globalgamemanagers` header, the `unityRevision` field
  in every bundle header, and IL2CPP metadata version 31.
- `VERSION` → `VRising: v1.1.13.0-r99712-b17 (202605251526)`.
- `StreamingAssets/ContentArchives/` — 4,411 files: **4,409 extensionless `UnityFS`
  bundles** (3.48 GiB) plus `archive_dependencies.txt` (3,134,616 B, 66,422 lines) and
  `archive_dependencies.bin`. Every bundle verified `UnityFS` format version 8, generation
  `5.x.x`, revision `2022.3.58f1`, flags `0x243` (LZ4HC +
  `BlocksAndDirectoryInfoCombined` + `BlockInfoNeedPaddingAtStart`). **No encryption, no
  custom container, no header obfuscation.**
- `StreamingAssets/EntityScenes/` — 1,183 `.entities` (2,305,196,115 B), 218
  `.entityheader`, 1 `scene_info.bin`.
- Classic serialized files total ~113 MB and hold **bootstrap and UI shell only**: just two
  scenes (`Assets/Scenes/UIEntryPoint.unity`, `Assets/Scenes/VRisingWorld/VRisingWorld.unity`).
- `il2cpp_data/Metadata/global-metadata.dat` — 36,381,944 B, metadata version **31**,
  unencrypted. `GameAssembly.dll` — 247,473,480 B.
- `StreamingAssets/Localization/` — 19 plain UTF-8 JSON files (19 languages). Two top-level
  arrays: `Codes` (28 rich-text macros) and `Nodes`, where each node is
  `{ "Guid": "...", "Text": "..." }` — **bare GUID, no name, no category**.
- **Trap:** `D:/SteamLibrary/steamapps/common/VRising/v3/` is a **complete second game
  install** (V Rising `v1.0.10.4-r91333-b12`, 8.86 GiB) with its own ContentArchives and
  EntityScenes. It must never be walked as part of the current version.

### 3.2 Bundles carry no asset paths

Swept **all 4,409 bundles / 489,455 objects**: **zero** `AssetBundle` (class ID 142)
objects. No `m_Container`, no `m_AssetBundleName`, therefore no asset paths.
`archive_dependencies.txt` contains no paths either — its `Object:` entries are
`<32-hex-guid>:<localId>` source-asset GUIDs, and the file contains no `assets/`, no
`.png`, no `.prefab`.

The only stable address is **`(bundle GUID, PathID)`**. Usable naming comes from `m_Name`:

- non-empty on **176,430 / 489,455 objects (36.0%)**, 56,570 distinct strings;
- **100% of Texture2D (11,194/11,194) and 100% of Sprite (4,011/4,011) are named**, which
  is what matters for art extraction;
- names are clean and semantic (`MapIcon_Trader`, `MiniMapMask`,
  `ZoneMap_StartCrypt_VRisingWorld`, `Stunlock_Icon_Structure_GothicWindowTransparent03`).

`archive_dependencies.txt` does yield a complete inter-bundle dependency graph: 4,410
`Archive:` / 4,410 `File:` / 1,151 `Object:` / 56,451 `Dependency:` lines.

### 3.3 TypeTrees are embedded in bundles, stripped in classic files

`SerializedFile.Metadata.TypeTreeEnabled` is **`true` on 4,409/4,409 bundles** and
**`false` on all 5 classic files**. Sampled bundles carry 1,462 type entries with node
counts min 7 / median 31 / max 3,848, **zero** zero-node entries and **zero**
`IsStrippedType`.

The embedded trees preserve real MonoBehaviour field layouts, including custom struct names
and PPtr target types:

```
MonoBehaviour Base
  PPtr<$AnimationCollection> SourceCollection
  AnimationMapping AnimationMaps
    Array Array
      AnimationMapping data
        string Source
        int Layer
```

**Consequence: the 3.48 GiB of bundles need no IL2CPP work at all.** IL2CPP is required
only for MonoBehaviour fields in the 5 classic files (~910 objects).

### 3.4 IL2CPP works, but is fragile

Out of the box it fails: V Rising exceeds LibCpp2IL's hardcoded `0xC0000` sanity limit
(`Failed to find code registration or metadata registration!`). It works only with:

- `LibCpp2IL.LibCpp2IlMain.Settings.AllowManualMetadataAndCodeRegInput = true`;
- the metadata-registration address **`18CB18A40` supplied as bare hex** (a `0x` prefix is
  silently parsed as 0). Code registration auto-detects correctly at `0x18A1D19D0`. Of the
  two rejected candidates only `18CB18A40` is correct — `18CB18A30` fails later at
  "Reading types";
- `Samboy063.LibCpp2IL` pinned to **`2022.1.0-pre-release.19`**. Versions `.20`/`.21` turn
  `LibCpp2IlMain.MetadataVersion` from a field into a property, giving
  `MissingFieldException` on every deserialize; the declared dependency `2022.0.7.2` gives
  `MissingMethodException`. Working range is `.15`–`.19`.

Measured when working: `InitializeCpp2IL()` 1.74 s, 43,442 type definitions, peak working
set 795 MB. Field resolution: `resources.assets` 746/748, `sharedassets0` 20/20,
`sharedassets1` 144/144, with meaningful names and values (e.g. `LiftGammaGain` resolving
`Vector4Parameter gain { m_OverrideState = 1, m_Value = { 1, 1, 1, 0.361203 } }`).

**The metadata-registration address changes with every game patch.** This is the most
fragile dependency in the project and is quarantined accordingly (§5.6).

### 3.5 Class database

`AssetsTools.NET` **ships no tpk** (both NuGet package trees contain zero `*.tpk`). The
LZ4 tpk from `AssetRipper/Tpk` works: `lz4.tpk`, 344,820 B, sha256
`ada041f006372ec29909e92d708bc4f72e545e04e1fc56fadf2e8f92fa056d3d`, built 2026-07-26,
`magic=TPK* fileVersion=2`, resolving **321 classes** for `2022.3.58f1`.

**The Brotli tpk variant cannot be read by AssetsTools.NET** — LZ4 or LZMA only.

Independently, `AssetRipper/TypeTreeDumps` contains `2022.3.58f1.dump` — V Rising's exact
engine build — so built-in struct layouts are verbatim rather than interpolated.

### 3.6 Bundle contents

Class-ID histogram over all 489,455 objects (abridged):

```
      1 GameObject         125542    115 MonoScript              774
    114 MonoBehaviour      115677     95 Animator                521
      4 Transform           75169     91 AnimatorController      257
    224 RectTransform       50373     90 Avatar                  159
    222 CanvasRenderer      42321     96 TrailRenderer           110
     43 Mesh                13133    108 Light                   104
    198 ParticleSystem      12917     49 TextAsset                83
    199 ParticleSystemRend  12916    223 Canvas                   82
     28 Texture2D           11194    136 CapsuleCollider          64
     21 Material             7551     89 Cubemap                  18
     74 AnimationClip        7410    120 LineRenderer             13
    213 Sprite               4011    128 Font                     11
     72 ComputeShader        2621     54 Rigidbody                 9
    225 CanvasGroup          1411    329 VideoClip                 7
    137 SkinnedMeshRenderer  1221    205 LODGroup                  3
     48 Shader               1147    187 Texture2DArray            3
     23 MeshRenderer          912     64 MeshCollider              2
     33 MeshFilter            909
```

Four **script-hash class IDs** are absent from the `AssetClassID` enum and need a numeric
fallback: `VFXRenderer` `73398921`, `VisualEffect` `2083052967`, `VisualEffectAsset`
`2058629509`, and the `ParentConstraint` family around `18183606xx`.

`globalgamemanagers.assets` holds **8,703 MonoScript** objects — the script-name registry
for resolving `m_Script` PPtrs (bundle-local MonoScripts number only 774).

### 3.7 Map-relevant assets

Name sweep across all bundles: `minimap` 7, `map` 302, `icon` 10,955 (GameObject 6,200 /
Texture2D 2,379 / Sprite 2,373), `terrain` 48, `poi` 609.

Map art is split across **both** bundles and classic files:

- `26fae5e0b4c6a9c2db14710268c2d097` — `MiniMapMask` (Texture2D + Sprite),
  `MiniMapHUDParent`, `MinimapCompass`, `MinimapMarkerPrefab`, `HUDMinimap`
- `1291f83dad76aebee1e45eb99ba68359` — the map icon sheet: `MapIcon_Player`,
  `MapIcon_ClanMember`, `MapIcon_Trader`, `MapIcon_Coffin01`, `MapIcon_GatewayUnlocked`,
  `MapIcon_DroppedLoot`, `MapIcon_CavePassage`, `MapIcon_SoulShard_*`
- `e2e8e78f077b91fed328d5edc571f79b` — `ZoneMap_StartGraveyard_VRisingWorld`,
  `ZoneMap_StartCrypt_VRisingWorld`
- `resources.assets` — `MapIcon_PlayerCastle`, `ZoneMap_Wilderness_VRisingWorld`,
  `WorldMapRevealMaterial`, and MonoBehaviours `Core/MapMarker`, `Core/MapZoom`,
  `Core/MapPan`, `Admin/MapTeleport`

**There are no Unity `Terrain` (class 84) objects anywhere in the game.** Every `terrain`
name hit is a Material or Mesh (`*_TerrainBlend`). There is no heightmap asset to extract;
world geometry lives in the DOTS subscenes.

### 3.8 Texture decoding

Verified end to end: `Texture2D` → PNG on disk, headers parsed and images visually
confirmed correct (a 512×1024 `ZoneMap_StartGraveyard_VRisingWorld` renders as a
recognisable crypt layout).

Format histogram over decoded samples: DXT5 367, DXT1 101, DXT5Crunched 20, DXT1Crunched
14, BC5 10, BC7 2, Alpha8 1. **No ASTC, no ETC** — this is a PC-only build, so there are no
mobile-codec concerns. Crunch and BC7 both work with no extra setup.

**Streamed textures require `TextureFile.SetPictureDataFromBundle(bundleInstance)` before
`FillPictureData(inst)`**, otherwise `pictureData` has length 0 and the PNG writes as a
0-byte file. Pixels always live in the sibling `<guid>.resS`.

### 3.9 Robustness and cost

- 4,409/4,409 bundles load. **2 sub-file failures**:
  `cd2465acddb8e6fbb7a6f02f03c1dc84[1]` → `ArgumentOutOfRangeException: Non-negative
  number required. (Parameter 'capacity')`, and `4f9f7c3b640c0c6591399854c598c670[1]` →
  `Exception: Expected tthm in extended type tree type`.
- The 2 `archive_dependencies.*` files are manifests, not bundles, and must be skipped by
  name rather than by failed load attempt.
- Full sweep of 489,455 objects: **0.9 min, peak working set 2,375 MB.**

### 3.10 DOTS format

`.entities` files are Unity Entities serialized binary. The container was decoded
byte-exactly.

`FileHeader` is **152 bytes** (`0x98`):

```
0    char[8]   "DOTSBIN!"
8    int32     FileVersion             = 77
12   int32     HeaderSize              = 152
16   Hash128   FileId
32   FixedString64Bytes FileType       = uint16 len=16 + "EntityBinaryFile"  (64 B)
96   int32     FirstLevelNodesCount    = 1                    (+4 pad)
104  int64     NodesSectionOffset ;  112 int32 NodesSectionSize     (+4 pad)
120  int64     MetadataSectionOffset ; 128 int32 MetadataSectionSize (+4 pad)
136  int64     DataSectionOffset ;   144 int64 DataSectionSize
```

**The node section lives at the end of the file**, not the front. It is a self-describing
tree of 72-byte `NodeHeader` records:

```
ulong NodeTypeHash; Hash128 Id; int Size, NextSiblingOffset, ChildrenCount;
long MetadataStartingOffset; int MetadataSize; long DataStartingOffset, DataSize
```

All 1,183 files are `FileVersion` 77 with exactly 6 children under `WorldNodeType`:
`ArchetypesNodeType` (rev 1), `BlobAssetsNodeType` (rev 1),
`SharedAndManagedComponentsNodeType` (rev 0), `EnabledBitsNodeType` (rev 0),
`ChunksNodeType` (rev 1), `BufferDataNodeType` (rev 1).

`FileVersion` 77 maps to **Unity Entities 1.1.0-pre.3 … 1.2.4** (1.0.x = 76, 1.3.2+ = 78).

The archetypes node layout is `int typeCount`, `ulong[typeCount] StableTypeHash`,
`int archetypeCount`, then per archetype `int entityCount, int componentTypeCount,
int[] typeIndexIntoHashTable`. Verified on
`018be26374d7ad94d99c57e637f5cc42.0.entities`: **87 types, 49 archetypes, 6,198 entities,
3,496 of 3,496 bytes consumed exactly.** Its `ChunksNode` payload is
`3,637,248 = 222 × 16,384` — raw 16 KiB archetype chunks (`kChunkSize = 16384`,
`kBufferOffset = 64`, `kSerializedHeaderSize = 40`).

**Component type names are not in the files.** Stunlock baked with
`SerializeComponentTypeNames = false`: 0 hits for `DebugSectionNodeType` /
`TypesNameNodeType` across all 1,183 files, and no `.exportedtypes` ship. However
`global-metadata.dat` retains **2,133 distinct `ProjectM.*` type names**.

`StableTypeHash` is **deterministic and reproducible offline**: FNV-1A64 (basis
`14695981039346656037`, prime `1099511628211`) over namespace, nested declaring-type names,
type name, **assembly name** (included under `UNITY_2022_3_11F1_OR_NEWER`, so active for
2022.3.58f1), generic arguments, then recursively every instance field's type. Field *names*
do not contribute. Two gotchas: Unity feeds each UTF-16 char as two bytes (`c & 255` then
`c >> 8`), so FNV-1a over UTF-8 will not match; and explicit `StructLayout` size hashing is
commented out in Unity's source (noted there as inconsistent between IL2CPP and Mono),
which removes a variable.

`.entityheader` files have no magic — a raw little-endian section table with an embedded
nested `DOTSBIN!` block, and the subscene name in plaintext in the tail. 229 unique scene
names recovered, e.g. `Farbane_Mid11_Quarry_Territory`, `Dunley_Mid02_Colosseum_Territory`,
`Curse_SpiderCave01_Territory`. Of these, 22 are `GameData_*` scenes forming the ECS game
database (`GameData_Gameplay` 130,857,088 B, `GameData_Abilities`, `GameData_Castle`,
`GameData_SpawnChains`, …), each with a `_Server` twin.

Unity's own serialization source is readable at `needle-mirror/com.unity.entities`
(`Unity.Entities/Serialization/DotsSerialization.cs`, `SerializeUtility.cs`,
`Types/TypeHash.cs`, `Types/Chunk.cs`). Its license is the Unity Companion License — it is
an authoritative **specification to read, not code to copy**.

### 3.11 No general `.entities` reader exists

GitHub searches for `DOTSBIN` and `EntityBinaryFile` return only vendored copies of Unity's
own serialization source. AssetRipper has zero issues mentioning DOTS. No third-party
parser exists.

The V Rising modding community does **runtime** ECS dumps instead — in-process via
BepInEx + `VRising.Unhollowed.Client`, reading `PrefabCollectionSystem`. Nobody parses
`.entities` offline.

One directly reusable artifact: **`decaprime/vrising-modding` (MIT)** publishes
`_data/prefabs/All.json`, 1.28 MB, **24,756 `name → PrefabGUID` entries**. This matters
because `PrefabGUID` is **not a reproducible hash** — tested against FNV-1a32 (UTF-8 and
UTF-16), djb2 and CRC32, 6/6 sample mismatches. The mapping must be harvested, never
derived.

## 4. Architecture

Deliberately isomorphic to uex and gdex, so an agent or developer who knows one knows all
three.

```
src/Unex/
  Program.cs                  System.CommandLine wiring
  UnexException.cs
  Config/ProfilesConfig.cs    named per-game profiles (gitignored profiles.json)
  Core/
    ProviderManager.cs        lazy per-profile AssetsManager, cached, failed mounts evicted
    UnityVfs.cs               synthesizes the virtual path tree (§5.1)
    VfsQuery.cs               pure: glob/regex list + search            [unit-tested]
    OutputPaths.cs            pure: output path mapping + collisions    [unit-tested]
    TypeTemplates.cs          tpk class database loading + cache
    Il2CppTemplates.cs        optional, quarantined Cpp2IL integration  (§5.6)
    AssetOps.cs               preview asset -> JSON, texture -> PNG
    TextureExport.cs          decode dispatch, .resS streamed pixels
    ExportRunner.cs           streaming batch export
    GuidIndex.cs              guid-index.json + archive dependency graph
  Dots/
    DotsFile.cs               DOTSBIN! header + node tree walk
    DotsNodes.cs              the 6 node types
    ArchetypeTable.cs         typeCount / hashes / archetypes
    ChunkReader.cs            16 KiB chunk walk, blittable component decode
    TypeHash.cs               FNV-1A64 StableTypeHash recompute         [unit-tested]
    Il2CppTypeIndex.cs        metadata -> struct layouts + hashes
    EntityHeaderFile.cs       .entityheader -> subscene name
    CoverageReport.cs         resolved vs unresolved, per file
  Mcp/UnexMcpTools.cs
  Serve/{ServeLoop,RequestHandler}.cs
```

`Dots/` stays **engine-generic**. Anything V Rising-specific (which assemblies hold
components, which directories to walk, the IL2CPP registration address) lives in profile
config, never in code. This is the lesson uex learned from `Core/Aion2Dat.cs`.

### 4.1 Isolation boundaries

- `VfsQuery`, `OutputPaths`, `TypeHash` are **pure** — no I/O, fully unit-testable without
  game files.
- `Il2CppTemplates.cs` is the **only** file that references LibCpp2IL. Removing it must
  leave a working tool that skips classic-file MonoBehaviour fields.
- `ProviderManager` is the only owner of `AssetsManager` lifetime; every operation takes a
  `profile` parameter, so one process serves many games.

## 5. Component design

### 5.1 Virtual filesystem

Unreal gives uex real pak paths and Godot gives gdex real `res://` paths. **Unity gives
nothing** (§3.2), so paths are synthesized. Three roots:

```
bundles/<bundleGuid>/<TypeName>/<m_Name | PathID>
serialized/<fileName>/<TypeName>/<m_Name | PathID>
entities/<SceneName>/<sectionIndex>
```

The VFS is the *addressing* scheme (stable, collision-free, one entry per object). The
export tree (§5.4) is a separate, friendlier *presentation*. Conflating the two was the
mistake avoided here: `list`/`search`/`preview` operate on VFS paths, `export` writes the
presentation tree, and `guid-index.json` maps between them.

Unnamed objects (64% of the total, mostly `Transform`, `RectTransform`, `CanvasRenderer`)
address by `PathID`. They are listed and previewable but excluded from the export tree by
default, since a tree of 313,000 numerically-named files serves nobody.

### 5.2 Profiles

```json
{
  "profiles": {
    "vrising": {
      "dataDir": "D:/SteamLibrary/steamapps/common/VRising/VRising_Data",
      "bundleRoots": ["StreamingAssets/ContentArchives"],
      "serializedFiles": ["resources.assets", "sharedassets0.assets",
                          "sharedassets1.assets", "globalgamemanagers",
                          "globalgamemanagers.assets"],
      "entityScenesDir": "StreamingAssets/EntityScenes",
      "unityVersion": null,
      "classDatabase": null,
      "il2cppMetadata": "il2cpp_data/Metadata/global-metadata.dat",
      "gameAssembly": "../GameAssembly.dll",
      "il2cppMetadataRegistration": "18CB18A40",
      "dotsAssemblies": ["ProjectM", "Stunlock.Core", "Unity.Transforms"],
      "prefabNames": null,
      "outputDir": "D:/SteamLibrary/steamapps/common/VRising/Exports",
      "exportRoots": ["bundles", "serialized", "entities"]
    }
  }
}
```

Resolution order matches uex: `--config` > `UNEX_PROFILES` env > `./profiles.json` >
executable directory. `profiles.json` is **gitignored** (machine-specific paths);
`profiles.example.json` is the committed template. All relative paths resolve against
`dataDir`.

- `unityVersion: null` → auto-detect from the bundle header, with the field as an override.
- `classDatabase: null` → use the cached tpk in `.unex-cache/` (§5.3).
- `il2cppMetadataRegistration` → bare hex, no `0x` prefix (§3.4). `null` disables IL2CPP.
- `prefabNames` → optional path to `decaprime/vrising-modding`'s `All.json`. When set,
  `PrefabGUID` integers in DOTS output are annotated with names. `null` = raw ints. Names
  are **never invented or derived**.

`doctor` warns when a sibling `v3/` directory exists next to `dataDir`, naming the trap
explicitly (§3.1).

### 5.3 Class database acquisition

AssetsTools.NET ships no tpk (§3.5). On first use unex downloads `lz4.tpk` into
`.unex-cache/` next to the executable and verifies the sha256 — the same pattern uex uses
for Oodle and zlib. Needs network once; subsequent runs are offline. `classDatabase` in the
profile overrides with a local path. The Brotli variant is rejected with a clear message.

### 5.4 Export tree

AssetStudio convention, in its no-container form (which is the only applicable form here):

```
<outputDir>/<TypeName>/<Name>.<ext>
```

`Texture2D` → `.png`, `Sprite` → `.png`, `MonoBehaviour`/`ScriptableObject` → `.json`,
`TextAsset` → raw bytes with original extension when inferable, `AudioClip` → `.wav`/`.ogg`,
everything else → `.json` of its serialized fields.

**Collision policy**, applied in order and recorded in `guid-index.json`:

1. `<Name>.<ext>`
2. on collision → `<Name>_<bundleGuid8>.<ext>` (first 8 hex chars)
3. still colliding → `<Name>_<bundleGuid8>_<PathID>.<ext>`

Type-first was chosen over GUID-first because 4,409 opaque hex directories are hostile to
both browsing and a downstream pipeline, and because every Texture2D and Sprite is named
(§3.2) so the type-first tree is near-complete for art.

`guid-index.json` accompanies every export and carries, per object,
`(bundleGuid, pathId, name, classId, typeName, outputPath)` plus the 56,451-edge archive
dependency graph from `archive_dependencies.txt`. Nothing is lost by not using GUID-first
directories.

DOTS output goes to a parallel root:

```
<outputDir>/EntityScenes/<SceneName>/<sceneGuid>.<section>.json
<outputDir>/EntityScenes/_coverage.json
```

### 5.5 Commands and MCP surface

Same shape as uex, so the surface transfers:

`doctor` · `export` · `list` · `search` · `preview` · `preview-texture` · `serve` · `mcp`,
plus **`coverage`** (the DOTS survey and resolved/unresolved report).

`.entities` files are handled **transparently** by `preview` and `export` — the same way uex
folds AION2 `.dat` decoding in rather than adding commands. `coverage` exists because the
honest reporting requirement (§6) deserves a first-class artifact, not a log line.

MCP tools: `profiles`, `list_dir`, `search_paths`, `preview_asset`, `preview_texture`,
`export_assets`, `dots_coverage`. Every tool except `profiles` takes a `profile` parameter.

`export` **streams** — objects are written and released as they are read, never accumulated.
The full-sweep measurement of 2,375 MB peak (§3.9) is the ceiling to stay under.

### 5.6 IL2CPP quarantine

Needed only for MonoBehaviour fields in the 5 classic serialized files (§3.3). Design rules:

1. All LibCpp2IL contact lives in `Core/Il2CppTemplates.cs`.
2. Disabled unless both `il2cppMetadata` and `il2cppMetadataRegistration` are set.
3. **Fail-soft.** Initialization failure, a stale registration address, or a per-object
   exception degrades that object to "fields unresolved" in the coverage report. It never
   aborts an export.
4. The manual registration address is supplied programmatically where the API allows;
   LibCpp2IL's stdin prompt is fed via a redirected stream, never by prompting a user.
5. `doctor` verifies the address still resolves and says plainly when a game patch has
   invalidated it.

Bundle MonoBehaviours never touch this path — they resolve from embedded TypeTrees.

## 6. DOTS design

Strategy C: tiered, capped at blittable components. Each tier is independently shippable
and independently useful.

| tier | output | needs | risk |
|---|---|---|---|
| 1 | node tree, type-hash table, archetype table, entity counts, subscene names | nothing | low — verified byte-exact (§3.10) |
| 2 | `StableTypeHash` → `ProjectM.*` type name and struct layout | IL2CPP metadata | medium — hash recompute must match exactly |
| 3 | blittable component **values** from 16 KiB chunks | tier 2 | high — offsets rot on game patches |

**Tier 3 decodes only plain blittable structs** — `float3`, `int`, `PrefabGUID`, enums,
bools, and fixed-size composites of those. Explicitly **detected and reported as
unresolved, never guessed**: dynamic buffers (`BufferDataNode` heap), `BlobAssetReference`,
shared components, managed components, and `Entity` reference remapping.

Coverage reporting is a **first-class shipped artifact**, not a footnote. `_coverage.json`
records per file and in aggregate: type hashes seen, hashes bound to names, components
decoded, components skipped and why. "What we cannot read yet" must always be visible
rather than silently absent — a dumper that quietly omits a third of its input is worse than
one that says so.

Tier 2 correctness is verifiable without ground truth: recompute `StableTypeHash` for every
`ProjectM.*` type found in IL2CPP metadata, and intersect with the hash tables read from the
files. A high intersection rate proves the implementation; a low one proves it is broken.
That intersection rate is the tier-2 acceptance metric.

## 7. Dependencies

Exact pins, all verified working together on net10.0 with a clean `dotnet build -c Release`
(0 errors, 0 warnings):

```xml
<PackageReference Include="AssetsTools.NET"            Version="3.0.5" />
<PackageReference Include="AssetsTools.NET.Cpp2IL"     Version="3.0.4" />
<PackageReference Include="AssetsTools.NET.Texture"    Version="3.0.2" />
<PackageReference Include="AssetRipper.TextureDecoder" Version="1.3.0" />
<PackageReference Include="AssetRipper.Primitives"     Version="3.2.0" />
<PackageReference Include="Samboy063.LibCpp2IL"        Version="2022.1.0-pre-release.19" />
<PackageReference Include="StbImageWriteSharp"         Version="1.16.7" />
<PackageReference Include="ModelContextProtocol"       Version="1.4.1" />
<PackageReference Include="Microsoft.Extensions.Hosting" Version="10.0.0" />
<PackageReference Include="System.CommandLine"         Version="2.0.10" />
```

Pinning notes — each of these was learned the hard way and must not be "helpfully" bumped:

- **`AssetRipper.TextureDecoder` must stay at 1.3.0.** `AssetsTools.NET.Texture` 3.0.2 is
  built against it; 2.6.2 removed `ColorRGBA64` and produces `TypeLoadException` on 100% of
  decode attempts (515/515 observed).
- **`AssetRipper.Primitives` and `StbImageWriteSharp` are undeclared transitive
  requirements** and must be referenced directly. Missing the former gives
  `FileNotFoundException: AssetRipper.Primitives, Version=3.1.3.0`; missing the latter
  breaks PNG writing while leaving raw decode working. Primitives must be 3.2.0, not 3.1.3
  (which trips `NU1605`).
- **`Samboy063.LibCpp2IL` must stay in `.15`–`.19`** (§3.4). The version declared by
  `AssetsTools.NET.Cpp2IL`'s nuspec is wrong.
- `AssetsTools.NET` ships only net35/net40/netstandard2.0 and `.Texture` only
  net6.0/netstandard2.0; both consume cleanly from net10.0.

The tpk is not a package: `lz4.tpk`, sha256 `ada041f0…`, from `AssetRipper/Tpk` (§3.5).

**Dependency risk, stated plainly:** `AssetsTools.NET` is essentially one maintainer, its
core targets `netstandard2.0` (so no `Span`-era API surface), and it provides no exporter
layer — all extraction, naming and output logic is ours to write. Mitigation: pin versions,
treat the `AssetRipper.*` MIT satellites as independently swappable, and vendor a fork if
upstream stalls.

## 8. Testing

**Unit tests must never require game files.** This is uex's hard rule and it carries over.
Covered: `VfsQuery`, `OutputPaths` (including the three-step collision policy),
`ProfilesConfig` loading and resolution order, `TypeHash` against known FNV-1A64 vectors
(with the UTF-16 two-byte feed), and `DotsFile` header + node-tree parsing against a
**hand-built synthetic fixture**. No game data is committed to the repo.

Real verification is `doctor`, which asserts measured facts rather than merely exiting 0:

| check | expected |
|---|---|
| bundle mount | 4,409 bundles load; exactly 2 known sub-file failures (§3.9) |
| TypeTree | `TypeTreeEnabled` true on all bundles, false on the 5 classic files |
| class database | `2022.3.58f1` resolves, 321 classes |
| texture decode | a known `Texture2D` decodes to a non-zero PNG of expected dimensions |
| DOTS tier 1 | `018be26374d7ad94d99c57e637f5cc42.0.entities` → 87 types, 49 archetypes, 6,198 entities, 3,496/3,496 archetype bytes consumed |
| DOTS tier 2 | `StableTypeHash` intersection rate above threshold (§6) |
| IL2CPP (if enabled) | registration address resolves; `resources.assets` ≥ 746/748 fields |
| `v3/` trap | warns when the sibling directory exists |

These are regression checks with real numbers, not smoke tests.

## 9. Phasing

Each phase is independently shippable.

- **Phase 1** — skeleton, profiles, tpk acquisition, bundle + serialized mount,
  `list`/`search`/`preview`, `doctor`. Per-file error isolation from the start.
- **Phase 2** — `Texture2D`/`Sprite` → PNG (with `.resS` streamed pixels), streaming batch
  `export`, type-first tree with collision policy, `guid-index.json` including the archive
  dependency graph.
- **Phase 3** — `serve` and `mcp`.
- **Phase 4** — optional IL2CPP quarantine for classic-file MonoBehaviours (§5.6).
- **Phase 5** — DOTS tier 1 plus `coverage`.
- **Phase 6** — DOTS tier 2, hash → name binding, with the intersection rate as the gate.
- **Phase 7** — DOTS tier 3, blittable value decode.

Phase 0 (feasibility spikes) is complete; its results are §3.

## 10. Non-goals

- No asset writing or patching. unex is read-only.
- No FMOD `.bank` audio (1.27 GiB across 12 banks — separate toolchain, irrelevant here).
- No mesh, model, or FBX export.
- No `v3/` legacy install support; it is detected and warned about, never walked.
- No dynamic buffers, blob assets, shared/managed components or `Entity` remapping in the
  DOTS reader — reported unresolved (§6).
- No invented `PrefabGUID` names. The hash is not reproducible (§3.11); names come from an
  opt-in harvested table or not at all.
- No GPL/AGPL code. `AssetRipper` core and `KindredExtract` sources are off-limits; their
  outputs are not.
- No runtime/in-process dumping via BepInEx. It was considered (the community standard, and
  correct by construction) but rejected for v1: it cannot run inside an offline pipeline.
  It remains the natural future correctness oracle for tier 3.

## 11. Risks

| risk | severity | mitigation |
|---|---|---|
| DOTS tier 3 offsets break on every game patch | high | tier 3 is last; coverage report makes breakage loud; tiers 1–2 keep working |
| IL2CPP registration address invalidated by patches | medium | quarantined, optional, fail-soft; `doctor` reports it |
| `AssetsTools.NET` bus factor | medium | pinned versions; satellites swappable; fork if needed |
| `StableTypeHash` recompute subtly wrong | medium | intersection rate is a self-checking metric, not a guess |
| Memory on full export | low | streaming export; 2,375 MB measured ceiling |
| Name collisions in type-first tree | low | three-step deterministic policy; `guid-index.json` is authoritative |

## 12. Evidence

Phase 0 spike project and artifacts: `E:/arkive-games/unex-spike/` (throwaway, 56 MB).
Retained because §3 cites it; deletable once implementation is under way.

- `out/sweep.log` — full-sweep summary, class-ID histogram, map name hits. Contains the
  line `bundles ok=4409 fail=2; serialized files=4409 typeTreeEnabled=4409;
  AssetBundle(142) objects found=0`
- `out/sweep_errors.txt` — the 2 sub-file failures and 2 manifest non-bundles
- `out/container_examples.txt`, `out/ab_names.txt` — **0 bytes**, the primary evidence that
  no container paths exist
- `out/all_names.tsv` — 15 MB, 176,430 object names
- `out/classic.log` — `typeTreeEnabled=False` on all 5 classic files
- `out/mono_final.log` — IL2CPP field resolution results
- `out/mappng/` — 17 decoded map PNGs, headers verified and images visually confirmed
- `out/png/` — **0-byte files** from the earlier failed attempt, retained as the signature
  of the `SetPictureDataFromBundle` omission (§3.8)
- `tpk/lz4.tpk` — 344,820 B, sha256 `ada041f0…`

External references: [needle-mirror/com.unity.entities](https://github.com/needle-mirror/com.unity.entities)
· [nesrak1/AssetsTools.NET](https://github.com/nesrak1/AssetsTools.NET)
· [AssetRipper/Tpk](https://github.com/AssetRipper/Tpk)
· [AssetRipper/TypeTreeDumps](https://github.com/AssetRipper/TypeTreeDumps)
· [decaprime/vrising-modding](https://github.com/decaprime/vrising-modding)
· [V Rising mod wiki: prefabs](https://wiki.vrisingmods.com/dev/prefabs.html)

## 13. Next step

Write the implementation plan. This spec lives in the arkive workspace because the `unex`
repo does not exist yet; the plan and this spec both move to `E:/arkive-games/unex/docs/`
once that repo is created, matching how uex keeps
`docs/superpowers/plans/2026-07-19-uex-exporter.md` alongside its own source.
