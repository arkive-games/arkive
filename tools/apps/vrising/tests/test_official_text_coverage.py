"""Every resource detail that reaches the published layer must have marker text.

`emit` raises `ValueError` when a detail has no entry in `RESOURCE_TEXT_REFS`, and
it raises *after* the whole export has been parsed, so a gap here does not
degrade one marker -- it aborts the run and emits no dataset at all. The gap is
invisible from either side on its own: `classify` decides the detail, a frozenset
in `emit` decides which kinds are published, and the refs live in a third module.

This pins the join. It reads no game data, so it fails in CI on the commit that
introduces the gap rather than on whoever next runs the pipeline.
"""

from __future__ import annotations

from vrising.markers.classify import _RESOURCE_KINDS, classify_prefab
from vrising.markers.emit import CORE_RESOURCE_KINDS
from vrising.markers.official_text import RESOURCE_TEXT_REFS


def published_details() -> set[tuple[str, str]]:
    """(kind, detail) pairs that `emit` will ask for official text."""
    return {
        (kind, detail)
        for _prefix, kind, detail in _RESOURCE_KINDS
        if kind in CORE_RESOURCE_KINDS
    }


def test_every_published_resource_detail_has_marker_text() -> None:
    missing = sorted(
        f"{detail} (kind={kind})"
        for kind, detail in published_details()
        if detail not in RESOURCE_TEXT_REFS
    )
    assert not missing, (
        "these details are published but have no RESOURCE_TEXT_REFS entry, so "
        f"`python -m vrising.markers` aborts before writing anything: {missing}"
    )


def test_classify_still_produces_the_details_the_refs_assume() -> None:
    """Guards the other direction: a rename in `classify` silently orphaning a ref.

    Only the spawn-chain names are checked. Container, mine-cart and randomized
    details come from separate branches of `classify_prefab` and are covered by
    the coverage test above via their own entries.
    """
    for prefix, kind, detail in _RESOURCE_KINDS:
        classified = classify_prefab(f"Chain_Resource_{prefix}01")
        assert classified is not None, prefix
        assert (classified.kind, classified.detail) == (kind, detail)


def test_gem_and_crystal_tiers_are_published_and_covered() -> None:
    """The specific gap this test file was added for.

    `Chain_Resource_GemCrude_01`, `GemRegular_01`, `GemFlawless_01`,
    `BloodCrystal01` and `GhostCrystal01` all exist in the shipped prefab set,
    and `gem`/`crystal` are both core kinds, so all five reach the published
    layer. They had no text refs, which aborted the emit.
    """
    for detail in (
        "crude_gem_vein",
        "regular_gem_vein",
        "flawless_gem_vein",
        "blood_crystal",
        "ghost_crystal",
        "emery",
    ):
        assert detail in RESOURCE_TEXT_REFS, detail
