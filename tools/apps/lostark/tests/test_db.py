import sqlite3

import pytest

from lostark.db import Tables, rows


def _make_db(path, name, cols, data):
    con = sqlite3.connect(path)
    con.execute(f"CREATE TABLE {name} ({','.join(cols)})")
    con.executemany(f"INSERT INTO {name} VALUES ({','.join('?' * len(cols))})", data)
    con.commit()
    con.close()


def test_rows_returns_dicts(tmp_path):
    db = tmp_path / "EFTable_Demo.db"
    _make_db(db, "Demo", ["A", "B"], [(1, 2), (3, 4)])
    assert list(rows(db, "Demo")) == [{"A": 1, "B": 2}, {"A": 3, "B": 4}]


def test_tables_resolves_by_stem(tmp_path):
    _make_db(tmp_path / "EFTable_Demo.db", "Demo", ["A"], [(9,)])
    assert [r["A"] for r in Tables(tmp_path).read("Demo")] == [9]


def test_missing_table_raises_with_the_name(tmp_path):
    with pytest.raises(FileNotFoundError, match="EFTable_Nope.db"):
        list(Tables(tmp_path).read("Nope"))


def test_open_is_read_only(tmp_path):
    db = tmp_path / "EFTable_Demo.db"
    _make_db(db, "Demo", ["A"], [(1,)])
    with Tables(tmp_path).connect("Demo") as con:
        with pytest.raises(sqlite3.OperationalError):
            con.execute("INSERT INTO Demo VALUES (2)")


def test_read_accepts_an_explicit_table_name(tmp_path):
    # GameMsg holds one table per language, so the stem is not the table name.
    db = tmp_path / "EFTable_Multi.db"
    _make_db(db, "Multi_Chinese", ["KEY", "MSG"], [("k", "v")])
    assert [r["MSG"] for r in Tables(tmp_path).read("Multi", "Multi_Chinese")] == ["v"]
