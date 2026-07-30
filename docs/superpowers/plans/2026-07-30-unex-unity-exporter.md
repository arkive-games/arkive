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
