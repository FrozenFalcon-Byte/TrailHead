"""History retrieval: FTS5 BM25, link-graph expansion, then one Jev fan-out request that filters and ranks."""

from __future__ import annotations

import re
import time
from pathlib import Path
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Iterable, Sequence

from .decisions import DecisionEngine, Question, load_question_set
from .store import Store, fts_query

MAX_PASSAGE_CHARS = 700
MAX_CODE_CHARS = 2600
KIND_LABEL = {
    "commit": "commit message", "pr": "pull request", "issue": "issue", "comment": "comment", "doc": "documentation",
    "code": "source code", "graph": "import graph",
}


@dataclass
class Evidence:
    ref: str  # commit:<sha> | pr:<n> | issue:<n> | comment:<id> | doc:<id>
    kind: str
    title: str
    text: str
    url: str
    ts: float  # unix time of the item, 0 for documentation
    source: str = "search"  # search | linked | file_history
    label: str = ""  # E1, E2, ... within one retrieval
    relevance: float | None = None
    directness: float | None = None
    injection: float | None = None
    kept: bool = False
    reason: str = ""
    pinned: bool = False  # chosen by an earlier decision (navigation), so only injection screening can drop it

    def passage(self) -> str:
        head = f"[{KIND_LABEL[self.kind]}] {self.title}".strip()
        return f"{head}\n{self.text}".strip()[: MAX_CODE_CHARS if self.kind in ("code", "graph") else MAX_PASSAGE_CHARS]


@dataclass
class Retrieval:
    question: str
    candidates: list[Evidence]
    call_id: str = ""
    requests: int = 0
    input_tokens: int = 0
    latency_ms: float = 0.0
    cached: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def kept(self) -> list[Evidence]:
        return [e for e in self.candidates if e.kept]


