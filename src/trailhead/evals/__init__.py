"""Evaluation harnesses. Each writes raw per-item results to eval/results/ and replays from the call cache."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
EVAL_DIR = ROOT / "eval"
RESULTS_DIR = EVAL_DIR / "results"


def load_results(name: str) -> dict[str, Any]:
    try:
        return json.loads((RESULTS_DIR / f"{name}.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def save_results(name: str, data: dict[str, Any]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    path = RESULTS_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    return path


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    def cell(value: Any) -> str:
        return f"{value:.3f}" if isinstance(value, float) else str(value)

    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    lines += ["| " + " | ".join(cell(v) for v in row) + " |" for row in rows]
    return "\n".join(lines)
