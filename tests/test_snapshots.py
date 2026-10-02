from dataclasses import replace

import httpx

from trailhead import snapshots
from trailhead.config import load_settings
from trailhead.store import Store


def _fake_storage(monkeypatch):
    objects: dict[str, bytes] = {}

    def handle(req: httpx.Request) -> httpx.Response:
        assert req.headers["apikey"] == "service-key"
        path = req.url.path
        if path == "/storage/v1/bucket":
            return httpx.Response(200, json={"name": "trailhead-repos"})
        if path == "/storage/v1/object/list/trailhead-repos":
            return httpx.Response(200, json=[{"name": n} for n in objects] + [{"name": "../../etc/passwd"}])
        name = path.rsplit("/", 1)[-1]
        if req.method == "POST":
            objects[name] = req.read()
            return httpx.Response(200, json={"Key": name})
        return httpx.Response(200, content=objects[name]) if name in objects else httpx.Response(404)

    real = httpx.Client
    monkeypatch.setattr(snapshots.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handle), **kw))
    return objects


def test_an_onboarded_repository_comes_back_after_the_disk_is_wiped(tmp_path, monkeypatch):
    objects = _fake_storage(monkeypatch)
    base = load_settings(env={"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "service-key"}, env_file=None)
    host = replace(base, data_dir=tmp_path / "before")
    db = host.data_dir / "dbs" / "acme__widget.db"
    store = Store(db)
    store.set_meta("repo", "acme/widget")
    store.close()
    assert snapshots.save(host, db) == ""
    assert list(objects) == ["acme__widget.db.gz"]

    fresh = replace(base, data_dir=tmp_path / "after")
    written = snapshots.restore(fresh, log=lambda *a, **k: None)
    assert written == [str(fresh.data_dir / "dbs" / "acme__widget.db")]
    assert Store(written[0]).get_meta("repo") == "acme/widget"
    assert snapshots.restore(fresh, log=lambda *a, **k: None) == []  # already on disk


def test_nothing_happens_without_a_service_key(tmp_path):
    settings = replace(load_settings(env={"SUPABASE_URL": "https://x.supabase.co"}, env_file=None), data_dir=tmp_path)
    assert not snapshots.enabled(settings)
    assert snapshots.restore(settings) == []
