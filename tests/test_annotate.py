from __future__ import annotations

from trailhead.annotate import annotate, commit_state, file_state, issue_state, pr_state, size_bucket
from trailhead.store import Store


def seeded() -> Store:
    store = Store(":memory:")
    store.execute("INSERT INTO files VALUES ('pkg/core.py','python',10,100,0,'Core logic.','Core logic. Defines run.')")
    store.execute("INSERT INTO files VALUES ('tests/test_core.py','python',10,100,1,'','Tests.')")
    store.execute("INSERT INTO symbols (path,name,kind,signature,doc,start_line,end_line) VALUES ('pkg/core.py','run','function','def run(x)','Run it.',1,2)")
    store.execute("INSERT INTO commits VALUES ('abc','ann',1700000000,'Fix retry','Because the counter started at zero, retries ran once too often.',1,2,1,0)")
    store.execute("INSERT INTO commit_files VALUES ('abc','pkg/core.py')")
    store.executemany(
        "INSERT INTO issues (number,is_pr,title,body,state,labels,author,created_at,merged) VALUES (?,?,?,?,?,?,?,?,?)",
        [(1, 0, "Retry off by one", "Steps...", "closed", '["bug","good first issue"]', "a", "2024-01-01", 0),
         (2, 1, "Fix retry counter", "Closes #1. We start the counter at one because zero double counts.", "closed", "[]", "b", "2024-01-02", 1)],
    )
    store.execute("INSERT INTO pr_files VALUES (2,'pkg/core.py')")
    return store


def test_states_are_small_relevant_and_dateless():
    store = seeded()
    assert file_state(store, "pkg/core.py") == "path: pkg/core.py\nlanguage: python\nheader: Core logic.\nsymbols:\n- def run(x)  # Run it."
    commit = commit_state(store, "abc")
    assert "Fix retry" in commit and "size: tiny" in commit and "- pkg/core.py" in commit and "1700000000" not in commit
    assert "changed paths:\n- pkg/core.py" in pr_state(store, 2) and "2024" not in pr_state(store, 2)
    assert "labels: bug, good first issue" in issue_state(store, 1) and "2024" not in issue_state(store, 1)


def test_size_buckets():
    assert size_bucket(1, 3).startswith("tiny") and size_bucket(2, 50) == "small" and size_bucket(10, 300) == "medium" and size_bucket(40, 5000) == "large"


async def test_annotate_is_incremental_and_stores_every_answer(scripted):
    store = seeded()
    engine = scripted(lambda state, qid, q: {"layer": "business_logic", "is_generated": 0.02, "newcomer_difficulty": 2}.get(qid))
    counts = await annotate(store, engine, "scripted", "file")
    assert counts == {"annotated": 2, "failed": 0, "skipped_existing": 0}
    assert [c[0].splitlines()[0] for c in engine.calls] == ["path: pkg/core.py", "path: tests/test_core.py"]  # source before tests
    assert set(engine.calls[0][1]) == {"layer", "role", "is_generated", "exposes_public_api", "newcomer_difficulty"}  # one fan-out request
    layer = store.annotation("file:pkg/core.py", "layer")
    assert layer["value"] == "business_logic" and layer["schema_version"].startswith("v1/file@")
    assert store.annotation("file:pkg/core.py", "is_generated")["value"] == "0.020"
    assert store.annotation("file:pkg/core.py", "newcomer_difficulty")["value"] == "2.000"

    again = await annotate(store, engine, "scripted", "file")
    assert again == {"annotated": 0, "failed": 0, "skipped_existing": 2} and len(engine.calls) == 2

    for kind, ref in (("pr", "pr:2"), ("issue", "issue:1"), ("commit", "commit:abc")):
        assert (await annotate(store, engine, "scripted", kind))["annotated"] == 1
        assert store.annotation(ref, "records_design_decision") is not None
    assert store.annotation("issue:1", "scope_clarity") is not None and store.annotation("pr:2", "scope_clarity") is None
