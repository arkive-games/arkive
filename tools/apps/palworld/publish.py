"""Ordered publisher for the Palworld data and resource artifact repositories.

The command deliberately owns the cross-repository release sequence. It never
generates or commits artifacts: both repositories must already be clean,
linear, signed, and ready to publish.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.parse import quote

import httpx

from .env import require_dir
from .version import content_version

DATA_ORIGIN = "arkive-games/data-palworld"
RESOURCE_ORIGIN = "arkive-games/resource-palworld"
DATA_URL = "https://data-palworld.tc-imba.com"
RESOURCE_URL = "https://resource-palworld.tc-imba.com"

REFERENCE_FILES = (
    "maps.json",
    "types.json",
    "pals.json",
    "breeding.json",
    "items.json",
    "buildings.json",
    "technology.json",
    "invaders.json",
    "research.json",
    "dungeon-layouts.json",
)
RESOURCE_PREFIXES = ("icons/", "layouts/", "notes/", "tiles/")


class PublishError(RuntimeError):
    """A release gate failed; no later release stage may run."""


@dataclass
class Documents:
    paths: tuple[str, ...]
    parsed: dict[str, Any]


@dataclass
class RepoState:
    name: str
    path: Path
    head: str
    origin_head: str
    commits: list[str]
    changed_files: set[str]
    deleted_files: set[str]
    push_status: str = "not needed"
    online_status: str = "not checked"

    @property
    def pending(self) -> bool:
        return bool(self.commits)


@dataclass
class ReleaseReport:
    status: str = "running"
    phase: str = "starting"
    error: str | None = None
    expected_data_version: str | None = None
    referenced_assets: int = 0
    resource: dict[str, Any] = field(default_factory=dict)
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class PublishConfig:
    data_repo: Path
    resource_repo: Path
    data_url: str = DATA_URL
    resource_url: str = RESOURCE_URL
    proxy: str | None = None
    deployment_timeout: float = 600.0
    request_timeout: float = 20.0
    poll_interval: float = 2.0
    workers: int = 24
    dry_run: bool = False
    json_output: bool = False


def load_local_documents(root: Path) -> Documents:
    root = Path(root)
    paths = list(REFERENCE_FILES)
    marker_dir = root / "markers"
    if not marker_dir.is_dir():
        raise PublishError(f"Missing data directory: {marker_dir}")
    paths.extend(
        p.relative_to(root).as_posix()
        for p in sorted(marker_dir.glob("*.json"), key=lambda p: p.name)
    )
    parsed: dict[str, Any] = {}
    for rel in paths:
        path = root / rel
        if not path.is_file():
            raise PublishError(f"Missing reference-bearing data file: {path}")
        body = path.read_bytes()
        try:
            value = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise PublishError(f"Invalid JSON in {path}: {exc}") from exc
        parsed[rel] = value
    return Documents(paths=tuple(paths), parsed=parsed)


def _asset_segment(value: Any, source: str) -> str:
    if not isinstance(value, str) or not value:
        raise PublishError(f"Invalid asset name at {source}: {value!r}")
    if any(char in value for char in ("/", "\\", "?", "#", "\0")) or value in {".", ".."}:
        raise PublishError(f"Unsafe asset name at {source}: {value!r}")
    return value


def collect_asset_references(documents: Documents) -> dict[str, set[str]]:
    """Collect every resource URL deterministically derived from Palworld data."""
    docs = documents.parsed
    refs: dict[str, set[str]] = {}

    def add(directory: str, value: Any, source: str, prefix: str = "") -> None:
        if value is None or value == "":
            return
        stem = _asset_segment(value, source)
        refs.setdefault(f"{directory}/{prefix}{stem}.webp", set()).add(source)

    try:
        for ci, category in enumerate(docs["types.json"]["categories"]):
            for si, subtype in enumerate(category["subtypes"]):
                add("icons", subtype.get("icon"), f"types.json:categories[{ci}].subtypes[{si}].icon")

        for rel in sorted(path for path in docs if path.startswith("markers/")):
            for mi, marker in enumerate(docs[rel]["markers"]):
                add("icons", marker.get("icon"), f"{rel}:markers[{mi}].icon")
                add("notes", marker.get("image"), f"{rel}:markers[{mi}].image")

        for mi, game_map in enumerate(docs["maps.json"]["maps"]):
            map_id = _asset_segment(game_map["id"], f"maps.json:maps[{mi}].id")
            count_x = int(game_map["tilesCountX"])
            count_y = int(game_map["tilesCountY"])
            levels = int(game_map.get("tileLevels", 0))
            for level in range(levels + 1):
                level_x = count_x >> level
                level_y = count_y >> level
                if level_x <= 0 or level_y <= 0:
                    break
                level_dir = "" if level == 0 else f"z-{level}/"
                for x in range(level_x):
                    for y in range(level_y):
                        path = f"tiles/{map_id}/{level_dir}{map_id}_{x:02d}_{y:02d}.webp"
                        refs.setdefault(path, set()).add(f"maps.json:maps[{mi}]")

        for li, layout in enumerate(docs["dungeon-layouts.json"]["layouts"]):
            if layout.get("footprint"):
                dungeon = _asset_segment(
                    layout["dungeon"], f"dungeon-layouts.json:layouts[{li}].dungeon"
                )
                variant = _asset_segment(
                    layout["variant"], f"dungeon-layouts.json:layouts[{li}].variant"
                )
                add(
                    "layouts",
                    f"{dungeon}_{variant}",
                    f"dungeon-layouts.json:layouts[{li}].footprint",
                )

        for pi, pal in enumerate(docs["pals.json"]["pals"]):
            base = f"pals.json:pals[{pi}]"
            add("icons", pal.get("icon"), f"{base}.icon")
            for element in pal.get("elements", []):
                if element != "None":
                    add("icons", element, f"{base}.elements", prefix="element_")
            for work in (pal.get("work") or {}):
                add("icons", work, f"{base}.work", prefix="work_")
            if pal.get("bestWork"):
                add("icons", pal["bestWork"], f"{base}.bestWork", prefix="work_")
            for skill in pal.get("activeSkills", []):
                element = skill.get("element")
                if element and element != "None":
                    add("icons", element, f"{base}.activeSkills.element", prefix="element_")
            partner_element = (pal.get("partnerSkill") or {}).get("element")
            if partner_element and partner_element != "None":
                add("icons", partner_element, f"{base}.partnerSkill.element", prefix="element_")

        for pi, pal in enumerate(docs["breeding.json"]["pals"]):
            add("icons", pal.get("icon"), f"breeding.json:pals[{pi}].icon")
        for ii, item in enumerate(docs["items.json"]["items"]):
            add("icons", item.get("icon"), f"items.json:items[{ii}].icon")
        for bi, building in enumerate(docs["buildings.json"]["buildings"]):
            add("icons", building.get("icon"), f"buildings.json:buildings[{bi}].icon")
        for ti, tech in enumerate(docs["technology.json"]["techs"]):
            add("icons", tech.get("icon"), f"technology.json:techs[{ti}].icon")
        for human_id, human in (docs["invaders.json"].get("humans") or {}).items():
            add("icons", human.get("icon"), f"invaders.json:humans.{human_id}.icon")
        for ri, project in enumerate(docs["research.json"]["projects"]):
            add("icons", project.get("category"), f"research.json:projects[{ri}].category", prefix="work_")
    except (KeyError, TypeError, ValueError) as exc:
        raise PublishError(f"Invalid Palworld data schema while collecting assets: {exc}") from exc

    return refs


def validate_local_assets(resource_root: Path, refs: dict[str, set[str]]) -> None:
    missing = [path for path in sorted(refs) if not (resource_root / path).is_file()]
    if not missing:
        return
    details = []
    for path in missing[:50]:
        details.append(f"  {path} <- {', '.join(sorted(refs[path])[:3])}")
    if len(missing) > 50:
        details.append(f"  ... and {len(missing) - 50} more")
    raise PublishError(f"Missing {len(missing)} referenced resource files:\n" + "\n".join(details))


def execute_release_steps(
    *,
    resource_pending: bool,
    data_pending: bool,
    push_resource: Callable[[], None],
    verify_resource: Callable[[], None],
    push_data: Callable[[], None],
    verify_data: Callable[[], None],
) -> None:
    """Run the fail-closed ordering independently of Git and HTTP details."""
    if resource_pending:
        push_resource()
    verify_resource()
    if data_pending:
        push_data()
    verify_data()


class Publisher:
    def __init__(self, config: PublishConfig, client: httpx.Client | None = None) -> None:
        self.config = config
        self.report = ReleaseReport()
        self._owns_client = client is None
        self.client = client or httpx.Client(
            proxy=config.proxy,
            timeout=config.request_timeout,
            follow_redirects=True,
        )
        self.documents: Documents | None = None
        self.references: dict[str, set[str]] = {}
        self.resource_state: RepoState | None = None
        self.data_state: RepoState | None = None
        self._last_data_errors: list[str] = []

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def log(self, message: str) -> None:
        if not self.config.json_output:
            print(message, flush=True)

    def phase(self, name: str) -> None:
        self.report.phase = name
        self.log(f"[{name}]")

    def _git(self, root: Path, *args: str, check: bool = True) -> str:
        command = ["git"]
        if self.config.proxy:
            command.extend(
                [
                    "-c",
                    f"http.proxy={self.config.proxy}",
                    "-c",
                    f"https.proxy={self.config.proxy}",
                    "-c",
                    "url.https://github.com/.insteadOf=git@github.com:",
                    "-c",
                    "url.https://github.com/.insteadOf=ssh://git@github.com/",
                ]
            )
        command.extend(args)
        result = subprocess.run(
            command,
            cwd=root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if check and result.returncode:
            detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
            raise PublishError(f"git {' '.join(args)} failed in {root}: {detail}")
        return result.stdout.strip()

    @staticmethod
    def _remote_matches(remote: str, expected: str) -> bool:
        normalized = remote.replace("\\", "/").removesuffix(".git").rstrip("/")
        return bool(re.search(rf"github\.com[:/]{re.escape(expected)}$", normalized))

    def preflight_repo(self, path: Path, name: str, expected_remote: str) -> RepoState:
        path = path.resolve()
        if not path.is_dir():
            raise PublishError(f"Repository directory does not exist: {path}")
        top = Path(self._git(path, "rev-parse", "--show-toplevel")).resolve()
        if top != path:
            raise PublishError(f"Configured {name} path is not its Git root: {path} (root: {top})")
        if self._git(path, "status", "--porcelain=v1"):
            raise PublishError(f"{name} working tree is not clean: {path}")
        branch = self._git(path, "branch", "--show-current")
        if branch != "master":
            raise PublishError(f"{name} must be on master, found {branch or 'detached HEAD'}")
        remote = self._git(path, "remote", "get-url", "origin")
        if not self._remote_matches(remote, expected_remote):
            raise PublishError(f"{name} origin is not {expected_remote}: {remote}")

        self._git(path, "fetch", "origin", "--prune")
        head = self._git(path, "rev-parse", "HEAD")
        origin_head = self._git(path, "rev-parse", "origin/master")
        ancestor = subprocess.run(
            ["git", "merge-base", "--is-ancestor", "origin/master", "HEAD"],
            cwd=path,
            capture_output=True,
            check=False,
        )
        if ancestor.returncode != 0:
            raise PublishError(
                f"{name} is behind or diverged from origin/master; rebase and re-sign before publishing"
            )
        merge_commits = self._git(path, "rev-list", "--merges", "origin/master..HEAD")
        if merge_commits:
            raise PublishError(f"{name} unpublished history contains merge commits")

        commit_lines = self._git(
            path,
            "log",
            "--reverse",
            "--format=%H%x09%G?%x09%s",
            "origin/master..HEAD",
        ).splitlines()
        commits: list[str] = []
        bad_signatures: list[str] = []
        for line in commit_lines:
            sha, signature, subject = line.split("\t", 2)
            commits.append(f"{sha} {subject}")
            if signature != "G":
                bad_signatures.append(f"{sha} ({signature}) {subject}")
        if bad_signatures:
            raise PublishError(
                f"{name} has unsigned or unverified unpublished commits:\n  "
                + "\n  ".join(bad_signatures)
            )

        changed_files = set(
            filter(
                None,
                self._git(
                    path,
                    "diff",
                    "--no-renames",
                    "--name-only",
                    "--diff-filter=ACMRT",
                    "origin/master..HEAD",
                ).splitlines(),
            )
        )
        deleted_files = set(
            filter(
                None,
                self._git(
                    path,
                    "diff",
                    "--no-renames",
                    "--name-only",
                    "--diff-filter=D",
                    "origin/master..HEAD",
                ).splitlines(),
            )
        )
        return RepoState(
            name=name,
            path=path,
            head=head,
            origin_head=origin_head,
            commits=commits,
            changed_files=changed_files,
            deleted_files=deleted_files,
            push_status="pending" if commits else "not needed",
        )

    def _repo_report(self, state: RepoState) -> dict[str, Any]:
        return {
            "path": str(state.path),
            "head": state.head,
            "originHeadBefore": state.origin_head,
            "pendingCommits": state.commits,
            "push": state.push_status,
            "online": state.online_status,
        }

    def push_repo(self, state: RepoState) -> None:
        self.log(f"Pushing {state.name} {state.head[:12]} to origin/master")
        self._git(state.path, "push", "origin", "HEAD:refs/heads/master")
        remote_line = self._git(state.path, "ls-remote", "origin", "refs/heads/master")
        remote_head = remote_line.split()[0] if remote_line else ""
        if remote_head != state.head:
            raise PublishError(
                f"{state.name} remote master is {remote_head or 'missing'}, expected {state.head}"
            )
        state.push_status = "pushed"

    def _probe_url(self, base: str, path: str, token: str) -> str:
        return f"{base.rstrip('/')}/{quote(path, safe='/')}?publish_probe={quote(token)}"

    def _asset_error(self, path: str, token: str, compare_hash: bool) -> str | None:
        url = self._probe_url(self.config.resource_url, path, token)
        try:
            response = self.client.get(url) if compare_hash else self.client.head(url)
            if not compare_hash and response.status_code in {405, 501}:
                response = self.client.get(url)
        except httpx.HTTPError as exc:
            return f"{path}: {exc}"
        if response.status_code != 200:
            return f"{path}: HTTP {response.status_code}"
        if compare_hash:
            local = (self.config.resource_repo / path).read_bytes()
            local_hash = hashlib.sha256(local).digest()
            remote_hash = hashlib.sha256(response.content).digest()
            if local_hash != remote_hash:
                return f"{path}: online content hash does not match local HEAD"
        return None

    def verify_asset_reachability(self, paths: Iterable[str], token: str) -> None:
        pending = set(paths)
        if not pending:
            return
        deadline = time.monotonic() + min(self.config.deployment_timeout, 60.0)
        last_errors: dict[str, str] = {}
        attempt = 0
        while pending:
            attempt += 1
            attempt_token = f"{token}-{attempt}-{uuid.uuid4().hex}"
            failed: set[str] = set()
            with ThreadPoolExecutor(max_workers=self.config.workers) as executor:
                futures = {
                    executor.submit(self._asset_error, path, attempt_token, False): path
                    for path in sorted(pending)
                }
                for future in as_completed(futures):
                    path = futures[future]
                    error = future.result()
                    if error:
                        failed.add(path)
                        last_errors[path] = error
                    else:
                        last_errors.pop(path, None)
            if not failed:
                return
            pending = failed
            if time.monotonic() >= deadline:
                break
            time.sleep(self.config.poll_interval)

        failures = [last_errors[path] for path in sorted(pending)]
        details = "\n  ".join(failures[:50])
        suffix = f"\n  ... and {len(failures) - 50} more" if len(failures) > 50 else ""
        raise PublishError(
            f"{len(failures)} referenced resources are not reachable:\n  {details}{suffix}"
        )

    def _canonical_asset_error(self, path: str, expected_status: int = 200) -> str | None:
        url = f"{self.config.resource_url.rstrip('/')}/{quote(path, safe='/')}"
        try:
            response = self.client.get(url, headers={"Cache-Control": "no-cache"})
        except httpx.HTTPError as exc:
            return f"{path}: canonical URL failed ({exc})"
        if response.status_code != expected_status:
            return (
                f"{path}: canonical URL returned HTTP {response.status_code}, "
                f"expected {expected_status}"
            )
        if expected_status == 200:
            local_hash = hashlib.sha256((self.config.resource_repo / path).read_bytes()).digest()
            remote_hash = hashlib.sha256(response.content).digest()
            if local_hash != remote_hash:
                return f"{path}: canonical URL content hash does not match local HEAD"
        return None

    def wait_for_resource_deploy(self) -> None:
        assert self.resource_state is not None
        changed = {
            path
            for path in self.resource_state.changed_files
            if (self.config.resource_repo / path).is_file()
            and path.startswith(RESOURCE_PREFIXES)
        }
        deleted = {
            path for path in self.resource_state.deleted_files if path.startswith(RESOURCE_PREFIXES)
        }
        if not changed and not deleted:
            return
        deadline = time.monotonic() + self.config.deployment_timeout
        attempt = 0
        last_errors: list[str] = []
        while time.monotonic() < deadline:
            attempt += 1
            token = f"resource-{self.resource_state.head}-{attempt}-{uuid.uuid4().hex}"
            errors = [
                error
                for path in sorted(changed)
                if (error := self._asset_error(path, token, True))
            ]
            for path in sorted(deleted):
                url = self._probe_url(self.config.resource_url, path, token)
                try:
                    status = self.client.get(url).status_code
                except httpx.HTTPError as exc:
                    errors.append(f"{path}: {exc}")
                else:
                    if status != 404:
                        errors.append(f"{path}: expected HTTP 404 after deletion, got {status}")
            if not errors:
                errors.extend(
                    error
                    for path in sorted(changed)
                    if (error := self._canonical_asset_error(path))
                )
                errors.extend(
                    error
                    for path in sorted(deleted)
                    if (error := self._canonical_asset_error(path, expected_status=404))
                )
            if not errors:
                return
            last_errors = errors
            time.sleep(self.config.poll_interval)
        raise PublishError(
            "Timed out waiting for resource-palworld deployment:\n  "
            + "\n  ".join(last_errors[:20])
        )

    def verify_resource_stage(self) -> None:
        assert self.resource_state is not None
        self.phase("verify resource deployment")
        if self.resource_state.pending:
            self.wait_for_resource_deploy()
        self.verify_asset_reachability(
            self.references,
            f"resource-all-{self.resource_state.head}-{uuid.uuid4().hex}",
        )
        self.resource_state.online_status = f"{len(self.references)} referenced assets reachable"

    def _remote_version(self, token: str) -> str | None:
        url = self._probe_url(self.config.data_url, "version.json", token)
        try:
            response = self.client.get(url, headers={"Cache-Control": "no-cache"})
        except httpx.HTTPError:
            return None
        if response.status_code != 200:
            return None
        try:
            value = response.json().get("version")
        except (json.JSONDecodeError, AttributeError):
            return None
        return value if isinstance(value, str) else None

    def _fetch_remote_documents(self, expected: str, token: str) -> Documents | None:
        assert self.documents is not None
        parsed: dict[str, Any] = {}
        errors: list[str] = []
        for rel in self.documents.paths:
            separator = "&" if "?" in rel else "?"
            url = (
                f"{self.config.data_url.rstrip('/')}/{quote(rel, safe='/')}"
                f"{separator}v={quote(expected)}&publish_probe={quote(token)}"
            )
            try:
                response = self.client.get(url, headers={"Cache-Control": "no-cache"})
            except httpx.HTTPError as exc:
                errors.append(f"{rel}: {exc}")
                continue
            if response.status_code != 200:
                errors.append(f"{rel}: HTTP {response.status_code}")
                continue
            try:
                value = response.json()
            except json.JSONDecodeError as exc:
                errors.append(f"{rel}: invalid online JSON ({exc})")
                continue
            if value != self.documents.parsed[rel]:
                errors.append(f"{rel}: online JSON does not match local HEAD")
                continue
            parsed[rel] = value
        self._last_data_errors = errors
        if errors:
            return None
        return Documents(paths=self.documents.paths, parsed=parsed)

    def wait_for_data_deploy(self) -> Documents:
        expected = self.report.expected_data_version
        assert expected is not None
        deadline = time.monotonic() + self.config.deployment_timeout
        attempt = 0
        while time.monotonic() < deadline:
            attempt += 1
            token = f"data-{expected}-{attempt}-{uuid.uuid4().hex}"
            if self._remote_version(token) == expected:
                remote = self._fetch_remote_documents(expected, token)
                if remote is not None:
                    canonical_status = None
                    try:
                        canonical = self.client.get(
                            f"{self.config.data_url.rstrip('/')}/version.json",
                            headers={"Cache-Control": "no-cache"},
                        )
                        canonical_status = canonical.status_code
                        canonical_version = canonical.json().get("version")
                    except (httpx.HTTPError, json.JSONDecodeError, AttributeError):
                        canonical_version = None
                    if canonical_status == 200 and canonical_version == expected:
                        return remote
            time.sleep(self.config.poll_interval)
        raise PublishError(
            f"Timed out waiting for data-palworld version {expected} and matching online data"
            + (
                ":\n  " + "\n  ".join(self._last_data_errors[:20])
                if self._last_data_errors
                else ""
            )
        )

    def verify_data_stage(self) -> None:
        assert self.data_state is not None
        self.phase("verify data deployment")
        remote_documents = self.wait_for_data_deploy()
        remote_refs = collect_asset_references(remote_documents)
        if remote_refs != self.references:
            added = sorted(set(remote_refs) - set(self.references))
            missing = sorted(set(self.references) - set(remote_refs))
            raise PublishError(
                "Online data resource references do not match local HEAD "
                f"(online-only={added[:10]}, local-only={missing[:10]})"
            )
        self.verify_asset_reachability(
            remote_refs,
            f"data-final-{self.data_state.head}-{uuid.uuid4().hex}",
        )
        self.data_state.online_status = (
            f"version {self.report.expected_data_version}; {len(remote_refs)} assets reachable"
        )

    def verify_dry_run(self) -> None:
        assert self.resource_state is not None
        assert self.data_state is not None
        changed = self.resource_state.changed_files | self.resource_state.deleted_files
        stable_refs = set(self.references) - changed
        self.phase("dry-run online checks")
        self.verify_asset_reachability(
            stable_refs,
            f"dry-run-{self.resource_state.head}-{uuid.uuid4().hex}",
        )
        self.resource_state.online_status = (
            f"{len(stable_refs)} unchanged referenced assets reachable; "
            f"{len(set(self.references) & changed)} pending assets deferred"
        )
        self.data_state.online_status = (
            "pending local data not requested" if self.data_state.pending else "not changed"
        )

    def run(self) -> ReleaseReport:
        try:
            self.phase("preflight")
            self.resource_state = self.preflight_repo(
                self.config.resource_repo, "resource-palworld", RESOURCE_ORIGIN
            )
            self.data_state = self.preflight_repo(
                self.config.data_repo, "data-palworld", DATA_ORIGIN
            )
            self.report.resource = self._repo_report(self.resource_state)
            self.report.data = self._repo_report(self.data_state)

            self.phase("local artifact validation")
            expected = content_version(self.config.data_repo)
            try:
                stamped = json.loads(
                    (self.config.data_repo / "version.json").read_text(encoding="utf-8")
                ).get("version")
            except (OSError, json.JSONDecodeError, AttributeError) as exc:
                raise PublishError(f"Invalid data-palworld version.json: {exc}") from exc
            if stamped != expected:
                raise PublishError(
                    f"Stale data-palworld version.json: stamped {stamped!r}, expected {expected!r}. "
                    "Re-run the emitting stage, commit the stamp, and retry this command."
                )
            self.report.expected_data_version = expected
            self.documents = load_local_documents(self.config.data_repo)
            self.references = collect_asset_references(self.documents)
            validate_local_assets(self.config.resource_repo, self.references)
            self.report.referenced_assets = len(self.references)
            self.log(
                f"Ready: resource commits={len(self.resource_state.commits)}, "
                f"data commits={len(self.data_state.commits)}, assets={len(self.references)}, "
                f"data version={expected}"
            )

            if self.config.dry_run:
                self.verify_dry_run()
            else:
                execute_release_steps(
                    resource_pending=self.resource_state.pending,
                    data_pending=self.data_state.pending,
                    push_resource=lambda: self._push_stage(self.resource_state, "push resource"),
                    verify_resource=self.verify_resource_stage,
                    push_data=lambda: self._push_stage(self.data_state, "push data"),
                    verify_data=self.verify_data_stage,
                )

            self.report.status = "success"
            self.report.phase = "complete"
            return self.report
        except PublishError as exc:
            self.report.status = "failed"
            self.report.error = str(exc)
            raise
        except Exception as exc:
            self.report.status = "failed"
            self.report.error = f"Unexpected {type(exc).__name__}: {exc}"
            raise PublishError(self.report.error) from exc
        finally:
            if self.resource_state is not None:
                self.report.resource = self._repo_report(self.resource_state)
            if self.data_state is not None:
                self.report.data = self._repo_report(self.data_state)

    def _push_stage(self, state: RepoState, phase: str) -> None:
        self.phase(phase)
        self.push_repo(state)


def render_report(report: ReleaseReport, json_output: bool) -> None:
    payload = asdict(report)
    if json_output:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
        return
    print("\nPalworld publish summary")
    print(f"Status: {report.status}")
    print(f"Final phase: {report.phase}")
    if report.expected_data_version:
        print(f"Data version: {report.expected_data_version}")
    print(f"Referenced assets: {report.referenced_assets}")
    for name, repo in (("resource-palworld", report.resource), ("data-palworld", report.data)):
        if not repo:
            continue
        print(f"{name}: {repo.get('head', '')[:12]} | {repo.get('push')} | {repo.get('online')}")
        for commit in repo.get("pendingCommits", []):
            print(f"  {commit}")
    if report.error:
        print(f"Error: {report.error}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m palworld.publish",
        description="Publish resource-palworld before data-palworld and verify both online.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Run release gates without pushing")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Print JSON summary")
    parser.add_argument("--proxy", default=os.environ.get("PALWORLD_PUBLISH_PROXY"))
    parser.add_argument("--data-repo", type=Path)
    parser.add_argument("--resource-repo", type=Path)
    parser.add_argument("--data-url", default=DATA_URL)
    parser.add_argument("--resource-url", default=RESOURCE_URL)
    parser.add_argument("--deployment-timeout", type=float, default=600.0)
    parser.add_argument("--request-timeout", type=float, default=20.0)
    parser.add_argument("--poll-interval", type=float, default=2.0)
    parser.add_argument("--workers", type=int, default=24)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = PublishConfig(
        data_repo=args.data_repo or require_dir("PALWORLD_DATA_OUT"),
        resource_repo=args.resource_repo or require_dir("PALWORLD_RES_OUT"),
        data_url=args.data_url,
        resource_url=args.resource_url,
        proxy=args.proxy,
        deployment_timeout=args.deployment_timeout,
        request_timeout=args.request_timeout,
        poll_interval=args.poll_interval,
        workers=max(1, args.workers),
        dry_run=args.dry_run,
        json_output=args.json_output,
    )
    publisher = Publisher(config)
    try:
        try:
            report = publisher.run()
        except PublishError:
            report = publisher.report
            render_report(report, config.json_output)
            return 1
        render_report(report, config.json_output)
        return 0
    finally:
        publisher.close()


if __name__ == "__main__":
    sys.exit(main())
