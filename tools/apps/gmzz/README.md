# gmzz — Lord of Mysteries pipelines

Named for the client's own codenames: the launcher is `GMZZLauncher`, the UE
project is `C7`. Paths come from `tools/.env` (`GMZZ_*`, see
`tools/.env.example`). The client is not modified and nothing here reads
launcher account files or game logs.

## Reading the client's tables

Every game table lives under `C7/Content/ScriptOPCode/Data/Excel` as a LuaJIT
2.1 dump, obfuscated twice over: each proto body is XOR'd with a repeating
48-byte ASCII key, and every instruction's opcode byte is remapped — which is
what the `ScriptOPCode` directory name means. `luac.py` undoes both and emits a
dump stock LuaJIT loads; `tables.py` then **executes** it.

Executing matters. LuaJIT compiles a table constructor into a *template* whose
non-constant fields are `nil` placeholders that the following instructions fill
in, so a reader that only walks the bytecode constants loses every localized
field — in `TrainTradeGoodsData` that is `GoodsDesc`, `GoodsNameTextID` and
`GoodsDescStation`, i.e. every name a wiki would want. The client's one call,
`Game.TableDataManager:GetLangStr(id)`, is stubbed to record the id, and the
text is substituted afterwards from the `StringDB_CN_Data_*` shards, which are
tables of the same kind.

Both layers were originally recovered here by analysis, and CUE4Parse has since
been confirmed to carry the same key (from the client binary) and the same
opcode permutation — `luac.py` now uses the complete table rather than only the
fourteen opcodes the data tables need, so the gameplay scripts decode too.

Two details cost real time to find, so they are worth restating:

- Text ids are ~16-digit numbers. Formatting one with Lua's `tostring` (which is
  `%.14g`) truncates it and every lookup misses; `%d` is required.
- Those ids index the string shards **directly**. They look like they need
  decoding; they don't. Join on the raw value.

Getting the export in the first place needs `uex` with the
`GAME_LordOfMysteries` game version — the game-specific `0x05070004`, not plain
`GAME_UE5_7` (`0x05070000`) — plus the client's AES key and usmap:

```bash
uex export --profile gmzz --only C7/Content/ScriptOPCode/Data/Excel
```

**The profile's `paksDir` must be the game root** (`.../Game/C7`), not
`Content/Paks`. Only two of this client's `.utoc` are real files; the rest of the
container set is described by `Content/package.manifest`, with chunk names
supplied by `Content/Manifest_UFSFiles_Win64.txt`. CUE4Parse's
`LoMDefaultFileProvider` needs to see both, and uex selects it automatically for
this game. Point it at `Content/Paks` instead and you get 148k files with almost
no cooked art rather than 591k — with **no error reported**, which is exactly how
this was originally misdiagnosed as a client that streams its art from a CDN.

## Exporting the hot-patched build, not the install

```bash
uv run python -m gmzz.kscache          # writes GMZZ_PATCHED/C7/Content
uex export --profile gmzz --only C7/Content/ScriptOPCode/Data/Excel
```

with uex's `gmzz` profile pointed at `GMZZ_PATCHED/C7` rather than the install.

The install is a *base* build and the client never rewrites it: every patch
since is downloaded into `Saved/kscache/` and overlaid at run time. An export of
`Game/C7` is therefore the last full download — 2018737 of 2026-08-19 — while
players are on 2097705, and **273 Excel tables differ** between the two.
`EquipmentWordRandomWordData` is one: its 非凡 ladder is Mark 550..1000 by 50 in
the install and 415..1000 by 65 live, which is why the reforge page's totals
were off by up to five until the live table was read. The patched tables are
also stock LuaJIT dumps — version byte `0x02`, no XOR, no opcode remap — so
`luac.py` tells them apart by that byte and passes them through.

`kscache.py` assembles a second client root uex can mount as-is:

- the base containers and `Manifest_UFSFiles_Win64.txt` are **hard-linked**, so
  `GMZZ_PATCHED` must be on the install's volume and nothing is copied;
- every changed `.pak` entry that has been downloaded goes into
  `Paks/pakchunk0-Windows_1_P.pak`, a plain version-11 pak whose `_P` suffix
  makes CUE4Parse prefer it over the base — this is where the tables live;
- for the IoStore containers a `package.manifest` is synthesized: each kscache
  pack file is hard-linked in as an extra partition of the container it patches
  (`pakchunk9999-Windows_s19.ucas`, …) and the changed chunks are re-pointed at
  it. Single-chunk bucket files are copied into one aggregate partition per
  container instead, because block offsets carry the partition index in a
  40-bit field and one container has 250 of them.

