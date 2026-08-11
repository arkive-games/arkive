import json

import httpx
import pytest

from palworld.publish import (
    Documents,
    PublishConfig,
    PublishError,
    Publisher,
    RepoState,
    collect_asset_references,
    execute_release_steps,
    validate_local_assets,
)


def _documents():
    parsed = {
        "maps.json": {
            "maps": [
                {
                    "id": "MainWorld",
                    "tilesCountX": 2,
                    "tilesCountY": 2,
                    "tileLevels": 1,
                }
            ]
        },
        "types.json": {"categories": [{"subtypes": [{"icon": "map_icon"}]}]},
        "markers/MainWorld.json": {
            "markers": [{"icon": "marker_icon", "image": "note_image"}]
        },
        "pals.json": {
            "pals": [
                {
                    "icon": "pal_icon",
                    "elements": ["Fire", "None"],
                    "work": {"Mining": 2},
                    "bestWork": "Mining",
                    "activeSkills": [{"element": "Water"}],
                    "partnerSkill": {"element": "Dark"},
                }
            ]
        },
        "breeding.json": {"pals": [{"icon": "pal_icon"}]},
        "items.json": {"items": [{"icon": "item_icon"}]},
        "buildings.json": {"buildings": [{"icon": "building_icon"}]},
        "technology.json": {"techs": [{"icon": "technology_icon"}]},
        "invaders.json": {"humans": {"Guard": {"icon": "human_icon"}}},
        "research.json": {"projects": [{"category": "Medicine"}]},
        "dungeon-layouts.json": {
            "layouts": [{"dungeon": "Cave", "variant": "A", "footprint": True}]
        },
    }
    raw = {
        path: json.dumps(value, separators=(",", ":")).encode()
        for path, value in parsed.items()
    }
    return Documents(raw=raw, parsed=parsed)


def test_collect_asset_references_covers_every_data_backed_asset_family():
    refs = collect_asset_references(_documents())
    assert {
        "icons/map_icon.webp",
        "icons/marker_icon.webp",
        "notes/note_image.webp",
        "icons/pal_icon.webp",
        "icons/element_Fire.webp",
        "icons/element_Water.webp",
        "icons/element_Dark.webp",
        "icons/work_Mining.webp",
        "icons/work_Medicine.webp",
        "icons/item_icon.webp",
        "icons/building_icon.webp",
        "icons/technology_icon.webp",
        "icons/human_icon.webp",
        "layouts/Cave_A.webp",
        "tiles/MainWorld/MainWorld_00_00.webp",
        "tiles/MainWorld/MainWorld_01_01.webp",
        "tiles/MainWorld/z-1/MainWorld_00_00.webp",
    } <= set(refs)
    assert "icons/element_None.webp" not in refs


def test_collect_asset_references_rejects_path_traversal():
    documents = _documents()
    documents.parsed["types.json"]["categories"][0]["subtypes"][0]["icon"] = "../secret"
    with pytest.raises(PublishError, match="Unsafe asset name"):
        collect_asset_references(documents)


def test_validate_local_assets_reports_source(tmp_path):
    refs = {"icons/missing.webp": {"types.json:categories[0].subtypes[0].icon"}}
    with pytest.raises(PublishError, match="types.json"):
        validate_local_assets(tmp_path, refs)


def test_release_steps_never_push_data_after_resource_verification_failure():
    events = []

    def verify_resource():
        events.append("verify-resource")
        raise PublishError("resource unavailable")

    with pytest.raises(PublishError, match="resource unavailable"):
        execute_release_steps(
            resource_pending=True,
            data_pending=True,
            dry_run=False,
            push_resource=lambda: events.append("push-resource"),
            verify_resource=verify_resource,
            push_data=lambda: events.append("push-data"),
            verify_data=lambda: events.append("verify-data"),
        )
    assert events == ["push-resource", "verify-resource"]


def test_release_steps_publish_in_required_order():
    events = []
    execute_release_steps(
        resource_pending=True,
        data_pending=True,
        dry_run=False,
        push_resource=lambda: events.append("push-resource"),
        verify_resource=lambda: events.append("verify-resource"),
        push_data=lambda: events.append("push-data"),
        verify_data=lambda: events.append("verify-data"),
    )
    assert events == ["push-resource", "verify-resource", "push-data", "verify-data"]


def test_release_steps_resume_without_republishing_resource():
    events = []
    execute_release_steps(
        resource_pending=False,
        data_pending=True,
        dry_run=False,
        push_resource=lambda: events.append("push-resource"),
        verify_resource=lambda: events.append("verify-resource"),
        push_data=lambda: events.append("push-data"),
        verify_data=lambda: events.append("verify-data"),
    )
    assert events == ["verify-resource", "push-data", "verify-data"]


def test_wait_for_resource_deploy_retries_until_content_matches(tmp_path):
    resource = tmp_path / "resource"
    data = tmp_path / "data"
    (resource / "icons").mkdir(parents=True)
    data.mkdir()
    expected = b"new-image"
    (resource / "icons/new.webp").write_bytes(expected)
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(404, request=request)
        return httpx.Response(200, content=expected, request=request)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    publisher = Publisher(
        PublishConfig(
            data_repo=data,
            resource_repo=resource,
            deployment_timeout=1,
            poll_interval=0,
            workers=1,
        ),
        client=client,
    )
    publisher.resource_state = RepoState(
        name="resource-palworld",
        path=resource,
        head="a" * 40,
        origin_head="b" * 40,
        commits=["a commit"],
        changed_files={"icons/new.webp"},
        deleted_files=set(),
    )
    publisher.wait_for_resource_deploy()
    assert calls == 2
    client.close()
