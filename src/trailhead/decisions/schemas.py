"""Load versioned question sets from schemas/<version>/<name>.yaml."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import yaml

from .types import Choice, InvalidQuestionError, Noul, Question, Score, canonical_json, sha256_hex, validate_questions

SCHEMA_ROOT = Path(__file__).resolve().parents[3] / "schemas"


@dataclass(frozen=True)
class QuestionSet:
    name: str
    version: str  # "<dir>/<name>@<content hash>", logged with every decision
    questions: Mapping[str, Question]

    def subset(self, *ids: str) -> dict[str, Question]:
        return {qid: self.questions[qid] for qid in ids}

    def render(self, qid: str, **values: str) -> Question:
        """A template question with {placeholders} filled in. Values come from code, never from repository text."""
        question = self.questions[qid]
        if isinstance(question, Choice):
            return Choice(question.instructions.format(**values), {k: v.format(**values) for k, v in question.criteria.items()})
        if isinstance(question, Score):
            return Score(question.instructions.format(**values), tuple(level.format(**values) for level in question.criteria))
        return Noul(question.instructions.format(**values))


def _build(qid: str, raw: Mapping[str, Any]) -> Question:
    kind = raw.get("type")
    instructions = str(raw.get("instructions") or "")
    if kind == "choice":
        return Choice(instructions, {str(k): str(v) for k, v in (raw.get("criteria") or {}).items()})
    if kind == "score":
        return Score(instructions, tuple(str(level) for level in (raw.get("criteria") or [])))
    if kind == "noul":
        return Noul(instructions)
    raise InvalidQuestionError(f"{qid}: unknown question type {kind!r}")


def load_question_set(name: str, version: str = "v1", root: Path = SCHEMA_ROOT) -> QuestionSet:
    path = root / version / f"{name}.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    questions = {str(qid): _build(str(qid), spec) for qid, spec in raw["questions"].items()}
    validate_questions(questions)
    digest = sha256_hex(canonical_json(raw["questions"]))[:8]
    return QuestionSet(name=name, version=f"{version}/{name}@{digest}", questions=questions)
