# unex Unity Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `unex`, a headless Unity asset exporter and explorer for V Rising, covering classic `UnityFS` bundle/serialized-file extraction plus tier-1 DOTS `.entities` structural parsing.

**Architecture:** .NET 10 console app on `AssetsTools.NET`, structurally isomorphic to the sibling tools `uex` (Unreal) and `gdex` (Godot): named per-game profiles, one lazily-mounted provider per profile, pure unit-testable core (`VfsQuery`, `OutputPaths`, `TypeHash`), and three frontends (CLI, `serve` JSON-lines, `mcp` stdio).

**Tech Stack:** C# / .NET 10, `AssetsTools.NET` 3.0.5, `AssetsTools.NET.Texture`, `AssetRipper.TextureDecoder` 1.3.0, `System.CommandLine`, `ModelContextProtocol`, xUnit.

**Spec:** `docs/superpowers/specs/2026-07-30-unex-unity-exporter-design.md`

**Repo:** all paths below are relative to `E:/arkive-games/unex` (a new repo, created in Task 1), *not* the arkive monorepo.

---

## Critical context for the implementer

You have almost no context on this problem domain. Read these before starting:

1. **The spec** (path above) — especially §3 (verified findings) and §7 (dependency pins).
2. **The Phase 0 spike project** at `E:/arkive-games/unex-spike/Spike/` — throwaway code that *already works* against the real game. `Sweep.cs` and `MapIcons.cs` contain the verified `AssetsTools.NET` call sequences. When this plan shows an API sequence, it was harvested from there. Prefer copying those patterns over inventing your own.

**Five facts that will save you days:**

- V Rising's bundles contain **zero** `AssetBundle` (class 142) objects, so there are **no asset paths**. Identity is `(bundleGuid, PathID, m_Name)`. Do not go looking for `m_Container`.
- Bundles have **embedded TypeTrees** (`Metadata.TypeTreeEnabled == true`), so MonoBehaviours in bundles deserialize with real field names and **no IL2CPP**. The 5 classic files have them stripped.
- Bundle files are **extensionless**. Call `LoadBundleFile` directly; never rely on extension sniffing.
- **Never bump `AssetRipper.TextureDecoder` past 1.3.0.** 2.6.2 removed `ColorRGBA64` and breaks 100% of texture decodes.
- `D:/SteamLibrary/steamapps/common/VRising/v3/` is a **second, older game install**. Never walk it.

**Absolute rule on tests:** unit tests must never require game files. Real-game verification lives exclusively in the `doctor` command. Never commit game data to the repo.

---

## File structure

| file | responsibility |
|---|---|
| `src/Unex/Program.cs` | `System.CommandLine` wiring only; no logic |
| `src/Unex/UnexException.cs` | the one exception type used for clean user-facing errors |
| `src/Unex/Config/ProfilesConfig.cs` | profile records + config file resolution |
| `src/Unex/Core/ClassDatabase.cs` | tpk acquisition into `.unex-cache/`, sha256 verify |
| `src/Unex/Core/ProviderManager.cs` | lazy per-profile `AssetsManager`; sole owner of mount lifetime |
| `src/Unex/Core/VfsEntry.cs` | the record describing one addressable object |
| `src/Unex/Core/VfsQuery.cs` | **pure** glob/regex filtering and listing |
| `src/Unex/Core/OutputPaths.cs` | **pure** export path mapping + collision policy |
| `src/Unex/Core/UnityVfs.cs` | walks bundles/serialized files into `VfsEntry` values |
| `src/Unex/Core/FieldJson.cs` | `AssetTypeValueField` → `JsonNode` |
| `src/Unex/Core/AssetOps.cs` | single-asset preview (JSON) and texture preview (PNG) |
| `src/Unex/Core/TextureExport.cs` | `Texture2D`/`Sprite` → PNG, incl. `.resS` streamed pixels |
| `src/Unex/Core/GuidIndex.cs` | `guid-index.json` + `archive_dependencies.txt` graph |
| `src/Unex/Core/ExportRunner.cs` | streaming batch export |
| `src/Unex/Core/Doctor.cs` | real-game assertions with expected numbers |
| `src/Unex/Dots/TypeHash.cs` | **pure** FNV-1A64 `StableTypeHash` recompute |
| `src/Unex/Dots/DotsFile.cs` | `DOTSBIN!` header + node-tree walk |
| `src/Unex/Dots/ArchetypeTable.cs` | archetypes node decode |
| `src/Unex/Dots/EntityHeaderFile.cs` | `.entityheader` → subscene name |
| `src/Unex/Dots/CoverageReport.cs` | resolved/unresolved accounting |
| `src/Unex/Serve/*.cs` | JSON-lines stdin/stdout server |
| `src/Unex/Mcp/UnexMcpTools.cs` | MCP stdio tool surface |

---

## Task 1: Repo scaffold

**Files:**
- Create: `.gitignore`, `LICENSE`, `README.md`, `CLAUDE.md`, `unex.slnx`
- Create: `src/Unex/Unex.csproj`, `src/Unex/Program.cs`, `src/Unex/UnexException.cs`
- Create: `tests/Unex.Tests/Unex.Tests.csproj`
- Create: `profiles.example.json`

- [ ] **Step 1: Create the repo and directories**

```bash
mkdir -p E:/arkive-games/unex/src/Unex E:/arkive-games/unex/tests/Unex.Tests
cd E:/arkive-games/unex && git init -b master
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
bin/
obj/
publish/
.unex-cache/
profiles.json
*.user
```

- [ ] **Step 3: Write `src/Unex/Unex.csproj`**

These versions are load-bearing. Read spec §7 before changing any of them.

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>unex</AssemblyName>
    <RootNamespace>Unex</RootNamespace>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="AssetsTools.NET" Version="3.0.5" />
    <PackageReference Include="AssetsTools.NET.Texture" Version="3.0.2" />
    <PackageReference Include="AssetRipper.TextureDecoder" Version="1.3.0" />
    <PackageReference Include="AssetRipper.Primitives" Version="3.2.0" />
    <PackageReference Include="StbImageWriteSharp" Version="1.16.7" />
    <PackageReference Include="Microsoft.Extensions.Hosting" Version="10.0.0" />
    <PackageReference Include="ModelContextProtocol" Version="1.4.1" />
    <PackageReference Include="System.CommandLine" Version="2.0.10" />
  </ItemGroup>

</Project>
```

`AssetsTools.NET.Cpp2IL` and `Samboy063.LibCpp2IL` are deliberately absent — IL2CPP is a later phase (spec §5.6) and is not needed for bundles.

- [ ] **Step 4: Write `tests/Unex.Tests/Unex.Tests.csproj`**

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="../../src/Unex/Unex.csproj" />
  </ItemGroup>

</Project>
```

Note: test files need an explicit `using Xunit;` — `ImplicitUsings` does not cover it.

- [ ] **Step 5: Write `unex.slnx`**

```xml
<Solution>
  <Folder Name="/src/">
    <Project Path="src/Unex/Unex.csproj" />
  </Folder>
  <Folder Name="/tests/">
    <Project Path="tests/Unex.Tests/Unex.Tests.csproj" />
  </Folder>
</Solution>
```

- [ ] **Step 6: Write `src Unex/UnexException.cs`** (file: `src/Unex/UnexException.cs`)

```csharp
namespace Unex;

public sealed class UnexException(string message) : Exception(message);
```

- [ ] **Step 7: Write a minimal `src/Unex/Program.cs`**

```csharp
using System.CommandLine;

namespace Unex;

public static class Program
{
    public static int Main(string[] args)
    {
        var root = new RootCommand("unex - Unity asset export and exploration tool");
        try
        {
            return root.Parse(args).Invoke();
        }
        catch (UnexException ex)
        {
            Console.Error.WriteLine($"error: {ex.Message}");
            return 1;
        }
    }
}
```

- [ ] **Step 8: Write `LICENSE`**

Apache License 2.0, copyright `2026 Yihao Liu (tc-imba)`. Copy the standard text verbatim from `E:/arkive-games/uex/LICENSE`:

```bash
cp E:/arkive-games/uex/LICENSE E:/arkive-games/unex/LICENSE
```

- [ ] **Step 9: Verify it builds and tests run**

Run: `cd E:/arkive-games/unex && dotnet build`
Expected: `Build succeeded`, 0 errors. Warnings about the netstandard2.0 TFM of `AssetsTools.NET` are expected and acceptable.

Run: `dotnet test`
Expected: build succeeds, 0 tests found (none written yet).

- [ ] **Step 10: Write `profiles.example.json`**

```json
{
  "profiles": {
    "vrising": {
      "dataDir": "D:/SteamLibrary/steamapps/common/VRising/VRising_Data",
      "bundleRoots": ["StreamingAssets/ContentArchives"],
      "serializedFiles": [
        "resources.assets",
        "sharedassets0.assets",
        "sharedassets1.assets",
        "globalgamemanagers",
        "globalgamemanagers.assets"
      ],
      "entityScenesDir": "StreamingAssets/EntityScenes",
      "unityVersion": null,
      "classDatabase": null,
      "prefabNames": null,
      "outputDir": "D:/SteamLibrary/steamapps/common/VRising/Exports",
      "exportRoots": ["bundles", "serialized", "entities"]
    }
  }
}
```

- [ ] **Step 11: Write `README.md` and `CLAUDE.md`**

`README.md` covers: what unex is, requirements (.NET 10 SDK, a V Rising install), profile setup (`cp profiles.example.json profiles.json`), config resolution order, the profile field table, and the command list. Model it on `E:/arkive-games/uex/README.md` — read that file and mirror its structure.

`CLAUDE.md` is the short orientation file for future agents. Model it on `E:/arkive-games/uex/CLAUDE.md` and include: build/test/publish commands, the architecture summary, and the five load-bearing facts from "Critical context" above.

- [ ] **Step 12: Commit**

```bash
cd E:/arkive-games/unex
git add .gitignore LICENSE README.md CLAUDE.md unex.slnx profiles.example.json src tests
git commit -m "feat: scaffold unex - .NET 10 Unity exporter on AssetsTools.NET"
```

---

## Task 2: Profiles configuration

**Files:**
- Create: `src/Unex/Config/ProfilesConfig.cs`
- Test: `tests/Unex.Tests/ProfilesConfigTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using System.Text.Json;
using Unex.Config;
using Xunit;

namespace Unex.Tests;

public class ProfilesConfigTests
{
    static string WriteTemp(string json)
    {
        var path = Path.Combine(Path.GetTempPath(), $"unex-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, json);
        return path;
    }

    [Fact]
    public void Loads_profile_and_resolves_relative_paths_against_dataDir()
    {
        var path = WriteTemp("""
        {
          "profiles": {
            "vrising": {
              "dataDir": "D:/Game/VRising_Data",
              "bundleRoots": ["StreamingAssets/ContentArchives"],
              "serializedFiles": ["resources.assets"],
              "entityScenesDir": "StreamingAssets/EntityScenes",
              "outputDir": "D:/Game/Exports",
              "exportRoots": ["bundles"]
            }
          }
        }
        """);

        var cfg = ProfilesConfig.Load(path);
        var p = cfg.Get("vrising");

        Assert.Equal("D:/Game/VRising_Data", p.DataDir);
        Assert.Equal(Path.GetFullPath("D:/Game/VRising_Data/StreamingAssets/ContentArchives"),
                     p.ResolvedBundleRoots[0]);
        Assert.Equal(Path.GetFullPath("D:/Game/VRising_Data/resources.assets"),
                     p.ResolvedSerializedFiles[0]);
        Assert.Null(p.UnityVersion);
        File.Delete(path);
    }

    [Fact]
    public void Unknown_profile_throws_with_available_names_listed()
    {
        var path = WriteTemp("""
        { "profiles": { "vrising": { "dataDir": "D:/x", "outputDir": "D:/y" } } }
        """);

        var cfg = ProfilesConfig.Load(path);
        var ex = Assert.Throws<UnexException>(() => cfg.Get("nope"));

        Assert.Contains("nope", ex.Message);
        Assert.Contains("vrising", ex.Message);
        File.Delete(path);
    }

    [Fact]
    public void Missing_config_file_throws()
    {
        Assert.Throws<UnexException>(() => ProfilesConfig.Load("Z:/definitely/absent.json"));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd E:/arkive-games/unex && dotnet test --filter ProfilesConfigTests`
Expected: FAIL — `Unex.Config` namespace does not exist (compile error).

- [ ] **Step 3: Write the implementation**

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Unex.Config;

public sealed class Profile
{
    public string DataDir { get; set; } = "";
    public List<string> BundleRoots { get; set; } = [];
    public List<string> SerializedFiles { get; set; } = [];
    public string? EntityScenesDir { get; set; }
    public string? UnityVersion { get; set; }
    public string? ClassDatabase { get; set; }
    public string? PrefabNames { get; set; }
    public string OutputDir { get; set; } = "";
    public List<string> ExportRoots { get; set; } = [];

    string Resolve(string relative) =>
        Path.GetFullPath(Path.IsPathRooted(relative) ? relative : Path.Combine(DataDir, relative));

    [JsonIgnore]
    public List<string> ResolvedBundleRoots => BundleRoots.Select(Resolve).ToList();

    [JsonIgnore]
    public List<string> ResolvedSerializedFiles => SerializedFiles.Select(Resolve).ToList();

    [JsonIgnore]
    public string? ResolvedEntityScenesDir =>
        EntityScenesDir is null ? null : Resolve(EntityScenesDir);
}

public sealed class ProfilesConfig
{
    public Dictionary<string, Profile> Profiles { get; set; } = [];

    static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static ProfilesConfig Load(string path)
    {
        if (!File.Exists(path))
            throw new UnexException($"profiles file not found: {path}");

        ProfilesConfig? cfg;
        try
        {
            cfg = JsonSerializer.Deserialize<ProfilesConfig>(File.ReadAllText(path), Options);
        }
        catch (JsonException ex)
        {
            throw new UnexException($"invalid JSON in {path}: {ex.Message}");
        }

        if (cfg is null || cfg.Profiles.Count == 0)
            throw new UnexException($"no profiles defined in {path}");

        return cfg;
    }

    /// <summary>--config &gt; UNEX_PROFILES &gt; ./profiles.json &gt; exe directory.</summary>
    public static ProfilesConfig Resolve(string? explicitPath)
    {
        foreach (var candidate in Candidates(explicitPath))
            if (candidate is not null && File.Exists(candidate))
                return Load(candidate);

        throw new UnexException(
            "no profiles.json found. Tried --config, UNEX_PROFILES, ./profiles.json, " +
            "and the executable directory. Copy profiles.example.json to profiles.json.");
    }

    static IEnumerable<string?> Candidates(string? explicitPath)
    {
        yield return explicitPath;
        yield return Environment.GetEnvironmentVariable("UNEX_PROFILES");
        yield return Path.Combine(Directory.GetCurrentDirectory(), "profiles.json");
        yield return Path.Combine(AppContext.BaseDirectory, "profiles.json");
    }

