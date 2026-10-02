from dataclasses import replace

from trailhead import repos
from trailhead.config import load_settings
from trailhead.store import Store


def test_a_repository_being_ingested_is_listed_once_as_running(tmp_path, monkeypatch):
    data = tmp_path / "data"
    store = Store(data / "dbs" / "acme__widget.db")
    store.set_meta("repo", "acme/widget")
    store.close()
    settings = replace(load_settings(env={}, env_file=None), data_dir=data)
    monkeypatch.setattr(repos, "_jobs", {"acme/widget": {"status": "running", "started": 0, "error": ""}})
    assert [(r["repo"], r["status"]) for r in repos.list_repos(settings)] == [("acme/widget", "running")]
    repos._jobs["acme/widget"]["status"] = "done"
    assert [(r["repo"], r["status"]) for r in repos.list_repos(settings)] == [("acme/widget", "ready")]
