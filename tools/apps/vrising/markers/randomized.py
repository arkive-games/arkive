"""Decode randomized spawn-chain settings from V Rising's game-data scene."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from pathlib import Path
import struct

from .dots import BlobAsset, DotsFile, DotsFormatError


SPAWN_CHAINS_SERVER_NAME = "39b5fe77f1899f646b14df2fe417b9f9.0.entities"

RANDOMIZED_CHAIN_HASH = 0x47E9E00E98D95C24
SERIALIZED_RANDOMIZED_SETTINGS_HASH = 0x28E8E86F84C34668
PREFAB_GUID_HASH = 0xB181319788200AE1

RANDOMIZED_CHAIN_SIGNATURE = frozenset(
    {
        RANDOMIZED_CHAIN_HASH,
        0x5653A0DF1A4F1643,
        0x4A5D9320C3C18012,
        0xB1AC034499F49E3E,
        0xA42DE7CC0763E5BE,
        0x97490261B3C2DE08,
        0x5C5D60F217E41458,
        0xDD171D948CCB47EA,
        PREFAB_GUID_HASH,
        0xF22AA2F3711EBF03,
        0x616A36E3C0CFEF8C,
        0x8650AB421C4AA0B2,
        0x2D6324EC1523C9E0,
        0xA466B7C9C19E31F1,
    }
)
RANDOMIZED_SETTINGS_SIGNATURE = frozenset(
    {
        0x5653A0DF1A4F1643,
        SERIALIZED_RANDOMIZED_SETTINGS_HASH,
        0x4A5D9320C3C18012,
        0xB1AC034499F49E3E,
        0xA42DE7CC0763E5BE,
        0x97490261B3C2DE08,
        0x5C5D60F217E41458,
        PREFAB_GUID_HASH,
        0x616A36E3C0CFEF8C,
        0x8650AB421C4AA0B2,
        0x2D6324EC1523C9E0,
        0xA466B7C9C19E31F1,
    }
)

RANDOMIZED_CHAIN_COMPONENT_OFFSET = 0x440
RANDOMIZED_CHAIN_COMPONENT_STRIDE = 32
RANDOMIZED_CHAIN_PREFAB_OFFSET = 0x5340
RANDOMIZED_CHAIN_CAPACITY = 128

SETTINGS_BLOB_REFERENCE_OFFSET = 0x440
SETTINGS_BLOB_REFERENCE_STRIDE = 8
SETTINGS_PREFAB_OFFSET = 0x4740
SETTINGS_CAPACITY = 128


@dataclass(frozen=True)
class RandomizedSpawnOption:
    prefab_id: int
    prefab_name: str
    weight: float
    probability: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class RandomizedSpawnGroup:
    weight: float
    probability: float
    options: tuple[RandomizedSpawnOption, ...]

    def to_dict(self) -> dict:
        return {
            "weight": self.weight,
            "probability": self.probability,
            "options": [option.to_dict() for option in self.options],
        }


@dataclass(frozen=True)
class RandomizedSpawnDefinition:
    prefab_id: int
    prefab_name: str
    settings_prefab_id: int
    settings_prefab_name: str
    groups: tuple[RandomizedSpawnGroup, ...]

    def to_dict(self) -> dict:
        return {
            "prefabId": self.prefab_id,
            "prefabName": self.prefab_name,
            "settingsPrefabId": self.settings_prefab_id,
            "settingsPrefabName": self.settings_prefab_name,
            "groups": [group.to_dict() for group in self.groups],
        }


def _unique_name(prefab_names: dict[int, tuple[str, ...]], prefab_id: int) -> str:
    names = prefab_names.get(prefab_id)
    if names is None:
        raise DotsFormatError(f"unknown randomized-chain prefab id {prefab_id}")
    if len(names) != 1:
        raise DotsFormatError(
            f"ambiguous randomized-chain prefab id {prefab_id}: {names}"
        )
    return names[0]


def _blob_array(
    data: memoryview, owner_offset: int, stride: int, description: str
) -> tuple[int, int]:
    if owner_offset < 0 or owner_offset + 8 > len(data):
        raise DotsFormatError(f"{description}: truncated BlobArray")
    relative_offset, count = struct.unpack_from("<ii", data, owner_offset)
    start = owner_offset + relative_offset
    if count < 0 or start < 0 or start + count * stride > len(data):
        raise DotsFormatError(f"{description}: invalid BlobArray bounds")
    return start, count


def _parse_settings_blob(
    asset: BlobAsset,
    prefab_names: dict[int, tuple[str, ...]],
    description: str,
) -> tuple[RandomizedSpawnGroup, ...]:
    data = asset.data
    if len(data) < 12:
        raise DotsFormatError(f"{description}: randomized settings blob is truncated")
    groups_offset, group_count = _blob_array(data, 0, 16, description)
    total_group_weight = struct.unpack_from("<f", data, 8)[0]
    if not math.isfinite(total_group_weight) or total_group_weight <= 0:
        raise DotsFormatError(f"{description}: invalid total group weight")

    groups: list[RandomizedSpawnGroup] = []
    measured_group_weight = 0.0
    for group_index in range(group_count):
        group_offset = groups_offset + group_index * 16
        options_offset, option_count = _blob_array(
            data, group_offset, 8, f"{description} group {group_index}"
        )
        group_weight, total_option_weight = struct.unpack_from(
            "<ff", data, group_offset + 8
        )
        if (
            not math.isfinite(group_weight)
            or group_weight <= 0
            or not math.isfinite(total_option_weight)
            or total_option_weight <= 0
            or option_count == 0
        ):
            raise DotsFormatError(f"{description}: invalid randomized group weights")

        options: list[RandomizedSpawnOption] = []
        measured_option_weight = 0.0
        for option_index in range(option_count):
            option_offset = options_offset + option_index * 8
            prefab_id, weight = struct.unpack_from("<if", data, option_offset)
            if not math.isfinite(weight) or weight <= 0:
                raise DotsFormatError(f"{description}: invalid spawn option weight")
            measured_option_weight += weight
            options.append(
                RandomizedSpawnOption(
                    prefab_id=prefab_id,
                    prefab_name=_unique_name(prefab_names, prefab_id),
                    weight=weight,
                    probability=(group_weight / total_group_weight)
                    * (weight / total_option_weight),
                )
            )
        if not math.isclose(measured_option_weight, total_option_weight):
            raise DotsFormatError(f"{description}: option weights do not match total")
        measured_group_weight += group_weight
        groups.append(
            RandomizedSpawnGroup(
                weight=group_weight,
                probability=group_weight / total_group_weight,
                options=tuple(options),
            )
        )
    if not math.isclose(measured_group_weight, total_group_weight):
        raise DotsFormatError(f"{description}: group weights do not match total")
    return tuple(groups)


def load_randomized_spawn_definitions(
    entity_scenes: Path, prefab_names: dict[int, tuple[str, ...]]
) -> dict[int, RandomizedSpawnDefinition]:
    """Resolve placed randomized-chain prefabs to their weighted child prefabs."""
    scene = DotsFile(entity_scenes / SPAWN_CHAINS_SERVER_NAME)
    instance_chunks = scene.chunks_for_signature(RANDOMIZED_CHAIN_SIGNATURE)
    settings_chunks = scene.chunks_for_signature(RANDOMIZED_SETTINGS_SIGNATURE)
    if len(instance_chunks) != 1 or len(settings_chunks) != 1:
        raise DotsFormatError(
            f"{scene.path}: randomized-chain archetypes were not uniquely identified"
        )
    instance_chunk = instance_chunks[0]
    settings_chunk = settings_chunks[0]
    if (
        instance_chunk.entity_count > RANDOMIZED_CHAIN_CAPACITY
        or settings_chunk.entity_count > SETTINGS_CAPACITY
    ):
        raise DotsFormatError(f"{scene.path}: randomized-chain chunk exceeds capacity")

    assets = {asset.payload_offset: asset for asset in scene.blob_assets()}
    settings: dict[int, tuple[str, tuple[RandomizedSpawnGroup, ...]]] = {}
    for index in range(settings_chunk.entity_count):
        prefab_id = struct.unpack_from(
            "<i", scene.data, settings_chunk.file_offset + SETTINGS_PREFAB_OFFSET + index * 4
        )[0]
        prefab_name = _unique_name(prefab_names, prefab_id)
        blob_offset = struct.unpack_from(
            "<q",
            scene.data,
            settings_chunk.file_offset
            + SETTINGS_BLOB_REFERENCE_OFFSET
            + index * SETTINGS_BLOB_REFERENCE_STRIDE,
        )[0]
        asset = assets.get(blob_offset)
        if asset is None:
            raise DotsFormatError(
                f"{scene.path}: settings {prefab_name} references missing blob {blob_offset}"
            )
        if prefab_id in settings:
            raise DotsFormatError(f"{scene.path}: duplicate settings prefab {prefab_name}")
        settings[prefab_id] = (
            prefab_name,
            _parse_settings_blob(asset, prefab_names, prefab_name),
        )

    definitions: dict[int, RandomizedSpawnDefinition] = {}
    for index in range(instance_chunk.entity_count):
        settings_prefab_id = struct.unpack_from(
            "<i",
            scene.data,
            instance_chunk.file_offset
            + RANDOMIZED_CHAIN_COMPONENT_OFFSET
            + index * RANDOMIZED_CHAIN_COMPONENT_STRIDE,
        )[0]
        prefab_id = struct.unpack_from(
            "<i",
            scene.data,
            instance_chunk.file_offset + RANDOMIZED_CHAIN_PREFAB_OFFSET + index * 4,
        )[0]
        prefab_name = _unique_name(prefab_names, prefab_id)
        resolved = settings.get(settings_prefab_id)
        if resolved is None:
            raise DotsFormatError(
                f"{scene.path}: {prefab_name} references missing randomized settings "
                f"{settings_prefab_id}"
            )
        settings_name, groups = resolved
        if prefab_id in definitions:
            raise DotsFormatError(f"{scene.path}: duplicate randomized prefab {prefab_name}")
        definitions[prefab_id] = RandomizedSpawnDefinition(
            prefab_id=prefab_id,
            prefab_name=prefab_name,
            settings_prefab_id=settings_prefab_id,
            settings_prefab_name=settings_name,
            groups=groups,
        )
    return definitions


__all__ = [
    "RandomizedSpawnDefinition",
    "RandomizedSpawnGroup",
    "RandomizedSpawnOption",
    "load_randomized_spawn_definitions",
]
