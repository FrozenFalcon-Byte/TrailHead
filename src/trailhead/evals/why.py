"""Calibration of why-answers: does P(supports) mean what it says, and does the system abstain when it should."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Callable

import yaml

from ..answer import answer_from_evidence
from ..baselines import bm25_files
from ..context import Context
from ..decisions import DecisionError
from ..llm.client import LLMError
from ..retrieve import retrieve
from . import EVAL_DIR, RESULTS_DIR, load_results, markdown_table, mean, save_results

CLAIM_LABELS = EVAL_DIR / "why_claim_labels.csv"
ANSWER_LABELS = EVAL_DIR / "why_answer_labels.csv"
CLAIM_FIELDS = ["qid", "claim_id", "question", "claim", "cited_passages", "system_status", "p_support", "label", "provisional_label", "notes"]
ANSWER_FIELDS = ["qid", "question", "system_status", "system_answer", "kept_evidence", "label", "provisional_label", "notes"]
BINS = [(0.0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.0001)]


def load_questions() -> list[dict[str, Any]]:
    return yaml.safe_load((EVAL_DIR / "why_questions.yaml").read_text(encoding="utf-8"))


async def run(ctx: Context, *, engine_kind: str = "jev", limit: int | None = None, progress: Callable[[str], None] = print) -> dict[str, Any]:
    """Locating files uses BM25 here, not beam search: this eval measures retrieval, verification and abstention."""
    engine = ctx.engine(engine_kind)
    allowed = set(ctx.tree().files())
    name = f"why_{engine_kind}"
    results = load_results(name) or {"items": {}}
    results["meta"] = {"repo": ctx.repo, "head": ctx.store.get_meta("head"), "engine": engine_kind}
    for q in load_questions()[:limit]:
        try:
            files = bm25_files(ctx.store, q["q"], allowed, 2).files
            found = await retrieve(ctx.store, engine, q["q"], files=files, limit=16)
            answer = await answer_from_evidence(engine, ctx.llm, q["q"], found.candidates, wants_reason=True, prose=False)
        except (DecisionError, LLMError) as exc:
            progress(f"{q['id']} failed: {exc}")
            continue
        results["items"][q["id"]] = {
            "id": q["id"], "question": q["q"], "expect": q["expect"], "status": answer.status, "confidence": answer.confidence,
            "abstain_reason": answer.abstain_reason, "text": answer.text, "files": files,
            "claims": [
                {"id": c.id, "text": c.text, "evidence": c.evidence, "verdict": c.verdict, "p_support": c.p_support, "directness": c.directness, "addresses": c.addresses, "status": c.status}
                for c in answer.claims
            ],
            "evidence": [
                {"label": e.label, "ref": e.ref, "url": e.url, "kept": e.kept, "relevance": e.relevance, "directness": e.directness, "injection": e.injection, "passage": e.passage()}
                for e in found.candidates
            ],
            "usage": {**answer.usage, "retrieve_input_tokens": found.input_tokens, "retrieve_latency_ms": found.latency_ms},
        }
        save_results(name, results)
        progress(f"{q['id']} {answer.status} confidence={answer.confidence:.2f} claims={[c.status for c in answer.claims]}")
    return results


def _read(path: Path) -> dict[tuple[str, ...], dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    return {((r["qid"], r["claim_id"]) if "claim_id" in r else (r["qid"],)): r for r in rows}


def export_labels(results: dict[str, Any]) -> tuple[int, int]:
    """Write the two labelling sheets. Labels already entered are kept when the row still describes the same text."""
    old_claims, old_answers = _read(CLAIM_LABELS), _read(ANSWER_LABELS)
    claim_rows, answer_rows = [], []
    for item in sorted(results.get("items", {}).values(), key=lambda i: i["id"]):
        passages = {e["label"]: e for e in item["evidence"]}
        for claim in item["claims"]:
            old = old_claims.get((item["id"], claim["id"]), {})
            same = old.get("claim") == claim["text"]
            cited = "\n---\n".join(f"{label} {passages[label]['url']}\n{passages[label]['passage']}" for label in claim["evidence"] if label in passages)
            claim_rows.append({
                "qid": item["id"], "claim_id": claim["id"], "question": item["question"], "claim": claim["text"], "cited_passages": cited,
                "system_status": claim["status"], "p_support": f"{claim['p_support']:.2f}",
                "label": old.get("label", "") if same else "", "provisional_label": old.get("provisional_label", "") if same else "", "notes": old.get("notes", "") if same else "",
            })
        old = old_answers.get((item["id"],), {})
        same = old.get("system_answer") == item["text"]
        kept = "\n".join(f"{e['label']} {e['url']}" for e in item["evidence"] if e["kept"])
        answer_rows.append({
            "qid": item["id"], "question": item["question"], "system_status": item["status"], "system_answer": item["text"], "kept_evidence": kept,
            "label": old.get("label", "") if same else "", "provisional_label": old.get("provisional_label", "") if same else "", "notes": old.get("notes", "") if same else "",
        })
    for path, fields, rows in ((CLAIM_LABELS, CLAIM_FIELDS, claim_rows), (ANSWER_LABELS, ANSWER_FIELDS, answer_rows)):
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    return len(claim_rows), len(answer_rows)


def _label(row: dict[str, str]) -> tuple[str, str]:
    """(label, where it came from). A human label wins over a provisional one."""
    if row.get("label", "").strip():
        return row["label"].strip().lower(), "human"
    if row.get("provisional_label", "").strip():
        return row["provisional_label"].strip().lower(), "provisional"
    return "", ""


def score(results: dict[str, Any]) -> dict[str, Any]:
    """Claim sheet labels: supported | unsupported. Answer sheet labels: correct | wrong (answered), should_abstain | should_answer (abstained)."""
    claims, answers = _read(CLAIM_LABELS), _read(ANSWER_LABELS)
    sources = {"human": 0, "provisional": 0}
    points: list[tuple[float, float]] = []
    for row in claims.values():
        label, source = _label(row)
        if label in ("supported", "unsupported"):
            sources[source] += 1
            points.append((float(row["p_support"]), float(label == "supported")))
    bins = []
    ece = 0.0
    for low, high in BINS:
        inside = [(p, y) for p, y in points if low <= p < high]
        if inside:
            confidence, accuracy = mean([p for p, _ in inside]), mean([y for _, y in inside])
            ece += len(inside) / len(points) * abs(confidence - accuracy)
            bins.append({"range": f"{low:.1f}-{min(high, 1.0):.1f}", "n": len(inside), "mean_confidence": confidence, "fraction_supported": accuracy})
    shown = [(p, y) for p, y in points if p >= 0.5]
    dropped = [(p, y) for p, y in points if p < 0.5]

    answered = abstained = correct = wrong = right_abstain = missed = 0
    for row in answers.values():
        label, source = _label(row)
        if not label:
            continue
        sources[source] += 1
        if row["system_status"] == "answered":
            answered += 1
            correct += label == "correct"
            wrong += label == "wrong"
        else:
            abstained += 1
            right_abstain += label == "should_abstain"
            missed += label == "should_answer"
    total = answered + abstained
    expectations = {"rationale": [0, 0], "none": [0, 0]}
    for item in results.get("items", {}).values():
        expectations[item["expect"]][0] += 1
        expectations[item["expect"]][1] += item["status"] == "abstained"
    return {
        "label_sources": sources,
        "claims": {"n": len(points), "ece": ece, "bins": bins,
                   "precision_of_shown_claims": mean([y for _, y in shown]), "n_shown": len(shown),
                   "supported_among_dropped": mean([y for _, y in dropped]), "n_dropped": len(dropped)},
        "answers": {"n": total, "answered": answered, "abstained": abstained, "abstention_rate": abstained / total if total else 0.0,
                    "precision_when_answering": correct / answered if answered else 0.0,
                    "abstentions_that_were_right": right_abstain / abstained if abstained else 0.0, "missed_answers": missed},
        "by_expectation": {k: {"questions": n, "abstained": a} for k, (n, a) in expectations.items()},
    }


def reliability_svg(bins: list[dict[str, Any]], ece: float) -> str:
    """Reliability diagram drawn by hand, so the eval needs no plotting dependency."""
    size, pad = 320, 44

    def x(v: float) -> float:
        return pad + v * (size - 2 * pad)

    def y(v: float) -> float:
        return size - pad - v * (size - 2 * pad)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" font-family="sans-serif" font-size="10">',
        f'<rect width="{size}" height="{size}" fill="white"/>',
        f'<line x1="{x(0)}" y1="{y(0)}" x2="{x(1)}" y2="{y(1)}" stroke="#999" stroke-dasharray="4 3"/>',
        f'<rect x="{x(0)}" y="{y(1)}" width="{x(1) - x(0)}" height="{y(0) - y(1)}" fill="none" stroke="#333"/>',
    ]
    for tick in (0, 0.25, 0.5, 0.75, 1):
        parts.append(f'<text x="{x(tick)}" y="{y(0) + 14}" text-anchor="middle">{tick:g}</text>')
        parts.append(f'<text x="{x(0) - 6}" y="{y(tick) + 3}" text-anchor="end">{tick:g}</text>')
    points = " ".join(f"{x(b['mean_confidence']):.1f},{y(b['fraction_supported']):.1f}" for b in bins)
    if len(bins) > 1:
        parts.append(f'<polyline points="{points}" fill="none" stroke="#1f6f4a" stroke-width="2"/>')
    for b in bins:
        parts.append(f'<circle cx="{x(b["mean_confidence"]):.1f}" cy="{y(b["fraction_supported"]):.1f}" r="{3 + min(9, b["n"] / 3):.1f}" fill="#1f6f4a" fill-opacity="0.6"/>')
        parts.append(f'<text x="{x(b["mean_confidence"]):.1f}" y="{y(b["fraction_supported"]) - 12:.1f}" text-anchor="middle">n={b["n"]}</text>')
    parts.append(f'<text x="{size / 2}" y="{size - 8}" text-anchor="middle">Jev P(supports)</text>')
    parts.append(f'<text x="12" y="{size / 2}" text-anchor="middle" transform="rotate(-90 12 {size / 2})">fraction labelled supported</text>')
    parts.append(f'<text x="{size / 2}" y="18" text-anchor="middle" font-size="12">Claim reliability, ECE {ece:.3f}</text></svg>')
    return "\n".join(parts)


def report(results: dict[str, Any], name: str = "why_jev") -> str:
    s = score(results)
    (RESULTS_DIR / f"{name}_reliability.svg").write_text(reliability_svg(s["claims"]["bins"], s["claims"]["ece"]), encoding="utf-8")
    save_results(f"{name}_scores", s)
    c, a = s["claims"], s["answers"]
    provisional = s["label_sources"]["provisional"]
    out = []
    if provisional:
        out += [f"**{provisional} of {provisional + s['label_sources']['human']} labels are provisional** (entered by the build agent, not by a person). Fill the `label` column to replace them.", ""]
    out += [markdown_table(["P(supports) bin", "claims", "mean confidence", "fraction supported"], [[b["range"], b["n"], b["mean_confidence"], b["fraction_supported"]] for b in c["bins"]]), ""]
    out += [markdown_table(["metric", "value"], [
        ["labelled claims", c["n"]], ["expected calibration error", c["ece"]],
        [f"precision of shown claims (P >= 0.5, n={c['n_shown']})", c["precision_of_shown_claims"]],
        [f"supported claims among dropped (n={c['n_dropped']})", c["supported_among_dropped"]],
        ["labelled questions", a["n"]], ["abstention rate", a["abstention_rate"]],
        [f"precision when answering (n={a['answered']})", a["precision_when_answering"]],
        [f"abstentions that were right (n={a['abstained']})", a["abstentions_that_were_right"]],
        ["answers missed by abstaining", a["missed_answers"]],
    ])]
    e = s["by_expectation"]
    out += ["", f"By author expectation: abstained on {e['none']['abstained']} of {e['none']['questions']} questions with no known rationale, and on {e['rationale']['abstained']} of {e['rationale']['questions']} questions whose rationale is recorded."]
    return "\n".join(out)
