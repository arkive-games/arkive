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
import math
from pathlib import Path
import re
import struct
from typing import Callable, Iterable

from ..common import write_json
from ..markers.bosses import SERVER_ENTITY_SCENES_RELATIVE, load_vblood_metadata
from ..markers.dots import BufferPatch, Chunk, DotsFile, DotsFormatError
from ..markers.extract import load_prefab_names
from ..markers.localization import LOCALIZATION_RELATIVE, load_localized_guid_texts


PREFAB_GUID_HASH = 0xB181319788200AE1
VBLOOD_UNIT_HASH = 0x02843730DC4B2791
VBLOOD_UNLOCK_TECH_BUFFER_HASH = 0x47BB0ADF70501660
TECH_UNLOCK_RECIPE_BUFFER_HASH = 0x80E4295F67FF934C
TECH_UNLOCK_BLUEPRINT_BUFFER_HASH = 0x7143C71C67DF7B4D
UNLOCKED_PASSIVES_BUFFER_HASH = 0x27F3470AB5F4B859
PROGRESSION_BOOK_SHAPESHIFT_HASH = 0x874EF1B80DFDFA55
PASSIVE_HASH = 0xE1C62E78E07BCDB1
MODIFY_UNIT_STAT_BUFF_HASH = 0x8FF07C457FF3930D

GAMEPLAY_SCENE_GUIDS = (
    "0eb9943ba313ad04782f5bf7ae01c25b",
    "295c92b7a799a3443b40e9ef192b5727",
)
TECH_SCENE_GUID = "b5aa7965775af294bb6086134f361689"
PASSIVE_SCENE_GUID = "b2f35358da120c04c92b9256f40d76ce"

# VBloodUnlockTechBuffer has no inline storage. The tech reward buffers use
# InternalBufferCapacity(32), giving a 16-byte header plus 32 four-byte GUIDs.
EXTERNAL_ONLY_BUFFER_STRIDE = 16
TECH_BUFFER_CAPACITY = 32
TECH_BUFFER_STRIDE = 16 + TECH_BUFFER_CAPACITY * 4
PASSIVE_STAT_CAPACITY = 3
PASSIVE_STAT_ELEMENT_SIZE = 36
PASSIVE_STAT_BUFFER_STRIDE = 16 + PASSIVE_STAT_CAPACITY * PASSIVE_STAT_ELEMENT_SIZE

PASSIVE_IDENTITY_PATTERN = re.compile(
    r"^SpellPassive_(?P<school>Blood|Chaos|Frost|Illusion|Storm|Unholy)_T0(?P<tier>[1-4])_"
)

