"""First-issue picker. Jev answers one fan-out request per issue (the `issue` question set); the weights live here, in code."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any

from .annotate import annotate, question_set_for
from .decisions import DecisionEngine
from .store import Store

# Composite weights. Scores are normalised to 0..1 by their top level; prior knowledge counts inverted.
WEIGHTS = {"scope_clarity": 0.35, "prior_knowledge_needed": 0.25, "has_acceptance_criteria": 0.2, "touches_single_area": 0.2}
UNSUITABLE_KINDS = {"question": 0.5, "other": 0.8}  # multipliers: a question asks for no change
LABEL_BONUS = 0.05  # maintainers already marked it as a good first issue


@dataclass
class Pick:
    number: int
    title: str
    url: str
    labels: list[str]
    score: float
    parts: dict[str, float]
    kind: str


def candidate_issues(store: Store, *, limit: int = 30, state: str = "open") -> list[int]:
    """Labelled first issues first, then the newest. Issues already linked to a fixing pull request are left out."""
    rows = store.query(
        """SELECT number FROM issues i WHERE is_pr = 0 AND state = ?
           AND NOT EXISTS (SELECT 1 FROM links l WHERE l.dst = 'issue:' || i.number AND l.rel = 'fixes')
           ORDER BY (labels LIKE '%good first issue%') DESC, number DESC LIMIT ?""",
        (state, limit),
    )
    return [r["number"] for r in rows]


def composite(values: dict[str, str], labels: list[str]) -> tuple[float, dict[str, float]]:
    levels = {"scope_clarity": 3.0, "prior_knowledge_needed": 3.0}
    parts = {
        "scope_clarity": float(values["scope_clarity"]) / levels["scope_clarity"],
        "prior_knowledge_needed": 1.0 - float(values["prior_knowledge_needed"]) / levels["prior_knowledge_needed"],
        "has_acceptance_criteria": float(values["has_acceptance_criteria"]),
        "touches_single_area": float(values["touches_single_area"]),
    }
    score = sum(WEIGHTS[k] * v for k, v in parts.items()) * UNSUITABLE_KINDS.get(values.get("kind", ""), 1.0)
    if "good first issue" in labels:
        score += LABEL_BONUS
    return round(score, 4), parts


async def pick_issues(store: Store, engine: DecisionEngine, engine_label: str, *, limit: int = 30, top: int = 10, numbers: list[int] | None = None) -> list[Pick]:
    numbers = numbers if numbers is not None else candidate_issues(store, limit=limit)
    await annotate(store, engine, engine_label, "issue", refs=[f"issue:{n}" for n in numbers], concurrency=1)
    version = question_set_for("issue").version
    repo = store.get_meta("repo")
    picks: list[Pick] = []
    for number in numbers:
        rows = store.query("SELECT qid, value FROM annotations WHERE ref = ? AND engine = ? AND schema_version = ?", (f"issue:{number}", engine_label, version))
        values = {r["qid"]: r["value"] for r in rows}
        if not all(k in values for k in WEIGHTS):
            continue  # the request failed; nothing to rank on
        issue = store.one("SELECT title, labels FROM issues WHERE number = ?", (number,))
        labels = json.loads(issue["labels"])
        score, parts = composite(values, labels)
        picks.append(Pick(number, issue["title"], f"https://github.com/{repo}/issues/{number}", labels, score, parts, values.get("kind", "")))
    picks.sort(key=lambda p: -p.score)
    return picks[:top]


def picks_to_dict(picks: list[Pick]) -> list[dict[str, Any]]:
    return [asdict(p) for p in picks]
