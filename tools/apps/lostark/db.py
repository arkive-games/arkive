"""Read-only access to the EFTable_*.db SQLite files.

``lostark-explorer`` decrypts the client archives into one SQLite file per game
table. Each file holds exactly one table whose name is the file stem minus the
``EFTable_`` prefix — except ``GameMsg``, which holds one table per language, so
:meth:`Tables.read` accepts an explicit table name.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


def _connect_ro(path: Path) -> sqlite3.Connection:
    """Open ``path`` read-only. The extraction is a source tree; nothing here writes."""
    if not path.exists():
        raise FileNotFoundError(f"no such table file: {path.name} (looked in {path.parent})")
    con = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def rows(path: Path, table: str) -> Iterator[dict]:
    """Every row of ``table`` in ``path``, as dicts."""
    con = _connect_ro(path)
    try:
        for row in con.execute(f'SELECT * FROM "{table}"'):
            yield dict(row)
    finally:
        con.close()


class Tables:
    """The ``ClientData/TableData`` directory of an extracted client."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def path(self, name: str) -> Path:
        return self.root / f"EFTable_{name}.db"

    @contextmanager
    def connect(self, name: str) -> Iterator[sqlite3.Connection]:
        con = _connect_ro(self.path(name))
        try:
            yield con
        finally:
            con.close()

    def read(self, name: str, table: str | None = None) -> Iterator[dict]:
        yield from rows(self.path(name), table or name)