# The exact name/description GUID pairs baked into SpellSchoolPassiveData for
# the current 24 progression passives. Two Blood prefabs retain legacy internal
# names, so the GUID relationship is pinned explicitly rather than inferred
# from similar-looking localized text.
PASSIVE_LOCALIZATION_GUIDS = {
    "SpellPassive_Blood_T01_BloodSpray": ("3d88a2d2-2d68-4493-b8d2-a1c35938b303", "8f2834f7-6abc-40d0-93f2-80c98bd35ee4"),
    "SpellPassive_Blood_T02_BloodTypeEfficiency": ("27b27ac4-c2b1-41b7-a0c6-74541b51ae60", "811e4045-32b8-4d80-bb5d-20792ad73a47"),
    "SpellPassive_Blood_T03_VBloodSlayer": ("8498441f-be9f-4970-80d3-039cd47ede7e", "af1cb53b-d854-4e68-9a4f-0c23642db024"),
    "SpellPassive_Blood_T04_Rampage": ("752549aa-06f5-4836-aab3-62f6e3b59a5f", "28c7d018-5378-43a4-b812-11e9467d9213"),
    "SpellPassive_Chaos_T01_ChaosKindling": ("2ba9299d-73d0-4385-bc8b-93ba8f413a9b", "d460d7a4-2ec4-4f9e-b1ed-99a1a5d92c79"),
    "SpellPassive_Chaos_T02_RenewingFlames": ("b3b95a9e-b249-4eca-b1c0-8afd1ebc8808", "23933df0-6ff1-40d9-870f-13d91854ea53"),
    "SpellPassive_Chaos_T03_Overpower": ("bee20477-d83f-4209-bfe5-75fc9ff192ab", "2f99e409-221c-4695-8ee3-6840d09bf32d"),
    "SpellPassive_Chaos_T04_RavenousStrikes": ("f1937a08-3e92-47c5-821e-47844d6b9a27", "06d890b5-b8cd-4011-8d1b-efe911e83ed1"),
    "SpellPassive_Frost_T01_ColdSoul": ("f10a7639-9181-4ac5-bf4e-f364d7c6861f", "efe17b21-c1c4-4bf4-aaa5-0ea995692498"),
    "SpellPassive_Frost_T02_ChillWeave": ("2be08eb9-734a-4e51-8e44-deb49acc4b23", "767fd224-ef94-428b-a0e9-76f040d1fac0"),
    "SpellPassive_Frost_T03_Bastion": ("72cdfecc-9f3e-4688-a545-72a711cc64e0", "a441f38f-76e6-47ec-92be-1a8fe5d98a41"),
    "SpellPassive_Frost_T04_DarkEnchantment": ("bf52fe43-9ad4-4d3d-95ca-82a1373d323a", "5aafea33-24d1-4811-bdcc-67b2d0844365"),
    "SpellPassive_Illusion_T01_SpiritualInfusion": ("a318f705-b651-4f05-93b4-ff354b0948ba", "15cfb26c-ca7f-4c84-90d5-e4340d316793"),
    "SpellPassive_Illusion_T02_FlowingSorcery": ("bbc94234-a490-43e3-a68d-4fda323ea415", "6b92cb22-5d2a-4aa4-a37f-242906ed5268"),
    "SpellPassive_Illusion_T03_FeralHaste": ("f235ea4c-d65d-434e-960d-ed833bbdb922", "970d8ef5-4246-4045-af55-91ee36ada62b"),
    "SpellPassive_Illusion_T04_WickedPower": ("b7a0e7e7-25ac-48fb-b51e-c2a820e93ed1", "e3d747cb-d92d-4730-8d67-b304c518cbe3"),
    "SpellPassive_Storm_T01_LightningFastStrikes": ("7bf886fd-d8e3-4fc8-9b3d-b08d07ec5d5e", "286fe114-59a4-46c7-8ea5-86312165851d"),
    "SpellPassive_Storm_T02_EnhancedConductivity": ("8f9e91f1-4915-4ffa-a558-5cdbd819dc8c", "b6784423-9d1c-4abe-8127-6101b7bf1d92"),
    "SpellPassive_Storm_T03_HungerForPower": ("858b0ef0-ca9d-4dc0-a22d-04c7c4032e82", "3fb995a5-e946-4ee4-93fa-310b88e0ed7d"),
    "SpellPassive_Storm_T04_TurbulentVelocity": ("019d86b9-d17f-468e-9231-1ce8f8a99907", "9f8568cf-65b0-4142-aeab-b13f3546d6d9"),
    "SpellPassive_Unholy_T01_ArcaneAnimator": ("739cd0e7-7805-4db7-bfc6-630ae9f58771", "ac75c0e3-a09e-4165-a96d-faef40135768"),
    "SpellPassive_Unholy_T02_SoulDrinker": ("d67e26d1-37f4-46c9-add2-e4790529b8e5", "0bcb0fd2-403e-4b7d-add5-544651d6173b"),
    "SpellPassive_Unholy_T03_LethalStrikes": ("775d7528-9a98-4dfd-b12d-5a2fa0c85bfe", "5bafa977-4afd-454e-9adc-38faa53eed62"),
    "SpellPassive_Unholy_T04_EmbraceMayhem": ("88639c52-ccec-4af0-aeda-e82018cfa5e5", "59b6c7e3-ab01-4fe0-9f18-e0cbc50b4ac3"),
}

