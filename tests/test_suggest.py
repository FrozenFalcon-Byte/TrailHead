from trailhead.store import Store
from trailhead.suggest import suggestions


def test_starters_name_the_open_repository_and_nothing_else(tmp_path):
    store = Store(tmp_path / "r.db")
    store.conn.executemany("INSERT INTO files VALUES (?, 'python', 100, 1000, ?, '', '')", [("pkg/core.py", 0), ("pkg/use.py", 0), ("tests/test_core.py", 1)])
    store.conn.executemany("INSERT INTO imports VALUES (?, ?)", [("pkg/use.py", "pkg/core.py"), ("tests/test_core.py", "pkg/core.py")])
    store.conn.executemany("INSERT INTO symbols (path, name, kind, signature, doc, start_line, end_line) VALUES ('pkg/core.py', ?, ?, '', '', 1, ?)",
                           [("Ledger", "class", 80), ("Ledger.post_entry", "method", 30), ("_hidden", "function", 90)])
    store.conn.executemany("INSERT INTO dirs VALUES (?, '')", [("pkg",), ("tests",)])
    store.conn.commit()
    s = suggestions(store)
    assert s["ask"][0] == "How does Ledger work?"
    assert "What breaks if I change Ledger.post_entry?" in s["ask"]
    assert "How do I run the test suite?" in s["ask"]
    assert "The code that handles post entry" in s["find"]
    assert not any("_hidden" in q or "tests/" in q for qs in s.values() for q in qs)


def test_an_empty_index_gives_no_starters(tmp_path):
    assert suggestions(Store(tmp_path / "e.db")) == {"ask": [], "find": [], "tour": []}