def _iso_ts(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def load_evidence(store: Store, ref: str) -> Evidence | None:
    repo = store.get_meta("repo")
    base = f"https://github.com/{repo}"
    kind, _, key = ref.partition(":")
    if kind == "commit":
        row = store.one("SELECT sha, subject, body, ts FROM commits WHERE sha = ?", (key,))
        return Evidence(ref, "commit", row["subject"], row["body"], f"{base}/commit/{key}", float(row["ts"])) if row else None
    if kind in ("pr", "issue"):
        row = store.one("SELECT number, is_pr, title, body, created_at FROM issues WHERE number = ?", (int(key),))
        if not row:
            return None
        path = "pull" if row["is_pr"] else "issues"
        return Evidence(ref, kind, row["title"], row["body"], f"{base}/{path}/{key}", _iso_ts(row["created_at"]))
    if kind == "comment":
        row = store.one(
            "SELECT c.id, c.number, c.kind, c.body, c.path, c.created_at, i.title, i.is_pr FROM comments c LEFT JOIN issues i ON i.number = c.number WHERE c.id = ?",
            (int(key),),
        )
        if not row:
            return None
        path = "pull" if row["is_pr"] else "issues"
        anchor = f"#discussion_r{key}" if row["kind"] == "review_comment" else f"#issuecomment-{key}"
        title = f"on #{row['number']} {row['title'] or ''}".strip() + (f" ({row['path']})" if row["path"] else "")
        return Evidence(ref, "comment", title, row["body"], f"{base}/{path}/{row['number']}{anchor}", _iso_ts(row["created_at"]))
    if kind == "doc":
        row = store.one("SELECT path, heading, text FROM docs WHERE id = ?", (int(key),))
        head = store.get_meta("head") or "HEAD"
        return Evidence(ref, "doc", f"{row['path']}: {row['heading']}".strip(": "), row["text"], f"{base}/blob/{head}/{row['path']}", 0.0) if row else None
    return None


def _search(store: Store, match: str, limit: int, restrict: Sequence[str] | None = None) -> list[str]:
    if not match:
        return []
    if restrict is not None:
        if not restrict:
            return []
        marks = ",".join("?" for _ in restrict)
        sql = f"SELECT ref FROM evidence_fts WHERE evidence_fts MATCH ? AND ref IN ({marks}) ORDER BY bm25(evidence_fts, 0.0, 0.0, 2.0, 1.0) LIMIT ?"
        return [r["ref"] for r in store.query(sql, (match, *restrict, limit))]
    sql = "SELECT ref FROM evidence_fts WHERE evidence_fts MATCH ? ORDER BY bm25(evidence_fts, 0.0, 0.0, 2.0, 1.0) LIMIT ?"
    return [r["ref"] for r in store.query(sql, (match, limit))]


def file_history_refs(store: Store, files: Iterable[str], limit: int = 400) -> list[str]:
    """Pull requests and commits that touched the given files, newest first."""
    refs: list[str] = []
    for path in files:
        refs += [f"pr:{r['number']}" for r in store.query("SELECT number FROM pr_files WHERE path = ? ORDER BY number DESC LIMIT ?", (path, limit))]
        refs += [
            f"commit:{r['sha']}"
            for r in store.query(
                "SELECT c.sha FROM commit_files f JOIN commits c ON c.sha = f.sha WHERE f.path = ? AND c.is_merge = 0 ORDER BY c.ts DESC LIMIT ?", (path, limit)
            )
        ]
    return list(dict.fromkeys(refs))


def candidates(
    store: Store,
    question: str,
    *,
    files: Sequence[str] = (),
    limit: int = 20,
    as_of: float | None = None,
    exclude: Iterable[str] = (),
    include_docs: bool = True,
    kinds: Sequence[str] | None = None,
) -> list[Evidence]:
    """BM25 hits, hits within the history of the given files, and link-graph neighbours of the best hits.
    `as_of` hides everything newer than that time, which is how evals stop a fix from leaking into its own tour."""
    excluded = set(exclude)
    match = fts_query(question)
    found: dict[str, Evidence] = {}

    def consider(ref: str, source: str) -> bool:
        if ref in found or ref in excluded or len(found) >= limit:
            return False
        evidence = load_evidence(store, ref)
        if evidence is None or len(evidence.passage()) < 40:
            return False
        if (evidence.kind == "doc" and not include_docs) or (kinds is not None and evidence.kind not in kinds):
            return False
        if as_of is not None and (evidence.ts == 0.0 or evidence.ts >= as_of):
            return False
        evidence.source = source
        found[ref] = evidence
        return True

    search_hits = _search(store, match, limit * 4)
    history_hits = _search(store, match, limit * 2, file_history_refs(store, files)) if files else []
    # Interleave so that neither global search nor the files' own history can crowd the other out.
    budget = limit - max(2, limit // 5)  # leave room for linked items
    for i in range(max(len(search_hits), len(history_hits))):
        if len(found) >= budget:
            break
        if i < len(history_hits):
            consider(history_hits[i], "file_history")
        if i < len(search_hits) and len(found) < budget:
            consider(search_hits[i], "search")
    for ref in list(found)[:8]:
        node = ref if not ref.startswith("comment:") else _comment_parent(store, ref)
        for other, _rel in store.neighbours(node) if node else []:
            if other.startswith(("pr:", "issue:", "commit:")):
                consider(other, "linked")
        if node and node != ref:
            consider(node, "linked")
    out = list(found.values())
    for i, evidence in enumerate(out, 1):
        evidence.label = f"E{i}"
    return out


_WORD = re.compile(r"[a-z]+|[A-Z][a-z]*|[0-9]+")
_STOP = {"the", "a", "an", "how", "does", "do", "is", "are", "what", "which", "where", "why", "when", "it", "of", "to", "in", "on", "for", "and", "or", "if", "i", "this", "that", "work", "works", "get", "gets", "go", "goes", "by", "with"}


def _terms(text: str) -> set[str]:
    words = {w.lower() for w in _WORD.findall(text)}
    return {w.rstrip("s") for w in words if w not in _STOP and len(w) > 2}


def _symbol_match(row: Any, terms: set[str]) -> float:
    """How well a definition matches the question: name words count double, docstring words once."""
    name = _terms(row["name"].replace(".", " ").replace("_", " "))
    doc = _terms(row["doc"] or "")
    return 2 * len(name & terms) + 0.5 * len(doc & terms) - 0.001 * (row["end_line"] - row["start_line"])


def code_evidence(store: Store, repo_dir: Path, path: str, symbol: str | None = None, question: str = "") -> Evidence | None:
    """A source excerpt as evidence: the module header, its definitions, and the bodies of the symbols that matter:
    the one navigation picked plus the ones whose names match the question."""
    row = store.one("SELECT path, header FROM files WHERE path = ?", (path,))
    if row is None:
        return None
    symbols = store.query("SELECT name, kind, signature, doc, start_line, end_line FROM symbols WHERE path = ? ORDER BY start_line", (path,))
    parts: list[str] = []
    if row["header"]:
        parts.append(f"Module docstring: {row['header'][:240]}")
    chosen = next((s for s in symbols if s["name"] == symbol), None)
    terms = _terms(question)
    ranked = sorted((s for s in symbols if s is not chosen and s["kind"] != "class"), key=lambda s: -_symbol_match(s, terms)) if terms else []
    picked = ([chosen] if chosen is not None else []) + [s for s in ranked[:3] if _symbol_match(s, terms) >= 2][: 3 if chosen is None else 2]
    if picked:
        lines = (repo_dir / path).read_text(encoding="utf-8", errors="replace").splitlines()
        budget = 1700
        for s in picked:
            body = "\n".join(lines[s["start_line"] - 1 : min(s["end_line"], s["start_line"] + 40)])[: max(300, budget // len(picked))]
            parts.append(f"{s['name']}, lines {s['start_line']} to {s['end_line']}:\n{body}")
    listing = [f"- {s['signature'][:110]}" + (f"  # {s['doc'][:80]}" if s["doc"] else "") for s in symbols if s["kind"] != "method" or any(s["name"].startswith(p["name"].split(".")[0] + ".") for p in picked)]
    if listing:
        parts.append("Definitions:\n" + "\n".join(listing[:24]))
    base = f"https://github.com/{store.get_meta('repo')}/blob/{store.get_meta('head') or 'HEAD'}/{path}"
    first = picked[0] if picked else None
    url = base + (f"#L{first['start_line']}-L{first['end_line']}" if first is not None else "")
    title = path + (f" ({', '.join(p['name'] for p in picked)})" if picked else "")
    return Evidence(f"file:{path}", "code", title, "\n".join(parts), url, 0.0, source="navigation")


def dependents_evidence(store: Store, path: str) -> Evidence | None:
    """Who imports a file, computed from the import graph. Generated by code, so it carries no repository prose."""
    rows = [r["src"] for r in store.query("SELECT src FROM imports WHERE dst = ? ORDER BY src", (path,))]
    if not rows:
        return None
    tests = [r for r in rows if store.scalar("SELECT is_test FROM files WHERE path = ?", (r,))]
    source = [r for r in rows if r not in tests]
    text = f"{path} is imported by {len(source)} source files and {len(tests)} test files.\n"
    text += "Source files that import it: " + (", ".join(source[:25]) or "none") + ".\n"
    text += "Test files that import it: " + (", ".join(tests[:20]) or "none") + "."
    return Evidence(f"graph:{path}", "graph", f"importers of {path}", text, "", 0.0, source="import_graph")


TEXT_SLICE = 680
TEXT_READ_LIMIT = 400_000
# Files a project uses to say how it is set up, run and tested. Read as text, never run.
GUIDE_NAMES = (
    "CONTRIBUTING.md", "CONTRIBUTING.rst", "CONTRIBUTING", "docs/contributing.rst", "docs/contributing.md",
    "README.md", "README.rst", "README", "INSTALL.md", "tox.ini", "pytest.ini", "noxfile.py", "Makefile",
    "pyproject.toml", "setup.cfg", "package.json", "justfile",
)
RUN_HEADING = re.compile(r"^(#{1,4} *)?(running|run|how to run|testing|tests?)( the)?( tests?| test suite)?\s*\n?(?:[=\-~^]{3,})?$", re.I | re.M)
RUN_WORDS = re.compile(r"\b(pytest|tox|nox|unittest|npm (run )?test|yarn test|make test|cargo test|go test|run(ning)? (the )?tests?|test suite|testenv)\b", re.I)


def text_evidence(store: Store, repo_dir: Path, path: str, *, focus: re.Pattern[str] | None = None, slices: int = 2) -> list[Evidence]:
    """Passages of a non-code file (a guide, a config) as documentation. With `focus`, the slices start where the
    file first talks about it instead of at the top. The file is read as text and never run."""
    root = Path(repo_dir).resolve()
    target = (root / path).resolve()
    if root not in target.parents or not target.is_file():
        return []
    try:
        with target.open(encoding="utf-8", errors="replace") as fh:
            text = fh.read(TEXT_READ_LIMIT)
    except OSError:
        return []
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    start = 0
    if focus is not None:
        hit = RUN_HEADING.search(text) if focus is RUN_WORDS else None
        hit = hit or focus.search(text)
        if hit is None:
            return []
        start = hit.start() if hit.re is RUN_HEADING else text.rfind("\n\n", 0, max(0, hit.start() - 120)) + 1
    base = f"https://github.com/{store.get_meta('repo')}/blob/{store.get_meta('head') or 'HEAD'}/{path}"
    out = []
    for i in range(slices):
        chunk = text[start + i * TEXT_SLICE : start + (i + 1) * TEXT_SLICE]
        if chunk.strip():
            out.append(Evidence(f"doc:{path}#{start + i * TEXT_SLICE}", "doc", path, chunk, base, 0.0, source="navigation"))
    return out


def guide_evidence(store: Store, repo_dir: Path, *, limit: int = 6) -> list[Evidence]:
    """How-to-run passages from the repository's own guides and test configs, the parts that mention running tests."""
    out: list[Evidence] = []
    for name in GUIDE_NAMES:
        found = text_evidence(store, repo_dir, name, focus=RUN_WORDS, slices=1 if name.endswith((".toml", ".cfg", ".json")) else 2)
        out.extend(found)
        if len(out) >= limit:
            break
    return out[:limit]


def _comment_parent(store: Store, ref: str) -> str | None:
    row = store.one("SELECT c.number, i.is_pr FROM comments c JOIN issues i ON i.number = c.number WHERE c.id = ?", (int(ref.split(":")[1]),))
    return f"{'pr' if row['is_pr'] else 'issue'}:{row['number']}" if row else None


async def retrieve(
    store: Store,
    engine: DecisionEngine,
    question: str,
    *,
    files: Sequence[str] = (),
    limit: int = 20,
    threshold: float = 0.35,
    injection_threshold: float = 0.5,
    rerank: bool = True,
    as_of: float | None = None,
    exclude: Iterable[str] = (),
    include_docs: bool = True,
    kinds: Sequence[str] | None = None,
    pinned: Sequence[Evidence] = (),
) -> Retrieval:
    """`pinned` passages (code excerpts picked by navigation) join the same request so that they are screened too."""
    found = candidates(store, question, files=files, limit=limit, as_of=as_of, exclude=exclude, include_docs=include_docs, kinds=kinds) if limit > 0 else []
    for extra in pinned:
        extra.pinned = True
        extra.label = f"E{len(found) + 1}"
        found.append(extra)
    result = Retrieval(question=question, candidates=found)
    if not found:
        return result
    schema = load_question_set("retrieve")
    questions: dict[str, Question] = {}
    for evidence in found:
        key = evidence.label.lower()
        questions[f"relevant_{key}"] = schema.render("relevant", label=evidence.label)
        questions[f"injection_{key}"] = schema.render("injection", label=evidence.label)
        if rerank:
            questions[f"directness_{key}"] = schema.render("directness", label=evidence.label)
    state = {"question": question, "passages": {e.label: e.passage() for e in found}}
    started = time.perf_counter()
    decision = await engine.decide(state, questions, purpose="retrieve:filter", schema_version=schema.version)
    result.call_id, result.requests, result.cached = decision.call_id, 1, decision.cached
    result.input_tokens, result.latency_ms = decision.input_tokens, decision.latency_ms
    result.extra["wall_ms"] = (time.perf_counter() - started) * 1000
    for evidence in found:
        key = evidence.label.lower()
        evidence.relevance = decision.noul(f"relevant_{key}")
        evidence.injection = decision.noul(f"injection_{key}")
        if rerank:
            evidence.directness = decision.score(f"directness_{key}").score
        if evidence.injection >= injection_threshold:
            evidence.reason = "dropped: looks like an injected instruction"
        elif evidence.relevance < threshold and not evidence.pinned:
            evidence.reason = "dropped: not relevant"
        else:
            evidence.kept, evidence.reason = True, "kept"
        if engine.log:
            engine.log.set_action(decision.call_id, f"relevant_{key}", evidence.reason)
            engine.log.set_action(decision.call_id, f"injection_{key}", "screened out" if evidence.injection >= injection_threshold else "passed")
    # Order in code: most direct first, relevance as the tie-break. Labels stay as asked, so citations match the log.
    result.candidates.sort(key=lambda e: (not e.kept, -(e.directness or 0.0), -(e.relevance or 0.0)))
    return result


def retrieval_to_dict(result: Retrieval) -> dict[str, Any]:
    return {
        "question": result.question,
        "evidence": [asdict(e) for e in result.candidates],
        "requests": result.requests,
        "input_tokens": result.input_tokens,
        "latency_ms": result.latency_ms,
        "cached": result.cached,
    }
