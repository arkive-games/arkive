"""Convert curated V Rising resources and fixed V Blood spawns to map-contract data."""

from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import re


RESOURCE_KINDS = (
    "copper",
    "crystal",
    "emery",
    "gem",
    "iron",
    "mechanical",
    "plant",
    "quartz",
    "random_mineral",
    "random_plant",
    "random_special",
    "silver",
    "special",
    "stone",
    "sulfur",
    "wood",
)

# The extractor audits every harvestable spawn, but the public map deliberately
# ships only scarce/progression-relevant materials. Ordinary stone, wood,
# vegetation, bone piles, and mixed pools dominated by those materials would
# overwhelm the useful markers.
CORE_RESOURCE_KINDS = frozenset(
    {"copper", "crystal", "emery", "gem", "iron", "mechanical", "quartz", "silver", "sulfur"}
)
NON_PUBLIC_CHUNKS = frozenset({"Dev_Island_Chunk"})


def _slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "unknown"


def _digest(*parts: object) -> str:
    source = "\0".join(json.dumps(part, sort_keys=True) for part in parts)
    return hashlib.sha1(source.encode("utf-8"), usedforsecurity=False).hexdigest()[:12]


def _marker_position(position: list[float]) -> dict[str, float]:
    if len(position) != 3:
        raise ValueError(f"expected a three-dimensional world position, got {position}")
    # Unity is X/Y-up/Z. The map contract uses horizontal X/Z as x/y and keeps
    # the height separately in z.
    return {"x": position[0], "y": position[2], "z": position[1]}


def _resource_pool(record: dict) -> tuple[str, dict] | None:
    randomized = record.get("randomizedResources")
    if not randomized:
        return None
    pool_id = f"pool-{_slug(randomized['settingsPrefabName'])}"
    outcomes = [
        {
            "kind": outcome["resource"]["kind"],
            "detail": outcome["resource"]["detail"],
            "probability": outcome["probability"],
        }
        for outcome in randomized["outcomes"]
    ]
    if not outcomes or abs(sum(item["probability"] for item in outcomes) - 1.0) >= 1e-6:
        raise ValueError(f"{pool_id} probabilities do not total one")
    return pool_id, {
        "id": pool_id,
        "source": randomized["settingsPrefabName"],
        "outcomes": outcomes,
    }


def build_marker_payload(resources: list[dict], fixed_bosses: list[dict]) -> dict:
    """Build compact contract markers and labels for the curated public map."""
    markers: list[dict] = []
    labels: dict[str, dict[str, str]] = {}
    pools: dict[str, dict] = {}
    counters: Counter[str] = Counter()
    marker_ids: set[str] = set()

    def append_marker(marker: dict, name: str, description: str = "") -> None:
        marker_id = marker["id"]
        if marker_id in marker_ids:
            raise ValueError(f"duplicate marker id {marker_id}")
        marker_ids.add(marker_id)
        counters[marker["subtype"]] += 1
        marker["indexInSubtype"] = counters[marker["subtype"]]
        markers.append(marker)
        labels[marker_id] = {
            "name": name,
            **({"description": description} if description else {}),
        }

    omitted: Counter[str] = Counter()
    non_public: Counter[str] = Counter()
    for resource in resources:
        classification = resource["resource"]
        source_kind = classification["kind"]
        if source_kind not in RESOURCE_KINDS:
            raise ValueError(f"unsupported resource kind {source_kind}")
        if resource.get("chunkName") in NON_PUBLIC_CHUNKS:
            non_public[source_kind] += 1
            continue
        pool = _resource_pool(resource)
        if source_kind.startswith("random_"):
            if pool is None:
                raise ValueError(f"{source_kind} marker has no randomized resource pool")
            outcome_kinds = {item["kind"] for item in pool[1]["outcomes"]}
            # A pool that can produce ordinary stone/vegetation stays out of
            # the core-material layer. A deterministic one-kind pool is folded
            # into that material (the current mechanical random chain).
            if not outcome_kinds or not outcome_kinds <= CORE_RESOURCE_KINDS:
                omitted[source_kind] += 1
                continue
            if len(outcome_kinds) == 1:
                kind = next(iter(outcome_kinds))
                pool = None
            else:
                omitted[source_kind] += 1
                continue
        else:
            kind = source_kind
            if kind not in CORE_RESOURCE_KINDS:
                omitted[source_kind] += 1
                continue
        position = resource["worldPosition"]
        marker_id = f"resource-{_slug(kind)}-{_digest(kind, position, resource.get('sourceDetails'))}"
        if pool:
            pool_id, pool_payload = pool
            previous = pools.setdefault(pool_id, pool_payload)
            if previous != pool_payload:
                raise ValueError(f"resource pool {pool_id} has inconsistent outcomes")
        else:
            pool_id = None
        count = int(resource.get("sourceCount", 1))
        detail = classification["detail"]
        append_marker(
            {
                "id": marker_id,
                "category": "resources",
                "subtype": f"resource-{kind.replace('_', '-')}",
                **_marker_position(position),
                "images": [],
                "contributors": [],
                "resourceKind": kind,
                "resourceDetail": detail,
                **({"count": count} if count > 1 else {}),
                **({"resourcePool": pool_id} if pool_id else {}),
            },
            detail.replace("_", " ").title(),
        )

    for record in fixed_bosses:
        boss = record["boss"]
        position = record["worldPosition"]
        marker_id = (
            f"boss-{_slug(boss['prefabName'])}-"
            f"{_digest(boss['prefabName'], position)}"
        )
        append_marker(
            {
                "id": marker_id,
                "category": "bosses",
                "subtype": "boss-fixed",
                **_marker_position(position),
                "images": [],
                "contributors": [],
                "movement": "fixed",
                "bossPrefab": boss["prefabName"],
                "bossLevel": boss.get("level"),
                "bossAct": boss.get("act"),
                "bossRegion": boss.get("region"),
            },
            boss["displayName"],
        )

    return {
        "markers": markers,
        "labels": labels,
        "resourcePools": sorted(pools.values(), key=lambda item: item["id"]),
        "summary": {
            "inputResourcePoints": len(resources),
            "resourceMarkers": sum(
                count for subtype, count in counters.items() if subtype.startswith("resource-")
            ),
            "omittedResourcePoints": dict(sorted(omitted.items())),
            "nonPublicResourcePoints": sum(non_public.values()),
            "nonPublicResourcesByKind": dict(sorted(non_public.items())),
            "fixedBossMarkers": len(fixed_bosses),
            "uniqueFixedBosses": len(
                {item["boss"]["prefabName"] for item in fixed_bosses}
            ),
            "resourcePools": len(pools),
            "markersBySubtype": dict(sorted(counters.items())),
        },
    }


def load_marker_payload(output_dir: Path) -> dict:
    output_dir = Path(output_dir)

    def read(name: str) -> list[dict]:
        path = output_dir / name
        if not path.is_file():
            raise RuntimeError(f"{path} is missing; run `python -m vrising.markers extract`")
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list):
            raise ValueError(f"{path} must contain a JSON array")
        return value

    return build_marker_payload(read("resources.display.json"), read("bosses.fixed.json"))


__all__ = [
    "CORE_RESOURCE_KINDS",
    "NON_PUBLIC_CHUNKS",
    "RESOURCE_KINDS",
    "build_marker_payload",
    "load_marker_payload",
]
