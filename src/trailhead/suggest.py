"""Starter questions built from the repository that is open, so Ask, Find and Tour never suggest another project's code.

Everything comes from the index: the files other files import most, the classes and functions inside them, the top
level folders and whether there are tests. Names are inserted into fixed templates, never free text from commits or
issues, so a suggestion cannot carry instructions from the repository into a question.
"""

from __future__ import annotations

import re
from typing import Any

from .store import Store

_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{2,40}$")
_SKIP_DIRS = ("docs/", "doc/", "examples/", "example/", "tests/", "test/", "benchmarks/", "scripts/", ".")
_SETUP = ("pyproject.toml", "setup.py", "package.json", "Makefile", "Cargo.toml", "go.mod", "Dockerfile", "tox.ini")


def _words(name: str) -> str:
    """process_request and processRequest both read as "process request"."""
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name.strip("_")).replace("_", " ")
    return " ".join(spaced.lower().split())


def _source(path: str) -> bool:
    return not path.startswith(_SKIP_DIRS) and "/test" not in path and not path.split("/")[-1].startswith(("test_", "conftest", "__"))


def suggestions(store: Store, n: int = 5) -> dict[str, list[str]]:
    # files ranked by how many other files import them: the core everything else leans on
    central = [r["dst"] for r in store.query("SELECT dst, COUNT(*) AS n FROM imports GROUP BY dst ORDER BY n DESC LIMIT 60")]
    if not central:
        central = [r["path"] for r in store.query("SELECT path FROM files WHERE is_test = 0 ORDER BY loc DESC LIMIT 60")]
    central = [p for p in central if _source(p)]

    classes: list[tuple[str, str]] = []
    funcs: list[tuple[str, str]] = []  # (qualified name, path)
    for path in central[:25]:
        rows = store.query("SELECT name, kind, end_line - start_line AS size FROM symbols WHERE path = ? ORDER BY size DESC", (path,))
        cls = next((r["name"] for r in rows if r["kind"] == "class" and _NAME.match(r["name"]) and not r["name"].startswith("_")), None)
        if cls and len(classes) < 6:
            classes.append((cls, path))
        fn = next((r["name"] for r in rows if r["kind"] in ("function", "method") and all(_NAME.match(p) for p in r["name"].split(".")) and not r["name"].split(".")[-1].startswith("_")), None)
        if fn and len(funcs) < 6:
            funcs.append((fn, path))

    dirs = [r["path"] for r in store.query("SELECT path FROM dirs WHERE path NOT LIKE '%/%' AND path NOT LIKE '.%' ORDER BY path") if r["path"] and _source(r["path"] + "/")]
    weight = {d: sum(p.startswith(d + "/") for p in central) for d in dirs}
    dirs.sort(key=lambda d: -weight[d])
    has_tests = bool(store.query("SELECT 1 FROM files WHERE is_test = 1 LIMIT 1"))
    has_setup = bool(store.query(f"SELECT 1 FROM files WHERE path IN ({','.join('?' * len(_SETUP))}) LIMIT 1", _SETUP))
    stem = lambda p: p.rsplit("/", 1)[-1].rsplit(".", 1)[0]  # noqa: E731

    ask: list[str] = []
    find: list[str] = []
    tour: list[str] = []
    fn_words = [_words(f.split(".")[-1]) for f, _ in funcs]
    if classes:
        ask.append(f"How does {classes[0][0]} work?")
        find.append(f"Where {classes[0][0]} is defined and created")
    if funcs:
        ask.append(f"What breaks if I change {funcs[0][0]}?")
        find.append(f"The code that handles {fn_words[0]}")
    if len(classes) > 1:
        ask.append(f"Why is {classes[1][0]} built the way it is?")
        tour.append(f"I want to understand how {classes[1][0]} fits into the rest of the code.")
    if has_tests:
        ask.append("How do I run the test suite?")
    elif has_setup:
        ask.append("How do I set this up and run it locally?")
    if len(funcs) > 1:
        find.append(f"Where {fn_words[1]} happens")
        tour.append(f"I want to change how {fn_words[1]} works without breaking its callers.")
    if classes:
        tour.append(f"I want to add a feature to {classes[0][0]} in {stem(classes[0][1])}.")
    if dirs:
        ask.append(f"What lives in {dirs[0]}/ and how is it organised?")
        tour.append(f"I want to find my way around {dirs[0]}/ before making a first change.")
    if len(classes) > 2:
        ask.append(f"Where is {classes[2][0]} used, and why there?")
        find.append(f"Where {classes[2][0]} is used")
    for name, path in funcs[2:4]:
        find.append(f"The function {name.split('.')[-1]} in {stem(path)}")
    if has_tests and funcs:
        tour.append(f"I want to write a test for {fn_words[0]}.")

    def pick(items: list[str]) -> list[str]:
        seen: list[str] = []
        for item in items:
            if item not in seen:
                seen.append(item)
        return seen[:n]

    return {"ask": pick(ask), "find": pick(find), "tour": pick(tour)}


def payload(store: Store) -> dict[str, Any]:
    try:
        return suggestions(store)
    except Exception:  # an index from an older schema just means no starters, never a broken page
        return {"ask": [], "find": [], "tour": []}
