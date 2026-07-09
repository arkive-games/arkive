"""Palworld map data pipeline (Python port of the original JS extractor).

Stages (run via ``python -m palworld.maps <stage>``):

- ``extract``   — parse the raw UE export into ``parsed/parsed.json``.
- ``calibrate`` — render world→pixel orientation previews (dev aid).
- ``emit``      — build the contract-v1 dataset into ``data-palworld``.
- ``tiles``     — convert map tiles + marker icons to WebP into ``resource-palworld``.

The raw export / output dirs come from required env vars
(``PALWORLD_RAW`` / ``PALWORLD_DATA_OUT`` / ``PALWORLD_RES_OUT``), loaded from
``tools/.env``; see ``palworld.env``.
"""
