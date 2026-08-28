"""Index every staged bundle: which classes it holds, and what they are called.

The game names nothing on disk — bundles are hash-named, and the one entry in each
``AssetBundle``'s container map is the literal string ``asset``, so there are no
``Assets/...`` paths to read. Object ``m_Name`` values are all there is, and they turn out
to be enough: ``Model_Boss_BloodyKnightHigh_LOD0``, ``Icon_Skill_...``,
``territorywars_bg_cart01``.

The output is one JSON-lines file, ``catalog.jsonl``, one record per bundle::

    {"bundle": "e8/00152_e8d00087546fa3d9.bundle",
     "objects": [{"pathId": 2, "class": "Texture2D", "name": "territorywars_bg_cart01"}]}

That is what the export stages query, so a selection can be re-derived and diffed without
re-reading 13 GB.

Usage::

    uv run python -m ro3.catalog --workers 8
    uv run python -m ro3.catalog --grep icon_skill --limit 40
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from .serialized import index_bundle
from .unpack import stage_dir

CATALOG = "catalog.jsonl"

#: Classes worth recording. Everything else is structure (Transform, GameObject, ...) and
#: would triple the index without adding a way to find anything.
KEEP = {
    "Texture2D", "Sprite", "SpriteAtlas", "Mesh", "TextAsset", "AnimationClip",
    "Material", "MonoBehaviour", "Font", "AudioClip",
}


def _scan(args) -> tuple[str, list[dict], str | None]:
    path, stage = args
    rel = Path(path).relative_to(stage).as_posix()
    try:
        entries = index_bundle(Path(path))
    except Exception as exc:  # noqa: BLE001 - a bad bundle is a data point, not a crash
        return rel, [], f"{type(exc).__name__}: {exc}"
    objects = [
        {"pathId": e.path_id, "class": e.class_name, "name": e.name}
        for e in entries
        if e.class_name in KEEP and e.name
    ]
    return rel, objects, None


def build(stage: Path, out: Path, *, workers: int = 1, limit: int | None = None) -> dict:
    files = sorted(stage.rglob("*.bundle"))
    if limit is not None:
        files = files[:limit]
    jobs = [(str(p), stage) for p in files]
    classes: Counter[str] = Counter()
    failures: list[str] = []
    started = time.time()
    named = 0

    with open(out, "w", encoding="utf-8") as fh:
        def emit(i, rel, objects, error):
            nonlocal named
            if error:
                if len(failures) < 30:
                    failures.append(f"{rel}: {error}")
                return
            for o in objects:
                classes[o["class"]] += 1
            named += len(objects)
            if objects:
                fh.write(json.dumps({"bundle": rel, "objects": objects},
                                    ensure_ascii=False) + "\n")

        if workers > 1:
            with ProcessPoolExecutor(max_workers=workers) as pool:
                for i, (rel, objects, error) in enumerate(
                    pool.map(_scan, jobs, chunksize=64), 1
                ):
                    emit(i, rel, objects, error)
                    _progress(i, len(files), named, len(failures), started)
        else:
            for i, job in enumerate(jobs, 1):
                emit(i, *_scan(job))
                _progress(i, len(files), named, len(failures), started)
    print()
    return {
        "bundles": len(files),
        "namedObjects": named,
        "classes": dict(classes.most_common()),
        "failures": len(failures),
        "failureExamples": failures,
    }


def _progress(done: int, total: int, named: int, failed: int, started: float) -> None:
    if done % 5000 and done != total:
        return
    elapsed = time.time() - started
    sys.stdout.write(
        f"\r{done}/{total} bundles  {named} named objects  {failed} failed  {elapsed:.0f}s"
    )
    sys.stdout.flush()


def load(path: Path):
    """Iterate the catalog: ``(bundle, object)`` pairs."""
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            record = json.loads(line)
            for obj in record["objects"]:
                yield record["bundle"], obj


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--stage", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--grep", default=None,
                    help="do not rebuild; search the existing catalog (case-insensitive regex)")
    ap.add_argument("--class", dest="klass", default=None, help="restrict --grep to a class")
    ap.add_argument("--print-limit", type=int, default=40)
    args = ap.parse_args()

    stage = args.stage or stage_dir()
    out = args.out or stage / CATALOG

    if args.grep:
        pattern = re.compile(args.grep, re.IGNORECASE)
        shown = 0
        total = 0
        for bundle, obj in load(out):
            if args.klass and obj["class"] != args.klass:
                continue
            if not pattern.search(obj["name"]):
                continue
            total += 1
            if shown < args.print_limit:
                print(f"{obj['class']:<14} {obj['name']:<52} {bundle}")
                shown += 1
        print(f"-- {total} matches")
        return 0

    stats = build(stage, out, workers=args.workers, limit=args.limit)
    print(f"bundles       : {stats['bundles']}")
    print(f"named objects : {stats['namedObjects']}")
    print(f"failures      : {stats['failures']}")
    for line in stats["failureExamples"][:10]:
        print(f"  {line}")
    print("classes:")
    for name, count in stats["classes"].items():
        print(f"  {name:<16} {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
