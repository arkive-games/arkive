
## Raw data input (added Phase 0)
The tools transform the raw game export into the `data/` and `resource/` repos.
Copy `.env.example` to `.env` and set `RAW_DATA_PATH` to the export root
(default `G:/NCSoft/Export/Exports/AION2/Content`). Wiring lands in Phase 1.

## PNG → WebP asset conversion
`aion2/tools/assets/convert_webp.py` recursively converts every `*.png` under a
source root to `*.webp` under a destination root, mirroring the tree. It is
idempotent (skips up-to-date `.webp`) — re-run freely; pass `--force` to redo all.

```bash
# Marker icons (Resource/Texture/Icon -> resource/UI/.../Icon)
uv run python -m aion2.tools.assets.convert_webp \
    "G:/NCSoft/Export/Exports/AION2/Content/UI/Resource/Texture/Icon" \
    "G:/NCSoft/aion2-map/resource/UI/Resource/Texture/Icon"

# A single world map's tiles
uv run python -m aion2.tools.assets.convert_webp \
    "G:/NCSoft/Export/Exports/AION2/Content/UI/Map/WorldMap/World_L_A" \
    "G:/NCSoft/aion2-map/resource/UI/Map/WorldMap/World_L_A"

# Whole UI tree (large)
uv run python -m aion2.tools.assets.convert_webp \
    "G:/NCSoft/Export/Exports/AION2/Content/UI" \
    "G:/NCSoft/aion2-map/resource/UI"
```

Options: `-q/--quality` (default 90), `--lossless`, `-f/--force`.
