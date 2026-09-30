from __future__ import annotations

import math

import pytest

from trailhead.decisions.types import Choice
from trailhead.navigate import EPSILON, NavPath, Navigator, RepoTree
from trailhead.obs.log import DecisionLog
from trailhead.store import Store

FILES = {
    "README.md": "Project readme.",
    "pkg/__init__.py": "Package root.",
    "pkg/core/engine.py": "Runs the crawl loop.",
    "pkg/core/scheduler.py": "Queues requests.",
    "pkg/http/retry.py": "Retries failed requests.",
    "pkg/http/cookies.py": "Cookie jar handling.",
    "tests/test_retry.py": "Tests.",
    ".github/workflows/ci.yml": "",
}


def seeded(files: dict[str, str] = FILES) -> Store:
    store = Store(":memory:")
    for path, summary in files.items():
        lang = "markdown" if path.endswith(".md") else "python"
        store.execute("INSERT INTO files VALUES (?,?,?,?,?,?,?)", (path, lang, 1, 1, int(path.startswith("tests/")), "", summary))
    store.executemany("INSERT INTO dirs VALUES (?,?)", [("pkg", "The package."), ("pkg/http", "HTTP helpers."), ("pkg/core", "Core.")])
    return store


def by_name(weights: dict[str, float]):
    """Decider that weights options by the entry name at the start of each option description."""

    def decide(state, qid, question: Choice):
        out = {}
        for key, text in question.criteria.items():
            name = text.split(":")[0].rstrip("/")
            out[key] = weights.get(name, 0.0)
        return out

    return decide


def test_tree_hides_dot_paths_and_filters_tests():
    tree = RepoTree(seeded(), include_tests=False)
    assert [n.name for n in tree.children("")] == ["README.md", "pkg"]
    assert [n.id for n in tree.children("pkg")] == ["pkg/__init__.py", "pkg/core", "pkg/http"]
    assert tree.node("pkg/http").summary == "HTTP helpers." and "tests/test_retry.py" not in tree.files()
    assert "tests/test_retry.py" in RepoTree(seeded()).files()


def test_path_score_is_geometric_mean_with_floor():
    assert NavPath(["", "a", "a/b"], [0.9, 0.4], True).score == pytest.approx(math.sqrt(0.36))
    assert NavPath(["", "a"], [0.0], True).score == pytest.approx(EPSILON)


async def test_beam_recovers_where_greedy_commits_to_the_wrong_branch(scripted):
    # core looks slightly better than http at depth 1, but nothing inside core fits the goal.
    weights = {"pkg": 0.9, "README.md": 0.1, "core": 0.55, "http": 0.45, "engine.py": 0.2, "scheduler.py": 0.2, "retry.py": 0.95, "cookies.py": 0.05}
    engine = scripted(by_name(weights), log=DecisionLog(":memory:"))
    nav = Navigator(RepoTree(seeded(), include_tests=False), engine, beam_width=2)

    beam = await nav.search("where are failed requests retried?")
    assert beam.files[0] == "pkg/http/retry.py"
    assert beam.paths[0].nodes == ["", "pkg", "pkg/http", "pkg/http/retry.py"]
    assert beam.requests == 3 and beam.separation_ratio and beam.separation_ratio > 1
    # depth 2 asked about both open directories in one request, with the goal as the only state
    state, questions = engine.calls[2]
    assert state == {"goal": "where are failed requests retried?"} and set(questions) == {"in_pkg_core", "in_pkg_http"}
    assert all(set(q.criteria) == {"c0", "c1", "none"} for q in questions.values())
    actions = {(r["question_id"], r["action"]) for r in engine.log.recent(20)}
    assert ("in_root", "expanded: pkg, README.md") in actions and any(a.startswith("expanded: retry.py") for _, a in actions)

    greedy = await nav.greedy("where are failed requests retried?")
    assert greedy.files == ["pkg/core/engine.py"] and greedy.separation_ratio is None
    assert greedy.requests == 0 and greedy.reused_steps == 3  # every node greedy opens was already asked about by beam


async def test_wide_directories_are_chunked_then_shortlisted(scripted):
    files = {f"pkg/m{i:03d}.py": f"Module {i}." for i in range(25)}
    engine = scripted(by_name({"pkg": 1.0, "m017.py": 0.8, "m003.py": 0.2}))
    nav = Navigator(RepoTree(seeded(files)), engine, beam_width=2, chunk_size=10)
    result = await nav.search("module seventeen")
    assert result.files[0] == "pkg/m017.py" and result.requests == 3  # root, chunks, shortlist
    assert set(engine.calls[1][1]) == {"in_pkg_part_00", "in_pkg_part_01", "in_pkg_part_02"}
    assert all(len(q.criteria) <= 11 for q in engine.calls[1][1].values())
    assert result.steps[-1].shortlisted_from == 25


async def test_symbol_pick_is_one_fanout_request(scripted):
    store = seeded()
    store.executemany(
        "INSERT INTO symbols (path,name,kind,signature,doc,start_line,end_line) VALUES (?,?,?,?,?,?,?)",
        [("pkg/http/retry.py", "RetryMiddleware", "class", "class RetryMiddleware", "Retries.", 10, 50),
         ("pkg/http/retry.py", "get_retry_request", "function", "def get_retry_request(request)", "", 60, 80)],
    )
    weights = {"pkg": 1, "http": 1, "retry.py": 1}

    def decide(state, qid, question):
        return {"c1": 0.7, "c0": 0.2, "none": 0.1} if qid.startswith("symbol_") else by_name(weights)(state, qid, question)

    nav = Navigator(RepoTree(store, include_tests=False), scripted(decide), beam_width=1)
    result = await nav.search("retry helper", symbol_store=store)
    assert result.symbols == {"pkg/http/retry.py": {"name": "get_retry_request", "line": 60, "probability": pytest.approx(0.7)}}
