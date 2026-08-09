"""Extract V Blood reward links from V Rising's serialized ECS game data.

The relationship is recovered in two independently validated steps:

* V Blood prefab -> ``VBloodUnlockTechBuffer`` entries in the gameplay data.
* Tech prefab -> recipe, blueprint, passive, and shapeshift buffers in the
  everything-else game data.

Every integer reference must resolve through the pinned prefab catalogs. The
extractor also compares the duplicated client/server gameplay datasets and
fails if they disagree, so a layout false-positive cannot silently ship.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import struct
from typing import Callable, Iterable

from ..common import write_json
from ..markers.bosses import SERVER_ENTITY_SCENES_RELATIVE, load_vblood_metadata
from ..markers.dots import BufferPatch, Chunk, DotsFile, DotsFormatError
from ..markers.extract import load_prefab_names


PREFAB_GUID_HASH = 0xB181319788200AE1
VBLOOD_UNIT_HASH = 0x02843730DC4B2791
VBLOOD_UNLOCK_TECH_BUFFER_HASH = 0x47BB0ADF70501660
TECH_UNLOCK_RECIPE_BUFFER_HASH = 0x80E4295F67FF934C
TECH_UNLOCK_BLUEPRINT_BUFFER_HASH = 0x7143C71C67DF7B4D
UNLOCKED_PASSIVES_BUFFER_HASH = 0x27F3470AB5F4B859
PROGRESSION_BOOK_SHAPESHIFT_HASH = 0x874EF1B80DFDFA55

GAMEPLAY_SCENE_GUIDS = (
    "0eb9943ba313ad04782f5bf7ae01c25b",
    "295c92b7a799a3443b40e9ef192b5727",
)
TECH_SCENE_GUID = "b5aa7965775af294bb6086134f361689"

# VBloodUnlockTechBuffer has no inline storage. The tech reward buffers use
# InternalBufferCapacity(32), giving a 16-byte header plus 32 four-byte GUIDs.
EXTERNAL_ONLY_BUFFER_STRIDE = 16
TECH_BUFFER_CAPACITY = 32
TECH_BUFFER_STRIDE = 16 + TECH_BUFFER_CAPACITY * 4


@dataclass(frozen=True)
class NamedPrefab:
    prefab_id: int
    prefab_name: str

    def as_json(self) -> dict[str, object]:
        return {"prefabId": self.prefab_id, "prefabName": self.prefab_name}


@dataclass(frozen=True)
class TechRewards:
    tech: NamedPrefab
    recipes: tuple[NamedPrefab, ...]
    blueprints: tuple[NamedPrefab, ...]
    passives: tuple[NamedPrefab, ...]
    shapeshifts: tuple[NamedPrefab, ...]

    def as_json(self) -> dict[str, object]:
        return {
            **self.tech.as_json(),
            "recipes": [value.as_json() for value in self.recipes],
            "blueprints": [value.as_json() for value in self.blueprints],
            "passives": [value.as_json() for value in self.passives],
            "shapeshifts": [value.as_json() for value in self.shapeshifts],
        }


def _load_named_reference(path: Path) -> dict[int, str]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"{path}: prefab reference must be a JSON object")
    result: dict[int, str] = {}
    for name, prefab_id in raw.items():
        if not isinstance(name, str) or not isinstance(prefab_id, int):
            raise ValueError(f"{path}: malformed prefab reference")
        previous = result.setdefault(prefab_id, name)
        if previous != name:
            raise ValueError(
                f"{path}: prefab id {prefab_id} maps to both {previous!r} and {name!r}"
            )
    return result


def _patches_by_offset(
    patches: Iterable[BufferPatch], chunk_index: int
) -> dict[int, BufferPatch]:
    return {
        patch.chunk_buffer_offset: patch
        for patch in patches
        if patch.chunk_index == chunk_index
    }


def _component_sequences(
    scene: DotsFile,
    chunk: Chunk,
    predicate: Callable[[int], bool],
) -> tuple[int, ...]:
    """Find one compact four-byte component array by validated values."""
    raw = scene.data[chunk.file_offset : chunk.file_offset + chunk.size]
    size = chunk.entity_count * 4
    candidates: set[tuple[int, ...]] = set()
    for base in range(64, chunk.size - size + 1, 16):
        values = struct.unpack_from(f"<{chunk.entity_count}i", raw, base)
        if all(predicate(value) for value in values):
            candidates.add(values)
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one validated GUID component in chunk "
            f"{chunk.index}, found {len(candidates)}"
        )
    return next(iter(candidates))


def _buffer_rows_at(
    scene: DotsFile,
    chunk: Chunk,
    base: int,
    internal_capacity: int,
    patches: dict[int, BufferPatch],
) -> tuple[tuple[int, ...], ...] | None:
    raw = scene.data[chunk.file_offset : chunk.file_offset + chunk.size]
    stride = 16 + internal_capacity * 4
    if base < 64 or base + chunk.entity_count * stride > chunk.size:
        return None
    rows: list[tuple[int, ...]] = []
    for entity_index in range(chunk.entity_count):
        header_offset = base + entity_index * stride
        pointer, length, capacity = struct.unpack_from("<Qii", raw, header_offset)
        if pointer != 0 or length < 0 or capacity < length:
            return None
        patch = patches.get(header_offset - 64)
        if internal_capacity == 0:
            if length == 0:
                if patch is not None:
                    return None
                data = memoryview(b"")
            else:
                if (
                    patch is None
                    or patch.element_count != length
                    or patch.capacity != capacity
                    or len(patch.data) < length * 4
                ):
                    return None
                data = patch.data[: length * 4]
        elif capacity == internal_capacity:
            if patch is not None:
                return None
            data = memoryview(raw)[
                header_offset + 16 : header_offset + 16 + length * 4
            ]
        else:
            if (
                capacity <= internal_capacity
                or patch is None
                or patch.element_count != length
                or patch.capacity != capacity
                or len(patch.data) < length * 4
            ):
                return None
            data = patch.data[: length * 4]
        rows.append(
            struct.unpack_from(f"<{length}i", data) if length else tuple()
        )
    return tuple(rows)


def _find_buffer_rows(
    scene: DotsFile,
    chunk: Chunk,
    internal_capacity: int,
    value_predicate: Callable[[int], bool],
    *,
    require_each_entity: bool,
) -> tuple[tuple[int, ...], ...]:
    stride = 16 + internal_capacity * 4
    patches = _patches_by_offset(scene.buffer_patches(), chunk.index)
    candidates: set[tuple[tuple[int, ...], ...]] = set()
    for base in range(64, chunk.size - chunk.entity_count * stride + 1, 16):
        rows = _buffer_rows_at(scene, chunk, base, internal_capacity, patches)
        if rows is None:
            continue
        if require_each_entity and not all(rows):
            continue
        values = [value for row in rows for value in row]
        if values and all(value_predicate(value) for value in values):
            candidates.add(rows)
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one validated dynamic buffer in chunk "
            f"{chunk.index}, found {len(candidates)}"
        )
    return next(iter(candidates))


def _boss_tech_map(
    scene: DotsFile,
    prefab_names: dict[int, tuple[str, ...]],
    tech_names: dict[int, str],
) -> dict[int, tuple[int, ...]]:
    required = {
        PREFAB_GUID_HASH,
        VBLOOD_UNIT_HASH,
        VBLOOD_UNLOCK_TECH_BUFFER_HASH,
    }
    result: dict[int, tuple[int, ...]] = {}
    for archetype_index, archetype in enumerate(scene.archetypes):
        if not required <= archetype.signature:
            continue
        for chunk in (
            value
            for value in scene.chunks
            if value.archetype_index == archetype_index
        ):
            bosses = _component_sequences(
                scene,
                chunk,
                lambda value: value in prefab_names
                and len(prefab_names[value]) == 1
                and prefab_names[value][0].startswith("CHAR_"),
            )
            tech_rows = _find_buffer_rows(
                scene,
                chunk,
                0,
                tech_names.__contains__,
                require_each_entity=True,
            )
            for boss_id, tech_ids in zip(bosses, tech_rows, strict=True):
                previous = result.setdefault(boss_id, tech_ids)
                if previous != tech_ids:
                    raise DotsFormatError(
                        f"{scene.path}: boss prefab {boss_id} has conflicting tech buffers"
                    )
    if not result:
        raise DotsFormatError(f"{scene.path}: no V Blood tech relationships found")
    return result


def _find_shared_buffer_base(
    scene: DotsFile,
    chunks: tuple[Chunk, ...],
    value_predicate: Callable[[int], bool],
) -> int:
    patches = scene.buffer_patches()
    max_entities = max(chunk.entity_count for chunk in chunks)
    candidates: list[int] = []
    for base in range(
        64,
        scene.chunk_size - max_entities * TECH_BUFFER_STRIDE + 1,
        16,
    ):
        total_values = 0
        valid = True
        for chunk in chunks:
            rows = _buffer_rows_at(
                scene,
                chunk,
                base,
                TECH_BUFFER_CAPACITY,
                _patches_by_offset(patches, chunk.index),
            )
            if rows is None:
                valid = False
                break
            values = [value for row in rows for value in row]
            if not all(value_predicate(value) for value in values):
                valid = False
                break
            total_values += len(values)
        if valid and total_values:
            candidates.append(base)
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one shared tech-buffer layout, found "
            f"{len(candidates)} at {candidates}"
        )
    return candidates[0]


def _read_shared_buffer(
    scene: DotsFile,
    chunks: tuple[Chunk, ...],
    base: int,
) -> dict[int, tuple[int, ...]]:
    patches = scene.buffer_patches()
    result: dict[int, tuple[int, ...]] = {}
    entity_offset = 0
    for chunk in chunks:
        rows = _buffer_rows_at(
            scene,
            chunk,
            base,
            TECH_BUFFER_CAPACITY,
            _patches_by_offset(patches, chunk.index),
        )
        if rows is None:
            raise DotsFormatError(
                f"{scene.path}: tech buffer at {base} failed in chunk {chunk.index}"
            )
        for row in rows:
            result[entity_offset] = row
            entity_offset += 1
    return result


def _tech_reward_map(
    scene: DotsFile,
    prefab_names: dict[int, tuple[str, ...]],
    tech_names: dict[int, str],
    recipe_names: dict[int, str],
) -> dict[int, TechRewards]:
    required = {
        PREFAB_GUID_HASH,
        TECH_UNLOCK_RECIPE_BUFFER_HASH,
        TECH_UNLOCK_BLUEPRINT_BUFFER_HASH,
        UNLOCKED_PASSIVES_BUFFER_HASH,
        PROGRESSION_BOOK_SHAPESHIFT_HASH,
    }
    archetype_indices = [
        index
        for index, archetype in enumerate(scene.archetypes)
        if required <= archetype.signature
    ]
    if len(archetype_indices) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one complete tech archetype, found "
            f"{len(archetype_indices)}"
        )
    chunks = tuple(
        chunk
        for chunk in scene.chunks
        if chunk.archetype_index == archetype_indices[0]
    )
    if not chunks:
        raise DotsFormatError(f"{scene.path}: complete tech archetype has no chunks")

    recipe_base = _find_shared_buffer_base(scene, chunks, recipe_names.__contains__)
    blueprint_base = _find_shared_buffer_base(
        scene,
        chunks,
        lambda value: value in prefab_names
        and len(prefab_names[value]) == 1
        and prefab_names[value][0].startswith(("BP_", "TM_")),
    )
    passive_base = _find_shared_buffer_base(
        scene,
        chunks,
        lambda value: value in prefab_names
        and len(prefab_names[value]) == 1
        and prefab_names[value][0].startswith("SpellPassive_"),
    )
    shapeshift_base = _find_shared_buffer_base(
        scene,
        chunks,
        lambda value: value in prefab_names
        and len(prefab_names[value]) == 1
        and prefab_names[value][0].startswith("AB_Shapeshift_"),
    )

    recipes = _read_shared_buffer(scene, chunks, recipe_base)
    blueprints = _read_shared_buffer(scene, chunks, blueprint_base)
    passives = _read_shared_buffer(scene, chunks, passive_base)
    shapeshifts = _read_shared_buffer(scene, chunks, shapeshift_base)

    result: dict[int, TechRewards] = {}
    entity_offset = 0
    for chunk in chunks:
        tech_ids = _component_sequences(scene, chunk, tech_names.__contains__)
        for tech_id in tech_ids:
            def named(values: tuple[int, ...], names: dict[int, str]) -> tuple[NamedPrefab, ...]:
                return tuple(NamedPrefab(value, names[value]) for value in values)

            rewards = TechRewards(
                tech=NamedPrefab(tech_id, tech_names[tech_id]),
                recipes=named(recipes[entity_offset], recipe_names),
                blueprints=named(
                    blueprints[entity_offset],
                    {key: value[0] for key, value in prefab_names.items() if len(value) == 1},
                ),
                passives=named(
                    passives[entity_offset],
                    {key: value[0] for key, value in prefab_names.items() if len(value) == 1},
                ),
                shapeshifts=named(
                    shapeshifts[entity_offset],
                    {key: value[0] for key, value in prefab_names.items() if len(value) == 1},
                ),
            )
            if tech_id in result:
                raise DotsFormatError(f"{scene.path}: duplicate tech prefab {tech_id}")
            result[tech_id] = rewards
            entity_offset += 1
    if set(result) != set(tech_names):
        missing = sorted(set(tech_names) - set(result))
        extra = sorted(set(result) - set(tech_names))
        raise DotsFormatError(
            f"{scene.path}: tech catalog mismatch; missing={missing}, extra={extra}"
        )
    return result


def _deduplicate(values: Iterable[NamedPrefab]) -> list[NamedPrefab]:
    result: list[NamedPrefab] = []
    seen: set[int] = set()
    for value in values:
        if value.prefab_id not in seen:
            seen.add(value.prefab_id)
            result.append(value)
    return result


def build_vblood_reward_payload(
    game_root: Path,
    prefab_reference: Path,
    vblood_reference: Path,
    tech_reference: Path,
    recipe_reference: Path,
) -> dict[str, object]:
    game_root = Path(game_root)
    entity_scenes = game_root / SERVER_ENTITY_SCENES_RELATIVE
    if not entity_scenes.is_dir():
        raise FileNotFoundError(
            f"V Rising bundled-server EntityScenes directory is missing: {entity_scenes}"
        )

    prefab_names = load_prefab_names(prefab_reference)
    tech_names = _load_named_reference(tech_reference)
    recipe_names = _load_named_reference(recipe_reference)
    vblood_metadata = load_vblood_metadata(vblood_reference)

    boss_maps: list[dict[int, tuple[int, ...]]] = []
    for scene_guid in GAMEPLAY_SCENE_GUIDS:
        scene_path = entity_scenes / f"{scene_guid}.0.entities"
        if not scene_path.is_file():
            raise FileNotFoundError(f"V Rising gameplay scene is missing: {scene_path}")
        boss_maps.append(
            _boss_tech_map(DotsFile(scene_path), prefab_names, tech_names)
        )
    if boss_maps[0] != boss_maps[1]:
        raise DotsFormatError(
            "V Rising client/server gameplay scenes disagree on V Blood tech rewards"
        )
    boss_tech = boss_maps[0]

    tech_scene_path = entity_scenes / f"{TECH_SCENE_GUID}.0.entities"
    if not tech_scene_path.is_file():
        raise FileNotFoundError(f"V Rising tech scene is missing: {tech_scene_path}")
    tech_rewards = _tech_reward_map(
        DotsFile(tech_scene_path), prefab_names, tech_names, recipe_names
    )

    records: list[dict[str, object]] = []
    for prefab_name, metadata in vblood_metadata.items():
        if metadata["category"] != "VBlood":
            continue
        matching_ids = [
            prefab_id
            for prefab_id, names in prefab_names.items()
            if prefab_name in names
        ]
        if len(matching_ids) != 1:
            raise DotsFormatError(
                f"expected one prefab id for V Blood {prefab_name}, found {matching_ids}"
            )
        boss_id = matching_ids[0]
        tech_ids = boss_tech.get(boss_id)
        if tech_ids is None:
            raise DotsFormatError(
                f"V Blood {prefab_name} ({boss_id}) has no verified tech buffer"
            )
        linked_tech = [tech_rewards[tech_id] for tech_id in tech_ids]
        recipes = _deduplicate(
            value for tech in linked_tech for value in tech.recipes
        )
        blueprints = _deduplicate(
            value for tech in linked_tech for value in tech.blueprints
        )
        passives = _deduplicate(
            value for tech in linked_tech for value in tech.passives
        )
        shapeshifts = _deduplicate(
            value for tech in linked_tech for value in tech.shapeshifts
        )
        records.append(
            {
                "bossPrefabId": boss_id,
                "bossPrefab": prefab_name,
                **metadata,
                "tech": [value.as_json() for value in linked_tech],
                "recipes": [value.as_json() for value in recipes],
                "blueprints": [value.as_json() for value in blueprints],
                "abilities": [
                    {**value.as_json(), "kind": "passive"} for value in passives
                ]
                + [
                    {**value.as_json(), "kind": "shapeshift"}
                    for value in shapeshifts
                ],
            }
        )

    records.sort(
        key=lambda value: (
            value["level"] if value["level"] is not None else 10_000,
            value["bossPrefab"],
        )
    )
    return {
        "schemaVersion": 1,
        "bosses": records,
        "source": {
            "gameplayScenes": [f"{value}.0.entities" for value in GAMEPLAY_SCENE_GUIDS],
            "techScene": f"{TECH_SCENE_GUID}.0.entities",
            "componentHashes": {
                "prefabGuid": f"0x{PREFAB_GUID_HASH:016X}",
                "vbloodUnit": f"0x{VBLOOD_UNIT_HASH:016X}",
                "vbloodUnlockTechBuffer": f"0x{VBLOOD_UNLOCK_TECH_BUFFER_HASH:016X}",
                "techUnlockRecipeBuffer": f"0x{TECH_UNLOCK_RECIPE_BUFFER_HASH:016X}",
                "techUnlockBlueprintBuffer": f"0x{TECH_UNLOCK_BLUEPRINT_BUFFER_HASH:016X}",
                "unlockedPassivesBuffer": f"0x{UNLOCKED_PASSIVES_BUFFER_HASH:016X}",
                "progressionBookShapeshift": f"0x{PROGRESSION_BOOK_SHAPESHIFT_HASH:016X}",
            },
        },
        "summary": {
            "bosses": len(records),
            "bossTechLinks": sum(len(value["tech"]) for value in records),
            "recipeLinks": sum(len(value["recipes"]) for value in records),
            "blueprintLinks": sum(len(value["blueprints"]) for value in records),
            "abilityLinks": sum(len(value["abilities"]) for value in records),
            "techCatalogEntries": len(tech_rewards),
        },
    }


def extract_vblood_rewards(
    game_root: Path,
    prefab_reference: Path,
    vblood_reference: Path,
    tech_reference: Path,
    recipe_reference: Path,
    output_path: Path,
) -> dict[str, object]:
    payload = build_vblood_reward_payload(
        game_root,
        prefab_reference,
        vblood_reference,
        tech_reference,
        recipe_reference,
    )
    write_json(output_path, payload)
    return payload


def load_vblood_reward_payload(path: Path) -> dict[str, object]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if (
        not isinstance(payload, dict)
        or payload.get("schemaVersion") != 1
        or not isinstance(payload.get("bosses"), list)
        or not isinstance(payload.get("summary"), dict)
    ):
        raise ValueError(f"{path}: invalid V Blood reward payload")
    return payload


__all__ = [
    "GAMEPLAY_SCENE_GUIDS",
    "TECH_SCENE_GUID",
    "build_vblood_reward_payload",
    "extract_vblood_rewards",
    "load_vblood_reward_payload",
]

