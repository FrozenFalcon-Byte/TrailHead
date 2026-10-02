import sqlite3
import tarfile
from dataclasses import replace

import pytest

from trailhead import deploy
from trailhead.config import load_settings
from trailhead.store import Store


def test_pack_folds_the_wal_into_one_archive_of_databases(tmp_path):
    data = tmp_path / "data"
    store = Store(data / "trailhead.db")
    store.set_meta("repo", "acme/widget")
    store.set_meta("head", "a" * 40)
    store.close()
    settings = replace(load_settings(env={}, env_file=None), data_dir=data)
    out = deploy.pack(settings, tmp_path / "out" / "snap.tar.gz")
    with tarfile.open(out) as tar:
        assert tar.getnames() == ["trailhead.db"]
        tar.extractall(tmp_path / "unpacked", filter="data")
    con = sqlite3.connect(tmp_path / "unpacked" / "trailhead.db")
    assert dict(con.execute("SELECT key, value FROM meta").fetchall())["repo"] == "acme/widget"


def test_checkout_refuses_anything_but_a_repo_name_and_a_full_sha(tmp_path):
    with pytest.raises(ValueError):
        deploy._checkout("acme/widget; rm -rf /", "a" * 40, tmp_path / "x")
    with pytest.raises(ValueError):
        deploy._checkout("acme/widget", "main", tmp_path / "x")
