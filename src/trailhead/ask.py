"""One question, end to end. Code owns the control flow: Jev routes, navigates, filters and verifies; the LLM only writes."""

from __future__ import annotations

from typing import Any, Callable

from .answer import Answer, answer_from_evidence, answer_to_dict
from .context import Context
from .decisions import load_question_set
from .navigate import NavPath, NavResult, NavStep, Navigator, nav_to_dict
from .retrieve import Evidence, code_evidence, dependents_evidence, retrieve, retrieval_to_dict

Emit = Callable[[str, dict[str, Any]], None]
ROUTE_MIN = 0.5  # below this the router's pick is not trusted and the broadest route is used
OUT_OF_SCOPE_AT = 0.6

# What each route does. Code decides this; the router only picks the key.
ROUTES: dict[str, dict[str, Any]] = {
    "where_is": {"navigate": True, "symbols": True, "answer": "location"},
    "how_does_it_work": {"navigate": True, "symbols": True, "code": 2, "history": 8, "kinds": None},
    "why_built_this_way": {"navigate": True, "symbols": False, "code": 0, "history": 20, "kinds": None, "reason": True},
    "what_breaks_if_changed": {"navigate": True, "symbols": True, "code": 1, "graph": 2, "history": 8, "kinds": ("commit", "pr", "issue", "comment")},
    "how_to_run_or_test": {"navigate": False, "code": 0, "history": 16, "kinds": ("doc",)},
    "other": {"navigate": False, "answer": "out_of_scope"},
}


def pick_route(probabilities: dict[str, float]) -> tuple[str, str]:
    """Route and the reason for it. A weak pick falls back to the route that looks at the most."""
    top = max(probabilities, key=lambda k: probabilities[k])
    if top == "other":
        return ("other", "out of scope") if probabilities[top] >= OUT_OF_SCOPE_AT else ("how_does_it_work", "unclear, treated as a how question")
    if probabilities[top] < ROUTE_MIN:
        return "how_does_it_work", f"router unsure ({top} {probabilities[top]:.2f}), treated as a how question"
    return top, "router"


def location_answer(question: str, nav: NavResult) -> Answer:
    """A where-is answer is the navigation result itself, so no repository text goes to an LLM."""
    if not nav.paths:
        return Answer(question, "abstained", "Navigation did not reach a file.", abstain_reason="no path found")
    best = nav.paths[0]
    symbol = nav.symbols.get(best.leaf)
    where = f"`{best.leaf}`" + (f", in `{symbol['name']}` (line {symbol['line']})" if symbol else "")
    weak = best.score < 0.35 or (nav.separation_ratio is not None and nav.separation_ratio < 1.2)
    text = f"{'Possibly' if weak else 'Most likely'} {where}."
    others = [f"`{p.leaf}`" for p in nav.paths[1:]]
    if others:
        text += f" Other candidates: {', '.join(others)}."
    if weak:
        text += " The top paths scored close together, so check the alternatives."
    return Answer(question, "answered", text, confidence=best.score, render="navigation")


async def ask(ctx: Context, question: str, *, engine_kind: str | None = None, emit: Emit | None = None, final_check: bool = True, beam_width: int = 3) -> dict[str, Any]:
    emit = emit or (lambda kind, payload: None)
    engine = ctx.engine(engine_kind)
    route_schema = load_question_set("route")
    navigator = Navigator(ctx.tree(), engine, beam_width=beam_width)
    state: dict[str, Any] = {"route": "", "plan": {}}

    def after_depth(result: NavResult, steps: list[NavStep], beam: list[NavPath]) -> bool | None:
        if result.extras is not None and not state["route"]:
            kind = result.extras.choice("question_kind")
            state["route"], state["route_reason"] = pick_route(kind.probabilities)
            state["plan"] = ROUTES[state["route"]]
            state["route_probabilities"] = kind.probabilities
            state["code_alone"] = result.extras.noul("code_alone")
            if engine.log:
                engine.log.set_action(result.extras.call_id, "question_kind", f"route: {state['route']} ({state['route_reason']})")
            emit("route", {"route": state["route"], "reason": state["route_reason"], "probabilities": kind.probabilities, "code_alone": state["code_alone"]})
        emit("nav_depth", {"steps": nav_to_dict(NavResult(question, [], steps, None))["steps"], "beam": [{"nodes": p.nodes, "score": p.score} for p in beam]})
        return None if state["plan"].get("navigate") else False

    nav = await navigator.search(question, extras=dict(route_schema.questions), after_depth=after_depth)
    plan = state["plan"]
    out: dict[str, Any] = {
        "question": question, "engine": engine.name, "route": state["route"], "route_reason": state.get("route_reason", ""),
        "route_probabilities": state.get("route_probabilities", {}), "code_alone": state.get("code_alone"),
    }
    if plan.get("navigate"):
        if plan.get("symbols") and nav.paths:
            await navigator.pick_symbols(nav, question, ctx.store)
        out["navigation"] = nav_to_dict(nav)
        emit("navigation", out["navigation"])

    if plan.get("answer") == "out_of_scope":
        answer = Answer(question, "abstained", "This does not look like a question about the codebase. Ask where something is, how it works, or why it was built that way.", abstain_reason="out of scope")
    elif plan.get("answer") == "location":
        answer = location_answer(question, nav)
    else:
        files = nav.files if plan.get("navigate") else []
        pinned: list[Evidence] = []
        for path in files[: plan.get("code", 0)]:
            symbol = nav.symbols.get(path, {}).get("name")
            evidence = code_evidence(ctx.store, ctx.repo_dir, path, symbol)
            if evidence:
                pinned.append(evidence)
        for path in files[: plan.get("graph", 0)]:
            graph = dependents_evidence(ctx.store, path)
            if graph:
                pinned.append(graph)
        history = plan.get("history", 0)
        if not plan.get("reason") and plan.get("kinds") is None and state.get("code_alone", 0.0) >= 0.5:
            history = min(history, 4)  # the router says the code is enough, so history only gets a small share
        found = await retrieve(ctx.store, engine, question, files=files, limit=history, kinds=plan.get("kinds"), pinned=pinned)
        out["retrieval"] = retrieval_to_dict(found)
        emit("evidence", out["retrieval"])
        answer = await answer_from_evidence(engine, ctx.llm, question, found.candidates, wants_reason=bool(plan.get("reason")), final_check=final_check)
    out["answer"] = answer_to_dict(answer)
    emit("answer", out["answer"])
    return out