    public Profile Get(string name)
    {
        if (Profiles.TryGetValue(name, out var p)) return p;
        throw new UnexException(
            $"unknown profile '{name}'. Available: {string.Join(", ", Profiles.Keys.Order())}");
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test --filter ProfilesConfigTests`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/Unex/Config/ProfilesConfig.cs tests/Unex.Tests/ProfilesConfigTests.cs
git commit -m "feat: per-game profile config with uex-compatible resolution order"
```

---

## Task 3: VfsEntry and pure VFS querying

The VFS is the *addressing* scheme: one stable, collision-free path per object. It is deliberately separate from the export tree (Task 8), which is a friendlier presentation.

**Files:**
- Create: `src/Unex/Core/VfsEntry.cs`, `src/Unex/Core/VfsQuery.cs`
- Test: `tests/Unex.Tests/VfsQueryTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using Unex.Core;
using Xunit;

namespace Unex.Tests;

public class VfsQueryTests
{
    static readonly VfsEntry[] Sample =
    [
        new("bundles/aaaa1111/Texture2D/MapIcon_Player", "aaaa1111", 5L, 28, "Texture2D", "MapIcon_Player"),
        new("bundles/aaaa1111/Sprite/MapIcon_Player",    "aaaa1111", 6L, 213, "Sprite", "MapIcon_Player"),
        new("bundles/bbbb2222/Texture2D/MiniMapMask",    "bbbb2222", 7L, 28, "Texture2D", "MiniMapMask"),
        new("bundles/bbbb2222/Transform/12345",          "bbbb2222", 12345L, 4, "Transform", ""),
        new("serialized/resources.assets/Texture2D/MapIcon_PlayerCastle",
            "resources.assets", 9L, 28, "Texture2D", "MapIcon_PlayerCastle"),
    ];

    [Fact]
    public void List_returns_immediate_children_of_a_directory()
    {
        var children = VfsQuery.ListDir(Sample, "bundles/aaaa1111").ToList();
        Assert.Equal(["Sprite/", "Texture2D/"], children.Order().ToList());
    }

    [Fact]
    public void List_at_root_returns_top_level_roots()
    {
        var children = VfsQuery.ListDir(Sample, "").ToList();
        Assert.Equal(["bundles/", "serialized/"], children.Order().ToList());
    }

    [Fact]
    public void Search_substring_is_case_insensitive()
    {
        var hits = VfsQuery.Search(Sample, "mapicon", regex: false, limit: 100).ToList();
        Assert.Equal(3, hits.Count);
    }

    [Fact]
    public void Search_regex_matches_the_full_vfs_path()
    {
        var hits = VfsQuery.Search(Sample, @"^bundles/.*/Texture2D/", regex: true, limit: 100).ToList();
        Assert.Equal(2, hits.Count);
    }

    [Fact]
    public void Search_respects_the_limit()
    {
        var hits = VfsQuery.Search(Sample, "", regex: false, limit: 2).ToList();
        Assert.Equal(2, hits.Count);
    }

    [Fact]
    public void Invalid_regex_throws_a_clean_error()
    {
        Assert.Throws<UnexException>(() => VfsQuery.Search(Sample, "([", regex: true, limit: 10).ToList());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter VfsQueryTests`
Expected: FAIL — `VfsEntry` / `VfsQuery` do not exist.

- [ ] **Step 3: Write `src/Unex/Core/VfsEntry.cs`**

```csharp
namespace Unex.Core;

/// <summary>
/// One addressable object. <paramref name="Container"/> is the bundle GUID for bundle
/// objects, or the file name for classic serialized files.
/// </summary>
public readonly record struct VfsEntry(
    string VfsPath,
    string Container,
    long PathId,
    int ClassId,
    string TypeName,
    string Name);
```

- [ ] **Step 4: Write `src/Unex/Core/VfsQuery.cs`**

```csharp
using System.Text.RegularExpressions;

namespace Unex.Core;

public static class VfsQuery
{
    /// <summary>Immediate children of a VFS directory. Directories are suffixed with '/'.</summary>
    public static IEnumerable<string> ListDir(IEnumerable<VfsEntry> entries, string dir)
    {
        var prefix = string.IsNullOrEmpty(dir) ? "" : dir.TrimEnd('/') + "/";
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var e in entries)
        {
            if (!e.VfsPath.StartsWith(prefix, StringComparison.Ordinal)) continue;
            var rest = e.VfsPath[prefix.Length..];
            if (rest.Length == 0) continue;

            var slash = rest.IndexOf('/');
            var child = slash < 0 ? rest : rest[..(slash + 1)];
            if (seen.Add(child)) yield return child;
        }
    }

    public static IEnumerable<VfsEntry> Search(
        IEnumerable<VfsEntry> entries, string pattern, bool regex, int limit)
    {
        Regex? rx = null;
        if (regex)
        {
            try { rx = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant); }
            catch (ArgumentException ex) { throw new UnexException($"invalid regex '{pattern}': {ex.Message}"); }
        }

        var yielded = 0;
        foreach (var e in entries)
        {
            if (yielded >= limit) break;
            var match = rx is not null
                ? rx.IsMatch(e.VfsPath)
                : e.VfsPath.Contains(pattern, StringComparison.OrdinalIgnoreCase);
            if (!match) continue;
            yielded++;
            yield return e;
        }
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test --filter VfsQueryTests`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/Unex/Core/VfsEntry.cs src/Unex/Core/VfsQuery.cs tests/Unex.Tests/VfsQueryTests.cs
git commit -m "feat: pure VFS entry model and list/search querying"
```

---

## Task 4: Output paths and the collision policy

Because V Rising has no container paths, the export tree is type-first (spec §5.4). Collisions are real — `MapIcon_PlayerCastle` exists in both a bundle and `resources.assets`.

**Files:**
- Create: `src/Unex/Core/OutputPaths.cs`
- Test: `tests/Unex.Tests/OutputPathsTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using Unex.Core;
using Xunit;

namespace Unex.Tests;

public class OutputPathsTests
{
    [Fact]
    public void Extension_is_chosen_by_type()
    {
        Assert.Equal(".png", OutputPaths.ExtensionFor("Texture2D"));
        Assert.Equal(".png", OutputPaths.ExtensionFor("Sprite"));
        Assert.Equal(".json", OutputPaths.ExtensionFor("MonoBehaviour"));
        Assert.Equal(".json", OutputPaths.ExtensionFor("GameObject"));
    }

    [Fact]
    public void First_use_of_a_name_is_unqualified()
    {
        var alloc = new OutputPaths();
        var e = new VfsEntry("x", "aaaa1111bbbb", 5L, 28, "Texture2D", "MapIcon_Player");
        Assert.Equal("Texture2D/MapIcon_Player.png", alloc.Allocate(e));
    }

    [Fact]
    public void Second_use_is_qualified_with_the_container_prefix()
    {
        var alloc = new OutputPaths();
        var a = new VfsEntry("x", "aaaa1111bbbb", 5L, 28, "Texture2D", "MapIcon_Player");
        var b = new VfsEntry("y", "cccc2222dddd", 6L, 28, "Texture2D", "MapIcon_Player");

        Assert.Equal("Texture2D/MapIcon_Player.png", alloc.Allocate(a));
        Assert.Equal("Texture2D/MapIcon_Player_cccc2222.png", alloc.Allocate(b));
    }

    [Fact]
    public void Third_collision_within_one_container_adds_the_path_id()
    {
        var alloc = new OutputPaths();
        var a = new VfsEntry("x", "aaaa1111bbbb", 5L, 28, "Texture2D", "Dup");
        var b = new VfsEntry("y", "cccc2222dddd", 6L, 28, "Texture2D", "Dup");
        var c = new VfsEntry("z", "cccc2222dddd", 7L, 28, "Texture2D", "Dup");

        Assert.Equal("Texture2D/Dup.png", alloc.Allocate(a));
        Assert.Equal("Texture2D/Dup_cccc2222.png", alloc.Allocate(b));
        Assert.Equal("Texture2D/Dup_cccc2222_7.png", alloc.Allocate(c));
    }

    [Fact]
    public void Same_name_in_different_types_does_not_collide()
    {
        var alloc = new OutputPaths();
        var tex = new VfsEntry("x", "aaaa1111bbbb", 5L, 28, "Texture2D", "MapIcon_Player");
        var spr = new VfsEntry("y", "aaaa1111bbbb", 6L, 213, "Sprite", "MapIcon_Player");

        Assert.Equal("Texture2D/MapIcon_Player.png", alloc.Allocate(tex));
        Assert.Equal("Sprite/MapIcon_Player.png", alloc.Allocate(spr));
    }

    [Fact]
    public void Invalid_filename_characters_are_replaced()
    {
        var alloc = new OutputPaths();
        var e = new VfsEntry("x", "aaaa1111bbbb", 5L, 28, "Texture2D", "a/b:c*d?");
        var got = alloc.Allocate(e);

        Assert.StartsWith("Texture2D/", got);
        Assert.EndsWith(".png", got);
        Assert.DoesNotContain(':', got);
        Assert.DoesNotContain('*', got);
        Assert.DoesNotContain('?', got);
        Assert.Equal(1, got.Count(c => c == '/'));
    }

    [Fact]
    public void Unnamed_objects_fall_back_to_the_path_id()
    {
        var alloc = new OutputPaths();
        var e = new VfsEntry("x", "aaaa1111bbbb", 4242L, 4, "Transform", "");
        Assert.Equal("Transform/4242.json", alloc.Allocate(e));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter OutputPathsTests`
Expected: FAIL — `OutputPaths` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
namespace Unex.Core;

/// <summary>
/// Allocates export-tree paths. Stateful: remembers issued paths so the collision
/// policy is deterministic within one export run.
/// </summary>
public sealed class OutputPaths
{
    readonly HashSet<string> _taken = new(StringComparer.OrdinalIgnoreCase);

    public static string ExtensionFor(string typeName) => typeName switch
    {
        "Texture2D" or "Sprite" or "Cubemap" => ".png",
        "TextAsset" => ".bytes",
        "AudioClip" => ".wav",
        _ => ".json",
    };

    public static string Sanitize(string name)
    {
        var chars = name.ToCharArray();
        var invalid = Path.GetInvalidFileNameChars();
        for (var i = 0; i < chars.Length; i++)
            if (Array.IndexOf(invalid, chars[i]) >= 0) chars[i] = '_';
        return new string(chars);
    }

    /// <summary>
    /// Type-first, GUID-qualified on collision, PathID-qualified on further collision.
    /// See spec §5.4.
    /// </summary>
    public string Allocate(VfsEntry e)
    {
        var ext = ExtensionFor(e.TypeName);
        var stem = e.Name.Length > 0 ? Sanitize(e.Name) : e.PathId.ToString();
        var dir = Sanitize(e.TypeName);
        var shortContainer = e.Container.Length > 8 ? e.Container[..8] : e.Container;

        foreach (var candidate in new[]
        {
            $"{dir}/{stem}{ext}",
            $"{dir}/{stem}_{shortContainer}{ext}",
            $"{dir}/{stem}_{shortContainer}_{e.PathId}{ext}",
        })
        {
            if (_taken.Add(candidate)) return candidate;
        }

        throw new UnexException(
            $"could not allocate an output path for {e.TypeName}/{e.Name} " +
            $"in {e.Container} (pathId {e.PathId})");
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test --filter OutputPathsTests`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/Unex/Core/OutputPaths.cs tests/Unex.Tests/OutputPathsTests.cs
git commit -m "feat: type-first export paths with deterministic collision policy"
```

---

## Task 5: Class database (tpk) acquisition

`AssetsTools.NET` ships no tpk (spec §3.5). unex fetches one into `.unex-cache/` and verifies its sha256, mirroring how uex fetches Oodle/zlib on first mount.

**Files:**
- Create: `src/Unex/Core/ClassDatabase.cs`
- Test: `tests/Unex.Tests/ClassDatabaseTests.cs`

- [ ] **Step 1: Write the failing test**

Only the pure parts are tested — no network access in unit tests.

```csharp
using Unex.Core;
using Xunit;

namespace Unex.Tests;

public class ClassDatabaseTests
{
    [Fact]
    public void Cache_path_sits_next_to_the_executable()
    {
        var path = ClassDatabase.CachePath();
        Assert.Contains(".unex-cache", path);
        Assert.EndsWith("lz4.tpk", path);
    }

    [Fact]
    public void Sha256_of_known_bytes_is_lowercase_hex()
    {
        var hash = ClassDatabase.Sha256Hex("abc"u8.ToArray());
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", hash);
    }

    [Fact]
    public void Brotli_tpk_is_rejected_with_an_actionable_message()
    {
        var ex = Assert.Throws<UnexException>(() => ClassDatabase.EnsureNotBrotli("brotli_file.tpk"));
        Assert.Contains("Brotli", ex.Message);
        Assert.Contains("lz4", ex.Message);
    }

    [Fact]
    public void Non_brotli_names_pass_the_check()
    {
        ClassDatabase.EnsureNotBrotli("lz4.tpk");
        ClassDatabase.EnsureNotBrotli("uncompressed.tpk");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter ClassDatabaseTests`
Expected: FAIL — `ClassDatabase` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
using System.Security.Cryptography;

namespace Unex.Core;

public static class ClassDatabase
{
    public const string DownloadUrl =
        "https://nightly.link/AssetRipper/Tpk/workflows/type_tree_tpk/master/lz4_file.zip";

    /// <summary>sha256 of the tpk verified during the Phase 0 spike (spec §3.5).</summary>
    public const string KnownSha256 =
        "ada041f006372ec29909e92d708bc4f72e545e04e1fc56fadf2e8f92fa056d3d";

    public static string CachePath() =>
        Path.Combine(AppContext.BaseDirectory, ".unex-cache", "lz4.tpk");

    public static string Sha256Hex(byte[] bytes) =>
        Convert.ToHexStringLower(SHA256.HashData(bytes));

    /// <summary>AssetsTools.NET cannot read the Brotli tpk variant (spec §3.5).</summary>
    public static void EnsureNotBrotli(string path)
    {
        if (Path.GetFileName(path).Contains("brotli", StringComparison.OrdinalIgnoreCase))
            throw new UnexException(
                $"'{path}' looks like the Brotli tpk variant, which AssetsTools.NET cannot read. " +
                "Use the lz4 or lzma variant instead.");
    }

    /// <summary>
    /// Returns a usable tpk path: the profile override if set, otherwise the cached
    /// download (fetching it on first use).
    /// </summary>
    public static string Ensure(string? profileOverride)
    {
        if (!string.IsNullOrEmpty(profileOverride))
        {
            EnsureNotBrotli(profileOverride);
            if (!File.Exists(profileOverride))
                throw new UnexException($"classDatabase not found: {profileOverride}");
            return profileOverride;
        }

        var cached = CachePath();
        if (File.Exists(cached)) return cached;

        Directory.CreateDirectory(Path.GetDirectoryName(cached)!);
        Console.Error.WriteLine($"unex: downloading class database -> {cached}");

        byte[] zipBytes;
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
            zipBytes = http.GetByteArrayAsync(DownloadUrl).GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            throw new UnexException(
                $"failed to download the class database from {DownloadUrl}: {ex.Message}. " +
                "Download it manually and point the profile's classDatabase field at the .tpk.");
        }

        using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(zipBytes));
        var entry = zip.Entries.FirstOrDefault(e => e.Name.EndsWith(".tpk", StringComparison.OrdinalIgnoreCase))
            ?? throw new UnexException($"no .tpk found inside {DownloadUrl}");

        using (var src = entry.Open())
        using (var dst = File.Create(cached))
            src.CopyTo(dst);

        var actual = Sha256Hex(File.ReadAllBytes(cached));
        if (actual != KnownSha256)
            Console.Error.WriteLine(
                $"unex: warning - class database sha256 {actual} differs from the verified " +
                $"{KnownSha256}; upstream published a new build. Proceeding.");

        return cached;
    }
}
```

The sha256 mismatch is a **warning, not an error** — `AssetRipper/Tpk` publishes nightly, so a new hash means "newer", not "corrupt". A hard failure here would break the tool on a schedule.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test --filter ClassDatabaseTests`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/Unex/Core/ClassDatabase.cs tests/Unex.Tests/ClassDatabaseTests.cs
git commit -m "feat: tpk class database acquisition with sha256 verification"
```

---

## Task 6: ProviderManager — lazy per-profile mount

The sole owner of `AssetsManager` lifetime. Every later task takes a `UnityProvider`.

**Files:**
- Create: `src/Unex/Core/ProviderManager.cs`
- Test: `tests/Unex.Tests/BundlePathTests.cs`

- [ ] **Step 1: Write the failing test**

Only the pure part — bundle-path filtering — is testable without game files.

```csharp
using Unex.Config;
using Unex.Core;
using Xunit;

namespace Unex.Tests;

public class BundlePathTests
{
    static string MakeTree(params string[] fileNames)
    {
        var dir = Path.Combine(Path.GetTempPath(), $"unex-{Guid.NewGuid():N}", "ContentArchives");
        Directory.CreateDirectory(dir);
        foreach (var name in fileNames) File.WriteAllText(Path.Combine(dir, name), "x");
        return dir;
    }

    [Fact]
    public void Manifests_and_extensioned_files_are_skipped()
    {
        var dir = MakeTree(
            "cd2465acddb8e6fbb7a6f02f03c1dc84",
            "4f9f7c3b640c0c6591399854c598c670",
            "archive_dependencies.txt",
            "archive_dependencies.bin",
            "something.resS");

        var profile = new Profile { DataDir = Path.GetDirectoryName(dir)!, BundleRoots = ["ContentArchives"] };
        var got = ProviderManager.EnumerateBundlePaths(profile).Select(Path.GetFileName).Order().ToList();

        Assert.Equal(["4f9f7c3b640c0c6591399854c598c670", "cd2465acddb8e6fbb7a6f02f03c1dc84"], got);
        Directory.Delete(Path.GetDirectoryName(dir)!, true);
    }

    [Fact]
    public void Missing_bundle_root_throws()
    {
        var profile = new Profile { DataDir = "Z:/absent", BundleRoots = ["ContentArchives"] };
        Assert.Throws<UnexException>(() => ProviderManager.EnumerateBundlePaths(profile).ToList());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd E:/arkive-games/unex && dotnet test --filter BundlePathTests`
Expected: FAIL — `ProviderManager` does not exist.

- [ ] **Step 3: Write `src/Unex/Core/ProviderManager.cs`**

The mount sequence (`new AssetsManager { UseQuickLookup = true }` → `LoadClassPackage` →
`LoadClassDatabaseFromPackage`) is copied verbatim from `unex-spike/Spike/Sweep.cs:16-18`.

```csharp
using System.Collections.Concurrent;
using AssetsTools.NET.Extra;
using Unex.Config;

namespace Unex.Core;

/// <summary>One mounted profile: the AssetsManager plus the resolved file lists.</summary>
public sealed class UnityProvider
{
    public required string ProfileName { get; init; }
    public required Profile Profile { get; init; }
    public required AssetsManager Manager { get; init; }
    public required string UnityVersion { get; init; }
    public required List<string> BundlePaths { get; init; }
    public required List<string> SerializedPaths { get; init; }

    /// <summary>
    /// Full VFS index, populated on demand by <c>UnityVfs.Index</c> (Task 7). Building it
    /// walks every bundle (~1 min, ~70 MB for V Rising), so it is cached per mount.
    /// </summary>
    public IReadOnlyList<VfsEntry>? CachedEntries { get; set; }
}

/// <summary>
/// Lazily mounts and caches one AssetsManager per profile. First use costs a class-database
/// load plus a directory scan; later uses hit the cache. A failed mount is evicted so a
/// long-lived serve/mcp process can retry after the user fixes the profile.
/// </summary>
public sealed class ProviderManager(ProfilesConfig config) : IDisposable
{
    readonly ConcurrentDictionary<string, Lazy<UnityProvider>> _providers =
        new(StringComparer.OrdinalIgnoreCase);

    public UnityProvider Get(string profileName)
    {
        var profile = config.Get(profileName); // throws UnexException for unknown names
        var lazy = _providers.GetOrAdd(profileName,
            _ => new Lazy<UnityProvider>(() => Mount(profileName, profile)));
        try
        {
            return lazy.Value;
        }
        catch
        {
            // Lazy caches its exception forever - evict so the next call retries.
            _providers.TryRemove(new KeyValuePair<string, Lazy<UnityProvider>>(profileName, lazy));
            throw;
        }
    }

    /// <summary>
    /// Every bundle under the profile's bundleRoots. V Rising's bundles are
    /// <b>extensionless</b>, and <c>archive_dependencies.txt</c> / <c>.bin</c> are manifests,
    /// not bundles - they must be skipped by name, never by a failed load attempt (spec §3.9).
    /// </summary>
    public static IEnumerable<string> EnumerateBundlePaths(Profile profile)
    {
        foreach (var root in profile.ResolvedBundleRoots)
        {
            if (!Directory.Exists(root))
                throw new UnexException($"bundle root not found: {root}");

            var paths = Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
                .Order(StringComparer.OrdinalIgnoreCase);
            foreach (var path in paths)
            {
                var name = Path.GetFileName(path);
                if (name.StartsWith("archive_dependencies", StringComparison.OrdinalIgnoreCase)) continue;
                if (Path.GetExtension(name).Length != 0) continue;
                yield return path;
            }
        }
    }

    /// <summary>
    /// Profile field first, otherwise read <c>Metadata.UnityVersion</c> off a real file.
    /// Uses a throwaway manager with no class database loaded - reading the metadata header
    /// needs no type templates (verified in <c>Spike/Sweep.cs</c> Classic, which prints
    /// <c>md.UnityVersion</c>).
    /// </summary>
    public static string DetectUnityVersion(Profile profile, string tpkPath)
    {
        if (!string.IsNullOrEmpty(profile.UnityVersion)) return profile.UnityVersion;

        var probe = new AssetsManager { UseQuickLookup = true };
        probe.LoadClassPackage(tpkPath);
        try
        {
            foreach (var bundlePath in EnumerateBundlePaths(profile).Take(8))
            {
                BundleFileInstance bundle;
                try { bundle = probe.LoadBundleFile(bundlePath, true); }
                catch { continue; }
                try
                {
                    var names = bundle.file.GetAllFileNames();
                    for (var i = 0; i < names.Count; i++)
                    {
                        if (!bundle.file.IsAssetsFile(i)) continue;
                        var inst = probe.LoadAssetsFileFromBundle(bundle, i, false);
                        var version = inst.file.Metadata.UnityVersion;
                        if (!string.IsNullOrEmpty(version)) return version;
                    }
                }
                catch { /* a broken bundle is not a reason to fail detection */ }
                finally { probe.UnloadBundleFile(bundle); probe.UnloadAllAssetsFiles(true); }
            }

            foreach (var path in profile.ResolvedSerializedFiles.Where(File.Exists))
            {
                try
                {
                    var inst = probe.LoadAssetsFile(path, false);
                    var version = inst.file.Metadata.UnityVersion;
                    probe.UnloadAssetsFile(inst);
                    if (!string.IsNullOrEmpty(version)) return version;
                }
                catch { /* try the next file */ }
            }
        }
        finally { probe.UnloadAllAssetsFiles(true); }

        throw new UnexException(
            "could not auto-detect the Unity version from any bundle or serialized file. " +
            "Set the profile's unityVersion field (e.g. \"2022.3.58f1\").");
    }

    static UnityProvider Mount(string name, Profile profile)
    {
        if (!Directory.Exists(profile.DataDir))
            throw new UnexException($"profile '{name}': dataDir not found: {profile.DataDir}");

        var tpk = ClassDatabase.Ensure(profile.ClassDatabase);
        var unityVersion = DetectUnityVersion(profile, tpk);

        var manager = new AssetsManager { UseQuickLookup = true };
        manager.LoadClassPackage(tpk);
        manager.LoadClassDatabaseFromPackage(unityVersion);

        var bundlePaths = EnumerateBundlePaths(profile).ToList();
        var serializedPaths = profile.ResolvedSerializedFiles.Where(File.Exists).ToList();
        if (bundlePaths.Count == 0 && serializedPaths.Count == 0)
            throw new UnexException(
                $"profile '{name}': no bundles under [{string.Join(", ", profile.ResolvedBundleRoots)}] " +
                $"and none of the configured serializedFiles exist under {profile.DataDir}.");

        Console.Error.WriteLine(
            $"unex: mounted '{name}' - unity {unityVersion}, {bundlePaths.Count} bundles, " +
            $"{serializedPaths.Count} serialized files");

        return new UnityProvider
        {
            ProfileName = name,
            Profile = profile,
            Manager = manager,
            UnityVersion = unityVersion,
            BundlePaths = bundlePaths,
            SerializedPaths = serializedPaths,
        };
    }

    public void Dispose()
    {
        foreach (var lazy in _providers.Values)
        {
            if (!lazy.IsValueCreated) continue;
            try { lazy.Value.Manager.UnloadAllAssetsFiles(true); } catch { /* best effort */ }
        }
        _providers.Clear();
    }
}
```

**Deliberately not used:** `AssetsManager.UnloadAll(...)` and `UnloadAllBundleFiles()` look
plausible but are **not** exercised anywhere in the spike, so they are not used here.
Every bundle load in this codebase is paired with `UnloadBundleFile` in a `finally`, so
`Dispose` only needs the verified `UnloadAllAssetsFiles(true)`. If you want a tidier
`Dispose`, confirm the member exists first by running the spike's `ApiDump`
(`E:/arkive-games/unex-spike/Spike/ApiDump.cs`, filter `AssetsManager`) — do not guess.

**Also deliberately avoided:** reading the Unity version out of the bundle *header*
(`bundle.file.Header.…`). The exact field name on `AssetBundleHeader` is unconfirmed;
`Metadata.UnityVersion` is verified and gives the same answer.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test --filter BundlePathTests`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/Unex/Core/ProviderManager.cs tests/Unex.Tests/BundlePathTests.cs
git commit -m "feat: lazy per-profile AssetsManager mount with auto Unity version detection"
```

---

## Task 7: UnityVfs plus the `list` and `search` commands

**Files:**
- Create: `src/Unex/Core/UnityVfs.cs`
- Modify: `src/Unex/Program.cs`

- [ ] **Step 1: Write `src/Unex/Core/UnityVfs.cs`**

The walk order and every API call below is harvested from `Spike/Sweep.cs:32-72`. Two
structural notes:

- `yield return` is illegal inside a `catch` block, so each container walk is a plain method
  returning a `List<VfsEntry>`; only the top-level `Enumerate` is an iterator.
- Per-file failures are **reported and skipped**. 2 of 4,409 bundles have unreadable
  sub-files (spec §3.9); a fatal error there would make the tool useless.

```csharp
using AssetsTools.NET;
using AssetsTools.NET.Extra;

namespace Unex.Core;

/// <summary>
/// Walks bundles and classic serialized files into <see cref="VfsEntry"/> values.
/// V Rising's bundles carry no container paths (spec §3.2), so paths are synthesized:
/// <c>bundles/&lt;guid&gt;/&lt;TypeName&gt;/&lt;m_Name|PathID&gt;</c> and
/// <c>serialized/&lt;fileName&gt;/&lt;TypeName&gt;/&lt;m_Name|PathID&gt;</c>.
/// Not thread-safe: it mounts and unmounts on the provider's shared AssetsManager.
/// </summary>
public static class UnityVfs
{
    /// <summary>
    /// Class-ID to name. Four script-hash class IDs used by V Rising are absent from the
    /// enum (VFXRenderer 73398921, VisualEffect 2083052967, VisualEffectAsset 2058629509,
    /// the ParentConstraint family near 18183606xx), so the numeric fallback is required,
    /// not defensive padding. Harvested from Spike/Scan.cs:286.
    /// </summary>
    public static string TypeName(int classId) =>
        Enum.GetName(typeof(AssetClassID), classId) ?? $"Unknown({classId})";

    /// <summary>Full index, built once per mount and cached on the provider.</summary>
    public static IReadOnlyList<VfsEntry> Index(UnityProvider p, Action<string>? onError = null) =>
        p.CachedEntries ??= Enumerate(p, onError).ToList();

    public static IEnumerable<VfsEntry> Enumerate(UnityProvider p, Action<string>? onError = null)
    {
        foreach (var path in p.BundlePaths)
            foreach (var entry in EnumerateBundle(p, path, onError))
                yield return entry;

        foreach (var path in p.SerializedPaths)
            foreach (var entry in EnumerateSerialized(p, path, onError))
                yield return entry;
    }

    public static List<VfsEntry> EnumerateBundle(
        UnityProvider p, string bundlePath, Action<string>? onError = null)
    {
        var container = Path.GetFileName(bundlePath);
        var am = p.Manager;
        var entries = new List<VfsEntry>();

        BundleFileInstance bundle;
        try { bundle = am.LoadBundleFile(bundlePath, true); }
        catch (Exception ex)
        {
            onError?.Invoke($"{container}: LOAD {ex.GetType().Name}: {ex.Message}");
            return entries;
        }

        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var names = bundle.file.GetAllFileNames();
            for (var i = 0; i < names.Count; i++)
            {
                if (!bundle.file.IsAssetsFile(i)) continue;
                AssetsFileInstance inst;
                try { inst = am.LoadAssetsFileFromBundle(bundle, i, false); }
                catch (Exception ex)
                {
                    onError?.Invoke($"{container}[{i}]: SUB {ex.GetType().Name}: {ex.Message}");
                    continue;
                }
                ReadObjects(am, inst, $"bundles/{container}", container, used, entries, onError);
            }
        }
        catch (Exception ex)
        {
            onError?.Invoke($"{container}: WALK {ex.GetType().Name}: {ex.Message}");
        }
        finally { am.UnloadBundleFile(bundle); am.UnloadAllAssetsFiles(true); }

        return entries;
    }

    public static List<VfsEntry> EnumerateSerialized(
        UnityProvider p, string filePath, Action<string>? onError = null)
    {
        var container = Path.GetFileName(filePath);
        var am = p.Manager;
        var entries = new List<VfsEntry>();

        AssetsFileInstance inst;
        try { inst = am.LoadAssetsFile(filePath, false); }
        catch (Exception ex)
        {
            onError?.Invoke($"{container}: LOAD {ex.GetType().Name}: {ex.Message}");
            return entries;
        }

        try
        {
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            ReadObjects(am, inst, $"serialized/{container}", container, used, entries, onError);
        }
        catch (Exception ex)
        {
            onError?.Invoke($"{container}: WALK {ex.GetType().Name}: {ex.Message}");
        }
        finally { am.UnloadAssetsFile(inst); }

        return entries;
    }

    static void ReadObjects(
        AssetsManager am, AssetsFileInstance inst, string vfsRoot, string container,
        HashSet<string> used, List<VfsEntry> sink, Action<string>? onError)
    {
        foreach (var info in inst.file.Metadata.AssetInfos)
        {
            var typeName = TypeName(info.TypeId);
            var name = "";
            try
            {
                // AssetReadFlags.None keeps this cheap: no PPtr following, no full deserialize.
                var field = am.GetBaseField(inst, info, AssetReadFlags.None)?["m_Name"];
                if (field != null && !field.IsDummy) name = field.AsString ?? "";
            }
            catch (Exception ex)
            {
                onError?.Invoke(
                    $"{container} pathId={info.PathId} {typeName}: NAME {ex.GetType().Name}: {ex.Message}");
            }

            // '/' inside m_Name would fake a directory level (e.g. the "Core/MapMarker" MonoBehaviours).
            var stem = name.Length > 0 ? name.Replace('/', '_') : info.PathId.ToString();
            var vfsPath = $"{vfsRoot}/{typeName}/{stem}";
            if (!used.Add(vfsPath))
            {
                vfsPath = $"{vfsRoot}/{typeName}/{stem}#{info.PathId}";
                used.Add(vfsPath);
            }
            sink.Add(new VfsEntry(vfsPath, container, info.PathId, info.TypeId, typeName, name));
        }
    }
}
```

- [ ] **Step 2: Rewrite `src/Unex/Program.cs` with the shared wiring plus `list` and `search`**

Program.cs stays **logic-free**: option declarations, one `Build*Command()` per subcommand,
and error mapping. Every later task adds one `Build*Command()` method and one
`root.Subcommands.Add(...)` line. Shape and API usage mirror
`E:/arkive-games/uex/src/Uex/Program.cs`.

```csharp
using System.CommandLine;
using Unex.Config;
using Unex.Core;

namespace Unex;

public static class Program
{
    static readonly Option<string?> ConfigOption = new("--config")
    {
        Description = "Path to profiles.json (default: UNEX_PROFILES env, ./profiles.json, exe dir)",
        Recursive = true,
    };

    static readonly Option<string> ProfileOption = new("--profile")
    {
        Description = "Game profile name from profiles.json",
        Required = true,
    };

    public static int Main(string[] args)
    {
        var root = new RootCommand("unex - Unity asset export and exploration tool");
        root.Options.Add(ConfigOption);
        root.Subcommands.Add(BuildListCommand());
        root.Subcommands.Add(BuildSearchCommand());
        return root.Parse(args).Invoke();
    }

    static int Run(Func<int> action)
    {
        try { return action(); }
        catch (UnexException e) { Console.Error.WriteLine($"error: {e.Message}"); return 1; }
        catch (Exception e)
        {
            Console.Error.WriteLine($"unexpected error: {e.GetType().Name}: {e.Message}");
            return 1;
        }
    }

    static void Warn(string message) => Console.Error.WriteLine($"unex: {message}");

    static Command BuildListCommand()
    {
        var pathArg = new Argument<string>("path")
        {
            Description = "VFS directory ('' = root)",
            DefaultValueFactory = _ => "",
        };
        var command = new Command("list", "List children of a VFS directory");
        command.Options.Add(ProfileOption);
        command.Arguments.Add(pathArg);
        command.SetAction(parse => Run(() =>
        {
            var config = ProfilesConfig.Resolve(parse.GetValue(ConfigOption));
            using var providers = new ProviderManager(config);
            var provider = providers.Get(parse.GetValue(ProfileOption)!);
            var index = UnityVfs.Index(provider, Warn);
            foreach (var child in VfsQuery.ListDir(index, parse.GetValue(pathArg)!).Order(StringComparer.Ordinal))
                Console.WriteLine(child);
            return 0;
        }));
        return command;
    }

    static Command BuildSearchCommand()
    {
        var patternArg = new Argument<string>("pattern")
        {
            Description = "Substring (default) or regex with --regex",
        };
        var regexOption = new Option<bool>("--regex") { Description = "Treat pattern as a regex" };
        var limitOption = new Option<int>("--limit")
        {
            Description = "Max results to print",
            DefaultValueFactory = _ => 200,
        };
        var command = new Command("search", "Search all VFS paths");
        command.Options.Add(ProfileOption);
        command.Options.Add(regexOption);
        command.Options.Add(limitOption);
        command.Arguments.Add(patternArg);
        command.SetAction(parse => Run(() =>
        {
            var config = ProfilesConfig.Resolve(parse.GetValue(ConfigOption));
            using var providers = new ProviderManager(config);
            var provider = providers.Get(parse.GetValue(ProfileOption)!);
            var index = UnityVfs.Index(provider, Warn);
            var hits = VfsQuery.Search(index, parse.GetValue(patternArg)!,
                parse.GetValue(regexOption), parse.GetValue(limitOption)).ToList();
            foreach (var hit in hits)
                Console.WriteLine($"{hit.VfsPath}\t{hit.TypeName}\tpathId={hit.PathId}");
            Console.Error.WriteLine($"({hits.Count} shown)");
            return 0;
        }));
        return command;
    }
}
```

- [ ] **Step 3: Verify the build and the existing tests**

Run: `cd E:/arkive-games/unex && dotnet build && dotnet test`
Expected: `Build succeeded`; PASS, 22 tests (3 + 6 + 7 + 4 + 2).

- [ ] **Step 4: Verify `list` against the real game**

Run: `dotnet run --project src/Unex -- list --profile vrising ""`
Expected (first run takes ~1 min — the index walks all 4,409 bundles; up to 2 `SUB` warnings
on stderr are the known failures from spec §3.9):

```
bundles/
serialized/
```

Run: `dotnet run --project src/Unex -- list --profile vrising bundles/1291f83dad76aebee1e45eb99ba68359`
Expected: type directories including `Texture2D/` and `Sprite/`.

- [ ] **Step 5: Verify `search` against the real game**

Run: `dotnet run --project src/Unex -- search --profile vrising ZoneMap_Wilderness`
Expected: hits under **both** roots, proving the two walks work and that the same name really
does exist twice (spec §3.7) —

```
bundles/3f4a8cafb88ce4502e1f2cacf8444118/Texture2D/ZoneMap_Wilderness_VRisingWorld	Texture2D	pathId=2934395629438329135
serialized/resources.assets/Texture2D/ZoneMap_Wilderness_VRisingWorld	Texture2D	pathId=103
```

- [ ] **Step 6: Commit**

```bash
git add src/Unex/Core/UnityVfs.cs src/Unex/Program.cs
git commit -m "feat: synthesize a VFS over bundles and serialized files; add list and search"
```

---

## Task 8: FieldJson, AssetOps and the `preview` command

**Files:**
- Create: `src/Unex/Core/FieldJson.cs`, `src/Unex/Core/AssetOps.cs`
- Modify: `src/Unex/Program.cs`
- Test: `tests/Unex.Tests/AssetOpsTests.cs`

- [ ] **Step 1: Write `src/Unex/Core/FieldJson.cs`**

`AssetValueType` member names below are harvested from `Spike/Q2.cs:176-203`, which ran
against the real game. **Confirm the full set once** before extending it:

```csharp
Console.WriteLine(string.Join(", ", Enum.GetNames(typeof(AssetsTools.NET.AssetValueType))));
```

Do not add members by guessing. The one accessor pair that is *not* verified is
`AsUInt`/`AsULong`; the code below therefore uses only `AsInt`/`AsLong`, with a note at the
unsigned cases.

The `Array` collapse is load-bearing: Unity models every list as a wrapper field with a
single synthetic `Array` child, so without the collapse `fields.TerritoryTextures` would be
`{"Array": [...]}` instead of the array asserted in Step 5.

```csharp
using System.Text.Json.Nodes;
using AssetsTools.NET;

namespace Unex.Core;

/// <summary>Recursive AssetTypeValueField -> JsonNode. No I/O; pure shape translation.</summary>
public static class FieldJson
{
    public static JsonNode? ToJson(AssetTypeValueField field)
    {
        var valueType = field.Value?.ValueType ?? AssetValueType.None;

        // 1. Array template: Unity wraps lists in a synthetic "Array" child. Collapse it.
        if (valueType == AssetValueType.None &&
            field.Children.Count == 1 &&
            field.Children[0].FieldName == "Array" &&
            (field.Children[0].Value?.ValueType ?? AssetValueType.None) == AssetValueType.Array)
            return ToJson(field.Children[0]);

        if (valueType == AssetValueType.Array)
        {
            var array = new JsonArray();
            foreach (var child in field.Children) array.Add(ToJson(child));
            return array;
        }

        // 2. Leaf value. Checked before the children test because a string field also has
        //    children (its char array) and must not serialize as an object.
        switch (valueType)
        {
            case AssetValueType.String:
                return JsonValue.Create(field.AsString ?? "");
            case AssetValueType.Bool:
                return JsonValue.Create(field.AsBool);
            case AssetValueType.Int8:
            case AssetValueType.UInt8:
            case AssetValueType.Int16:
            case AssetValueType.UInt16:
            case AssetValueType.Int32:
                return JsonValue.Create(field.AsInt);
            case AssetValueType.UInt32:
                return JsonValue.Create(field.AsLong); // widened so values > int.MaxValue stay positive
            case AssetValueType.Int64:
            case AssetValueType.UInt64:
                // If AsULong exists (confirm once via Spike/ApiDump.cs, filter
                // AssetTypeValueField), switch the UInt64 case to it. With AsLong, u64
                // values above long.MaxValue render negative. No such field is known in
                // V Rising's data, so this is documented rather than worked around.
                return JsonValue.Create(field.AsLong);
            case AssetValueType.Float:
                return JsonValue.Create(field.AsFloat);
            case AssetValueType.Double:
                return JsonValue.Create(field.AsDouble);
            case AssetValueType.ByteArray:
                return JsonValue.Create(Convert.ToHexStringLower(field.AsByteArray ?? []));
        }

        // 3. Has children: a struct / class node.
        if (field.Children.Count > 0)
        {
            var obj = new JsonObject();
            foreach (var child in field.Children)
            {
                var key = child.FieldName;
                if (string.IsNullOrEmpty(key)) continue;
                obj[key] = ToJson(child); // duplicate field names cannot occur in a type tree
            }
            return obj;
        }

        return null;
    }
}
```

- [ ] **Step 2: Write `src/Unex/Core/AssetOps.cs`**

`WithLoadedBundle` hands the callback the `BundleFileInstance` because Task 9 needs it for
`SetPictureDataFromBundle`. Resolution deliberately re-walks **only the one container** named
in the VFS path rather than building the full index, so `preview` is fast.

`AssetFileInfo` is the element type of `Metadata.AssetInfos`. The spike only ever used `var`,
so **confirm this type name once** via `Spike/ApiDump.cs` (filter `AssetFileInfo`) — it was
`AssetFileInfoEx` in AssetsTools.NET v2, and this signature is the only place the name is
spelled out.

```csharp
using System.Text.Json;
using System.Text.Json.Nodes;
using AssetsTools.NET;
using AssetsTools.NET.Extra;

namespace Unex.Core;

public static class AssetOps
{
    static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    /// <summary>
    /// VFS path -> VfsEntry. Walks only the container named in the path (segment 2), so this
    /// costs one bundle load, not a full sweep.
    /// </summary>
    public static VfsEntry Resolve(UnityProvider p, string vfsPath, Action<string>? onError = null)
    {
        var normalized = vfsPath.Replace('\\', '/').Trim('/');
        var segments = normalized.Split('/');
        if (segments.Length < 3)
            throw new UnexException(
                $"'{vfsPath}' is not an object path. Expected " +
                "bundles/<guid>/<TypeName>/<name> or serialized/<fileName>/<TypeName>/<name>.");

        var candidates = segments[0] switch
        {
            "bundles" => UnityVfs.EnumerateBundle(p, ContainerPath(p.BundlePaths, segments[1], "bundle"), onError),
            "serialized" => UnityVfs.EnumerateSerialized(p, ContainerPath(p.SerializedPaths, segments[1], "serialized file"), onError),
            _ => throw new UnexException($"unknown VFS root '{segments[0]}'. Roots: bundles, serialized."),
        };

        var exact = candidates
            .Where(e => string.Equals(e.VfsPath, normalized, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (exact.Count == 1) return exact[0];

        // Tolerate a missing type segment: "bundles/<guid>/<name>" also resolves when unique.
        var tail = "/" + segments[^1];
        var loose = candidates
            .Where(e => e.VfsPath.EndsWith(tail, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (loose.Count == 1) return loose[0];

        if (loose.Count > 1)
            throw new UnexException(
                $"'{vfsPath}' is ambiguous ({loose.Count} matches). Candidates:\n  " +
                string.Join("\n  ", loose.Take(10).Select(e => e.VfsPath)));

        throw new UnexException(
            $"'{vfsPath}' not found in {segments[1]} ({candidates.Count} objects). " +
            "Use 'unex search' to find the exact VFS path.");
    }

    static string ContainerPath(List<string> known, string container, string kind) =>
        known.FirstOrDefault(x => string.Equals(Path.GetFileName(x), container, StringComparison.OrdinalIgnoreCase))
        ?? throw new UnexException($"no {kind} named '{container}' is mounted for this profile.");

    /// <summary>
    /// Re-opens the container that owns <paramref name="entry"/> and runs the callback with the
    /// loaded file, the object's info, and the owning bundle (null for classic files, which
    /// stream their pixels from a sibling .resS instead).
    /// </summary>
    public static T WithLoadedBundle<T>(
        UnityProvider p, VfsEntry entry,
        Func<AssetsFileInstance, AssetFileInfo, BundleFileInstance?, T> body)
    {
        var am = p.Manager;
        var bundlePath = p.BundlePaths.FirstOrDefault(
            x => string.Equals(Path.GetFileName(x), entry.Container, StringComparison.OrdinalIgnoreCase));

        if (bundlePath is not null)
        {
            var bundle = am.LoadBundleFile(bundlePath, true);
            try
            {
                var names = bundle.file.GetAllFileNames();
                for (var i = 0; i < names.Count; i++)
                {
                    if (!bundle.file.IsAssetsFile(i)) continue;
                    var inst = am.LoadAssetsFileFromBundle(bundle, i, false);
                    var info = inst.file.Metadata.GetAssetInfo(entry.PathId);
                    if (info is null) continue;
                    return body(inst, info, bundle);
                }
                throw new UnexException(
                    $"pathId {entry.PathId} is not in bundle {entry.Container} (stale VFS path?)");
            }
            finally { am.UnloadBundleFile(bundle); am.UnloadAllAssetsFiles(true); }
        }

        var serializedPath = p.SerializedPaths.FirstOrDefault(
                x => string.Equals(Path.GetFileName(x), entry.Container, StringComparison.OrdinalIgnoreCase))
            ?? throw new UnexException($"container '{entry.Container}' is not mounted for this profile.");

        var serializedInst = am.LoadAssetsFile(serializedPath, false);
        try
        {
            var info = serializedInst.file.Metadata.GetAssetInfo(entry.PathId)
                ?? throw new UnexException($"pathId {entry.PathId} is not in {entry.Container}");
            return body(serializedInst, info, null);
        }
        finally { am.UnloadAssetsFile(serializedInst); }
    }

    public static string Preview(UnityProvider p, VfsEntry entry, int maxBytes)
    {
        var json = WithLoadedBundle(p, entry, (inst, info, _) =>
        {
            var baseField = p.Manager.GetBaseField(inst, info)
                ?? throw new UnexException(
                    $"{entry.VfsPath}: no type template for class {entry.ClassId} " +
                    $"({entry.TypeName}); the class database may not cover this Unity version.");
            return new JsonObject
            {
                ["vfsPath"] = entry.VfsPath,
                ["container"] = entry.Container,
                ["pathId"] = entry.PathId,
                ["classId"] = entry.ClassId,
                ["typeName"] = entry.TypeName,
                ["name"] = entry.Name,
                ["fields"] = FieldJson.ToJson(baseField),
            }.ToJsonString(Indented);
        });

        return json.Length <= maxBytes
            ? json
            : json[..maxBytes] + $"\n... truncated at {maxBytes} chars (raise --max-bytes)";
    }
}
```

- [ ] **Step 3: Write the resolution-error test**

Game-file-free coverage of the argument validation only.

```csharp
using Unex.Config;
using Unex.Core;
using Xunit;

namespace Unex.Tests;

public class AssetOpsTests
{
    static UnityProvider Empty() => new()
    {
        ProfileName = "t",
        Profile = new Profile(),
        Manager = null!,        // never touched: every case below throws during validation
        UnityVersion = "2022.3.58f1",
        BundlePaths = [],
        SerializedPaths = [],
    };

    [Theory]
    [InlineData("bundles")]
    [InlineData("bundles/abcd")]
    [InlineData("")]
    public void Paths_with_fewer_than_three_segments_are_rejected(string path)
    {
        var ex = Assert.Throws<UnexException>(() => AssetOps.Resolve(Empty(), path));
        Assert.Contains("not an object path", ex.Message);
    }

    [Fact]
    public void Unknown_root_is_rejected_by_name()
    {
        var ex = Assert.Throws<UnexException>(() => AssetOps.Resolve(Empty(), "entities/Foo/0"));
        Assert.Contains("unknown VFS root", ex.Message);
    }

    [Fact]
    public void Unmounted_container_is_reported()
    {
        var ex = Assert.Throws<UnexException>(
            () => AssetOps.Resolve(Empty(), "bundles/deadbeef/Texture2D/Foo"));
        Assert.Contains("deadbeef", ex.Message);
    }
}
```

- [ ] **Step 4: Add the `preview` command to `Program.cs`**

Add the method and register it in `Main` next to the others
(`root.Subcommands.Add(BuildPreviewCommand());`).

```csharp
    static Command BuildPreviewCommand()
    {
        var assetArg = new Argument<string>("asset") { Description = "VFS path of the object" };
        var maxBytesOption = new Option<int>("--max-bytes")
        {
            Description = "Truncate JSON beyond this size",
            DefaultValueFactory = _ => 200_000,
        };
        var command = new Command("preview", "Serialize one object's fields to JSON on stdout");
        command.Options.Add(ProfileOption);
        command.Options.Add(maxBytesOption);
        command.Arguments.Add(assetArg);
        command.SetAction(parse => Run(() =>
        {
            var config = ProfilesConfig.Resolve(parse.GetValue(ConfigOption));
            using var providers = new ProviderManager(config);
            var provider = providers.Get(parse.GetValue(ProfileOption)!);
            var entry = AssetOps.Resolve(provider, parse.GetValue(assetArg)!, Warn);
            Console.WriteLine(AssetOps.Preview(provider, entry, parse.GetValue(maxBytesOption)));
            return 0;
        }));
        return command;
    }
```

- [ ] **Step 5: Run the tests, then verify `preview` against the real game**

Run: `dotnet test`
Expected: PASS, 27 tests (22 + 5).

Run:
```bash
dotnet run --project src/Unex -- preview --profile vrising \
  "bundles/a1620494a9d50bc243346b8d740f24fa/MonoBehaviour/ZoneMap_VRisingWorld_POIPolygonTextureCollection" \
  --max-bytes 2000000 > /tmp/poi.json
```

Verify the shape and the numbers measured in the spike (`Spike/Q3.cs`):

```bash
python -c "import json;d=json.load(open('/tmp/poi.json'));t=d['fields']['TerritoryTextures'];print(len(t), t[0]['CenterPosWS'])"
```

Expected exactly:

```
226 {'x': -1855.0, 'y': -1832.5}
```

`TerritoryTextures` being a **list of 226** (not `{"Array": ...}`) proves the collapse rule;
`CenterPosWS` being `{x, y}` proves the struct case; the float values prove
`AssetValueType.Float` is mapped correctly.

- [ ] **Step 6: Commit**

```bash
git add src/Unex/Core/FieldJson.cs src/Unex/Core/AssetOps.cs src/Unex/Program.cs \
        tests/Unex.Tests/AssetOpsTests.cs
git commit -m "feat: field-tree JSON serialization and the preview command"
```

---

## Task 9: TextureExport and the `preview-texture` command

**Files:**
- Create: `src/Unex/Core/TextureExport.cs`
- Modify: `src/Unex/Program.cs`

- [ ] **Step 1: Write `src/Unex/Core/TextureExport.cs`**

The call sequence is harvested from `Spike/MapIcons.cs:44-58` and `Spike/Q2.cs:50-72`. **The
one thing that must not be dropped:**

> if `texture.m_StreamData.path` is non-empty you MUST call
> `texture.SetPictureDataFromBundle(bundle)` before `FillPictureData(inst)`.

Omitting it does not throw — `FillPictureData` returns a zero-length array and
`DecodeTextureImage` writes a **0-byte PNG**. That exact bug produced every file in
`E:/arkive-games/unex-spike/out/png/`, which the spec retains as its signature (§12). The code
below therefore also hard-fails on 0 raw bytes and on a 0-byte output file, so the failure can
never be silent again.

`m_StreamData` and `m_TextureSettings` are **structs**, not classes: `texture.m_StreamData?.path`
is a compile error (`CS8977`-class "cannot use ?. on a non-nullable value type"). Use
`string.IsNullOrEmpty(texture.m_StreamData.path)`.

The `Sprite` branch reads `m_RD.texture` to reach the backing Texture2D. Those two field names
come from the embedded type tree and are **not** verified by the spike. Confirm them once with
`unex preview --profile vrising "bundles/1291f83dad76aebee1e45eb99ba68359/Sprite/MapIcon_Trader"`
and read the JSON — do not guess a second name if the first fails.

```csharp
using AssetsTools.NET;
using AssetsTools.NET.Extra;
using AssetsTools.NET.Texture;

namespace Unex.Core;

public sealed record TextureInfo(
    string Name, int Width, int Height, string Format, int RawBytes, long PngBytes, string OutPath);

public static class TextureExport
{
    public static bool IsTextureType(string typeName) =>
        typeName is "Texture2D" or "Sprite" or "Cubemap";

    /// <summary>
    /// Core writer, used both by preview-texture and by the streaming export (Task 10), which
    /// already holds an open bundle and must not re-open it per object.
    /// </summary>
    public static TextureInfo WritePng(
        AssetsManager am, AssetsFileInstance inst, AssetFileInfo info,
        BundleFileInstance? bundle, string outPath, string label)
    {
        var baseField = am.GetBaseField(inst, info)
            ?? throw new UnexException($"{label}: no type template for class {info.TypeId}");

        // Sprites do not own pixels; hop to the Texture2D in m_RD.texture.
        if (UnityVfs.TypeName(info.TypeId) == "Sprite")
        {
            var pathIdField = baseField["m_RD"]["texture"]["m_PathID"];
            if (pathIdField == null || pathIdField.IsDummy)
                throw new UnexException($"{label}: Sprite has no m_RD.texture PPtr");
            var texturePathId = pathIdField.AsLong;
            if (texturePathId == 0)
                throw new UnexException($"{label}: Sprite's m_RD.texture is null");
            var textureInfo = inst.file.Metadata.GetAssetInfo(texturePathId)
                ?? throw new UnexException(
                    $"{label}: Sprite references texture pathId {texturePathId}, which is not in " +
                    $"the same file (cross-file sprite atlases are not supported)");
            baseField = am.GetBaseField(inst, textureInfo)
                ?? throw new UnexException($"{label}: no type template for the backing Texture2D");
        }

        var texture = TextureFile.ReadTextureFile(baseField);
        var format = ((TextureFormat)texture.m_TextureFormat).ToString();

        // m_StreamData is a struct - `?.` will not compile here.
        if (!string.IsNullOrEmpty(texture.m_StreamData.path))
        {
            if (bundle is null)
            {
                // Classic serialized files stream from a sibling .resS, which FillPictureData
                // resolves itself; only bundle-hosted textures need the explicit hand-off.
            }
            else
            {
                texture.SetPictureDataFromBundle(bundle);
            }
        }

        var data = texture.FillPictureData(inst);
        if (data is null || data.Length == 0)
            throw new UnexException(
                $"{label}: 0 raw pixel bytes (format {format}, streamData path " +
                $"'{texture.m_StreamData.path}'). For a bundle-hosted texture this means " +
                "SetPictureDataFromBundle was not called; for a classic file it means the " +
                "sibling .resS is missing.");

        var fullOut = Path.GetFullPath(outPath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullOut)!);
        if (!texture.DecodeTextureImage(data, fullOut, ImageExportType.Png, 100))
            throw new UnexException($"{label}: decode failed for texture format {format}");

        var pngBytes = File.Exists(fullOut) ? new FileInfo(fullOut).Length : 0;
        if (pngBytes == 0)
            throw new UnexException(
                $"{label}: wrote a 0-byte PNG from {data.Length} raw bytes (format {format})");

        return new TextureInfo(
            texture.m_Name ?? "", texture.m_Width, texture.m_Height, format,
            data.Length, pngBytes, fullOut);
    }

    public static TextureInfo SavePng(UnityProvider p, VfsEntry entry, string outPath)
    {
        if (!IsTextureType(entry.TypeName))
            throw new UnexException(
                $"{entry.VfsPath} is a {entry.TypeName}; preview-texture handles " +
                "Texture2D, Sprite and Cubemap.");

        return AssetOps.WithLoadedBundle(p, entry,
            (inst, info, bundle) =>
                WritePng(p.Manager, inst, info, bundle, outPath, entry.VfsPath));
    }
}
```

- [ ] **Step 2: Add the `preview-texture` command to `Program.cs`**

Register it in `Main` (`root.Subcommands.Add(BuildPreviewTextureCommand());`).

```csharp
    static Command BuildPreviewTextureCommand()
    {
        var assetArg = new Argument<string>("asset") { Description = "VFS path of a Texture2D/Sprite/Cubemap" };
        var outOption = new Option<string>("--out") { Description = "PNG output file path", Required = true };
        var command = new Command("preview-texture", "Decode one texture to a PNG file");
        command.Options.Add(ProfileOption);
        command.Options.Add(outOption);
        command.Arguments.Add(assetArg);
        command.SetAction(parse => Run(() =>
        {
            var config = ProfilesConfig.Resolve(parse.GetValue(ConfigOption));
            using var providers = new ProviderManager(config);
            var provider = providers.Get(parse.GetValue(ProfileOption)!);
            var entry = AssetOps.Resolve(provider, parse.GetValue(assetArg)!, Warn);
            var info = TextureExport.SavePng(provider, entry, parse.GetValue(outOption)!);
            Console.WriteLine(
                $"{info.Name}  {info.Width}x{info.Height}  {info.Format}  " +
                $"raw={info.RawBytes:N0}  png={info.PngBytes:N0}  -> {info.OutPath}");
            return 0;
        }));
        return command;
    }
```

- [ ] **Step 3: Verify against the real game**

Run:
```bash
dotnet run --project src/Unex -- preview-texture --profile vrising \
  "bundles/3f4a8cafb88ce4502e1f2cacf8444118/Texture2D/ZoneMap_Wilderness_VRisingWorld" \
  --out /tmp/wilderness.png
```

Expected (matching the spike's `out/zonemap.txt`):

```
ZoneMap_Wilderness_VRisingWorld  6080x6080  DXT1  raw=18,483,200  png=<~50,000,000>  -> ...
```

Then assert the file is genuinely non-empty — this is the check that catches the
`SetPictureDataFromBundle` regression:

```bash
ls -l /tmp/wilderness.png
```
Expected: roughly 50 MB, and **explicitly not 0 bytes**. If it is 0 bytes, the streamed-pixel
hand-off was skipped; nothing else can produce that result.

- [ ] **Step 4: Verify the classic-file copy decodes too**

Run:
```bash
dotnet run --project src/Unex -- preview-texture --profile vrising \
  "serialized/resources.assets/Texture2D/ZoneMap_Wilderness_VRisingWorld" \
  --out /tmp/wilderness_classic.png
```
Expected: another non-zero PNG. This exercises the `bundle is null` path, where the pixels come
from the sibling `.resS` via `FillPictureData` alone.

- [ ] **Step 5: Commit**

```bash
git add src/Unex/Core/TextureExport.cs src/Unex/Program.cs
git commit -m "feat: Texture2D/Sprite PNG decode incl. bundle-streamed pixels"
```

---

## Task 10: GuidIndex, ExportRunner and the `export` command

**Files:**
- Create: `src/Unex/Core/GuidIndex.cs`, `src/Unex/Core/ExportRunner.cs`
- Modify: `src/Unex/Program.cs`
- Test: `tests/Unex.Tests/GuidIndexTests.cs`

- [ ] **Step 1: Write the failing test for the dependency-graph parser**

`archive_dependencies.txt` is plain text, so the parser is unit-testable with a synthetic
fixture. Real counts to expect from the game file (spec §3.2): 4,410 `Archive:`, 4,410 `File:`,
1,151 `Object:`, 56,451 `Dependency:`.

```csharp
using Unex.Core;
using Xunit;

namespace Unex.Tests;

public class GuidIndexTests
{
    [Fact]
    public void Dependency_lines_are_attributed_to_the_enclosing_archive()
    {
        var path = Path.Combine(Path.GetTempPath(), $"unex-{Guid.NewGuid():N}.txt");
        File.WriteAllText(path,
            "Archive: aaaa1111\n" +
            "\tFile: aaaa1111\n" +
            "\t\tObject: 11112222333344445555666677778888:5\n" +
            "\t\tDependency: bbbb2222\n" +
            "\t\tDependency: cccc3333\n" +
            "Archive: bbbb2222\n" +
            "\tFile: bbbb2222\n" +
            "\t\tDependency: cccc3333\n");

        var graph = GuidIndex.ParseDependencies(path);

        Assert.Equal(2, graph.ArchiveCount);
        Assert.Equal(2, graph.FileCount);
        Assert.Equal(1, graph.ObjectCount);
        Assert.Equal(3, graph.DependencyCount);
        Assert.Equal(["bbbb2222", "cccc3333"], graph.Dependencies["aaaa1111"]);
        Assert.Equal(["cccc3333"], graph.Dependencies["bbbb2222"]);
        File.Delete(path);
    }

    [Fact]
    public void A_dependency_before_any_archive_is_an_error()
    {
        var path = Path.Combine(Path.GetTempPath(), $"unex-{Guid.NewGuid():N}.txt");
        File.WriteAllText(path, "\t\tDependency: bbbb2222\n");
        var ex = Assert.Throws<UnexException>(() => GuidIndex.ParseDependencies(path));
        Assert.Contains("before any 'Archive:'", ex.Message);
        File.Delete(path);
    }

    [Fact]
    public void Missing_dependency_file_is_reported_as_absent_not_thrown()
    {
        Assert.Null(GuidIndex.TryFindDependencyFile(["Z:/absent"]));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd E:/arkive-games/unex && dotnet test --filter GuidIndexTests`
Expected: FAIL — `GuidIndex` does not exist.

- [ ] **Step 3: Write `src/Unex/Core/GuidIndex.cs`**

The writer streams: it holds one `Utf8JsonWriter` open for the whole export and never
accumulates the 489,455 records in memory.

```csharp
using System.Text.Json;

namespace Unex.Core;

public sealed record ArchiveGraph(
    Dictionary<string, List<string>> Dependencies,
    int ArchiveCount, int FileCount, int ObjectCount, int DependencyCount);

public static class GuidIndex
{
    public const string DependencyFileName = "archive_dependencies.txt";

    public static string? TryFindDependencyFile(IEnumerable<string> bundleRoots) =>
        bundleRoots.Select(root => Path.Combine(root, DependencyFileName)).FirstOrDefault(File.Exists);

    /// <summary>
    /// Parses the inter-bundle dependency manifest. Line shapes (indentation is informational
    /// only, so the parser trims and matches on the prefix):
    /// <c>Archive: &lt;guid&gt;</c>, tab <c>File: &lt;guid&gt;</c>,
    /// two tabs <c>Object: &lt;guid&gt;:&lt;localId&gt;</c>, two tabs <c>Dependency: &lt;guid&gt;</c>.
    /// </summary>
    public static ArchiveGraph ParseDependencies(string path)
    {
        if (!File.Exists(path)) throw new UnexException($"dependency manifest not found: {path}");

        var dependencies = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        string? current = null;
        int archives = 0, files = 0, objects = 0, deps = 0;

        foreach (var raw in File.ReadLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0) continue;

            if (Take(line, "Archive:", out var archive))
            {
                current = archive;
                archives++;
                if (!dependencies.ContainsKey(archive)) dependencies[archive] = [];
            }
            else if (Take(line, "File:", out _)) files++;
            else if (Take(line, "Object:", out _)) objects++;
            else if (Take(line, "Dependency:", out var dependency))
            {
                if (current is null)
                    throw new UnexException(
                        $"{path}: 'Dependency: {dependency}' appears before any 'Archive:' line.");
                dependencies[current].Add(dependency);
                deps++;
            }
            // unknown line kinds are ignored: the manifest is allowed to grow new records
        }

        return new ArchiveGraph(dependencies, archives, files, objects, deps);
    }

    static bool Take(string line, string prefix, out string value)
    {
        if (line.StartsWith(prefix, StringComparison.Ordinal))
        {
            value = line[prefix.Length..].Trim();
            return true;
        }
        value = "";
        return false;
    }
}

/// <summary>
/// Streams guid-index.json. One object is written per export as it is produced, so peak
/// memory stays flat across a full 489,455-object sweep.
/// </summary>
public sealed class GuidIndexWriter : IDisposable
{
    readonly FileStream _stream;
    readonly Utf8JsonWriter _writer;
    int _count;

    public GuidIndexWriter(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        _stream = File.Create(path);
        _writer = new Utf8JsonWriter(_stream, new JsonWriterOptions { Indented = false });
        _writer.WriteStartObject();
        _writer.WriteStartArray("objects");
    }

    public void Add(VfsEntry entry, string outputPath)
    {
        var isBundle = entry.VfsPath.StartsWith("bundles/", StringComparison.Ordinal);
        _writer.WriteStartObject();
        _writer.WriteString("vfsPath", entry.VfsPath);
        if (isBundle) _writer.WriteString("bundleGuid", entry.Container);
        else _writer.WriteNull("bundleGuid");
        _writer.WriteString("container", entry.Container);
        _writer.WriteNumber("pathId", entry.PathId);
        _writer.WriteString("name", entry.Name);
        _writer.WriteNumber("classId", entry.ClassId);
        _writer.WriteString("typeName", entry.TypeName);
        _writer.WriteString("outputPath", outputPath.Replace('\\', '/'));
        _writer.WriteEndObject();
        if (++_count % 4096 == 0) _writer.Flush();
    }

    public void Finish(ArchiveGraph? graph)
    {
        _writer.WriteEndArray();
        _writer.WriteNumber("objectCount", _count);

        if (graph is not null)
        {
            _writer.WriteStartObject("archiveDependencies");
            _writer.WriteNumber("archiveCount", graph.ArchiveCount);
            _writer.WriteNumber("fileCount", graph.FileCount);
            _writer.WriteNumber("objectCount", graph.ObjectCount);
            _writer.WriteNumber("dependencyCount", graph.DependencyCount);
            _writer.WriteStartObject("edges");
            foreach (var (archive, deps) in graph.Dependencies.OrderBy(k => k.Key, StringComparer.Ordinal))
            {
                _writer.WriteStartArray(archive);
                foreach (var dep in deps) _writer.WriteStringValue(dep);
                _writer.WriteEndArray();
            }
            _writer.WriteEndObject();
            _writer.WriteEndObject();
        }

        _writer.WriteEndObject();
        _writer.Flush();
    }

    public void Dispose() { _writer.Dispose(); _stream.Dispose(); }
}
```

- [ ] **Step 4: Write `src/Unex/Core/ExportRunner.cs`**

This walks containers itself rather than reusing `AssetOps.WithLoadedBundle` per object: with
4,409 bundles, re-opening one bundle per object would turn a 1-minute job into hours. Each
object is written and released immediately — nothing accumulates. The full-sweep ceiling to
stay under is **2,375 MB peak working set** (spec §3.9).

```csharp
using System.Text;
using AssetsTools.NET;
using AssetsTools.NET.Extra;
using Unex.Config;

namespace Unex.Core;

public sealed record ExportSummary(
    int Packages, int Textures, int RawFiles, int Skipped, List<string> Errors);

public static class ExportRunner
{
    public static ExportSummary Run(
        UnityProvider p, IReadOnlyList<string>? only, Action<string>? log = null)
    {
        var profile = p.Profile;
        var roots = only is { Count: > 0 } ? only : profile.ExportRoots;
        if (string.IsNullOrEmpty(profile.OutputDir))
            throw new UnexException($"profile '{p.ProfileName}': outputDir is not set.");

        if (roots.Any(r => r.TrimEnd('/').Equals("entities", StringComparison.OrdinalIgnoreCase)))
            log?.Invoke("root 'entities' is produced by the DOTS pipeline; run 'unex coverage' for it");

        Directory.CreateDirectory(profile.OutputDir);
        var paths = new OutputPaths();
        var errors = new List<string>();
        int packages = 0, textures = 0, rawFiles = 0, skipped = 0;

        using var index = new GuidIndexWriter(Path.Combine(profile.OutputDir, "guid-index.json"));

        foreach (var bundlePath in p.BundlePaths)
        {
            var vfsRoot = $"bundles/{Path.GetFileName(bundlePath)}";
            if (!Selected(vfsRoot, roots)) continue;
            ExportBundle(p, bundlePath, roots, paths, index, errors, log,
                ref packages, ref textures, ref rawFiles, ref skipped);
        }

        foreach (var serializedPath in p.SerializedPaths)
        {
            var vfsRoot = $"serialized/{Path.GetFileName(serializedPath)}";
            if (!Selected(vfsRoot, roots)) continue;
            ExportSerialized(p, serializedPath, roots, paths, index, errors, log,
                ref packages, ref textures, ref rawFiles, ref skipped);
        }

        var graph = GuidIndex.TryFindDependencyFile(profile.ResolvedBundleRoots) is { } manifest
            ? GuidIndex.ParseDependencies(manifest)
            : null;
        index.Finish(graph);

        return new ExportSummary(packages, textures, rawFiles, skipped, errors);
    }

    /// <summary>
    /// Prefix match in both directions, so <c>--only bundles</c> selects every bundle and
    /// <c>--only bundles/&lt;guid&gt;/Texture2D</c> selects just that bundle (then filters its
    /// objects by the full VFS path).
    /// </summary>
    static bool Selected(string vfsRoot, IReadOnlyList<string> roots)
    {
        if (roots.Count == 0) return true;
        foreach (var raw in roots)
        {
            var root = raw.Replace('\\', '/').Trim('/');
            if (root.Length == 0) return true;
            if (root.StartsWith(vfsRoot, StringComparison.OrdinalIgnoreCase)) return true;
            if (vfsRoot.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    static bool SelectedEntry(string vfsPath, IReadOnlyList<string> roots)
    {
        if (roots.Count == 0) return true;
        foreach (var raw in roots)
        {
            var root = raw.Replace('\\', '/').Trim('/');
            if (root.Length == 0) return true;
            if (vfsPath.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    static void ExportBundle(
        UnityProvider p, string bundlePath, IReadOnlyList<string> roots, OutputPaths paths,
        GuidIndexWriter index, List<string> errors, Action<string>? log,
        ref int packages, ref int textures, ref int rawFiles, ref int skipped)
    {
        var am = p.Manager;
        var container = Path.GetFileName(bundlePath);
        BundleFileInstance bundle;
        try { bundle = am.LoadBundleFile(bundlePath, true); }
        catch (Exception ex) { errors.Add($"{container}: LOAD {ex.GetType().Name}: {ex.Message}"); return; }

        try
        {
            var names = bundle.file.GetAllFileNames();
            for (var i = 0; i < names.Count; i++)
            {
                if (!bundle.file.IsAssetsFile(i)) continue;
                AssetsFileInstance inst;
                try { inst = am.LoadAssetsFileFromBundle(bundle, i, false); }
                catch (Exception ex)
                {
                    errors.Add($"{container}[{i}]: SUB {ex.GetType().Name}: {ex.Message}");
                    continue;
                }
                ExportObjects(p, inst, bundle, $"bundles/{container}", container, roots, paths,
                    index, errors, ref packages, ref textures, ref rawFiles, ref skipped);
            }
        }
        catch (Exception ex) { errors.Add($"{container}: WALK {ex.GetType().Name}: {ex.Message}"); }
        finally { am.UnloadBundleFile(bundle); am.UnloadAllAssetsFiles(true); }
    }

    static void ExportSerialized(
        UnityProvider p, string filePath, IReadOnlyList<string> roots, OutputPaths paths,
        GuidIndexWriter index, List<string> errors, Action<string>? log,
        ref int packages, ref int textures, ref int rawFiles, ref int skipped)
    {
        var am = p.Manager;
        var container = Path.GetFileName(filePath);
        AssetsFileInstance inst;
        try { inst = am.LoadAssetsFile(filePath, false); }
        catch (Exception ex) { errors.Add($"{container}: LOAD {ex.GetType().Name}: {ex.Message}"); return; }

        try
        {
            ExportObjects(p, inst, null, $"serialized/{container}", container, roots, paths,
                index, errors, ref packages, ref textures, ref rawFiles, ref skipped);
        }
        catch (Exception ex) { errors.Add($"{container}: WALK {ex.GetType().Name}: {ex.Message}"); }
        finally { am.UnloadAssetsFile(inst); }
    }

    static void ExportObjects(
        UnityProvider p, AssetsFileInstance inst, BundleFileInstance? bundle,
        string vfsRoot, string container, IReadOnlyList<string> roots, OutputPaths paths,
        GuidIndexWriter index, List<string> errors,
        ref int packages, ref int textures, ref int rawFiles, ref int skipped)
    {
        var am = p.Manager;
        var outputDir = p.Profile.OutputDir;

        foreach (var info in inst.file.Metadata.AssetInfos)
        {
            var typeName = UnityVfs.TypeName(info.TypeId);
            var name = "";
            try
            {
                var field = am.GetBaseField(inst, info, AssetReadFlags.None)?["m_Name"];
                if (field != null && !field.IsDummy) name = field.AsString ?? "";
            }
            catch { /* naming failures are non-fatal; the object exports under its PathID */ }

            // Spec §5.1: a tree of ~313,000 numerically-named files serves nobody.
            if (name.Length == 0) { skipped++; continue; }

            var vfsPath = $"{vfsRoot}/{typeName}/{name.Replace('/', '_')}";
            if (!SelectedEntry(vfsPath, roots)) { skipped++; continue; }

            var entry = new VfsEntry(vfsPath, container, info.PathId, info.TypeId, typeName, name);
            string relative;
            try { relative = paths.Allocate(entry); }
            catch (Exception ex) { errors.Add($"{vfsPath}: {ex.Message}"); continue; }
            var absolute = Path.Combine(outputDir, relative);

            try
            {
                if (TextureExport.IsTextureType(typeName))
                {
                    TextureExport.WritePng(am, inst, info, bundle, absolute, vfsPath);
                    textures++;
                }
                else if (typeName == "TextAsset")
                {
                    var baseField = am.GetBaseField(inst, info)
                        ?? throw new UnexException("no type template");
                    var script = baseField["m_Script"];
                    var bytes = script != null && !script.IsDummy
                        ? Encoding.UTF8.GetBytes(script.AsString ?? "")
                        : [];
                    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(absolute))!);
                    File.WriteAllBytes(absolute, bytes);
                    rawFiles++;
                }
                else
                {
                    var baseField = am.GetBaseField(inst, info)
                        ?? throw new UnexException("no type template");
                    var json = FieldJson.ToJson(baseField)?.ToJsonString() ?? "null";
                    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(absolute))!);
                    File.WriteAllText(absolute, json);
                    packages++;
                }
                index.Add(entry, relative);
            }
            catch (Exception ex)
            {
                errors.Add($"{vfsPath}: {ex.GetType().Name}: {ex.Message}");
            }
        }
    }
}
```

`TextAsset` uses `m_Script` (a string field holding the raw payload) — the standard Unity
layout. If a `TextAsset` in this game turns out to store bytes elsewhere, `preview` it once and
adjust; do not guess.

- [ ] **Step 5: Add the `export` command to `Program.cs`**

Register it in `Main` (`root.Subcommands.Add(BuildExportCommand());`).

```csharp
    static Command BuildExportCommand()
    {
        var onlyOption = new Option<string[]>("--only")
        {
            Description = "Export only these VFS prefixes (default: the profile's exportRoots)",
            AllowMultipleArgumentsPerToken = true,
        };
        var command = new Command("export", "Batch export to the profile's outputDir");
        command.Options.Add(ProfileOption);
        command.Options.Add(onlyOption);
        command.SetAction(parse => Run(() =>
        {
            var config = ProfilesConfig.Resolve(parse.GetValue(ConfigOption));
            using var providers = new ProviderManager(config);
            var provider = providers.Get(parse.GetValue(ProfileOption)!);
            var summary = ExportRunner.Run(provider, parse.GetValue(onlyOption), Warn);
            Console.WriteLine(
                $"exported: {summary.Packages} packages, {summary.Textures} textures, " +
                $"{summary.RawFiles} raw files ({summary.Skipped} unnamed/filtered skipped) " +
                $"-> {provider.Profile.OutputDir}");
            if (summary.Errors.Count > 0)
            {
                Console.Error.WriteLine($"{summary.Errors.Count} objects failed:");
                foreach (var error in summary.Errors.Take(20)) Console.Error.WriteLine($"  {error}");
                if (summary.Errors.Count > 20)
                    Console.Error.WriteLine($"  ... and {summary.Errors.Count - 20} more");
            }
            return 0; // partial failures are normal for a full tree; doctor is the health gate
        }));
        return command;
    }
```

- [ ] **Step 6: Run the tests, then verify a scoped export**

Run: `dotnet test`
Expected: PASS, 30 tests (27 + 3).

Run:
```bash
dotnet run --project src/Unex -- export --profile vrising \
  --only bundles/1291f83dad76aebee1e45eb99ba68359
```
Expected: a summary line naming a non-zero texture count, e.g.
`exported: N packages, M textures, 0 raw files (K unnamed/filtered skipped) -> .../Exports`.

Then confirm the tree shape and the index:
```bash
ls "D:/SteamLibrary/steamapps/common/VRising/Exports/Texture2D" | head
python -c "import json;d=json.load(open('D:/SteamLibrary/steamapps/common/VRising/Exports/guid-index.json'));print(d['objectCount'], d['archiveDependencies']['dependencyCount'])"
```
Expected: `MapIcon_*.png` files listed, and the dependency counts from spec §3.2 —
`archiveCount` 4410, `dependencyCount` **56451** (the graph is parsed from the whole manifest
regardless of `--only`).

- [ ] **Step 7: Commit**

```bash
git add src/Unex/Core/GuidIndex.cs src/Unex/Core/ExportRunner.cs src/Unex/Program.cs \
        tests/Unex.Tests/GuidIndexTests.cs
git commit -m "feat: streaming batch export with guid-index.json and the archive graph"
```

---

## Task 11: Doctor — real-game assertions with numbers

`doctor` is where real-game verification lives, because unit tests may never touch game files.
It must **assert measured facts**, not merely exit 0.

**Files:**
- Create: `src/Unex/Core/Doctor.cs`
- Modify: `src/Unex/Program.cs`

- [ ] **Step 1: Write `src/Unex/Core/Doctor.cs`**

Expected values are the ones measured in Phase 0 (spec §8). They apply to a profile whose
`dataDir` is a V Rising 1.1.13 install; for any other profile the counts are reported as
observations and only the structural checks are enforced. `Expectations.For` is the single
place those numbers live.

One unconfirmed member: **`AssetsManager.ClassDatabase` and its `.Classes` collection**. The
class count (321 for `2022.3.58f1`) is the whole point of the check, so confirm the accessor
once via `Spike/ApiDump.cs` with filter `ClassDatabase` before running. Note also that
`Unex.Core.ClassDatabase` (our tpk helper) and AssetsTools.NET's `ClassDatabaseFile` share a
prefix — the code below only does member access on the manager, so no `using` alias is needed.

```csharp
using AssetsTools.NET;
using AssetsTools.NET.Extra;

namespace Unex.Core;

public sealed record Expectations(
    int? BundleCount, int? SubFileFailures, string[] KnownSubFileFailures,
    int? ClassCount, string? UnityVersion,
    string? TextureVfsPath, int? TextureWidth, int? TextureHeight, string? TextureFormat)
{
    /// <summary>V Rising 1.1.13 (spec §3). Any other profile gets observation-only checks.</summary>
    public static readonly Expectations VRising = new(
        BundleCount: 4409,
        SubFileFailures: 2,
        KnownSubFileFailures:
        [
            "cd2465acddb8e6fbb7a6f02f03c1dc84[1]",
            "4f9f7c3b640c0c6591399854c598c670[1]",
        ],
        ClassCount: 321,
        UnityVersion: "2022.3.58f1",
        TextureVfsPath: "bundles/3f4a8cafb88ce4502e1f2cacf8444118/Texture2D/ZoneMap_Wilderness_VRisingWorld",
        TextureWidth: 6080,
        TextureHeight: 6080,
        TextureFormat: "DXT1");

    public static readonly Expectations Unknown = new(
        null, null, [], null, null, null, null, null, null);

    public static Expectations For(string profileName) =>
        profileName.Equals("vrising", StringComparison.OrdinalIgnoreCase) ? VRising : Unknown;
}

public static class Doctor
{
    public static int Run(UnityProvider p, bool quick, TextWriter output)
    {
        var expected = Expectations.For(p.ProfileName);
        var failures = new List<string>();

        void Check(string name, bool ok, string detail)
        {
            output.WriteLine($"[{(ok ? "PASS" : "FAIL")}] {name,-26} {detail}");
            if (!ok) failures.Add(name);
        }
        void Info(string name, string detail) => output.WriteLine($"[info] {name,-26} {detail}");

        output.WriteLine($"profile:  {p.ProfileName}");
        output.WriteLine($"dataDir:  {p.Profile.DataDir}");
        output.WriteLine($"unity:    {p.UnityVersion}");
        output.WriteLine();

        // --- 1. the v3/ trap (spec §3.1) -------------------------------------------------
        var sibling = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(p.Profile.DataDir))!, "v3");
        if (Directory.Exists(sibling))
            output.WriteLine(
                $"[WARN] v3 trap                   '{sibling}' exists. That is a SECOND, OLDER " +
                "complete game install with its own ContentArchives and EntityScenes. " +
                "It must never be walked as part of this version.");
        else
            Info("v3 trap", "no sibling v3/ directory");

        // --- 2. unity version ------------------------------------------------------------
        if (expected.UnityVersion is { } wantedVersion)
            Check("unity version", p.UnityVersion == wantedVersion,
                $"{p.UnityVersion} (expected {wantedVersion})");

        // --- 3. class database -----------------------------------------------------------
        // Confirm the accessor name once via Spike/ApiDump.cs (filter: ClassDatabase).
        var classCount = p.Manager.ClassDatabase?.Classes.Count ?? 0;
        if (expected.ClassCount is { } wantedClasses)
            Check("class database", classCount == wantedClasses,
                $"{classCount} classes resolved for {p.UnityVersion} (expected {wantedClasses})");
        else
            Info("class database", $"{classCount} classes resolved for {p.UnityVersion}");

        // --- 4. bundle mount + TypeTree --------------------------------------------------
        var bundlePaths = quick ? p.BundlePaths.Take(200).ToList() : p.BundlePaths;
        int loaded = 0, subFiles = 0, typeTreeOn = 0, assetBundleObjects = 0;
        var subFailures = new List<string>();

        foreach (var bundlePath in bundlePaths)
        {
            var container = Path.GetFileName(bundlePath);
            BundleFileInstance bundle;
            try { bundle = p.Manager.LoadBundleFile(bundlePath, true); loaded++; }
            catch (Exception ex) { subFailures.Add($"{container} LOAD {ex.GetType().Name}"); continue; }
            try
            {
                var names = bundle.file.GetAllFileNames();
                for (var i = 0; i < names.Count; i++)
                {
                    if (!bundle.file.IsAssetsFile(i)) continue;
                    AssetsFileInstance inst;
                    try { inst = p.Manager.LoadAssetsFileFromBundle(bundle, i, false); }
                    catch { subFailures.Add($"{container}[{i}]"); continue; }
                    subFiles++;
                    if (inst.file.Metadata.TypeTreeEnabled) typeTreeOn++;
                    assetBundleObjects +=
                        inst.file.Metadata.GetAssetsOfType(AssetClassID.AssetBundle).Count;
                }
            }
            finally { p.Manager.UnloadBundleFile(bundle); p.Manager.UnloadAllAssetsFiles(true); }
        }

        if (!quick && expected.BundleCount is { } wantedBundles)
            Check("bundle count", bundlePaths.Count == wantedBundles,
                $"{bundlePaths.Count} bundles (expected {wantedBundles})");
        else
            Info("bundle count", $"{bundlePaths.Count} bundles{(quick ? " (--quick sample)" : "")}");

        Check("bundles load", loaded == bundlePaths.Count,
            $"{loaded}/{bundlePaths.Count} loaded");

        if (!quick && expected.SubFileFailures is { } wantedFailures)
        {
            var unexpected = subFailures
                .Where(f => !expected.KnownSubFileFailures.Any(
                    known => f.StartsWith(known, StringComparison.OrdinalIgnoreCase)))
                .ToList();
            Check("sub-file failures",
                subFailures.Count == wantedFailures && unexpected.Count == 0,
                $"{subFailures.Count} (expected exactly {wantedFailures} known: " +
                $"{string.Join(", ", expected.KnownSubFileFailures)})" +
                (unexpected.Count > 0 ? $" - UNEXPECTED: {string.Join(", ", unexpected.Take(5))}" : ""));
        }
        else
        {
            Info("sub-file failures", $"{subFailures.Count}{(quick ? " (--quick sample)" : "")}");
        }

        Check("TypeTree in bundles", subFiles > 0 && typeTreeOn == subFiles,
            $"TypeTreeEnabled on {typeTreeOn}/{subFiles} bundle sub-files (expected all)");
        Check("no AssetBundle objects", assetBundleObjects == 0,
            $"{assetBundleObjects} class-142 objects found (expected 0; identity is " +
            "(bundleGuid, PathID, m_Name))");

        // --- 5. TypeTree is stripped in the classic files ---------------------------------
        var classicStripped = 0;
        foreach (var serializedPath in p.SerializedPaths)
        {
            var inst = p.Manager.LoadAssetsFile(serializedPath, false);
            try { if (!inst.file.Metadata.TypeTreeEnabled) classicStripped++; }
            finally { p.Manager.UnloadAssetsFile(inst); }
        }
        Check("TypeTree in classic files", classicStripped == p.SerializedPaths.Count,
            $"TypeTreeEnabled false on {classicStripped}/{p.SerializedPaths.Count} " +
            "classic files (expected all - they are stripped)");

        // --- 6. texture decode -----------------------------------------------------------
        if (expected.TextureVfsPath is { } texturePath)
        {
            try
            {
                var entry = AssetOps.Resolve(p, texturePath);
                var temp = Path.Combine(Path.GetTempPath(), $"unex-doctor-{Guid.NewGuid():N}.png");
                var info = TextureExport.SavePng(p, entry, temp);
                var ok = info.PngBytes > 0
                         && info.Width == expected.TextureWidth
                         && info.Height == expected.TextureHeight
                         && info.Format == expected.TextureFormat;
                Check("texture decode", ok,
                    $"{info.Name} {info.Width}x{info.Height} {info.Format} png={info.PngBytes:N0} B " +
                    $"(expected {expected.TextureWidth}x{expected.TextureHeight} " +
                    $"{expected.TextureFormat}, non-zero)");
                File.Delete(temp);
            }
            catch (Exception ex)
            {
                Check("texture decode", false, $"{ex.GetType().Name}: {ex.Message}");
            }
        }

        output.WriteLine();
        output.WriteLine(failures.Count == 0
            ? "doctor: OK"
            : $"doctor: {failures.Count} check(s) failed: {string.Join(", ", failures)}");
        return failures.Count == 0 ? 0 : 1;
    }
}
```

- [ ] **Step 2: Add the `doctor` command to `Program.cs`**

Register it first in `Main` (`root.Subcommands.Add(BuildDoctorCommand());`).

```csharp
    static Command BuildDoctorCommand()
    {
        var quickOption = new Option<bool>("--quick")
        {
            Description = "Sample 200 bundles instead of all of them (skips the count assertions)",
        };
        var command = new Command("doctor", "Verify a profile against the measured Phase 0 facts");
        command.Options.Add(ProfileOption);
        command.Options.Add(quickOption);
        command.SetAction(parse => Run(() =>
        {
            var config = ProfilesConfig.Resolve(parse.GetValue(ConfigOption));
            using var providers = new ProviderManager(config);
            var provider = providers.Get(parse.GetValue(ProfileOption)!);
            return Doctor.Run(provider, parse.GetValue(quickOption), Console.Out);
        }));
        return command;
    }
```

- [ ] **Step 3: Verify against the real game**

Run: `dotnet run --project src/Unex -- doctor --profile vrising --quick`
Expected: fast (~10 s), all `PASS`/`info`, no `FAIL`, exit 0.

Run: `dotnet run --project src/Unex -- doctor --profile vrising`
Expected (~1 min), with these exact numbers:

```
[info] v3 trap                    ...        (or [WARN] if D:/.../VRising/v3 exists)
[PASS] unity version              2022.3.58f1 (expected 2022.3.58f1)
[PASS] class database             321 classes resolved for 2022.3.58f1 (expected 321)
[PASS] bundle count               4409 bundles (expected 4409)
[PASS] bundles load               4409/4409 loaded
[PASS] sub-file failures          2 (expected exactly 2 known: cd2465..., 4f9f7c...)
[PASS] TypeTree in bundles        TypeTreeEnabled on 4409/4409 bundle sub-files (expected all)
[PASS] no AssetBundle objects     0 class-142 objects found ...
[PASS] TypeTree in classic files  TypeTreeEnabled false on 5/5 classic files (expected all ...)
[PASS] texture decode             ZoneMap_Wilderness_VRisingWorld 6080x6080 DXT1 png=... non-zero
doctor: OK
```

Verify the exit code is honest:
```bash
dotnet run --project src/Unex -- doctor --profile vrising; echo "exit=$?"
```
Expected: `exit=0`. Temporarily edit `Expectations.VRising`'s `ClassCount` to `320`, re-run, and
confirm `exit=1` with a `FAIL` line — then revert. A doctor that cannot fail is not a check.

- [ ] **Step 4: Commit**

```bash
git add src/Unex/Core/Doctor.cs src/Unex/Program.cs
git commit -m "feat: doctor asserts the measured Phase 0 numbers and warns about the v3 trap"
```

---

## Task 12: `serve` (JSON lines) and `mcp` (stdio)

Two frontends over the same core. **Read
`E:/arkive-games/uex/src/Uex/Serve/ServeLoop.cs`, `RequestHandler.cs` and
`Mcp/UexMcpTools.cs` before writing this task** — the structure below mirrors them
deliberately so an agent who knows uex knows unex.

**Files:**
- Create: `src/Unex/Serve/RequestHandler.cs`, `src/Unex/Serve/ServeLoop.cs`,
  `src/Unex/Mcp/UnexMcpTools.cs`
- Modify: `src/Unex/Program.cs`
- Test: `tests/Unex.Tests/RequestHandlerTests.cs`

- [ ] **Step 1: Write the failing test**

`RequestHandler` is the envelope only — it takes an executor delegate, so the whole
request/response shape is testable with no game files at all.

```csharp
using System.Text.Json.Nodes;
using Unex.Serve;
using Xunit;

namespace Unex.Tests;

public class RequestHandlerTests
{
    static RequestHandler Echo() => new((cmd, profile, args) => new JsonObject
    {
        ["cmd"] = cmd,
        ["profile"] = profile,
        ["arg"] = args?["x"]?.GetValue<string>(),
    });

    [Fact]
    public void Successful_request_echoes_the_id_and_wraps_the_result()
    {
        var response = JsonNode.Parse(Echo().Handle(
            """{"id":7,"cmd":"list","profile":"vrising","args":{"x":"bundles"}}"""))!;

        Assert.Equal(7, response["id"]!.GetValue<int>());
        Assert.True(response["ok"]!.GetValue<bool>());
        Assert.Equal("list", response["result"]!["cmd"]!.GetValue<string>());
        Assert.Equal("vrising", response["result"]!["profile"]!.GetValue<string>());
        Assert.Equal("bundles", response["result"]!["arg"]!.GetValue<string>());
    }

    [Fact]
    public void Invalid_json_produces_an_error_envelope_not_an_exception()
    {
        var response = JsonNode.Parse(Echo().Handle("{not json"))!;
        Assert.False(response["ok"]!.GetValue<bool>());
        Assert.Contains("Invalid JSON", response["error"]!.GetValue<string>());
    }

    [Fact]
    public void Missing_cmd_is_reported_with_the_id_preserved()
    {
        var response = JsonNode.Parse(Echo().Handle("""{"id":3}"""))!;
        Assert.Equal(3, response["id"]!.GetValue<int>());
        Assert.False(response["ok"]!.GetValue<bool>());
        Assert.Contains("cmd", response["error"]!.GetValue<string>());
    }

    [Fact]
    public void An_executor_exception_becomes_an_error_envelope()
    {
        var handler = new RequestHandler((_, _, _) => throw new UnexException("boom"));
        var response = JsonNode.Parse(handler.Handle("""{"id":1,"cmd":"list"}"""))!;
        Assert.False(response["ok"]!.GetValue<bool>());
        Assert.Equal("boom", response["error"]!.GetValue<string>());
    }

    [Fact]
    public void Responses_are_single_line_so_the_protocol_stays_line_delimited()
    {
        var handler = new RequestHandler((_, _, _) => throw new Exception("multi\nline\ntrace"));
        var line = handler.Handle("""{"id":1,"cmd":"list"}""");
        Assert.DoesNotContain('\n', line);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd E:/arkive-games/unex && dotnet test --filter RequestHandlerTests`
Expected: FAIL — `Unex.Serve` namespace does not exist.

- [ ] **Step 3: Write `src/Unex/Serve/RequestHandler.cs`**

```csharp
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Unex.Serve;

/// <summary>
/// JSON-lines envelope: parse the request, dispatch to the executor, wrap result or error.
/// Never throws, and never emits a newline inside a response - the protocol is one line in,
/// one line out.
/// </summary>
public sealed class RequestHandler(Func<string, string?, JsonNode?, JsonNode?> execute)
{
    static readonly JsonSerializerOptions Compact = new() { WriteIndented = false };

    public string Handle(string requestLine)
    {
        JsonNode? id = null;
        try
        {
            JsonNode? request;
            try { request = JsonNode.Parse(requestLine); }
            catch (JsonException e) { throw new UnexException($"Invalid JSON request: {e.Message}"); }

            id = request?["id"]?.DeepClone();
            var cmd = request?["cmd"]?.GetValue<string>()
                ?? throw new UnexException("Request is missing 'cmd'.");
            var profile = request?["profile"]?.GetValue<string>();
            var result = execute(cmd, profile, request?["args"]);
            return new JsonObject { ["id"] = id, ["ok"] = true, ["result"] = result }
                .ToJsonString(Compact);
        }
        catch (Exception e)
        {
            var message = e is UnexException ? e.Message : e.ToString().ReplaceLineEndings(" | ");
            return new JsonObject { ["id"] = id?.DeepClone(), ["ok"] = false, ["error"] = message }
                .ToJsonString(Compact);
        }
    }
}
```

- [ ] **Step 4: Write `src/Unex/Serve/ServeLoop.cs`**

```csharp
using System.Text.Json.Nodes;
using Unex.Config;
using Unex.Core;

namespace Unex.Serve;

/// <summary>stdin/stdout JSON-lines server over all configured profiles, with lazy mounts.</summary>
public sealed class ServeLoop(ProfilesConfig config)
{
    readonly ProviderManager _providers = new(config);
    bool _shutdown;

    public int Run(TextReader input, TextWriter output)
    {
        var handler = new RequestHandler(Execute);
        output.WriteLine("""{"ok":true,"result":"unex serve ready - one JSON request per line"}""");
        output.Flush();
        while (!_shutdown && input.ReadLine() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            output.WriteLine(handler.Handle(line));
            output.Flush();
        }
        _providers.Dispose();
        return 0;
    }

    JsonNode? Execute(string cmd, string? profileName, JsonNode? args)
    {
        if (cmd == "shutdown") { _shutdown = true; return JsonValue.Create("bye"); }
        if (cmd == "profiles")
            return new JsonArray([.. config.Profiles.Keys.Order()
                .Select(k => (JsonNode)JsonValue.Create(k))]);

        if (profileName is null) throw new UnexException($"Command '{cmd}' requires 'profile'.");
        var provider = _providers.Get(profileName);

        return cmd switch
        {
            "list" => new JsonArray([.. VfsQuery
                .ListDir(UnityVfs.Index(provider), Str(args, "path") ?? "")
                .Order(StringComparer.Ordinal)
                .Select(c => (JsonNode)JsonValue.Create(c))]),

            "search" => new JsonArray([.. VfsQuery.Search(
                    UnityVfs.Index(provider),
                    Str(args, "pattern") ?? throw new UnexException("'pattern' required"),
                    args?["regex"]?.GetValue<bool>() ?? false,
                    Int(args, "limit") ?? 200)
                .Select(e => (JsonNode)new JsonObject
                {
                    ["vfsPath"] = e.VfsPath,
                    ["container"] = e.Container,
                    ["pathId"] = e.PathId,
                    ["classId"] = e.ClassId,
                    ["typeName"] = e.TypeName,
                    ["name"] = e.Name,
                })]),

            "preview" => JsonValue.Create(AssetOps.Preview(provider,
                AssetOps.Resolve(provider, Str(args, "asset") ?? throw new UnexException("'asset' required")),
                Int(args, "maxBytes") ?? 200_000)),

            "preview-texture" => TextureNode(provider, args),

            "export" => ExportNode(provider, args),

            _ => throw new UnexException(
                $"Unknown command '{cmd}'. Commands: profiles, list, search, preview, " +
                "preview-texture, export, shutdown."),
        };
    }

    static JsonNode TextureNode(UnityProvider provider, JsonNode? args)
    {
        var entry = AssetOps.Resolve(provider,
            Str(args, "asset") ?? throw new UnexException("'asset' required"));
        var outPath = Str(args, "out") ?? throw new UnexException("'out' required");
        var info = TextureExport.SavePng(provider, entry, outPath);
        return new JsonObject
        {
            ["name"] = info.Name,
            ["width"] = info.Width,
            ["height"] = info.Height,
            ["format"] = info.Format,
            ["rawBytes"] = info.RawBytes,
            ["pngBytes"] = info.PngBytes,
            ["outPath"] = info.OutPath,
        };
    }

    static JsonNode ExportNode(UnityProvider provider, JsonNode? args)
    {
        var only = args?["only"] is JsonArray arr
            ? arr.Select(n => n!.GetValue<string>()).ToList()
            : null;
        var summary = ExportRunner.Run(provider, only);
        return new JsonObject
        {
            ["packages"] = summary.Packages,
            ["textures"] = summary.Textures,
            ["rawFiles"] = summary.RawFiles,
            ["skipped"] = summary.Skipped,
            ["errorCount"] = summary.Errors.Count,
            ["errors"] = new JsonArray([.. summary.Errors.Take(50)
                .Select(e => (JsonNode)JsonValue.Create(e))]),
        };
    }

    static string? Str(JsonNode? args, string key) => args?[key]?.GetValue<string>();
    static int? Int(JsonNode? args, string key) => args?[key]?.GetValue<int>();
}
```

- [ ] **Step 5: Write `src/Unex/Mcp/UnexMcpTools.cs`**

Six tools; every one except `profiles` takes a `profile` parameter.

```csharp
using System.ComponentModel;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Server;
using Unex.Config;
using Unex.Core;

namespace Unex.Mcp;

[McpServerToolType]
public sealed class UnexMcpTools(ProfilesConfig config, ProviderManager providers)
{
    [McpServerTool(Name = "profiles"), Description("List configured game profiles (use these names as the 'profile' argument of every other tool).")]
    public string Profiles() =>
        new JsonArray([.. config.Profiles.OrderBy(p => p.Key, StringComparer.Ordinal)
            .Select(p => (JsonNode)new JsonObject
            {
                ["name"] = p.Key,
                ["dataDir"] = p.Value.DataDir,
                ["outputDir"] = p.Value.OutputDir,
            })]).ToJsonString();

    [McpServerTool(Name = "list_dir"), Description("List children of a virtual Unity asset directory. Roots: bundles/, serialized/. Directories end with '/'.")]
    public string ListDir(
        [Description("Game profile name")] string profile,
        [Description("Virtual directory path; empty string for the root")] string path = "")
    {
        var provider = providers.Get(profile);
        return string.Join("\n",
            VfsQuery.ListDir(UnityVfs.Index(provider), path).Order(StringComparer.Ordinal));
    }

    [McpServerTool(Name = "search_paths"), Description("Search all virtual asset paths of a game (case-insensitive substring, or regex).")]
    public string SearchPaths(
        [Description("Game profile name")] string profile,
        [Description("Substring or regex pattern")] string pattern,
        [Description("Interpret pattern as regex")] bool regex = false,
        [Description("Max matches returned")] int limit = 200)
    {
        var provider = providers.Get(profile);
        var hits = VfsQuery.Search(UnityVfs.Index(provider), pattern, regex, limit).ToList();
        return $"matches shown: {hits.Count}\n" +
               string.Join("\n", hits.Select(h => $"{h.VfsPath}\t{h.TypeName}\tpathId={h.PathId}"));
    }

    [McpServerTool(Name = "preview_asset"), Description("Serialize one Unity object's fields to JSON (truncated beyond maxBytes).")]
    public string PreviewAsset(
        [Description("Game profile name")] string profile,
        [Description("Virtual asset path, e.g. bundles/<guid>/MonoBehaviour/<name>")] string asset,
        [Description("Truncate JSON beyond this many characters")] int maxBytes = 100_000) // lower than the CLI's 200k: tool results land in an agent's context window
    {
        var provider = providers.Get(profile);
        return AssetOps.Preview(provider, AssetOps.Resolve(provider, asset), maxBytes);
    }

    [McpServerTool(Name = "preview_texture"), Description("Decode a Texture2D/Sprite/Cubemap to a PNG file on disk and return the file path (read the file to view it).")]
    public string PreviewTexture(
        [Description("Game profile name")] string profile,
        [Description("Virtual asset path of the texture")] string asset,
        [Description("PNG output file path; default: a temp file")] string? outPath = null)
    {
        var provider = providers.Get(profile);
        var entry = AssetOps.Resolve(provider, asset);
        // the default name encodes the full VFS path so same-named textures cannot clobber
        outPath ??= Path.Combine(Path.GetTempPath(), "unex", entry.VfsPath.Replace('/', '_') + ".png");
        var info = TextureExport.SavePng(provider, entry, outPath);
        return $"{info.Name} {info.Width}x{info.Height} {info.Format} " +
               $"png={info.PngBytes:N0} B -> {info.OutPath}";
    }

    [McpServerTool(Name = "export_assets"), Description("Batch export to the profile's outputDir (type-first JSON/PNG tree plus guid-index.json). With no 'only', exports the profile's configured exportRoots.")]
    public string ExportAssets(
        [Description("Game profile name")] string profile,
        [Description("Optional list of virtual path prefixes to restrict the export")] string[]? only = null)
    {
        var provider = providers.Get(profile);
        var summary = ExportRunner.Run(provider, only);
        var errors = summary.Errors.Count == 0
            ? ""
            : $"\nerrors ({summary.Errors.Count}):\n" + string.Join("\n", summary.Errors.Take(20));
        return $"exported {summary.Packages} packages, {summary.Textures} textures, " +
               $"{summary.RawFiles} raw files, {summary.Skipped} skipped -> " +
               $"{provider.Profile.OutputDir}{errors}";
    }
}

public static class McpHost
{
    public static async Task<int> RunAsync(ProfilesConfig config)
    {
        var builder = Host.CreateApplicationBuilder();
        // stdout carries the MCP protocol - all logging must go to stderr
        builder.Logging.AddConsole(o => o.LogToStandardErrorThreshold = LogLevel.Trace);
        builder.Services.AddSingleton(config);
        builder.Services.AddSingleton<ProviderManager>();
        builder.Services.AddMcpServer()
            .WithStdioServerTransport()
            .WithTools<UnexMcpTools>();
        await builder.Build().RunAsync();
        return 0;
    }
}
```

`ProviderManager` is registered as a singleton and takes `ProfilesConfig` in its primary
constructor, so DI resolves it without a factory.

- [ ] **Step 6: Add `serve` and `mcp` to `Program.cs`**

Register both in `Main`.

```csharp
    static Command BuildServeCommand()
    {
        var command = new Command("serve",
            "JSON-lines request/response server on stdin/stdout (all profiles, lazy mounts)");
        command.SetAction(parse => Run(() =>
            new Serve.ServeLoop(ProfilesConfig.Resolve(parse.GetValue(ConfigOption)))
                .Run(Console.In, Console.Out)));
        return command;
    }

    static Command BuildMcpCommand()
    {
        var command = new Command("mcp",
            "MCP stdio server exposing list/search/preview/export tools for all profiles");
        command.SetAction((parse, cancellationToken) =>
        {
            try
            {
                return Mcp.McpHost.RunAsync(ProfilesConfig.Resolve(parse.GetValue(ConfigOption)));
            }
            catch (UnexException e)
            {
                Console.Error.WriteLine($"error: {e.Message}");
                return Task.FromResult(1);
            }
        });
        return command;
    }
```

- [ ] **Step 7: Run the tests and verify `serve` end to end**

Run: `dotnet test`
Expected: PASS, 35 tests (30 + 5).

Run:
```bash
printf '%s\n' \
  '{"id":1,"cmd":"profiles"}' \
  '{"id":2,"cmd":"search","profile":"vrising","args":{"pattern":"MapIcon_Trader","limit":5}}' \
  '{"id":3,"cmd":"nope","profile":"vrising"}' \
  '{"id":4,"cmd":"shutdown"}' \
  | dotnet run --project src/Unex -- serve
```
Expected: the ready banner, then one response line per request —
`{"id":1,"ok":true,"result":["vrising"]}`, an id-2 result array containing
`bundles/1291f83dad76aebee1e45eb99ba68359/Sprite/MapIcon_Trader`, an id-3 line with
`"ok":false` and an error naming the valid commands, and `{"id":4,"ok":true,"result":"bye"}`.
Every line must be valid single-line JSON.

- [ ] **Step 8: Verify the MCP server starts and lists its tools**

Run: `dotnet run --project src/Unex -- mcp` and, from another shell, drive it with your MCP
client of choice (or send an `initialize` + `tools/list` pair on stdin).
Expected: exactly six tools — `profiles`, `list_dir`, `search_paths`, `preview_asset`,
`preview_texture`, `export_assets` — and **nothing but MCP JSON on stdout** (the mount banner
from `ProviderManager` and all logging must appear on stderr; anything else corrupts the
protocol).

- [ ] **Step 9: Commit**

```bash
git add src/Unex/Serve src/Unex/Mcp src/Unex/Program.cs tests/Unex.Tests/RequestHandlerTests.cs
git commit -m "feat: serve (JSON lines) and mcp (stdio) frontends"
```

---

## Task 13: DOTS `StableTypeHash` recompute

Pure arithmetic, no game files, fully unit-testable. This is the foundation of DOTS tier 2 —
tier 2 itself (binding hashes to `ProjectM.*` names via IL2CPP) is deferred, but the hash
function must exist and be right before anything can bind.

**Files:**
- Create: `src/Unex/Dots/TypeHash.cs`
- Test: `tests/Unex.Tests/TypeHashTests.cs`

- [ ] **Step 1: Write the failing test**

Two of these are real, externally-published vectors: FNV-1a 64 of `""` is
`0xcbf29ce484222325` (the basis) and of `"a"` is `0xaf63dc4c8601ec8c`. The test uses them to
validate the *reference* UTF-8 implementation, then proves Unity's feed differs — which is the
entire gotcha.

```csharp
using System.Text;
using Unex.Dots;
using Xunit;

namespace Unex.Tests;

public class TypeHashTests
{
    /// <summary>Textbook FNV-1a 64 over UTF-8 bytes - what a naive implementation would write.</summary>
    static ulong Utf8Reference(string text)
    {
        var hash = TypeHash.Fnv1A64Basis;
        foreach (var b in Encoding.UTF8.GetBytes(text))
            hash = (hash ^ b) * TypeHash.Fnv1A64Prime;
        return hash;
    }

    [Fact]
    public void Empty_string_hashes_to_the_offset_basis()
    {
        Assert.Equal(TypeHash.Fnv1A64Basis, TypeHash.FNV1A64(""));
        Assert.Equal(14695981039346656037UL, TypeHash.Fnv1A64Basis);
        Assert.Equal(1099511628211UL, TypeHash.Fnv1A64Prime);
    }

    [Fact]
    public void The_utf8_reference_matches_the_published_fnv1a64_vectors()
    {
        Assert.Equal(0xcbf29ce484222325UL, Utf8Reference(""));
        Assert.Equal(0xaf63dc4c8601ec8cUL, Utf8Reference("a"));
    }

    [Fact]
    public void Unity_feeds_two_bytes_per_utf16_char_so_it_differs_from_a_utf8_feed()
    {
        // non-ASCII: UTF-8 emits 2-3 bytes per char, Unity emits exactly 2 per UTF-16 unit
        Assert.NotEqual(Utf8Reference("Ünïty"), TypeHash.FNV1A64("Ünïty"));
        // even pure ASCII differs, because Unity still feeds the zero high byte
        Assert.NotEqual(Utf8Reference("a"), TypeHash.FNV1A64("a"));
    }

    [Fact]
    public void The_high_byte_of_each_char_contributes()
    {
        // U+0141 and U+0041 share a low byte; only the high byte distinguishes them
        Assert.NotEqual(TypeHash.FNV1A64("\u0141"), TypeHash.FNV1A64("\u0041"));
    }

    [Fact]
    public void Combine_with_no_values_is_the_identity()
    {
        Assert.Equal(TypeHash.Fnv1A64Basis, TypeHash.CombineFNV1A64(TypeHash.Fnv1A64Basis));
    }

    [Fact]
    public void Combine_is_order_sensitive()
    {
        Assert.NotEqual(
            TypeHash.CombineFNV1A64(TypeHash.Fnv1A64Basis, 1, 2),
            TypeHash.CombineFNV1A64(TypeHash.Fnv1A64Basis, 2, 1));
    }

    // ---- StableTypeHash over synthetic type descriptors --------------------------------

    static TypeDescriptor Float3() => new("Unity.Mathematics", [], "float3", "Unity.Mathematics",
        [], [new("System", [], "Single", "mscorlib", [], [])]);

    static TypeDescriptor Translation() => new("ProjectM", [], "Translation", "ProjectM",
        [], [Float3()]);

    [Fact]
    public void The_same_descriptor_always_hashes_the_same()
    {
        Assert.Equal(TypeHash.StableTypeHash(Translation()), TypeHash.StableTypeHash(Translation()));
    }

    [Fact]
    public void The_assembly_name_participates()
    {
        var other = Translation() with { AssemblyName = "Stunlock.Core" };
        Assert.NotEqual(TypeHash.StableTypeHash(Translation()), TypeHash.StableTypeHash(other));
    }

    [Fact]
    public void The_namespace_participates()
    {
        var other = Translation() with { Namespace = "Unity.Transforms" };
        Assert.NotEqual(TypeHash.StableTypeHash(Translation()), TypeHash.StableTypeHash(other));
    }

    [Fact]
    public void Field_types_participate_but_field_names_do_not()
    {
        var withInt = Translation() with { Fields = [new("System", [], "Int32", "mscorlib", [], [])] };
        Assert.NotEqual(TypeHash.StableTypeHash(Translation()), TypeHash.StableTypeHash(withInt));
    }

    [Fact]
    public void Generic_arguments_participate()
    {
        var open = new TypeDescriptor("ProjectM", [], "Buffer`1", "ProjectM", [], []);
        var closed = open with { GenericArguments = [Float3()] };
        Assert.NotEqual(TypeHash.StableTypeHash(open), TypeHash.StableTypeHash(closed));
    }

    [Fact]
    public void Nested_declaring_types_participate()
    {
        var nested = Translation() with { DeclaringTypeNames = ["Outer"] };
        Assert.NotEqual(TypeHash.StableTypeHash(Translation()), TypeHash.StableTypeHash(nested));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter TypeHashTests`
Expected: FAIL — `Unex.Dots` namespace does not exist.

- [ ] **Step 3: Write `src/Unex/Dots/TypeHash.cs`**

```csharp
namespace Unex.Dots;

/// <summary>
/// A component type, described independently of where the description came from (IL2CPP
/// metadata, a hand-written fixture, or a future reflection source). Field <b>names</b> are
/// deliberately absent: they do not contribute to StableTypeHash.
/// </summary>
public sealed record TypeDescriptor(
    string Namespace,
    IReadOnlyList<string> DeclaringTypeNames,
    string Name,
    string AssemblyName,
    IReadOnlyList<TypeDescriptor> GenericArguments,
    IReadOnlyList<TypeDescriptor> Fields);

/// <summary>
/// Offline recompute of Unity Entities' <c>StableTypeHash</c> (spec §3.10). Pure: no I/O, no
/// game files. Specification read from
/// <c>needle-mirror/com.unity.entities/Unity.Entities/Types/TypeHash.cs</c> (Unity Companion
/// License - a spec to read, not code to copy).
/// </summary>
public static class TypeHash
{
    public const ulong Fnv1A64Basis = 14695981039346656037UL;
    public const ulong Fnv1A64Prime = 1099511628211UL;

    /// <summary>
    /// FNV-1A64 over a string. <b>Unity feeds each UTF-16 char as two bytes</b>
    /// (<c>c &amp; 255</c> then <c>c &gt;&gt; 8</c>), so plain FNV-1a over UTF-8 bytes will not
    /// match - not for non-ASCII text, and not even for ASCII, because the zero high byte is
    /// still fed. This is the single most likely place to get StableTypeHash wrong.
    /// </summary>
    public static ulong FNV1A64(string text)
    {
        var hash = Fnv1A64Basis;
        unchecked
        {
            foreach (var c in text)
            {
                hash = (hash ^ (byte)(c & 255)) * Fnv1A64Prime;
                hash = (hash ^ (byte)(c >> 8)) * Fnv1A64Prime;
            }
        }
        return hash;
    }

    /// <summary>FNV-1A64 over an int, little-endian byte by byte.</summary>
    public static ulong FNV1A64(int value)
    {
        var hash = Fnv1A64Basis;
        unchecked
        {
            hash = (hash ^ (ulong)(value & 0xFF)) * Fnv1A64Prime;
            hash = (hash ^ (ulong)((value >> 8) & 0xFF)) * Fnv1A64Prime;
            hash = (hash ^ (ulong)((value >> 16) & 0xFF)) * Fnv1A64Prime;
            hash = (hash ^ (ulong)((value >> 24) & 0xFF)) * Fnv1A64Prime;
        }
        return hash;
    }

    /// <summary>Folds already-computed hashes into an accumulator, whole ulong at a time.</summary>
    public static ulong CombineFNV1A64(ulong hash, params ulong[] values)
    {
        unchecked
        {
            foreach (var value in values)
            {
                hash ^= value;
                hash *= Fnv1A64Prime;
            }
        }
        return hash;
    }

    /// <summary>
    /// Namespace plus the chain of declaring type names, outermost first.
    /// </summary>
    public static ulong HashNamespace(TypeDescriptor type)
    {
        var hash = FNV1A64(type.Namespace);
        foreach (var declaring in type.DeclaringTypeNames)
            hash = CombineFNV1A64(hash, FNV1A64(declaring));
        return hash;
    }

    /// <summary>
    /// Namespace, declaring types, type name, <b>assembly name</b> (included under
    /// <c>UNITY_2022_3_11F1_OR_NEWER</c>, so active for V Rising's 2022.3.58f1), generic
    /// arguments, then recursively every instance field's type.
    /// Explicit <c>StructLayout</c> size hashing is commented out in Unity's own source
    /// (noted there as inconsistent between IL2CPP and Mono), so it is omitted here too -
    /// that removes a variable rather than adding one.
    /// </summary>
    public static ulong StableTypeHash(TypeDescriptor type) =>
        StableTypeHash(type, new HashSet<TypeDescriptor>());

    static ulong StableTypeHash(TypeDescriptor type, HashSet<TypeDescriptor> visiting)
    {
        // A struct cannot contain itself, but a malformed descriptor could; refuse to spin.
        if (!visiting.Add(type)) return FNV1A64(type.Name);
        try
        {
            var hash = HashNamespace(type);
            hash = CombineFNV1A64(hash, FNV1A64(type.Name));
            hash = CombineFNV1A64(hash, FNV1A64(type.AssemblyName));
            foreach (var argument in type.GenericArguments)
                hash = CombineFNV1A64(hash, StableTypeHash(argument, visiting));
            foreach (var field in type.Fields)
                hash = CombineFNV1A64(hash, StableTypeHash(field, visiting));
            return hash;
        }
        finally { visiting.Remove(type); }
    }
}
```

**Honest limit:** these tests prove the arithmetic is deterministic, order-sensitive and uses
Unity's two-byte char feed. They cannot prove the field *ordering* of Unity's algorithm is
reproduced exactly, because that needs real type descriptions. The acceptance metric for that
is the tier-2 hash **intersection rate** against the hash tables read out of `.entities`
(spec §6) — a high rate proves the implementation, a low one proves it is broken. Do not
declare tier 2 done on the strength of these unit tests alone.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test --filter TypeHashTests`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/Unex/Dots/TypeHash.cs tests/Unex.Tests/TypeHashTests.cs
git commit -m "feat: offline FNV-1A64 StableTypeHash recompute with Unity's UTF-16 byte feed"
```

---

## Task 14: `DOTSBIN!` header and node-tree walk

DOTS tier 1. The container was decoded byte-exactly during Phase 0 (spec §3.10); this task
turns that into code. **No game data is committed** — the test builds a synthetic file in
memory.

**Files:**
- Create: `src/Unex/Dots/DotsFile.cs`
- Test: `tests/Unex.Tests/DotsFileTests.cs`

- [ ] **Step 1: Write the failing test with a hand-constructed fixture**

```csharp
using System.Buffers.Binary;
using System.Text;
using Unex.Dots;
using Xunit;

namespace Unex.Tests;

public class DotsFileTests
{
    const int HeaderSize = 152;
    const int NodeSize = 72;

    static void WriteNode(
        byte[] buffer, int at, ulong nodeTypeHash, int size, int nextSiblingOffset,
        int childrenCount, long metadataOffset, int metadataSize, long dataOffset, long dataSize)
    {
        var span = buffer.AsSpan(at);
        BinaryPrimitives.WriteUInt64LittleEndian(span[0..], nodeTypeHash);
        BinaryPrimitives.WriteUInt64LittleEndian(span[8..], 0xF00DUL + (ulong)at);  // Id.Lo
        BinaryPrimitives.WriteUInt64LittleEndian(span[16..], 0xBEEFUL);             // Id.Hi
        BinaryPrimitives.WriteInt32LittleEndian(span[24..], size);
        BinaryPrimitives.WriteInt32LittleEndian(span[28..], nextSiblingOffset);
        BinaryPrimitives.WriteInt32LittleEndian(span[32..], childrenCount);
        BinaryPrimitives.WriteInt64LittleEndian(span[36..], metadataOffset);
        BinaryPrimitives.WriteInt32LittleEndian(span[44..], metadataSize);
        BinaryPrimitives.WriteInt64LittleEndian(span[48..], dataOffset);
        BinaryPrimitives.WriteInt64LittleEndian(span[56..], dataSize);
        // 56 + 8 = 64 used; bytes 64..71 are the record's tail padding to 72
    }

    /// <summary>
    /// Root with two children, node section placed at the END of the file (as Unity does).
    /// Data section: 3,496 bytes of archetype payload + 128 bytes of chunk payload.
    /// </summary>
    static byte[] BuildFile(string magic = "DOTSBIN!", int fileVersion = 77)
    {
        var nodes = new byte[3 * NodeSize];
        WriteNode(nodes, 0, 0x1111, 3 * NodeSize, 3 * NodeSize, 2, 0, 0, 0, 0);
        WriteNode(nodes, NodeSize, 0x2222, NodeSize, NodeSize, 0, 0, 0, 0, 3496);
        WriteNode(nodes, 2 * NodeSize, 0x3333, NodeSize, NodeSize, 0, 0, 0, 3496, 128);

        var data = new byte[3496 + 128];
        for (var i = 0; i < data.Length; i++) data[i] = (byte)(i & 0xFF);

        var file = new byte[HeaderSize + data.Length + nodes.Length];
        var span = file.AsSpan();
        Encoding.ASCII.GetBytes(magic).CopyTo(span[0..8]);
        BinaryPrimitives.WriteInt32LittleEndian(span[8..], fileVersion);
        BinaryPrimitives.WriteInt32LittleEndian(span[12..], HeaderSize);
        BinaryPrimitives.WriteUInt64LittleEndian(span[16..], 0xAABBCCDDUL);   // FileId.Lo
        BinaryPrimitives.WriteUInt64LittleEndian(span[24..], 0x11223344UL);   // FileId.Hi
        BinaryPrimitives.WriteUInt16LittleEndian(span[32..], 16);             // FixedString64Bytes len
        Encoding.UTF8.GetBytes("EntityBinaryFile").CopyTo(span[34..]);
        BinaryPrimitives.WriteInt32LittleEndian(span[96..], 1);               // FirstLevelNodesCount
        BinaryPrimitives.WriteInt64LittleEndian(span[104..], HeaderSize + data.Length);
        BinaryPrimitives.WriteInt32LittleEndian(span[112..], nodes.Length);
        BinaryPrimitives.WriteInt64LittleEndian(span[120..], HeaderSize);     // metadata section
        BinaryPrimitives.WriteInt32LittleEndian(span[128..], 0);
        BinaryPrimitives.WriteInt64LittleEndian(span[136..], HeaderSize);     // data section
        BinaryPrimitives.WriteInt64LittleEndian(span[144..], data.Length);
        data.CopyTo(span[HeaderSize..]);
        nodes.CopyTo(span[(HeaderSize + data.Length)..]);
        return file;
    }

    [Fact]
    public void Header_fields_are_read_from_the_documented_offsets()
    {
        var parsed = DotsFile.Parse(BuildFile(), "synthetic.entities");
        var header = parsed.Header;

        Assert.Equal(77, header.FileVersion);
        Assert.Equal(152, header.HeaderSize);
        Assert.Equal("EntityBinaryFile", header.FileType);
        Assert.Equal(1, header.FirstLevelNodesCount);
        Assert.Equal(0xAABBCCDDUL, header.FileId.Lo);
        Assert.Equal(0x11223344UL, header.FileId.Hi);
        Assert.Equal(152 + 3624, header.NodesSectionOffset);
        Assert.Equal(216, header.NodesSectionSize);
        Assert.Equal(152, header.DataSectionOffset);
        Assert.Equal(3624, header.DataSectionSize);
    }

    [Fact]
    public void The_node_tree_is_walked_from_the_end_of_the_file()
    {
        var parsed = DotsFile.Parse(BuildFile(), "synthetic.entities");

        Assert.Single(parsed.Roots);
        var root = parsed.Roots[0];
        Assert.Equal(0x1111UL, root.NodeTypeHash);
        Assert.Equal(2, root.ChildrenCount);
        Assert.Equal(2, root.Children.Count);
        Assert.Equal(0x2222UL, root.Children[0].NodeTypeHash);
        Assert.Equal(3496, root.Children[0].DataSize);
        Assert.Equal(0x3333UL, root.Children[1].NodeTypeHash);
        Assert.Equal(3496, root.Children[1].DataStartingOffset);
        Assert.Equal(128, root.Children[1].DataSize);
    }

    [Fact]
    public void Node_payloads_are_sliced_out_of_the_data_section()
    {
        var bytes = BuildFile();
        var parsed = DotsFile.Parse(bytes, "synthetic.entities");
        var archetypes = parsed.Roots[0].Children[0];

        var payload = DotsFile.NodeData(bytes, parsed.Header, archetypes);
        Assert.Equal(3496, payload.Length);
        Assert.Equal(0, payload[0]);
        Assert.Equal(1, payload[1]);
    }

    [Fact]
    public void Bad_magic_is_rejected()
    {
        var ex = Assert.Throws<UnexException>(
            () => DotsFile.Parse(BuildFile(magic: "NOTDOTS!"), "synthetic.entities"));
        Assert.Contains("DOTSBIN!", ex.Message);
    }

    [Fact]
    public void An_unsupported_file_version_is_rejected_by_number()
    {
        var ex = Assert.Throws<UnexException>(
            () => DotsFile.Parse(BuildFile(fileVersion: 78), "synthetic.entities"));
        Assert.Contains("78", ex.Message);
        Assert.Contains("77", ex.Message);
    }

    [Fact]
    public void A_truncated_file_is_rejected_rather_than_read_out_of_bounds()
    {
        var truncated = BuildFile()[..100];
        Assert.Throws<UnexException>(() => DotsFile.Parse(truncated, "synthetic.entities"));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter DotsFileTests`
Expected: FAIL — `DotsFile` does not exist.

- [ ] **Step 3: Write `src/Unex/Dots/DotsFile.cs`**

```csharp
using System.Buffers.Binary;
using System.Text;

namespace Unex.Dots;

public readonly record struct Hash128(ulong Lo, ulong Hi)
{
    public override string ToString() => $"{Lo:x16}{Hi:x16}";
}

/// <summary>The 152-byte DOTSBIN! FileHeader (spec §3.10).</summary>
public sealed record DotsHeader(
    int FileVersion, int HeaderSize, Hash128 FileId, string FileType,
    int FirstLevelNodesCount,
    long NodesSectionOffset, int NodesSectionSize,
    long MetadataSectionOffset, int MetadataSectionSize,
    long DataSectionOffset, long DataSectionSize);

/// <summary>One 72-byte NodeHeader plus its children.</summary>
public sealed record DotsNode(
    ulong NodeTypeHash, Hash128 Id, int Size, int NextSiblingOffset, int ChildrenCount,
    long MetadataStartingOffset, int MetadataSize,
    long DataStartingOffset, long DataSize,
    List<DotsNode> Children);

public sealed record DotsFileContents(string FileName, DotsHeader Header, List<DotsNode> Roots);

public static class DotsFile
{
    public const int FileHeaderSize = 152;
    public const int NodeHeaderSize = 72;
    public static readonly byte[] Magic = "DOTSBIN!"u8.ToArray();

    /// <summary>
    /// FileVersion 77 maps to Unity Entities 1.1.0-pre.3 … 1.2.4 (1.0.x = 76, 1.3.2+ = 78).
    /// All 1,183 V Rising files are 77. Anything else means the layout may have moved, so
    /// refuse rather than silently misread.
    /// </summary>
    public static readonly int[] SupportedFileVersions = [77];

    public static DotsFileContents ParseFile(string path) =>
        Parse(File.ReadAllBytes(path), Path.GetFileName(path));

    public static DotsFileContents Parse(byte[] bytes, string fileName)
    {
        if (bytes.Length < FileHeaderSize)
            throw new UnexException(
                $"{fileName}: {bytes.Length} bytes is shorter than the {FileHeaderSize}-byte DOTSBIN! header.");

        var span = bytes.AsSpan();
        if (!span[..8].SequenceEqual(Magic))
            throw new UnexException(
                $"{fileName}: not a DOTSBIN! file (magic is " +
                $"'{Encoding.ASCII.GetString(span[..8]).Replace('\0', '.')}').");

        var fileVersion = BinaryPrimitives.ReadInt32LittleEndian(span[8..]);
        if (!SupportedFileVersions.Contains(fileVersion))
            throw new UnexException(
                $"{fileName}: unsupported DOTS FileVersion {fileVersion}. " +
                $"Supported: {string.Join(", ", SupportedFileVersions)} " +
                "(77 = Unity Entities 1.1.0-pre.3 .. 1.2.4; 76 = 1.0.x; 78 = 1.3.2+).");

        var headerSize = BinaryPrimitives.ReadInt32LittleEndian(span[12..]);
        if (headerSize != FileHeaderSize)
            throw new UnexException(
                $"{fileName}: HeaderSize is {headerSize}, expected {FileHeaderSize}.");

        var fileId = new Hash128(
            BinaryPrimitives.ReadUInt64LittleEndian(span[16..]),
            BinaryPrimitives.ReadUInt64LittleEndian(span[24..]));

        // FixedString64Bytes: uint16 length then UTF-8 bytes, the whole field padded to 64 B.
        var fileTypeLength = BinaryPrimitives.ReadUInt16LittleEndian(span[32..]);
        if (fileTypeLength > 61)
            throw new UnexException(
                $"{fileName}: FileType length {fileTypeLength} does not fit a FixedString64Bytes.");
        var fileType = Encoding.UTF8.GetString(span.Slice(34, fileTypeLength));

        var header = new DotsHeader(
            FileVersion: fileVersion,
            HeaderSize: headerSize,
            FileId: fileId,
            FileType: fileType,
            FirstLevelNodesCount: BinaryPrimitives.ReadInt32LittleEndian(span[96..]),
            NodesSectionOffset: BinaryPrimitives.ReadInt64LittleEndian(span[104..]),
            NodesSectionSize: BinaryPrimitives.ReadInt32LittleEndian(span[112..]),
            MetadataSectionOffset: BinaryPrimitives.ReadInt64LittleEndian(span[120..]),
            MetadataSectionSize: BinaryPrimitives.ReadInt32LittleEndian(span[128..]),
            DataSectionOffset: BinaryPrimitives.ReadInt64LittleEndian(span[136..]),
            DataSectionSize: BinaryPrimitives.ReadInt64LittleEndian(span[144..]));

        // The node section lives at the END of the file, not the front.
        if (header.NodesSectionOffset < 0 || header.NodesSectionSize < 0 ||
            header.NodesSectionOffset + header.NodesSectionSize > bytes.Length)
            throw new UnexException(
                $"{fileName}: node section [{header.NodesSectionOffset}, " +
                $"+{header.NodesSectionSize}) does not fit in {bytes.Length} bytes.");

        var nodes = span.Slice((int)header.NodesSectionOffset, header.NodesSectionSize);
        var roots = new List<DotsNode>();
        var cursor = 0;
        for (var i = 0; i < header.FirstLevelNodesCount; i++)
        {
            var (node, consumed) = ReadNode(nodes, cursor, fileName);
            roots.Add(node);
            cursor += consumed;
        }

        return new DotsFileContents(fileName, header, roots);
    }

    /// <summary>
    /// Reads one node and its subtree, returning the bytes consumed. The tree is
    /// self-describing through <c>ChildrenCount</c>, so the walk does not depend on
    /// <c>NextSiblingOffset</c>; when that field is populated it is validated against the
    /// measured size, which catches a layout change loudly instead of silently.
    /// </summary>
    static (DotsNode Node, int Consumed) ReadNode(ReadOnlySpan<byte> nodes, int at, string fileName)
    {
        if (at + NodeHeaderSize > nodes.Length)
            throw new UnexException(
                $"{fileName}: node at +{at} runs past the {nodes.Length}-byte node section.");

        var span = nodes[at..];
        var childrenCount = BinaryPrimitives.ReadInt32LittleEndian(span[32..]);
        if (childrenCount < 0 || childrenCount > 4096)
            throw new UnexException($"{fileName}: node at +{at} claims {childrenCount} children.");

        var node = new DotsNode(
            NodeTypeHash: BinaryPrimitives.ReadUInt64LittleEndian(span[0..]),
            Id: new Hash128(
                BinaryPrimitives.ReadUInt64LittleEndian(span[8..]),
                BinaryPrimitives.ReadUInt64LittleEndian(span[16..])),
            Size: BinaryPrimitives.ReadInt32LittleEndian(span[24..]),
            NextSiblingOffset: BinaryPrimitives.ReadInt32LittleEndian(span[28..]),
            ChildrenCount: childrenCount,
            MetadataStartingOffset: BinaryPrimitives.ReadInt64LittleEndian(span[36..]),
            MetadataSize: BinaryPrimitives.ReadInt32LittleEndian(span[44..]),
            DataStartingOffset: BinaryPrimitives.ReadInt64LittleEndian(span[48..]),
            DataSize: BinaryPrimitives.ReadInt64LittleEndian(span[56..]),
            Children: []);

        var consumed = NodeHeaderSize;
        for (var i = 0; i < childrenCount; i++)
        {
            var (child, childConsumed) = ReadNode(nodes, at + consumed, fileName);
            node.Children.Add(child);
            consumed += childConsumed;
        }

        if (node.NextSiblingOffset > 0 && node.NextSiblingOffset != consumed)
            throw new UnexException(
                $"{fileName}: node at +{at} declares NextSiblingOffset " +
                $"{node.NextSiblingOffset} but its subtree measures {consumed} bytes. " +
                "The node layout has changed - re-verify against spec §3.10.");

        return (node, consumed);
    }

    /// <summary>A node's payload, sliced out of the data section.</summary>
    public static ReadOnlySpan<byte> NodeData(byte[] bytes, DotsHeader header, DotsNode node)
    {
        var start = header.DataSectionOffset + node.DataStartingOffset;
        if (node.DataSize < 0 || start < 0 || start + node.DataSize > bytes.Length)
            throw new UnexException(
                $"node data [{start}, +{node.DataSize}) does not fit in {bytes.Length} bytes.");
        return bytes.AsSpan((int)start, (int)node.DataSize);
    }

    /// <summary>Depth-first flattening, for reporting and for locating a node by kind index.</summary>
    public static IEnumerable<DotsNode> Flatten(DotsNode node)
    {
        yield return node;
        foreach (var child in node.Children)
            foreach (var descendant in Flatten(child))
                yield return descendant;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test --filter DotsFileTests`
Expected: PASS, 6 tests.

Run: `dotnet test`
Expected: PASS, 54 tests (35 + 13 + 6).

- [ ] **Step 5: Commit**

```bash
git add src/Unex/Dots/DotsFile.cs tests/Unex.Tests/DotsFileTests.cs
git commit -m "feat: DOTSBIN! header and node-tree parser with a synthetic fixture test"
```

---

## Task 15: Archetype table, `.entityheader`, and the `coverage` command

Completes DOTS tier 1: what is in the files structurally, plus an honest account of what is
not readable yet. Coverage reporting is a **first-class shipped artifact** (spec §6) — a dumper
that quietly omits a third of its input is worse than one that says so.

**Files:**
- Create: `src/Unex/Dots/ArchetypeTable.cs`, `src/Unex/Dots/EntityHeaderFile.cs`,
  `src/Unex/Dots/CoverageReport.cs`
- Modify: `src/Unex/Program.cs`
- Test: `tests/Unex.Tests/ArchetypeTableTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using System.Buffers.Binary;
using Unex.Dots;
using Xunit;

namespace Unex.Tests;

public class ArchetypeTableTests
{
    /// <summary>
    /// Layout: int typeCount, ulong[typeCount] StableTypeHash, int archetypeCount, then per
    /// archetype int entityCount, int componentTypeCount, int[componentTypeCount] typeIndex.
    /// </summary>
    static byte[] Build(ulong[] hashes, (int Entities, int[] Types)[] archetypes, int extraBytes = 0)
    {
        var size = 4 + hashes.Length * 8 + 4
                   + archetypes.Sum(a => 8 + a.Types.Length * 4) + extraBytes;
        var buffer = new byte[size];
        var span = buffer.AsSpan();
        var at = 0;

        BinaryPrimitives.WriteInt32LittleEndian(span[at..], hashes.Length); at += 4;
        foreach (var hash in hashes) { BinaryPrimitives.WriteUInt64LittleEndian(span[at..], hash); at += 8; }
        BinaryPrimitives.WriteInt32LittleEndian(span[at..], archetypes.Length); at += 4;
        foreach (var (entities, types) in archetypes)
        {
            BinaryPrimitives.WriteInt32LittleEndian(span[at..], entities); at += 4;
            BinaryPrimitives.WriteInt32LittleEndian(span[at..], types.Length); at += 4;
            foreach (var index in types) { BinaryPrimitives.WriteInt32LittleEndian(span[at..], index); at += 4; }
        }
        return buffer;
    }

    [Fact]
    public void Reads_hashes_archetypes_and_entity_counts()
    {
        var payload = Build([0xAAAA, 0xBBBB, 0xCCCC],
            [(100, [0, 1]), (23, [1, 2, 0])]);

        var table = ArchetypeTable.Read(payload, "synthetic");

        Assert.Equal([0xAAAAUL, 0xBBBBUL, 0xCCCCUL], table.TypeHashes);
        Assert.Equal(2, table.Archetypes.Count);
        Assert.Equal(100, table.Archetypes[0].EntityCount);
        Assert.Equal([0, 1], table.Archetypes[0].TypeIndices);
        Assert.Equal([1, 2, 0], table.Archetypes[1].TypeIndices);
        Assert.Equal(123, table.TotalEntities);
        Assert.Equal(payload.Length, table.BytesConsumed);
        Assert.Equal(payload.Length, table.BytesAvailable);
    }

    [Fact]
    public void Leftover_bytes_are_a_hard_error()
    {
        var payload = Build([0xAAAA], [(1, [0])], extraBytes: 4);
        var ex = Assert.Throws<UnexException>(() => ArchetypeTable.Read(payload, "synthetic"));
        Assert.Contains("consumed", ex.Message);
    }

    [Fact]
    public void A_truncated_payload_is_a_hard_error()
    {
        var payload = Build([0xAAAA, 0xBBBB], [(1, [0])]);
        var ex = Assert.Throws<UnexException>(() => ArchetypeTable.Read(payload[..12], "synthetic"));
        Assert.Contains("synthetic", ex.Message);
    }

    [Fact]
    public void A_type_index_outside_the_hash_table_is_a_hard_error()
    {
        var payload = Build([0xAAAA], [(1, [7])]);
        var ex = Assert.Throws<UnexException>(() => ArchetypeTable.Read(payload, "synthetic"));
        Assert.Contains("7", ex.Message);
    }

    [Fact]
    public void Hashes_for_an_archetype_are_resolvable_by_index()
    {
        var table = ArchetypeTable.Read(Build([0xAAAA, 0xBBBB], [(5, [1, 0])]), "synthetic");
        Assert.Equal([0xBBBBUL, 0xAAAAUL], table.HashesOf(table.Archetypes[0]));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter ArchetypeTableTests`
Expected: FAIL — `ArchetypeTable` does not exist.

- [ ] **Step 3: Write `src/Unex/Dots/ArchetypeTable.cs`**

```csharp
using System.Buffers.Binary;

namespace Unex.Dots;

public sealed record ArchetypeEntry(int EntityCount, int ComponentTypeCount, int[] TypeIndices);

public sealed record ArchetypeTable(
    ulong[] TypeHashes, List<ArchetypeEntry> Archetypes, int BytesConsumed, int BytesAvailable)
{
    public int TotalEntities => Archetypes.Sum(a => a.EntityCount);

    public ulong[] HashesOf(ArchetypeEntry archetype) =>
        [.. archetype.TypeIndices.Select(i => TypeHashes[i])];
}

/// <summary>
/// Decodes the ArchetypesNode payload (spec §3.10). Layout:
/// <c>int typeCount</c>, <c>ulong[typeCount] StableTypeHash</c>, <c>int archetypeCount</c>,
/// then per archetype <c>int entityCount</c>, <c>int componentTypeCount</c>,
/// <c>int[componentTypeCount] typeIndexIntoHashTable</c>.
/// Every byte of the payload must be consumed - a leftover means the layout is not what we
/// think it is, and a silent partial read would poison every downstream number.
/// </summary>
public static class ArchetypeTable
{
    public static ArchetypeTable Read(ReadOnlySpan<byte> payload, string label)
    {
        var at = 0;

        int Int32()
        {
            if (at + 4 > payload.Length)
                throw new UnexException(
                    $"{label}: archetype payload truncated at +{at} of {payload.Length} bytes.");
            var value = BinaryPrimitives.ReadInt32LittleEndian(payload[at..]);
            at += 4;
            return value;
        }

        ulong UInt64()
        {
            if (at + 8 > payload.Length)
                throw new UnexException(
                    $"{label}: archetype payload truncated at +{at} of {payload.Length} bytes.");
            var value = BinaryPrimitives.ReadUInt64LittleEndian(payload[at..]);
            at += 8;
            return value;
        }

        var typeCount = Int32();
        if (typeCount < 0 || 4 + (long)typeCount * 8 > payload.Length)
            throw new UnexException(
                $"{label}: implausible typeCount {typeCount} for a {payload.Length}-byte payload.");

        var hashes = new ulong[typeCount];
        for (var i = 0; i < typeCount; i++) hashes[i] = UInt64();

        var archetypeCount = Int32();
        if (archetypeCount < 0 || archetypeCount > payload.Length / 8)
            throw new UnexException(
                $"{label}: implausible archetypeCount {archetypeCount} for a " +
                $"{payload.Length}-byte payload.");

        var archetypes = new List<ArchetypeEntry>(archetypeCount);
        for (var a = 0; a < archetypeCount; a++)
        {
            var entityCount = Int32();
            var componentTypeCount = Int32();
            if (componentTypeCount < 0 || at + (long)componentTypeCount * 4 > payload.Length)
                throw new UnexException(
                    $"{label}: archetype {a} claims {componentTypeCount} component types, " +
                    $"which does not fit the remaining {payload.Length - at} bytes.");

            var indices = new int[componentTypeCount];
            for (var i = 0; i < componentTypeCount; i++)
            {
                var index = Int32();
                if (index < 0 || index >= typeCount)
                    throw new UnexException(
                        $"{label}: archetype {a} references type index {index}, outside the " +
                        $"{typeCount}-entry hash table.");
                indices[i] = index;
            }
            archetypes.Add(new ArchetypeEntry(entityCount, componentTypeCount, indices));
        }

        if (at != payload.Length)
            throw new UnexException(
                $"{label}: consumed {at} of {payload.Length} archetype bytes - " +
                $"{payload.Length - at} left over. The layout does not match spec §3.10.");

        return new ArchetypeTable(hashes, archetypes, at, payload.Length);
    }
}
```

- [ ] **Step 4: Write `src/Unex/Dots/EntityHeaderFile.cs`**

`.entityheader` has **no magic**. What was decoded in Phase 0 is: a raw little-endian section
table, an embedded nested `DOTSBIN!` block, and the subscene name in plaintext in the tail
(229 unique names recovered, e.g. `Farbane_Mid11_Quarry_Territory`). The name recovery is
frankly a **heuristic**, and it says so in the output so `coverage` can report it as such
rather than pretend it is a decode.

```csharp
using System.Buffers.Binary;
using System.Text;

namespace Unex.Dots;

public sealed record EntityHeader(
    string FileName,
    int[] SectionTable,
    DotsHeader? Embedded,
    string? SceneName,
    string SceneNameSource);

public static class EntityHeaderFile
{
    /// <summary>How many leading int32s of the section table to record (semantics undecoded).</summary>
    public const int SectionTableInts = 8;

    /// <summary>Bytes of the tail scanned for the plaintext scene name.</summary>
    public const int TailScanBytes = 1024;

    public static EntityHeader ParseFile(string path)
    {
        var bytes = File.ReadAllBytes(path);
        var fileName = Path.GetFileName(path);
        var span = bytes.AsSpan();

        var table = new int[Math.Min(SectionTableInts, bytes.Length / 4)];
        for (var i = 0; i < table.Length; i++)
            table[i] = BinaryPrimitives.ReadInt32LittleEndian(span[(i * 4)..]);

        // The nested DOTSBIN! block: locate the magic, then parse from there.
        DotsHeader? embedded = null;
        var magicAt = IndexOf(span, DotsFile.Magic);
        if (magicAt >= 0 && magicAt + DotsFile.FileHeaderSize <= bytes.Length)
        {
            try { embedded = DotsFile.Parse(bytes[magicAt..], fileName).Header; }
            catch (UnexException) { embedded = null; } // reported as unresolved, never fatal
        }

        var (sceneName, source) = RecoverSceneName(span);
        return new EntityHeader(fileName, table, embedded, sceneName, source);
    }

    static int IndexOf(ReadOnlySpan<byte> haystack, ReadOnlySpan<byte> needle)
    {
        for (var i = 0; i + needle.Length <= haystack.Length; i++)
            if (haystack.Slice(i, needle.Length).SequenceEqual(needle)) return i;
        return -1;
    }

    /// <summary>
    /// Longest printable-ASCII identifier run in the file tail. Heuristic, not a decode: the
    /// section-table semantics that would name the field are still undecoded, so the caller
    /// must report the source alongside the value.
    /// </summary>
    static (string? Name, string Source) RecoverSceneName(ReadOnlySpan<byte> span)
    {
        var start = Math.Max(0, span.Length - TailScanBytes);
        var tail = span[start..];
        string? best = null;
        var builder = new StringBuilder();

        void Flush()
        {
            if (builder.Length >= 4 && (best is null || builder.Length > best.Length))
                best = builder.ToString();
            builder.Clear();
        }

        foreach (var b in tail)
        {
            var c = (char)b;
            if (c is (>= 'A' and <= 'Z') or (>= 'a' and <= 'z') or (>= '0' and <= '9') or '_')
                builder.Append(c);
            else Flush();
        }
        Flush();

        return best is null ? (null, "not-found") : (best, "tail-plaintext-heuristic");
    }
}
```

- [ ] **Step 5: Write `src/Unex/Dots/CoverageReport.cs`**

The six node kinds appear as exactly six children of the single `WorldNodeType` root, in the
order given in spec §3.10. Their `NodeTypeHash` values are `StableTypeHash`es of Unity's own
node structs and cannot be recomputed reliably offline yet, so the report **learns** the
hash-to-kind binding from position and then cross-checks that every file agrees. A file whose
root shape differs is recorded as skipped with the reason, never silently reinterpreted.

```csharp
using System.Text.Json.Nodes;

namespace Unex.Dots;

public sealed record EntitiesFileReport(
    string FileName, long Bytes, int FileVersion,
    int NodeCount, int TypeCount, int ArchetypeCount, int EntityCount,
    int ArchetypeBytesConsumed, int ArchetypeBytesAvailable,
    string? Skipped);

public sealed record CoverageSummary(
    int FilesSeen, int FilesParsed, int FilesSkipped,
    int DistinctTypeHashes, int TypeHashesBoundToNames,
    int TotalEntities, int TotalArchetypes,
    List<EntitiesFileReport> Files,
    Dictionary<string, int> SkipReasons,
    Dictionary<string, string> NodeKindHashes,
    List<string> Unresolved);

public static class CoverageReport
{
    /// <summary>The six children of WorldNodeType, in file order (spec §3.10).</summary>
    public static readonly string[] NodeKindsInOrder =
    [
        "ArchetypesNodeType",
        "BlobAssetsNodeType",
        "SharedAndManagedComponentsNodeType",
        "EnabledBitsNodeType",
        "ChunksNodeType",
        "BufferDataNodeType",
    ];

    /// <summary>
    /// Tier 1 is structural only. Everything named here is detected and reported, never
    /// guessed (spec §6).
    /// </summary>
    public static readonly string[] TierOneUnresolved =
    [
        "component type names (StableTypeHash -> ProjectM.* requires IL2CPP metadata; tier 2)",
        "blittable component values in 16 KiB chunks (tier 3)",
        "dynamic buffers (BufferDataNode heap)",
        "BlobAssetReference targets",
        "shared components",
        "managed components",
        "Entity reference remapping",
    ];

    public static CoverageSummary Run(string entityScenesDir, Action<string>? log = null)
    {
        if (!Directory.Exists(entityScenesDir))
            throw new UnexException($"entityScenesDir not found: {entityScenesDir}");

        var files = Directory.EnumerateFiles(entityScenesDir, "*.entities", SearchOption.AllDirectories)
            .Order(StringComparer.OrdinalIgnoreCase).ToList();

        var reports = new List<EntitiesFileReport>();
        var skipReasons = new Dictionary<string, int>(StringComparer.Ordinal);
        var nodeKindHashes = new Dictionary<string, string>(StringComparer.Ordinal);
        var allHashes = new HashSet<ulong>();
        int parsed = 0, totalEntities = 0, totalArchetypes = 0, done = 0;

        foreach (var path in files)
        {
            var fileName = Path.GetFileName(path);
            var length = new FileInfo(path).Length;
            try
            {
                var bytes = File.ReadAllBytes(path);
                var contents = DotsFile.Parse(bytes, fileName);

                if (contents.Roots.Count != 1)
                    throw new UnexException($"expected 1 root node, found {contents.Roots.Count}");
                var root = contents.Roots[0];
                if (root.Children.Count != NodeKindsInOrder.Length)
                    throw new UnexException(
                        $"expected {NodeKindsInOrder.Length} children under the world node, " +
                        $"found {root.Children.Count}");

                for (var i = 0; i < NodeKindsInOrder.Length; i++)
                {
                    var kind = NodeKindsInOrder[i];
                    var hash = root.Children[i].NodeTypeHash.ToString("x16");
                    if (nodeKindHashes.TryGetValue(kind, out var known) && known != hash)
                        throw new UnexException(
                            $"{kind} hash {hash} disagrees with {known} seen in earlier files");
                    nodeKindHashes[kind] = hash;
                }

                var archetypeNode = root.Children[0];
                var table = ArchetypeTable.Read(
                    DotsFile.NodeData(bytes, contents.Header, archetypeNode), fileName);
                foreach (var hash in table.TypeHashes) allHashes.Add(hash);

                reports.Add(new EntitiesFileReport(
                    fileName, length, contents.Header.FileVersion,
                    DotsFile.Flatten(root).Count(),
                    table.TypeHashes.Length, table.Archetypes.Count, table.TotalEntities,
                    table.BytesConsumed, table.BytesAvailable, null));

                parsed++;
                totalEntities += table.TotalEntities;
                totalArchetypes += table.Archetypes.Count;
            }
            catch (Exception ex)
            {
                var reason = ex is UnexException ? ex.Message : $"{ex.GetType().Name}: {ex.Message}";
                skipReasons[reason] = skipReasons.GetValueOrDefault(reason) + 1;
                reports.Add(new EntitiesFileReport(fileName, length, 0, 0, 0, 0, 0, 0, 0, reason));
            }

            if (++done % 200 == 0) log?.Invoke($"coverage: {done}/{files.Count} files");
        }

        return new CoverageSummary(
            FilesSeen: files.Count,
            FilesParsed: parsed,
            FilesSkipped: files.Count - parsed,
            DistinctTypeHashes: allHashes.Count,
            TypeHashesBoundToNames: 0, // tier 2 is not implemented; reported honestly as 0
            TotalEntities: totalEntities,
            TotalArchetypes: totalArchetypes,
            Files: reports,
            SkipReasons: skipReasons,
            NodeKindHashes: nodeKindHashes,
            Unresolved: [.. TierOneUnresolved]);
    }

    public static void Write(CoverageSummary summary, string path, IEnumerable<EntityHeader> headers)
    {
        var json = new JsonObject
        {
            ["tier"] = 1,
            ["filesSeen"] = summary.FilesSeen,
            ["filesParsed"] = summary.FilesParsed,
            ["filesSkipped"] = summary.FilesSkipped,
            ["distinctTypeHashes"] = summary.DistinctTypeHashes,
            ["typeHashesBoundToNames"] = summary.TypeHashesBoundToNames,
            ["totalArchetypes"] = summary.TotalArchetypes,
            ["totalEntities"] = summary.TotalEntities,
            ["nodeKindHashes"] = new JsonObject(
                summary.NodeKindHashes.Select(kv => KeyValuePair.Create(kv.Key, (JsonNode?)JsonValue.Create(kv.Value)))),
            ["unresolved"] = new JsonArray([.. summary.Unresolved.Select(u => (JsonNode)JsonValue.Create(u))]),
            ["skipReasons"] = new JsonObject(
                summary.SkipReasons.Select(kv => KeyValuePair.Create(kv.Key, (JsonNode?)JsonValue.Create(kv.Value)))),
            ["subScenes"] = new JsonArray([.. headers.Select(h => (JsonNode)new JsonObject
            {
                ["file"] = h.FileName,
                ["sceneName"] = h.SceneName,
                ["sceneNameSource"] = h.SceneNameSource,
                ["embeddedFileVersion"] = h.Embedded?.FileVersion,
            })]),
            ["files"] = new JsonArray([.. summary.Files.Select(f => (JsonNode)new JsonObject
            {
                ["file"] = f.FileName,
                ["bytes"] = f.Bytes,
                ["fileVersion"] = f.FileVersion,
                ["nodes"] = f.NodeCount,
                ["types"] = f.TypeCount,
                ["archetypes"] = f.ArchetypeCount,
                ["entities"] = f.EntityCount,
                ["archetypeBytesConsumed"] = f.ArchetypeBytesConsumed,
                ["archetypeBytesAvailable"] = f.ArchetypeBytesAvailable,
                ["skipped"] = f.Skipped,
            })]),
        };

        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        File.WriteAllText(path, json.ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
    }
}
```

- [ ] **Step 6: Add the `coverage` command to `Program.cs`**

Register it in `Main` (`root.Subcommands.Add(BuildCoverageCommand());`). It needs no mounted
`AssetsManager` — `.entities` files are read directly — so it only resolves the profile.

```csharp
    static Command BuildCoverageCommand()
    {
        var fileOption = new Option<string?>("--file")
        {
            Description = "Report on a single .entities file name instead of the whole directory",
        };
        var command = new Command("coverage",
            "Survey DOTS .entities files and write _coverage.json (tier 1: structure only)");
        command.Options.Add(ProfileOption);
        command.Options.Add(fileOption);
        command.SetAction(parse => Run(() =>
        {
            var config = ProfilesConfig.Resolve(parse.GetValue(ConfigOption));
            var profile = config.Get(parse.GetValue(ProfileOption)!);
            var scenesDir = profile.ResolvedEntityScenesDir
                ?? throw new UnexException("profile has no entityScenesDir set.");

            var single = parse.GetValue(fileOption);
            if (single is not null)
            {
                var path = Path.Combine(scenesDir, single);
                if (!File.Exists(path)) throw new UnexException($"not found: {path}");
                var bytes = File.ReadAllBytes(path);
                var contents = Dots.DotsFile.Parse(bytes, single);
                var table = Dots.ArchetypeTable.Read(
                    Dots.DotsFile.NodeData(bytes, contents.Header, contents.Roots[0].Children[0]), single);
                Console.WriteLine(
                    $"{single}: fileVersion={contents.Header.FileVersion} " +
                    $"types={table.TypeHashes.Length} archetypes={table.Archetypes.Count} " +
                    $"entities={table.TotalEntities} " +
                    $"archetypeBytes={table.BytesConsumed}/{table.BytesAvailable}");
                return 0;
            }

            var summary = Dots.CoverageReport.Run(scenesDir, Warn);
            var headers = Directory
                .EnumerateFiles(scenesDir, "*.entityheader", SearchOption.AllDirectories)
                .Order(StringComparer.OrdinalIgnoreCase)
                .Select(Dots.EntityHeaderFile.ParseFile)
                .ToList();

            var outPath = Path.Combine(profile.OutputDir, "EntityScenes", "_coverage.json");
            Dots.CoverageReport.Write(summary, outPath, headers);

            Console.WriteLine(
                $"coverage: {summary.FilesParsed}/{summary.FilesSeen} .entities parsed, " +
                $"{summary.DistinctTypeHashes} distinct type hashes " +
                $"({summary.TypeHashesBoundToNames} bound to names), " +
                $"{summary.TotalArchetypes} archetypes, {summary.TotalEntities} entities, " +
                $"{headers.Count} subscene headers -> {outPath}");
            if (summary.FilesSkipped > 0)
            {
                Console.Error.WriteLine($"{summary.FilesSkipped} file(s) skipped:");
                foreach (var (reason, count) in summary.SkipReasons.OrderByDescending(k => k.Value).Take(10))
                    Console.Error.WriteLine($"  {count,5}x {reason}");
            }
            return 0;
        }));
        return command;
    }
```

- [ ] **Step 7: Run the tests, then verify the single-file numbers**

Run: `dotnet test`
Expected: PASS, 59 tests (54 + 5).

Run:
```bash
dotnet run --project src/Unex -- coverage --profile vrising \
  --file 018be26374d7ad94d99c57e637f5cc42.0.entities
```
Expected **exactly** (the byte-exact Phase 0 measurement, spec §3.10):

```
018be26374d7ad94d99c57e637f5cc42.0.entities: fileVersion=77 types=87 archetypes=49 entities=6198 archetypeBytes=3496/3496
```

All four numbers must match: **87 types, 49 archetypes, 6,198 entities, and 3,496 of 3,496
archetype bytes consumed**. `ArchetypeTable.Read` throws rather than returning a partial read,
so `3496/3496` cannot be faked by a lenient parser.

- [ ] **Step 8: Verify the full survey**

Run: `dotnet run --project src/Unex -- coverage --profile vrising`
Expected: `1183/1183 .entities parsed` (spec §3.1) and `218` subscene headers, with
`_coverage.json` written under `<outputDir>/EntityScenes/`. Then check the report is honest
about its limits:

```bash
python -c "import json;d=json.load(open('D:/SteamLibrary/steamapps/common/VRising/Exports/EntityScenes/_coverage.json'));print(d['filesParsed'], d['typeHashesBoundToNames'], len(d['unresolved']));print(sorted(d['nodeKindHashes']))"
```
Expected: `1183 0 7`, and all six node kinds listed. `typeHashesBoundToNames == 0` is the
correct tier-1 answer — tier 2 is not implemented, and the report says so rather than omitting
the field.

Spot-check a recovered subscene name against the spike's findings:
```bash
python -c "import json;d=json.load(open('D:/SteamLibrary/steamapps/common/VRising/Exports/EntityScenes/_coverage.json'));n=[s['sceneName'] for s in d['subScenes']];print(len(set(n)));print([x for x in n if x and 'Quarry' in x][:3])"
```
Expected: a name set in the low hundreds, including `Farbane_Mid11_Quarry_Territory`-style
values (229 unique names were recovered in Phase 0).

- [ ] **Step 9: Commit**

```bash
git add src/Unex/Dots/ArchetypeTable.cs src/Unex/Dots/EntityHeaderFile.cs \
        src/Unex/Dots/CoverageReport.cs src/Unex/Program.cs \
        tests/Unex.Tests/ArchetypeTableTests.cs
git commit -m "feat: DOTS tier 1 archetype table, subscene headers and the coverage command"
```

---

## Deferred to a follow-up plan

Not in this plan, in the order they should be picked up:

- **DOTS tier 2 — `StableTypeHash` → name binding via IL2CPP.** `Dots/Il2CppTypeIndex.cs`:
  enumerate the 2,133 `ProjectM.*` type definitions in `global-metadata.dat`, build a
  `TypeDescriptor` per component type, recompute the hash with `Dots/TypeHash.cs` (Task 13),
  and intersect with the hash tables `coverage` already reads. The **intersection rate is the
  acceptance gate** (spec §6) — it self-checks the hash implementation without ground truth.
  Blocked on the IL2CPP quarantine below.
- **DOTS tier 3 — blittable chunk value decode.** `Dots/ChunkReader.cs`: walk the 16 KiB
  archetype chunks (`kChunkSize = 16384`, `kBufferOffset = 64`, `kSerializedHeaderSize = 40`)
  and decode plain blittable structs only — `float3`, `int`, `PrefabGUID`, enums, bools and
  fixed-size composites. Dynamic buffers, `BlobAssetReference`, shared components, managed
  components and `Entity` remapping stay **detected and reported unresolved, never guessed**.
  Offsets rot on every game patch, which is why this is last and why `_coverage.json` must make
  breakage loud.
- **Optional IL2CPP quarantine for classic-file MonoBehaviours.** `Core/Il2CppTemplates.cs`,
  the only file allowed to reference LibCpp2IL (spec §5.6). Needed for ~910 objects in the 5
  classic serialized files, whose TypeTrees are stripped; bundle MonoBehaviours never need it.
  Requires `Samboy063.LibCpp2IL` pinned to `2022.1.0-pre-release.19`,
  `AllowManualMetadataAndCodeRegInput = true`, and the metadata-registration address
  `18CB18A40` supplied as **bare hex** (a `0x` prefix silently parses as 0). That address
  changes with every game patch, so the integration must be disabled by default, fail-soft per
  object, and reported by `doctor`.
