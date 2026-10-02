"""Answers from evidence: an LLM drafts claims, Jev verifies each claim against what it cites, code decides what survives."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Sequence

from .decisions import DecisionEngine, Question, load_question_set
from .llm.client import LLMClient, LLMError
from .retrieve import Evidence

PROMPTS = Path(__file__).resolve().parents[2] / "prompts" / "v1"
KEEP_AT = 0.7  # P(supports) needed to state a claim plainly
FLAG_AT = 0.5  # below KEEP_AT but at or above this, the claim is shown with a low-confidence badge
ADDRESSES_AT = 0.5
MAX_CLAIMS = 6
NO_RATIONALE = "No recorded rationale found."
_MARKER = re.compile(r"\[(E\d+)\]")


@dataclass
class Claim:
    id: str
    text: str
    evidence: list[str]
    verdict: str = ""
    p_support: float = 0.0
    directness: float = 0.0
    addresses: float = 0.0
    status: str = "unverified"  # verified | flagged | dropped
    badge: str = ""  # high | medium | low
    reason: str = ""


@dataclass
class Answer:
    question: str
    status: str  # answered | abstained
    text: str
    claims: list[Claim] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)  # everything that was considered, kept first
    confidence: float = 0.0  # P(supports) of the best claim that addresses the question
    abstain_reason: str = ""
    render: str = ""  # llm | claims (deterministic fallback)
    guard: dict[str, Any] = field(default_factory=dict)
    usage: dict[str, Any] = field(default_factory=dict)

    @property
    def verified(self) -> list[Claim]:
        return [c for c in self.claims if c.status in ("verified", "flagged")]


def _prompt(name: str) -> str:
    return (PROMPTS / name).read_text(encoding="utf-8")


def passages_block(evidence: Sequence[Evidence]) -> str:
    """Evidence as delimited data. The delimiter cannot be forged because angle brackets in passages are escaped."""
    parts = []
    for e in evidence:
        body = e.passage().replace("<", "&lt;").replace(">", "&gt;")
        parts.append(f'<passage id="{e.label}">\n{body}\n</passage>')
    return "\n".join(parts)


async def draft_claims(llm: LLMClient, question: str, evidence: Sequence[Evidence], usage: dict[str, Any]) -> list[Claim]:
    labels = {e.label for e in evidence}
    user = f"Question: {question}\n\nPassages:\n{passages_block(evidence)}"
    reply = await llm.complete(_prompt("claims.md"), user, json_mode=True, max_tokens=1500)
    _count(usage, "llm", reply.input_tokens, reply.output_tokens, reply.latency_ms)
    try:
        raw = json.loads(reply.text).get("claims") or []
    except (json.JSONDecodeError, AttributeError):
        return []
    claims: list[Claim] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        text = " ".join(str(item.get("text") or "").split())
        cited = [str(x).strip("[] ") for x in item.get("evidence") or [] if str(x).strip("[] ") in labels][:3]
        if text and cited:  # a claim that cites nothing we gave it cannot be checked, so it never reaches the reader
            claims.append(Claim(id=f"C{len(claims) + 1}", text=_MARKER.sub("", text).strip(), evidence=cited))
        if len(claims) >= MAX_CLAIMS:
            break
    return claims


async def verify_claims(engine: DecisionEngine, question: str, claims: list[Claim], evidence: Sequence[Evidence], usage: dict[str, Any]) -> None:
    """One request: for each claim, does what it cites support it, how directly, and does it answer the question."""
    if not claims:
        return
    schema = load_question_set("verify")
    by_label = {e.label: e for e in evidence}
    cited = sorted({label for c in claims for label in c.evidence}, key=lambda label: int(label[1:]))
    state = {
        "question": question,
        "passages": {label: by_label[label].passage() for label in cited},
        "claims": {c.id: {"claim": c.text, "cites": c.evidence} for c in claims},
    }
    questions: dict[str, Question] = {}
    for c in claims:
        for qid in ("support", "direct", "addresses"):
            questions[f"{qid}_{c.id.lower()}"] = schema.render(qid, claim=c.id)
    decision = await engine.decide(state, questions, purpose="answer:verify", schema_version=schema.version)
    _count(usage, "engine", decision.input_tokens, decision.output_tokens, decision.latency_ms)
    for c in claims:
        key = c.id.lower()
        support = decision.choice(f"support_{key}")
        c.verdict, c.p_support = support.choice, support.probabilities.get("supports", 0.0)
        c.directness, c.addresses = decision.noul(f"direct_{key}"), decision.noul(f"addresses_{key}")
        if c.verdict == "supports" and c.p_support >= KEEP_AT:
            c.status = "verified"
            c.badge = "high" if c.p_support >= 0.85 and c.directness >= 0.5 else "medium"
            c.reason = "cited evidence supports it"
        elif c.verdict == "supports" and c.p_support >= FLAG_AT:
            c.status, c.badge, c.reason = "flagged", "low", "support is weak"
        else:
            c.status, c.reason = "dropped", f"evidence {c.verdict}"
        if engine.log:
            engine.log.set_action(decision.call_id, f"support_{key}", f"{c.status}: {c.reason}")
            engine.log.set_action(decision.call_id, f"addresses_{key}", "answers the question" if c.addresses >= ADDRESSES_AT else "background")


def claims_as_text(claims: Sequence[Claim]) -> str:
    """Deterministic rendering: the verified claims themselves, used when prose cannot be trusted or is not needed."""
    return " ".join(f"{c.text.rstrip('.')}{' (low confidence)' if c.status == 'flagged' else ''} {''.join(f'[{e}]' for e in c.evidence)}." for c in claims)


def citations_ok(text: str, claims: Sequence[Claim]) -> bool:
    """Code-level output check: the prose cites something, and only passages that verified claims cite."""
    allowed = {label for c in claims for label in c.evidence}
    used = set(_MARKER.findall(text))
    return bool(used) and used <= allowed


async def render_answer(llm: LLMClient, engine: DecisionEngine, question: str, claims: Sequence[Claim], usage: dict[str, Any], *, final_check: bool = True) -> tuple[str, str, dict[str, Any]]:
    """Prose from verified claims only, then the output check. Returns (text, how it was rendered, guard report)."""
    fallback = claims_as_text(claims)
    listing = "\n".join(f"- {c.text}{' (low confidence)' if c.status == 'flagged' else ''} {''.join(f'[{e}]' for e in c.evidence)}" for c in claims)
    try:
        reply = await llm.complete(_prompt("render.md"), f"Question: {question}\n\nClaims:\n{listing}", max_tokens=700)
    except LLMError as exc:
        return fallback, "claims", {"error": str(exc)[:200]}
    _count(usage, "llm", reply.input_tokens, reply.output_tokens, reply.latency_ms)
    text = reply.text.strip()
    guard: dict[str, Any] = {"citations_ok": citations_ok(text, claims)}
    if not guard["citations_ok"]:
        return fallback, "claims", guard
    if final_check:
        schema = load_question_set("guard")
        state = {"claims": {c.id: c.text for c in claims}, "answer": _MARKER.sub("", text)}
        decision = await engine.decide(state, schema.subset("adds_facts", "follows_embedded_instruction"), purpose="answer:output_check", schema_version=schema.version)
        _count(usage, "engine", decision.input_tokens, decision.output_tokens, decision.latency_ms)
        guard["adds_facts"] = decision.noul("adds_facts")
        guard["follows_embedded_instruction"] = decision.noul("follows_embedded_instruction")
        blocked = guard["adds_facts"] >= 0.5 or guard["follows_embedded_instruction"] >= 0.5
        if engine.log:
            for qid in ("adds_facts", "follows_embedded_instruction"):
                engine.log.set_action(decision.call_id, qid, "blocked prose, showing claims" if blocked else "passed")
        if blocked:
            return fallback, "claims", guard
    return text, "llm", guard


async def answer_from_evidence(
    engine: DecisionEngine,
    llm: LLMClient,
    question: str,
    evidence: Sequence[Evidence],
    *,
    wants_reason: bool = False,
    final_check: bool = True,
    prose: bool = True,
) -> Answer:
    """`evidence` is everything retrieval considered; only kept passages reach the LLM."""
    usage: dict[str, Any] = {}
    kept = [e for e in evidence if e.kept]
    nothing = NO_RATIONALE if wants_reason else "Nothing in the repository or its history answers this."
    answer = Answer(question=question, status="abstained", text=nothing, evidence=list(evidence), usage=usage)
    if not kept:
        answer.abstain_reason = "no relevant evidence was retrieved"
        return answer
    answer.claims = await draft_claims(llm, question, kept, usage)
    if not answer.claims:
        answer.abstain_reason = "the evidence does not answer the question"
        return answer
    await verify_claims(engine, question, answer.claims, kept, usage)
    answering = [c for c in answer.verified if c.addresses >= ADDRESSES_AT]
    if not answering:
        answer.abstain_reason = "no claim that answers the question is supported by its evidence" if answer.verified else "no drafted claim is supported by its evidence"
        if answer.verified:
            # The question itself stays unanswered, but what was verified is still worth showing, labelled as background.
            answer.status = "partial"
            answer.confidence = max(c.p_support for c in answer.verified)
            lead = "No recorded rationale answers the why directly. What the repository does show:" if wants_reason else "Nothing answers this directly. What the repository does show:"
            answer.text, answer.render = f"{lead} {claims_as_text(answer.verified)}", "claims"
        return answer
    answer.status = "answered"
    answer.confidence = max(c.p_support for c in answering)
    shown = answering + [c for c in answer.verified if c not in answering]
    if prose:
        answer.text, answer.render, answer.guard = await render_answer(llm, engine, question, shown, usage, final_check=final_check)
    else:
        answer.text, answer.render = claims_as_text(shown), "claims"
    return answer


def _count(usage: dict[str, Any], who: str, input_tokens: int, output_tokens: int, latency_ms: float) -> None:
    usage[f"{who}_requests"] = usage.get(f"{who}_requests", 0) + 1
    usage[f"{who}_input_tokens"] = usage.get(f"{who}_input_tokens", 0) + input_tokens
    usage[f"{who}_output_tokens"] = usage.get(f"{who}_output_tokens", 0) + output_tokens
    usage[f"{who}_latency_ms"] = usage.get(f"{who}_latency_ms", 0.0) + latency_ms


def answer_to_dict(answer: Answer) -> dict[str, Any]:
    return {
        "question": answer.question, "status": answer.status, "text": answer.text, "confidence": answer.confidence,
        "abstain_reason": answer.abstain_reason, "render": answer.render, "guard": answer.guard, "usage": answer.usage,
        "claims": [asdict(c) for c in answer.claims], "evidence": [asdict(e) for e in answer.evidence],
    }
