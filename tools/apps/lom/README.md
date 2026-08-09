# Lord of Mysteries equipment database

This package builds a local, traceable SQLite database for equipment affixes
and sealed-item effects from an authorized export of the installed client.
The client is not modified and the pipeline does not read launcher account
files or game logs.

## Input layers

1. `Manifest_UFSFiles_Win64.txt` is always required. It produces the exact,
   reviewable list of relevant cooked assets.
2. A raw JSON table-export directory is optional. Every row is preserved in
   `source_row` before any interpretation.
3. A normalized JSON document is optional. It populates queryable entries,
   affixes, effects, and localized text.

The normalizer should be written only after a representative authorized table
export is available. This prevents guessed cooked-field names from silently
becoming the database contract.

## Commands

Run from `tools/`:

```powershell
uv run python -m lom.database plan `
  --manifest 'F:/GMZZLauncher/Game/Manifest_UFSFiles_Win64.txt' `
  --output 'E:/Exports/lord-of-mysteries/extraction-plan.json'

uv run python -m lom.database build `
  --manifest 'F:/GMZZLauncher/Game/Manifest_UFSFiles_Win64.txt' `
  --tables 'E:/Exports/lord-of-mysteries/tables' `
  --normalized 'E:/Exports/lord-of-mysteries/normalized.json' `
  --output 'E:/arkive-games/data-lom/lom.sqlite'

uv run python -m lom.database inspect 'E:/arkive-games/data-lom/lom.sqlite'
```

`build` refuses to overwrite an existing database. Pass `--replace` only when
an intentional, reproducible rebuild is required. Rebuilds are atomic: the old
database remains intact if validation or import fails.

## Normalized interchange format

The top-level keys are `metadata`, `texts`, `effects`, `affixes`, and `entries`.
IDs remain strings so 64-bit game identifiers are never rounded by a JSON
consumer. Optional or newly discovered source columns remain in each row's
`raw_json`.

```json
{
  "metadata": {"clientVersion": "1844870"},
  "texts": [
    {
      "id": "TXT_ITEM_1",
      "locale": "zh-CN",
      "text": "...",
      "sourceTable": "StringDB_CN_Data_itemnormal"
    }
  ],
  "effects": [
    {
      "id": "BUFF_1",
      "kind": "buff",
      "descriptionTextId": "TXT_EFFECT_1",
      "parameters": {"value": 10}
    }
  ],
  "affixes": [
    {
      "id": "AFFIX_1",
      "system": "equipment",
      "nameTextId": "TXT_AFFIX_1",
      "minValue": 5,
      "maxValue": 10,
      "unit": "percent",
      "effectIds": ["BUFF_1"]
    }
  ],
  "entries": [
    {
      "id": "ITEM_1",
      "kind": "equipment",
      "nameTextId": "TXT_ITEM_1",
      "quality": "rare",
      "slot": "weapon",
      "affixes": [{"id": "AFFIX_1", "pool": "weapon", "weight": 100}]
    }
  ]
}
```

Use `equipment_search_zh_cn` and `sealed_search_zh_cn` for flattened Chinese
queries while retaining the normalized tables for exact joins.
