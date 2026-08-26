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

**No images yet.** The client is `Online_Shipping.Windows.Cdn`: it ships only
two `.utoc` (`global`, `pakchunk0-Windows`) and streams the rest through UE5
IoStore On-Demand, caching chunks under `Saved/kscache` named by `FIoChunkId`.
So ~75 GB of `.ucas` has no local table of contents, `package.manifest` is a
`KMF` CDN patch manifest keyed by 16-byte hashes with no asset paths in it, and
every icon path the UI code references is absent from the mounted VFS: 148,312
files mount, only 2,739 are `.uasset`, and none of them are item icons. Goods
carry a numeric `icon` id (via `SystemItemID` → `ItemNewData`), so the join is
ready the moment the art becomes reachable.

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