What the run cannot recover, and reports: chunks the client has not downloaded
yet (it fetches on demand; ~3,000 of 616k, in optional and cosmetic containers)
are dropped rather than misread, one Excel table among them; the 53 pak entries
*added* since the base build have no name, because the pak's own index is the
only source of names and the chunk id is not a path hash we could find; and the
`.upak` containers are left as installed. The format itself — the `KMF`
manifest's 48-byte chunk records, `local.cache`, the pack and bucket files, the
client's pak footer variant — is written up at the top of `kscache.py`.

Needs `GMZZ_PATCHED` and `GMZZ_AES_KEY` (the pak index key, the same one in
uex's profile) in `tools/.env`.

## Train trade (铁路大亨)

```bash
uv run python -m gmzz.traintrade
```

Writes `traintrade/{goods,goods_types,prices,contracts,quests,constants}.json`
and `locales/zh-CN/traintrade.json` into `GMZZ_DATA_OUT`, then re-stamps
`version.json`. Field names are the client's own — the pipeline resolves text
and orders rows, but renames nothing, because a wiki guessing at
`LeftOverSellPrice` is better off guessing from the real name than from one we
invented. It fails loudly on any unresolved text id rather than shipping blank
labels.

## Goods icons

```bash
uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Item/Large
uv run python -m gmzz.icons
```

Goods carry no icon path. The chain is `TrainTradeGoodsData.SystemItemID` →
`ItemNewData.icon` → `C7/Content/Arts/UI_2/Resource/Item/Large/<icon>.uasset`
(400×400 DXT5). `gmzz.icons` resolves it, writes the 32 distinct WebP images
into `GMZZ_RES_OUT/icons/` and the mapping into
`data-gmzz/traintrade/icons.json`. Thirty-two, not sixty-four: the `HIGH_` tiers
share art with their base tier, as they share descriptions.

The icon id stays out of `goods.json` deliberately — every field there is the
client's own, and this one is a join we performed. The stage fails rather than
skipping a goods row that won't resolve, since a missing icon is a hole in the
wiki and a silent skip hides a broken join.

## Equipment and relic icons, and the rarity plates

```bash
uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Item/Large
uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/ConfigIcon/ItemQuality
uv run python -m gmzz.equipicons
```

Converts the 270 distinct icons used by `equipment.items`, `relics.artifacts` and
`relics.materials.items` into `GMZZ_RES_OUT/icons/` — the same directory
`gmzz.icons` fills, because these are the same `Item/Large` art under the
client's own numeric names. It writes no JSON: both stages already emit an `icon`
field per row, so there is nothing left to map. Which is also why it does **not**
re-stamp `version.json` — the version is a digest of `GMZZ_DATA_OUT`, and this
stage only reads from there.

The same run ships the seven **rarity plates** the client draws under every item
icon, `ConfigIcon/ItemQuality/ItemQuality01..07`, into `GMZZ_RES_OUT/ui/` under
their own names. `ItemNewData.quality` is the `0N` in the name — the placeholder
rows called 橙 are quality 6, and 06 is the orange plate — so the page indexes
them by quality directly instead of keeping a colour table that would have to be
matched to the game by eye. The 136×136 asset is a 120×120 plate inside a soft
drop shadow; only the plate is shipped, since the tile draws its own border and
the shadow would leave the coloured bar floating above the tile's edge.

**Run it after `gmzz.equipment` and `gmzz.relics`.** It collects the ids from
their emitted JSON rather than from the tables, since those two stages own the
filters that decide which rows exist; re-deriving the set here would be a second
copy of that logic, free to drift. It fails naming the module to run when either
file is absent.

**The `icon` field is not the row's id.** Item 3001059 (温暖的皮靴) carries
`icon: "3280621"`, and icons are shared — 270 images for 419 rows. Deduplicate,
and never assume the row id is the asset name.

Coverage is 100% across all 419 rows, so a PNG missing from the export means the
export regressed and is an error rather than a skip. As in `gmzz.icons`, the
whole set — icons and plates — is validated before anything is written: the two
artifact repos are committed separately, so a half-converted run would ship
visibly broken. Re-runs skip any WebP newer than its source PNG.

## Utopian Theater (乌托邦剧场)

```bash
uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Skill
uv run python -m gmzz.utopia
```

The mode is `Mythic` internally — the client's own `UtopiaTheate` spelling
survives only in its audio paths — so the table is `MythicCardInfoData`. Writes
281 cards to `data-gmzz/utopia/cards.json` and their 115 distinct icons to
`resource-gmzz/utopia/`; `CardIcon` is a UE object path, so `/Game/` maps to the
pak's `C7/Content/` and the export lands as `.png`.

**No pathway field is emitted.** `Tag` separates the 81 universal cards from the
200 pathway-locked ones, but which of the six Beyonder pathways each of those
200 belongs to is in no table the export contains. A wiki asserting the wrong
pathway is worse than one that stays silent, so the split is left out and the
page groups by tag. If the mapping turns up, it is a small addition here.

## Beyonder rating (非凡评分)

```bash
uv run python -m gmzz.score
```

Writes `data-gmzz/score/rating.json`: 4 groups, 14 items, their benchmark
curves, the rating bands and the improvement materials.

非凡评分 is the game's one number for how developed a character is. Its panel
splits into 4 groups (`CEGenusData`: 途径 / 装备 / 封印物 / 非凡人物) over 14 items
(`CESpeciesData`). "CE" is the client's own abbreviation — combat effectiveness —
which is why nothing in the export answers to `Score` or `Rating`, and the
fastest way in is the panel's own label strings.

**The per-item score is not in the client, and this pipeline invents none.**
`Data/NetDefs/AvatarActorCEComponent.xml` settles it:

```xml
<ZhanLi Type="int" Flags="OWN_CLIENT" .../>          <!-- 非凡评分 CEScore -->
<CESpeciesScore Type="DictIntInt" Flags="OWN_INITIAL_ONLY" .../>
<OnMsgSyncCESpeciesScore> <Arg>int</Arg> <Arg>int</Arg> </OnMsgSyncCESpeciesScore>
```

The client receives every number and computes none, so how gear becomes points
is server-side and unrecoverable here. What the client *does* own is the whole
grading side, and that is what ships: the benchmark curves, the completion
formula (`Min(1, Min(1, s/expected) * 0.9 + Min(1, s/max) * 0.1)`), the bands
(推荐提升 / 稳步增长 / 趋于完善 / 登峰造极) and the materials each item consumes.

Three traps, all of which cost time:

- **The static `ExpectedScore` / `MaxScore` columns match no level.** Fitting all
  28 formulas across the whole 70×31 grid, the best point (L70 D21) reproduces 4
  of 28. They are emitted as the client's own fields, but the *curves* are what
  grades a player — a column pinned to nothing would misgrade everyone.
- **The curves take two parameters**, `$1` = 扮演等级 (to 70) and `$2` = 神性等级
  (to 30) — the pair the client itself calls 扮演等级与神性等级. Divinity is inert
  below the level cap because its branches sit behind `elseif $1 < 70`, verified
  over all 28 curves, so the emitted form is `byLevel[1..69]` plus
  `byDivinity[0..30]` rather than a 2170-point grid. The build asserts that
  separability rather than trusting it.
- **Do not probe outside the domain.** Each ladder ends at `elseif $2 == 30`, so
  a divinity of 31 matches no branch and falls through to the `local Score`
  default at the top of the body — which for 秘偶属性 is a different number than
  its own value at 30. An early version asserted the curve was flat past 30 and
  failed the build on that. Six curves are also not monotonic; that is the
  client's data, not an error, so it is not asserted either.

The formulas are run on the LuaJIT that `tables.py` already uses rather than
re-implemented. The branch order is `$1 < 40 … $1 < 70` and only then `$2 < n`,
and a transcription slip in that order would be invisible in the output.

## Equipment reforge graces (装备重塑 / 恩赐)

```bash
uv run python -m gmzz.reforge
```

Writes 70 graces and the 8 slots that have them to
`data-gmzz/reforge/{graces,slots}.json`, then re-stamps `version.json`.

Reforging rerolls an equipment's random affixes (`词条`); two or more
*extraordinary* (`非凡`) ones combine into a **named grace** (`恩赐`) —
征服宣言, 血谋共舞的旗帜, 铁火铸就的盟约. Naming it is what the page is for, so the
grace is the row, and its extraordinary-affix requirement the headline number.

The table is `EquipmentSpiritualityConvergenceData`: the feature is `灵性汇聚` /
"spirituality convergence" internally, so grepping the export for `Reforge`,
`Affix` or `Grace` finds **nothing at all** — which is how this looked at first
like a feature shipped after the export. Two facts make it findable again:

- `EquipmentSlotData.ConvergenceDefaultIcon` names the reforge screen's own
  placeholder art, which ties "convergence" to this UI.
- The names are not in the table — it stores text ids — and searching the
  *decrypted bytes* of every table for one of those ids finds only the string
  shards. That is a false negative, not evidence: LuaJIT writes a number
  differently as a table **key** (plain uleb128 pair) than as a **value**
  (`uleb128_33`, the low word shifted left with a flag bit), and the shards hold
  them as keys. Executing every table and searching the *results* found the row
  immediately. Byte-scanning the dumps is only sound for strings.

`GroupCondition1` and `GroupCondition2` carry the mechanic: each is
`{affixCount: [affixGroupId, ...]}`, naming a stat family and how many
extraordinary affixes of it the grace needs. Both must hold, so the requirement
is the **sum**. Beware two shapes:

- A count of `1` reaches the pipeline as a *list*, because LuaJIT tables keyed
  `1..n` do. Read as a dict it would index from 0 and turn every one-affix
  condition into a zero — silently, and for every slot at once.
- A count of `0` is real, and distinguishes "3 attack, none of the other family"
  from a row that only asks for 3 attack. It pairs with a different grace name.

The sum is verified, not assumed: the client's editor labels survive in the
string shards as `恩赐词条-<slot>-<n>-<i>`, and `恩赐词条-武器-4-3（2+2）` is
exactly the row whose two conditions are 2 and 2. Every label has a row summing
to its `n`.

Three things are emitted as-is rather than tidied, because tidying them would
assert more than the client does:

- **`brief1` / `brief2` keep the client's numbering.** For most rows `Brief2` is
  the same effect worded for a healing build (compare `EquipmentMythData`'s
  `WordDesc` / `WordDesc2`), but on the 指环 two-affix rows it describes an
  effect the row's own `Prop` values do not produce. Naming the column
  `effectHealing` would launder that inconsistency.
- **`残躯壁垒` is one name on 18 rows** across 指环, 护符, 帽子, 披风 and 鞋靴 —
  one text id, shared. The two-affix graces on those slots are individually
  themed (夜影/月泪/血吻, 秘典/真视/隐录), so this is the client's placeholder for
  three-affix names it has not written yet. It ships duplicated because that is
  what the game shows.
- **`SEASON_DAY(101)>=999`** is the client's "not scheduled this season" marker
  (护符 and 鞋靴 three-affix graces). It parses as day 999 like any other rather
  than being special-cased into a flag we invented.

An unrecognised `ShowCondition` raises. A wiki that renders "no requirement"
because the pipeline failed to parse the requirement is worse than a build that
stops.

**No grace icons.** `Icon` names 46 assets under
`Arts/UI_2/Resource/ConfigIcon/Equipment/BeyonderIcon/`; they are listed in the
client's `Manifest_UFSFiles_Win64.txt` but absent from what uex indexes
(`ConfigIcon` resolves to one file, against 18130 manifest entries), so the
asset name is emitted for a later run to resolve and the page is typographic.

## Equipment and sealed items

An older pipeline, predating the table reader above: it turns
`Manifest_UFSFiles_Win64.txt` into a reviewable extraction plan and builds a
SQLite database from JSON table exports supplied separately.

```bash
uv run python -m gmzz.database plan \
  --manifest 'D:/GMZZLauncher/Game/Manifest_UFSFiles_Win64.txt' \
  --output 'E:/Exports/lord-of-mysteries/extraction-plan.json'

uv run python -m gmzz.database build \
  --manifest 'D:/GMZZLauncher/Game/Manifest_UFSFiles_Win64.txt' \
  --tables 'E:/Exports/lord-of-mysteries/tables' \
  --normalized 'E:/Exports/lord-of-mysteries/normalized.json' \
  --output 'E:/Exports/lord-of-mysteries/gmzz.sqlite'

uv run python -m gmzz.database inspect 'E:/Exports/lord-of-mysteries/gmzz.sqlite'
```

Keep the database out of `GMZZ_DATA_OUT`: `version.py` digests every file under
that directory, so one living there would be hashed into the dataset's
`version.json` and bust every browser cache on an unrelated rebuild.

`build` refuses to overwrite an existing database; pass `--replace` for an
intentional, reproducible rebuild. Rebuilds are atomic — the old database
survives a failed validation or import. `equipment_search_zh_cn` and
`sealed_search_zh_cn` are flattened Chinese views over the normalized tables,
whose top-level keys are `metadata`, `texts`, `effects`, `affixes` and
`entries`; ids stay strings so a JSON consumer never rounds a 64-bit game id,
and unrecognised source columns survive in each row's `raw_json`.

Its manual export step is now unnecessary — `tables.load_table` reads those same
tables straight out of the client. Porting it onto the reader is the obvious next
step and would drop the `--tables`/`--normalized` inputs entirely.