UNIT_STAT_TYPES = {
    27: "PhysicalLifeLeech",
    28: "SpellLifeLeech",
    29: "PhysicalCriticalStrikeChance",
    30: "PhysicalCriticalStrikeDamage",
    31: "SpellCriticalStrikeChance",
    32: "SpellCriticalStrikeDamage",
    56: "DamageVsVBloods",
    59: "PrimaryAttackSpeed",
    61: "PrimaryLifeLeech",
    68: "BonusSpellPower",
    70: "SpellCooldownRecoveryRate",
    71: "WeaponCooldownRecoveryRate",
    72: "UltimateCooldownRecoveryRate",
    73: "MinionDamage",
    74: "DamageReduction",
    75: "HealingReceived",
    76: "IncreasedShieldEfficiency",
    77: "BloodEfficiency",
    82: "BonusMaxHealth",
    83: "BonusMovementSpeed",
    84: "BonusShapeshiftMovementSpeed",
    86: "UltimateEfficiency",
    89: "WeaponFreeCast",
    90: "WeaponSkillPower",
}

MODIFICATION_TYPES = {
    0: "Set",
    1: "SetMin",
    2: "SetMax",
    3: "Add",
    4: "Multiply",
    5: "MultiplyBaseAdd",
    6: "AddToBase",
    7: "BitwiseOR",
    8: "BitwiseNOT",
}


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


@dataclass(frozen=True)
class PassiveStatModification:
    stat_type: str
    modification_type: str
    value: float
    soft_cap_value: float
    modifier: float

    def as_json(self) -> dict[str, object]:
        return {
            "statType": self.stat_type,
            "modificationType": self.modification_type,
            "value": self.value,
            "softCapValue": self.soft_cap_value,
            "modifier": self.modifier,
        }


@dataclass(frozen=True)
class PassiveDetails:
    passive: NamedPrefab
    school: str
    tier: int
    name: dict[str, str]
    description: dict[str, str]
    stat_modifications: tuple[PassiveStatModification, ...]

    def as_json(self) -> dict[str, object]:
        return {
            **self.passive.as_json(),
            "school": self.school,
            "tier": self.tier,
            "name": self.name,
            "description": self.description,
            "statModifications": [value.as_json() for value in self.stat_modifications],
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


def _parse_passive_identity(prefab_name: str) -> tuple[str, int]:
    match = PASSIVE_IDENTITY_PATTERN.match(prefab_name)
    if match is None:
        raise DotsFormatError(f"unsupported passive prefab name: {prefab_name}")
    return match.group("school"), int(match.group("tier"))


def _parse_passive_stat_element(
    raw: bytes,
    offset: int,
) -> PassiveStatModification | None:
    attribute_cap_type, stat_type, modification_type = struct.unpack_from(
        "<iBB", raw, offset
    )
    value, soft_cap_value, modifier = struct.unpack_from("<fff", raw, offset + 8)
    increase_by_stacks = raw[offset + 20]
    value_by_stacks = struct.unpack_from("<f", raw, offset + 24)[0]
    priority, modification_id = struct.unpack_from("<ii", raw, offset + 28)
    if (
        attribute_cap_type not in (-1, 0, 1)
        or stat_type not in UNIT_STAT_TYPES
        or modification_type not in MODIFICATION_TYPES
        or increase_by_stacks not in (0, 1)
        or not all(
            math.isfinite(number) and abs(number) < 1_000_000
            for number in (value, soft_cap_value, modifier, value_by_stacks)
        )
        or abs(priority) > 1_000_000
        or abs(modification_id) > 1_000_000_000
    ):
        return None
    return PassiveStatModification(
        stat_type=UNIT_STAT_TYPES[stat_type],
        modification_type=MODIFICATION_TYPES[modification_type],
        value=value,
        soft_cap_value=soft_cap_value,
        modifier=modifier,
    )


def _find_passive_stat_rows(
    scene: DotsFile,
    chunk: Chunk,
) -> tuple[tuple[PassiveStatModification, ...], ...]:
    raw = scene.data[chunk.file_offset : chunk.file_offset + chunk.size]
    size = chunk.entity_count * PASSIVE_STAT_BUFFER_STRIDE
    candidates: set[tuple[tuple[PassiveStatModification, ...], ...]] = set()
    for base in range(64, chunk.size - size + 1, 4):
        rows: list[tuple[PassiveStatModification, ...]] = []
        valid = True
        total_values = 0
        for entity_index in range(chunk.entity_count):
            header_offset = base + entity_index * PASSIVE_STAT_BUFFER_STRIDE
            pointer, length, capacity = struct.unpack_from("<Qii", raw, header_offset)
            if (
                pointer != 0
                or length < 0
                or length > PASSIVE_STAT_CAPACITY
                or capacity != PASSIVE_STAT_CAPACITY
            ):
                valid = False
                break
            values: list[PassiveStatModification] = []
            for value_index in range(length):
                value = _parse_passive_stat_element(
                    raw,
                    header_offset + 16 + value_index * PASSIVE_STAT_ELEMENT_SIZE,
                )
                if value is None:
                    valid = False
                    break
                values.append(value)
            if not valid:
                break
            total_values += len(values)
            rows.append(tuple(values))
        if valid and total_values:
            candidates.add(tuple(rows))
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one passive stat buffer in chunk "
            f"{chunk.index}, found {len(candidates)}"
        )
    return next(iter(candidates))


