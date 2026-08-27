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
