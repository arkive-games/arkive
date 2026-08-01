"""Explicit resource taxonomy for V Rising spawn-chain prefabs."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .randomized import RandomizedSpawnDefinition


@dataclass(frozen=True)
class ResourceClassification:
    kind: str
    detail: str
    aggregate: bool

    def to_dict(self) -> dict[str, str | bool]:
        return asdict(self)


_RESOURCE_KINDS = (
    ("BloodCrystal", "crystal", "blood_crystal"),
    ("GhostCrystal", "crystal", "ghost_crystal"),
    ("GemCrude", "gem", "crude_gem_vein"),
    ("GemRegular", "gem", "regular_gem_vein"),
    ("GemFlawless", "gem", "flawless_gem_vein"),
    ("Copper", "copper", "copper"),
    ("Iron", "iron", "iron"),
    ("Sulfur", "sulfur", "sulfur"),
    ("Silver", "silver", "silver"),
    ("Quartz", "quartz", "quartz"),
    ("Emery", "emery", "emery"),
    ("Mech", "mechanical", "mechanical_resource"),
    ("Rock", "stone", "stone"),
)


def _slug(value: str) -> str:
    value = re.sub(r"(?:Big|Medium)?\d+$", "", value)
    value = re.sub(r"(?<!^)(?=[A-Z])", "_", value)
    return value.lower()


def classify_prefab(name: str) -> ResourceClassification | None:
    """Classify only auditable harvestable spawn-chain names.

    Dense ordinary stone, wood, and plant-fibre points are marked for display
    aggregation. Minerals, named herbs, and unusual pickups remain exact.
    """
    if name.startswith("Chain_Resource_"):
        tail = name.removeprefix("Chain_Resource_")
        for prefix, kind, detail in _RESOURCE_KINDS:
            if tail.startswith(prefix):
                return ResourceClassification(kind, detail, kind == "stone")
        return ResourceClassification("special", f"resource_{_slug(tail)}", False)

    if name.startswith("RandChain_Minerals_"):
        return ResourceClassification("random_mineral", "random_mineral_spawn", False)

    if name.startswith("RandChain_Vegetation_"):
        return ResourceClassification("random_plant", "random_plant_spawn", False)

    if name.startswith("RandChain_Mechs_"):
        return ResourceClassification("random_special", "random_mech_spawn", False)

    if name.startswith(("Chain_Emery01_", "Chain_Strongblade_Emery01_")):
        return ResourceClassification("emery", "emery_container", False)

    if name == "Chain_MineCart_01_Iron":
        return ResourceClassification("iron", "iron_mine_cart", False)

    if name == "Chain_MineCart_01_Silver":
        return ResourceClassification("silver", "silver_mine_cart", False)

    if name.startswith("Chain_Noctem_RiftCrystalChild"):
        return ResourceClassification("crystal", "rift_crystal", False)

    if name.startswith("Chain_Tree_"):
        return ResourceClassification("wood", _slug(name.removeprefix("Chain_Tree_")), True)

    if name.startswith("Chain_Pickup_PlantfiberSunflower"):
        return ResourceClassification("plant", "sunflower", False)

    if name.startswith("Chain_Pickup_Plantfiber"):
        return ResourceClassification(
            "plant", _slug(name.removeprefix("Chain_Pickup_")), True
        )

    if name.startswith("Chain_Pickup_"):
        tail = name.removeprefix("Chain_Pickup_")
        named_plant_tokens = (
            "BleedingHeart",
            "BloodRose",
            "Cotton",
            "FireBlossom",
            "GhostShroom",
            "HellsClarion",
            "Lotus",
            "MourningLily",
            "SnowFlower",
            "Sunflower",
            "Thistle",
            "TrippyShroom",
        )
        if tail.startswith(named_plant_tokens):
            return ResourceClassification("plant", _slug(tail), False)
        return ResourceClassification("special", f"pickup_{_slug(tail)}", False)

    return None


def summarize_randomized_resources(
    definition: "RandomizedSpawnDefinition",
) -> dict:
    """Summarize exact weighted outcomes without pretending one has spawned."""
    outcomes: dict[tuple[str, str, bool], dict] = {}
    probability_total = 0.0
    for group in definition.groups:
        for option in group.options:
            resource = classify_prefab(option.prefab_name)
            if resource is None or resource.kind.startswith("random_"):
                raise ValueError(
                    f"{definition.prefab_name} has non-resource option "
                    f"{option.prefab_name}"
                )
            key = (resource.kind, resource.detail, resource.aggregate)
            outcome = outcomes.setdefault(
                key,
                {
                    "resource": resource.to_dict(),
                    "probability": 0.0,
                    "prefabs": [],
                },
            )
            outcome["probability"] += option.probability
            outcome["prefabs"].append(
                {
                    "prefabId": option.prefab_id,
                    "prefabName": option.prefab_name,
                    "probability": option.probability,
                }
            )
            probability_total += option.probability
    if not outcomes or not abs(probability_total - 1.0) < 1e-6:
        raise ValueError(
            f"{definition.prefab_name} resource probabilities total "
            f"{probability_total}"
        )
    return {
        "settingsPrefabId": definition.settings_prefab_id,
        "settingsPrefabName": definition.settings_prefab_name,
        "outcomes": sorted(
            outcomes.values(),
            key=lambda item: (
                item["resource"]["kind"],
                item["resource"]["detail"],
            ),
        ),
    }


def aggregate_display_markers(
    records: list[dict], grid_size: float = 40.0
) -> list[dict]:
    """Aggregate only records whose explicit classification permits it."""
    if grid_size <= 0:
        raise ValueError("grid_size must be positive")
    exact: list[dict] = []
    groups: dict[tuple[str, int, int], list[dict]] = {}
    for record in records:
        resource = record.get("resource")
        if not resource:
            continue
        if not resource["aggregate"]:
            exact.append({**record, "aggregated": False, "sourceCount": 1})
            continue
        x, _, z = record["worldPosition"]
        key = (resource["kind"], int(x // grid_size), int(z // grid_size))
        groups.setdefault(key, []).append(record)

    aggregated: list[dict] = []
    for key in sorted(groups):
        members = groups[key]
        x = sum(item["worldPosition"][0] for item in members) / len(members)
        y = sum(item["worldPosition"][1] for item in members) / len(members)
        z = sum(item["worldPosition"][2] for item in members) / len(members)
        details: dict[str, int] = {}
        for item in members:
            detail = item["resource"]["detail"]
            details[detail] = details.get(detail, 0) + 1
        aggregated.append(
            {
                "resource": {
                    "kind": key[0],
                    "detail": "mixed" if len(details) > 1 else next(iter(details)),
                    "aggregate": True,
                },
                "worldPosition": [x, y, z],
                "aggregated": True,
                "sourceCount": len(members),
                "sourceDetails": dict(sorted(details.items())),
            }
        )
    return sorted(
        exact + aggregated,
        key=lambda item: (
            item["resource"]["kind"],
            item["worldPosition"][0],
            item["worldPosition"][2],
        ),
    )


__all__ = [
    "ResourceClassification",
    "aggregate_display_markers",
    "classify_prefab",
    "summarize_randomized_resources",
]