def _passive_details(
    scene: DotsFile,
    prefab_names: dict[int, tuple[str, ...]],
    catalog_passives: Iterable[NamedPrefab],
    localization_dir: Path,
) -> list[PassiveDetails]:
    passive_by_id = {value.prefab_id: value for value in catalog_passives}
    expected_names = {value.prefab_name for value in passive_by_id.values()}
    if expected_names != set(PASSIVE_LOCALIZATION_GUIDS):
        missing = sorted(expected_names - set(PASSIVE_LOCALIZATION_GUIDS))
        stale = sorted(set(PASSIVE_LOCALIZATION_GUIDS) - expected_names)
        raise DotsFormatError(
            f"passive localization mapping mismatch; missing={missing}, stale={stale}"
        )
    localized = load_localized_guid_texts(
        localization_dir,
        (
            guid
            for pair in PASSIVE_LOCALIZATION_GUIDS.values()
            for guid in pair
        ),
    )
    details: dict[int, PassiveDetails] = {}
    required = {PREFAB_GUID_HASH, PASSIVE_HASH}
    for archetype_index, archetype in enumerate(scene.archetypes):
        if not required <= archetype.signature:
            continue
        for chunk in (
            value
            for value in scene.chunks
            if value.archetype_index == archetype_index
        ):
            try:
                prefab_ids = _component_sequences(
                    scene, chunk, passive_by_id.__contains__
                )
            except DotsFormatError:
                continue
            stat_rows = (
                _find_passive_stat_rows(scene, chunk)
                if MODIFY_UNIT_STAT_BUFF_HASH in archetype.signature
                else tuple(() for _ in range(chunk.entity_count))
            )
            for prefab_id, stat_modifications in zip(
                prefab_ids, stat_rows, strict=True
            ):
                passive = passive_by_id.get(prefab_id)
                if passive is None:
                    continue
                if prefab_id in details:
                    raise DotsFormatError(
                        f"{scene.path}: duplicate passive prefab {prefab_id}"
                    )
                school, tier = _parse_passive_identity(passive.prefab_name)
                name_guid, description_guid = PASSIVE_LOCALIZATION_GUIDS[
                    passive.prefab_name
                ]
                details[prefab_id] = PassiveDetails(
                    passive=passive,
                    school=school,
                    tier=tier,
                    name=localized[name_guid],
                    description=localized[description_guid],
                    stat_modifications=stat_modifications,
                )
    if set(details) != set(passive_by_id):
        missing = sorted(set(passive_by_id) - set(details))
        extra = sorted(set(details) - set(passive_by_id))
        raise DotsFormatError(
            f"{scene.path}: passive catalog mismatch; missing={missing}, extra={extra}"
        )
    return sorted(details.values(), key=lambda value: value.passive.prefab_name)


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
    catalog_tech = sorted(
        tech_rewards.values(), key=lambda value: value.tech.prefab_name
    )
    catalog_recipes = sorted(
        _deduplicate(value for tech in catalog_tech for value in tech.recipes),
        key=lambda value: value.prefab_name,
    )
    catalog_blueprints = sorted(
        _deduplicate(value for tech in catalog_tech for value in tech.blueprints),
        key=lambda value: value.prefab_name,
    )
    catalog_passives = sorted(
        _deduplicate(value for tech in catalog_tech for value in tech.passives),
        key=lambda value: value.prefab_name,
    )
    passive_scene_path = entity_scenes / f"{PASSIVE_SCENE_GUID}.0.entities"
    if not passive_scene_path.is_file():
        raise FileNotFoundError(
            f"V Rising passive scene is missing: {passive_scene_path}"
        )
    passive_details = _passive_details(
        DotsFile(passive_scene_path),
        prefab_names,
        catalog_passives,
        game_root / LOCALIZATION_RELATIVE,
    )
    catalog_shapeshifts = sorted(
        _deduplicate(value for tech in catalog_tech for value in tech.shapeshifts),
        key=lambda value: value.prefab_name,
    )
    return {
        "schemaVersion": 2,
        "bosses": records,
        "catalog": {
            "tech": [value.as_json() for value in catalog_tech],
            "recipes": [value.as_json() for value in catalog_recipes],
            "blueprints": [value.as_json() for value in catalog_blueprints],
            "passives": [value.as_json() for value in passive_details],
            "shapeshifts": [value.as_json() for value in catalog_shapeshifts],
        },
        "source": {
            "gameplayScenes": [f"{value}.0.entities" for value in GAMEPLAY_SCENE_GUIDS],
            "techScene": f"{TECH_SCENE_GUID}.0.entities",
            "passiveScene": f"{PASSIVE_SCENE_GUID}.0.entities",
            "componentHashes": {
                "prefabGuid": f"0x{PREFAB_GUID_HASH:016X}",
                "vbloodUnit": f"0x{VBLOOD_UNIT_HASH:016X}",
                "vbloodUnlockTechBuffer": f"0x{VBLOOD_UNLOCK_TECH_BUFFER_HASH:016X}",
                "techUnlockRecipeBuffer": f"0x{TECH_UNLOCK_RECIPE_BUFFER_HASH:016X}",
                "techUnlockBlueprintBuffer": f"0x{TECH_UNLOCK_BLUEPRINT_BUFFER_HASH:016X}",
                "unlockedPassivesBuffer": f"0x{UNLOCKED_PASSIVES_BUFFER_HASH:016X}",
                "progressionBookShapeshift": f"0x{PROGRESSION_BOOK_SHAPESHIFT_HASH:016X}",
                "passive": f"0x{PASSIVE_HASH:016X}",
                "modifyUnitStatBuff": f"0x{MODIFY_UNIT_STAT_BUFF_HASH:016X}",
            },
        },
        "summary": {
            "bosses": len(records),
            "bossTechLinks": sum(len(value["tech"]) for value in records),
            "recipeLinks": sum(len(value["recipes"]) for value in records),
            "blueprintLinks": sum(len(value["blueprints"]) for value in records),
            "abilityLinks": sum(len(value["abilities"]) for value in records),
            "techCatalogEntries": len(tech_rewards),
            "recipeCatalogEntries": len(catalog_recipes),
            "blueprintCatalogEntries": len(catalog_blueprints),
            "passiveCatalogEntries": len(catalog_passives),
            "passiveStatModificationEntries": sum(
                len(value.stat_modifications) for value in passive_details
            ),
            "shapeshiftCatalogEntries": len(catalog_shapeshifts),
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
        or payload.get("schemaVersion") != 2
        or not isinstance(payload.get("bosses"), list)
        or not isinstance(payload.get("catalog"), dict)
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
