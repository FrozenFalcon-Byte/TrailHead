from __future__ import annotations

from trailhead.tour import Candidate, Stop, Tour, TourPlanner, import_order, similar_changes, tour_from_dict, tour_to_dict
from trailhead.picker import composite, pick_issues
from trailhead.navigate import RepoTree
from test_annotate import seeded


def test_import_order_puts_dependencies_first_then_priority():
    imports = {("a.py", "b.py"), ("b.py", "c.py"), ("x.py", "a.py")}
    assert import_order(["a.py", "b.py", "c.py"], imports, {"a.py": 0.9, "b.py": 0.5, "c.py": 0.1}) == ["c.py", "b.py", "a.py"]
    assert import_order(["p.py", "q.py"], set(), {"p.py": 0.2, "q.py": 0.8}) == ["q.py", "p.py"]
    cyclic = {("a.py", "b.py"), ("b.py", "a.py")}
    assert sorted(import_order(["a.py", "b.py"], cyclic, {"a.py": 1.0})) == ["a.py", "b.py"]


def test_similar_changes_respects_cutoff_and_exclusions():
    store = seeded()
    store.execute("INSERT INTO links VALUES ('pr:2','issue:1','fixes')")
    store.execute("INSERT INTO evidence_fts (ref, kind, title, body) VALUES ('issue:1','issue','Retry off by one','Steps')")
    found = similar_changes(store, "retry off by one", {"pkg/core.py"})
    assert found["pkg/core.py"][1] == ["pr:2"]
    assert similar_changes(store, "retry off by one", {"pkg/core.py"}, exclude=["pr:2"]) == {}
    assert similar_changes(store, "retry off by one", {"pkg/core.py"}, as_of=0.5) == {}


class FakeCtx:
    def __init__(self, store):
        self.store = store

    def tree(self, **_):
        return RepoTree(self.store, include_tests=False, include_docs=False)


def planner(store, engine):
    store.execute("INSERT INTO files VALUES ('pkg/util.py','python',5,50,0,'Helpers.','Helpers.')")
    store.execute("INSERT INTO files VALUES ('pkg/other.py','python',5,50,0,'Other.','Other.')")
    store.execute("INSERT INTO imports VALUES ('pkg/core.py','pkg/util.py')")
    return TourPlanner(FakeCtx(store), engine)


async def test_plan_judges_the_pool_in_one_request_and_replans_without_asking(scripted):
    store = seeded()
    def decide(state, qid, q):
        if qid.startswith("in_"):
            return {"c0": 1.0} if "core.py" in str(q.criteria) or "pkg/" in str(q.criteria) else None
        if qid.startswith("need_"):
            files = state["files"]
            path = files[qid.split("_")[1].upper()].split(":")[0]
            return {"pkg/core.py": 0.9, "pkg/util.py": 0.7, "pkg/other.py": 0.3}[path]
        return 0.2
    engine = scripted(decide)
    p = planner(store, engine)
    tour = await p.plan("fix the retry counter", notes=True)
    tour_calls = [c for c in engine.calls if any(k.startswith("need_") for k in c[1])]
    assert len(tour_calls) == 1
    assert tour.files[:2] == ["pkg/util.py", "pkg/core.py"]  # util is imported by core, so it is read first
    assert all(s.why for s in tour.stops) and tour.stops[1].look_at == ["run"]
    calls = len(engine.calls)
    await p.replan(tour, {"pkg/util.py": "known"})
    assert "pkg/util.py" not in tour.files and len(engine.calls) == calls
    assert tour.events[-1]["removed"] == ["pkg/util.py"]
    again = tour_from_dict(tour_to_dict(tour))
    assert again.files == tour.files and again.skipped == {"pkg/util.py": "known"}


def test_composite_weights_and_kind_penalty():
    good = {"scope_clarity": "3.000", "prior_knowledge_needed": "0.000", "has_acceptance_criteria": "1.0", "touches_single_area": "1.0", "kind": "bug_fix"}
    score, parts = composite(good, [])
    assert score == 1.0 and parts["prior_knowledge_needed"] == 1.0
    assert composite({**good, "kind": "question"}, [])[0] == 0.5
    assert composite(good, ["good first issue"])[0] == 1.05


async def test_pick_issues_ranks_by_composite(scripted):
    store = seeded()
    store.execute("INSERT INTO issues (number,is_pr,title,body,state,labels,author,created_at,merged) VALUES (3,0,'Vague','hmm','open','[]','c','2024-02-01',0)")
    store.execute("INSERT INTO issues (number,is_pr,title,body,state,labels,author,created_at,merged) VALUES (4,0,'Clear','Change x in y','open','[]','c','2024-02-01',0)")
    def decide(state, qid, q):
        clear = "Clear" in state
        return {"scope_clarity": 3 if clear else 0, "prior_knowledge_needed": 0 if clear else 3, "has_acceptance_criteria": 0.9 if clear else 0.1,
                "touches_single_area": 0.9 if clear else 0.2, "kind": "bug_fix"}.get(qid)
    picks = await pick_issues(store, scripted(decide), "scripted", numbers=[3, 4])
    assert [p.number for p in picks] == [4, 3] and picks[0].score > 0.9


async def test_tentative_stops_follow_confident_ones_even_when_imported(scripted):
    store = seeded()
    def decide(state, qid, q):
        if qid.startswith("need_"):
            path = state["files"][qid.split("_")[1].upper()].split(":")[0]
            return {"pkg/core.py": 0.9, "pkg/util.py": 0.3, "pkg/other.py": 0.2}[path]
        return {"c0": 1.0} if qid.startswith("in_") else 0.2
    tour = await planner(store, scripted(decide)).plan("fix the retry counter", notes=False)
    assert tour.files[0] == "pkg/core.py" and tour.stops[1].tentative
