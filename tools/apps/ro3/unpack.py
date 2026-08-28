"""Write Ragnarok Online 3's bundles out as ordinary, standard UnityFS files.

This is the seam. Upstream of it the game's art lives behind FairGuard's block-0
obfuscation (:mod:`.keygen`) inside RO3V containers (:mod:`.vfs`); downstream of it there
is a directory of plain Unity asset bundles that ``unex``, AssetStudio, AssetRipper or
anything else opens with no knowledge that either format exists.

Each output file is a **byte-identical copy** of the sub-file except for the first
``min(len(block0), 1280)`` bytes of block 0, which are de-XOR-ed. Nothing is repacked, so
hashes, block boundaries, node tables and every other block survive untouched.

Layout of the staging directory mirrors the game's own sharding, with one directory per
container so that the 2,619 sub-file ids that repeat across containers cannot collide::

    <stage>/<shard>/<container-stem>/<index:05d>_<id-hex>.bundle

Bare (uncontained) ``UnityFS`` files keep their own name under their shard.

Verification is on by default: block 0 of an LZ4-compressed bundle must decompress to
exactly its declared uncompressed size, which a wrong keystream will not do. Failures are
counted and reported, never written.

Usage::

    uv run python -m ro3.unpack                     # everything
    uv run python -m ro3.unpack --limit 200         # a bounded sample
    uv run python -m ro3.unpack --workers 8         # one emulator per process
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from .bundle import BundleError, lz4_block_decompress, parse
from .env import optional_dir, require_dir
from .keygen import decrypt_block0
from .vfs import UNITYFS_MAGIC, classify, read_index

MANIFEST = "unpack-manifest.json"


def stage_dir() -> Path:
    """Where decrypted bundles go: ``RO3_STAGE``, else ``RO3_RAW/decrypted``."""
    explicit = optional_dir("RO3_STAGE")
    return explicit if explicit is not None else require_dir("RO3_RAW") / "decrypted"


def vfs_root() -> Path:
    return require_dir("RO3_GAME") / "StreamingAssets" / "VFS"


@dataclass
class Stats:
    containers: int = 0
    bare: int = 0
    written: int = 0
    skipped_nonunity: int = 0
    verified: int = 0
    failed: int = 0
    bytes_out: int = 0
    failures: list[str] = field(default_factory=list)

    def merge(self, other: "Stats") -> None:
        self.containers += other.containers
        self.bare += other.bare
        self.written += other.written
        self.skipped_nonunity += other.skipped_nonunity
        self.verified += other.verified
        self.failed += other.failed
        self.bytes_out += other.bytes_out
        self.failures.extend(other.failures[: max(0, 20 - len(self.failures))])


def decrypt_image(image: bytes, *, verify: bool = True) -> bytes:
    """One UnityFS sub-file, with block 0 deobfuscated. Raises on a failed verification."""
    info = parse(image)
    start, end = info.block0_span
    if end > len(image):
        raise BundleError(f"block 0 runs to {end} but the image is {len(image)} bytes")
    plain = decrypt_block0(image[start:end])
    if verify and info.blocks[0].compression in (2, 3):
        # LZ4 as an oracle: the decoder consumes the whole input and must land exactly on
        # the declared size. Random bytes essentially never do.
        lz4_block_decompress(plain, info.blocks[0].uncompressed_size)
    return image[:start] + plain + image[end:]


def _relative_target(stage: Path, source: Path, root: Path, index: int | None,
                     ident: int | None) -> Path:
    """Where one image lands under the stage.

    Everything is given a ``.bundle`` name, including the 337 bare bundles the game ships
    under other extensions (``.hd``, ``.ld``, ``.korean``, ...). Those really are UnityFS
    images, and a reader that selects candidates by suffix — unex does — would otherwise
    walk straight past them.
    """
    rel = source.relative_to(root)
    if index is None:
        name = rel.name if rel.suffix == ".bundle" else f"{rel.name}.bundle"
        return stage / rel.parent / name
    return stage / rel.parent / rel.stem / f"{index:05d}_{ident:016x}.bundle"


def unpack_file(path: Path, root: Path, stage: Path, *, verify: bool = True,
                overwrite: bool = False) -> Stats:
    """Decrypt every UnityFS image in one VFS file into the staging directory."""
    stats = Stats()
    with open(path, "rb") as fh:
        head = fh.read(24)
    kind = classify(head)

    if kind == "unityfs":
        stats.bare = 1
        jobs = [(None, None, 0, path.stat().st_size)]
    elif kind == "ro3v":
        stats.containers = 1
        jobs = []
        for i, sl in enumerate(read_index(path)):
            jobs.append((i, sl.id, sl.offset, sl.length))
    else:
        return stats

    raw = path.read_bytes()
    for index, ident, offset, length in jobs:
        image = raw[offset:offset + length]
        if not image.startswith(UNITYFS_MAGIC):
            stats.skipped_nonunity += 1
            continue
        target = _relative_target(stage, path, root, index, ident)
        if target.exists() and not overwrite:
            stats.written += 1
            continue
        try:
            out = decrypt_image(image, verify=verify)
        except Exception as exc:  # noqa: BLE001 - every failure mode is worth counting
            stats.failed += 1
            if len(stats.failures) < 20:
                label = path.name if index is None else f"{path.name}#{index}"
                stats.failures.append(f"{label}: {type(exc).__name__}: {exc}")
            continue
        if verify:
            stats.verified += 1
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".bundle.part")
        tmp.write_bytes(out)
        os.replace(tmp, target)
        stats.written += 1
        stats.bytes_out += len(out)
    return stats


def _worker(args) -> Stats:
    path, root, stage, verify, overwrite = args
    try:
        return unpack_file(path, root, stage, verify=verify, overwrite=overwrite)
    except Exception as exc:  # noqa: BLE001 - a bad container must not kill the run
        stats = Stats()
        stats.failed += 1
        stats.failures.append(f"{path.name}: {type(exc).__name__}: {exc}")
        return stats


def unpack_tree(root: Path, stage: Path, *, limit: int | None = None, verify: bool = True,
                overwrite: bool = False, workers: int = 1,
                match: str | None = None) -> Stats:
    files = sorted(p for p in root.rglob("*") if p.is_file())
    if match:
        files = [p for p in files if match in p.name]
    if limit is not None:
        files = files[:limit]
    stage.mkdir(parents=True, exist_ok=True)

    total = Stats()
    started = time.time()
    jobs = [(p, root, stage, verify, overwrite) for p in files]
    if workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            for i, stats in enumerate(pool.map(_worker, jobs, chunksize=8), 1):
                total.merge(stats)
                _progress(i, len(files), total, started)
    else:
        for i, job in enumerate(jobs, 1):
            total.merge(_worker(job))
            _progress(i, len(files), total, started)
    print()
    return total


def _progress(done: int, total_files: int, stats: Stats, started: float) -> None:
    if done % 100 and done != total_files:
        return
    elapsed = time.time() - started
    rate = done / elapsed if elapsed else 0
    sys.stdout.write(
        f"\r{done}/{total_files} files  {stats.written} bundles  "
        f"{stats.failed} failed  {stats.bytes_out / 1e9:.2f} GB  "
        f"{rate:.1f} files/s  {elapsed:.0f}s"
    )
    sys.stdout.flush()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=None, help="staging directory")
    ap.add_argument("--limit", type=int, default=None, help="only the first N VFS files")
    ap.add_argument("--match", default=None, help="only VFS files whose name contains this")
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--no-verify", action="store_true",
                    help="skip the LZ4 oracle (faster, and blind)")
    args = ap.parse_args()

    root = vfs_root()
    stage = args.out or stage_dir()
    print(f"source : {root}")
    print(f"stage  : {stage}")
    stats = unpack_tree(root, stage, limit=args.limit, verify=not args.no_verify,
                        overwrite=args.overwrite, workers=args.workers, match=args.match)

    print(f"containers      : {stats.containers}")
    print(f"bare bundles    : {stats.bare}")
    print(f"bundles written : {stats.written}")
    print(f"LZ4-verified    : {stats.verified}")
    print(f"non-Unity skips : {stats.skipped_nonunity}")
    print(f"failures        : {stats.failed}")
    for line in stats.failures:
        print(f"  {line}")
    print(f"bytes written   : {stats.bytes_out / 1e9:.2f} GB")

    (stage / MANIFEST).write_text(json.dumps({
        "source": str(root),
        "containers": stats.containers,
        "bareBundles": stats.bare,
        "bundlesWritten": stats.written,
        "lz4Verified": stats.verified,
        "nonUnitySkipped": stats.skipped_nonunity,
        "failures": stats.failed,
        "failureExamples": stats.failures,
        "bytesWritten": stats.bytes_out,
    }, indent=1), encoding="utf-8")
    return 1 if stats.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
