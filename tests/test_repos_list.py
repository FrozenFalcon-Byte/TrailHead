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


def test_stopping_a_first_ingest_leaves_nothing_behind(tmp_path, monkeypatch):
    import threading
    import time

    from trailhead.ingest import pipeline

    settings = replace(load_settings(env={}, env_file=None), data_dir=tmp_path / "data")
    monkeypatch.setattr(repos, "_jobs", {})
    gate = threading.Event()

    def slow_ingest(target, repo, *, progress, **_):
        Store(target.db_path).set_meta("repo", repo)
        progress("Cloning the repository")
        gate.wait(5)
        progress("Reading the code tree")  # raises once stop was asked for
        raise AssertionError("should have stopped")

    monkeypatch.setattr(pipeline, "ingest", slow_ingest)
    repos.start_ingest(settings, "acme/widget")
    assert repos.stop_ingest("acme/widget")["step"] == "Stopping"
    gate.set()
    for _ in range(100):
        if repos._jobs["acme/widget"]["status"] != "running":
            break
        time.sleep(0.02)
    assert repos._jobs["acme/widget"]["status"] == "cancelled"
    assert repos.list_repos(settings) == []
    assert not repos.db_for(settings, "acme/widget").exists()


def test_a_long_github_rate_limit_fails_fast_instead_of_sleeping():
    import httpx
    import pytest

    from trailhead.ingest.github import GitHub, GitHubRateLimited

    def handler(request):
        return httpx.Response(403, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(int(__import__("time").time()) + 3000)})

    with pytest.raises(GitHubRateLimited):
        GitHub("", transport=httpx.MockTransport(handler))._get("https://api.github.com/x")


def test_removing_a_repository_takes_it_off_the_shelf_but_keeps_the_bundled_one(tmp_path, monkeypatch):
    import pytest

    data = tmp_path / "data"
    for path, name in ((data / "trailhead.db", "scrapy/scrapy"), (data / "dbs" / "acme__widget.db", "acme/widget")):
        store = Store(path)
        store.set_meta("repo", name)
        store.close()
    settings = replace(load_settings(env={}, env_file=None), data_dir=data)
    monkeypatch.setattr(repos, "_jobs", {})
    listed = {r["repo"]: r["removable"] for r in repos.list_repos(settings)}
    assert listed == {"scrapy/scrapy": False, "acme/widget": True}
    assert repos.remove_repo(settings, "acme/widget")["status"] == "removed"
    assert [r["repo"] for r in repos.list_repos(settings)] == ["scrapy/scrapy"]
    with pytest.raises(ValueError):
        repos.remove_repo(settings, "scrapy/scrapy")


def test_an_update_keeps_the_repository_on_the_shelf_while_it_runs(tmp_path, monkeypatch):
    import threading
    import time

    from trailhead.ingest import pipeline

    data = tmp_path / "data"
    store = Store(data / "trailhead.db")
    store.set_meta("repo", "acme/widget")
    store.close()
    settings = replace(load_settings(env={}, env_file=None), data_dir=data)
    monkeypatch.setattr(repos, "_jobs", {})
    gate = threading.Event()

    def slow_ingest(target, repo, *, progress, **_):
        progress("Reading the commit history")
        gate.wait(5)
        return {}

    monkeypatch.setattr(pipeline, "ingest", slow_ingest)
    repos.start_ingest(settings, "acme/widget")
    time.sleep(0.05)
    [listed] = repos.list_repos(settings)
    assert (listed["status"], listed["updating"]) == ("ready", "Reading the commit history")
    gate.set()
    for _ in range(50):
        if repos._jobs["acme/widget"]["status"] == "done":
            break
        time.sleep(0.02)
    [listed] = repos.list_repos(settings)
    assert listed["updating"] == "" and listed["updated_at"] > 0
