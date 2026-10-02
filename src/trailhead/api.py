"""HTTP API for the web app. Long jobs (ask, tour, where) stream Server-Sent Events: every decision Jev makes is
pushed as it lands, and a heartbeat reports when the next Jev request slot opens, since the free tier allows one a minute."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Awaitable, Callable

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import evals, repos, snapshots
from .auth import AuthError, User, Verifier
from .config import ENGINE_KINDS, Settings, load_settings
from .context import Context
from .decisions import DecisionError
from .llm.client import LLMError
from .navigate import Navigator, nav_to_dict

logger = logging.getLogger(__name__)
HEARTBEAT_S = 2.0
Emit = Callable[[str, dict[str, Any]], None]


class AskBody(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    repo: str | None = None
    engine: str | None = None


class TourBody(BaseModel):
    goal: str = Field(min_length=3, max_length=1200)
    repo: str | None = None
    engine: str | None = None
    notes: bool = True


class ReplanBody(BaseModel):
    tour: dict[str, Any]
    feedback: dict[str, str]
    repo: str | None = None


class ExplainBody(BaseModel):
    tour: dict[str, Any]
    repo: str | None = None
    engine: str | None = None


class RankBody(BaseModel):
    repo: str | None = None
    engine: str | None = None
    limit: int = Field(default=8, ge=1, le=20)


class IngestBody(BaseModel):
    repo: str = Field(pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    # the signed-in person's own GitHub token, for this run's API quota only; never stored or logged
    github_token: str = Field("", max_length=400, repr=False)


class RepoBody(BaseModel):
    repo: str = Field(pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _sse(kind: str, payload: Any) -> bytes:
    return f"event: {kind}\ndata: {json.dumps(payload, default=str)}\n\n".encode()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    verifier = Verifier(settings)
    contexts: dict[str, Context] = {}
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        for ctx in contexts.values():
            await ctx.aclose()

    app = FastAPI(title="Trailhead", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.web_origins), allow_origin_regex=settings.web_origin_regex or None, allow_methods=["*"], allow_headers=["*"])

    async def user(request: Request) -> User:
        try:
            return verifier.verify(request.headers.get("authorization"))
        except AuthError as exc:
            raise HTTPException(401, str(exc)) from exc

    def default_repo() -> str:
        listed = [r for r in repos.list_repos(settings) if r.get("status") == "ready"]
        if not listed:
            raise HTTPException(404, "no repository has been ingested yet")
        return listed[0]["repo"]

    def ctx_for(repo: str | None) -> Context:
        name = repo or default_repo()
        if name not in contexts:
            try:
                scoped = repos.settings_for(settings, name)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            if not scoped.db_path.exists():
                raise HTTPException(404, f"{name} has not been ingested")
            contexts[name] = Context(scoped)
        return contexts[name]

    def engine_kind(kind: str | None) -> str:
        if kind and kind not in ENGINE_KINDS:
            raise HTTPException(400, f"engine must be one of {ENGINE_KINDS}")
        return kind or settings.decision_engine

    def next_slot() -> float:
        """Seconds until the shared Jev limiter hands out its next request."""
        try:
            value = float((settings.data_dir / "ratelimit" / "beatapi.slot").read_text().strip() or 0)
        except (OSError, ValueError):
            return 0.0
        return max(0.0, value - time.time())

    def stream(job: Callable[[Emit], Awaitable[Any]]) -> StreamingResponse:
        async def events() -> AsyncIterator[bytes]:
            queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
            started = time.time()

            def emit(kind: str, payload: dict[str, Any]) -> None:
                queue.put_nowait((kind, payload))

            async def run() -> None:
                try:
                    result = await job(emit)
                    queue.put_nowait(("done", result))
                except (DecisionError, LLMError, ValueError) as exc:
                    queue.put_nowait(("error", {"message": str(exc)}))
                except Exception as exc:  # the stream must always end with an event the UI understands
                    logger.exception("job failed")
                    queue.put_nowait(("error", {"message": f"{type(exc).__name__}: {exc}"}))

            task = asyncio.create_task(run())
            try:
                while True:
                    try:
                        kind, payload = await asyncio.wait_for(queue.get(), HEARTBEAT_S)
                    except asyncio.TimeoutError:
                        yield _sse("heartbeat", {"elapsed": round(time.time() - started, 1), "next_slot_s": round(next_slot(), 1)})
                        continue
                    yield _sse(kind, payload)
                    if kind in ("done", "error"):
                        break
            finally:
                if not task.done():
                    task.cancel()

        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "auth": settings.auth_mode, "auth_configured": verifier.configured, "engines": list(ENGINE_KINDS),
                "default_engine": settings.decision_engine, "next_slot_s": round(next_slot(), 1),
                "snapshots": await asyncio.to_thread(snapshots.status, settings)}

    @app.get("/api/config")
    async def config(_: User = Depends(user)) -> dict[str, Any]:
        """What the server is set up to use, for the Settings page. Names and limits only: never a key or a URL with credentials."""
        from urllib.parse import urlsplit

        host = lambda url: urlsplit(url).hostname or ""  # noqa: E731
        return {
            "default_engine": settings.decision_engine,
            "engines": list(ENGINE_KINDS),
            "offline": settings.offline,
            "auth": settings.auth_mode,
            "jev": {"model_id": settings.jev_model_id, "max_concurrency": settings.jev_max_concurrency,
                    "providers": [{"name": p.name, "model": p.model, "rpm": p.requests_per_minute, "host": host(p.base_url)} for p in settings.jev_providers]},
            "llm": {"configured": bool(settings.llm_api_key), "model": settings.llm_model, "host": host(settings.llm_base_url), "rpm": settings.llm_rpm,
                    "reasoning_effort": settings.llm_reasoning_effort, "fallback_model": settings.llm_fallback_model},
            "local": {"model": settings.local_llm_model, "host": host(settings.local_llm_base_url)},
            "github_token": bool(settings.github_token),
            "repos": len(repos.list_repos(settings)),
        }

    @app.get("/api/me")
    async def me(current: User = Depends(user)) -> dict[str, Any]:
        return current.__dict__

    @app.get("/api/repos")
    async def list_repos(_: User = Depends(user)) -> list[dict[str, Any]]:
        return await asyncio.to_thread(repos.list_repos, settings)

    @app.post("/api/repos")
    async def add_repo(body: IngestBody, _: User = Depends(user)) -> dict[str, Any]:
        return repos.start_ingest(settings, body.repo, github_token=body.github_token)

    @app.post("/api/repos/stop")
    async def stop_repo(body: RepoBody, _: User = Depends(user)) -> dict[str, Any]:
        return repos.stop_ingest(body.repo)

    @app.get("/api/overview")
    async def overview(repo: str | None = None, _: User = Depends(user)) -> dict[str, Any]:
        ctx = ctx_for(repo)
        store = ctx.store
        layers = {r["value"]: r["n"] for r in store.query("SELECT value, COUNT(*) AS n FROM annotations WHERE qid = 'layer' GROUP BY value ORDER BY n DESC")}
        top_dirs = [dict(r) for r in store.query("SELECT path, summary FROM dirs WHERE path NOT LIKE '%/%' AND path NOT LIKE '.%' ORDER BY path")]
        return {**repos.summary(store), "layers": layers, "top_dirs": top_dirs, "next_slot_s": round(next_slot(), 1)}

    @app.get("/api/suggest")
    async def suggest(repo: str | None = None, _: User = Depends(user)) -> dict[str, Any]:
        from .suggest import payload

        return payload(ctx_for(repo).store)

    @app.get("/api/tree")
    async def tree(path: str = "", repo: str | None = None, _: User = Depends(user)) -> dict[str, Any]:
        ctx = ctx_for(repo)
        t = ctx.tree(include_tests=True, include_docs=True)
        try:
            node = t.node(path)
        except KeyError as exc:
            raise HTTPException(404, f"no such path: {path}") from exc
        children = []
        for child in t.children(path):
            ann = {r["qid"]: r["value"] for r in ctx.store.query("SELECT qid, value FROM annotations WHERE ref = ?", (f"file:{child.id}",))} if child.kind == "file" else {}
            children.append({"id": child.id, "name": child.name, "kind": child.kind, "summary": child.summary, "annotations": ann})
        children.sort(key=lambda c: (c["kind"] != "dir", c["name"]))
        return {"id": node.id, "kind": node.kind, "summary": node.summary, "children": children}

    @app.post("/api/ask")
    async def ask_endpoint(body: AskBody, _: User = Depends(user)) -> StreamingResponse:
        from .ask import ask

        ctx, kind = ctx_for(body.repo), engine_kind(body.engine)
        return stream(lambda emit: ask(ctx, body.question, engine_kind=kind, emit=emit))

    @app.post("/api/where")
    async def where(body: AskBody, _: User = Depends(user)) -> StreamingResponse:
        ctx, kind = ctx_for(body.repo), engine_kind(body.engine)

        async def job(emit: Emit) -> dict[str, Any]:
            navigator = Navigator(ctx.tree(), ctx.engine(kind))

            def after_depth(result: Any, steps: list[Any], beam: list[Any]) -> None:
                emit("nav_depth", {"steps": nav_to_dict(type(result)(body.question, [], steps, None))["steps"], "beam": [{"nodes": p.nodes, "score": p.score} for p in beam]})

            result = await navigator.search(body.question, after_depth=after_depth, symbol_store=ctx.store)
            return nav_to_dict(result)

        return stream(job)

    @app.post("/api/tour")
    async def tour_endpoint(body: TourBody, _: User = Depends(user)) -> StreamingResponse:
        from .tour import TourPlanner, tour_to_dict

        ctx, kind = ctx_for(body.repo), engine_kind(body.engine)

        async def job(emit: Emit) -> dict[str, Any]:
            planner = TourPlanner(ctx, ctx.engine(kind), llm=ctx.llm if body.notes else None)
            return tour_to_dict(await planner.plan(body.goal, notes=body.notes, emit=emit))

        return stream(job)

    @app.post("/api/tour/replan")
    async def replan(body: ReplanBody, _: User = Depends(user)) -> dict[str, Any]:
        from .tour import TourPlanner, tour_from_dict, tour_to_dict

        ctx = ctx_for(body.repo)
        planner = TourPlanner(ctx, ctx.engine(), llm=ctx.llm)
        try:
            return tour_to_dict(await planner.replan(tour_from_dict(body.tour), body.feedback))
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.post("/api/tour/explain")
    async def explain(body: ExplainBody, _: User = Depends(user)) -> StreamingResponse:
        from .tour import explain_tour, tour_from_dict

        ctx, kind = ctx_for(body.repo), engine_kind(body.engine)
        try:
            tour = tour_from_dict(body.tour)
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(400, str(exc)) from exc

        async def job(emit: Emit) -> dict[str, Any]:
            return await explain_tour(ctx, ctx.engine(kind), tour, emit=emit)

        return stream(job)

    rank_locks: dict[str, asyncio.Lock] = {}

    async def issues_payload(ctx: Context) -> dict[str, Any]:
        """Ranks only issues already annotated, so this never waits on Jev. Stored annotations are the cache."""
        from .picker import WEIGHTS, candidate_issues, pick_issues

        annotated = {int(r["ref"].split(":")[1]) for r in ctx.store.query("SELECT DISTINCT ref FROM annotations WHERE ref LIKE 'issue:%'")}
        numbers = [n for n in candidate_issues(ctx.store, limit=200) if n in annotated]
        best: dict[int, dict[str, Any]] = {}
        engines = sorted({r["engine"] for r in ctx.store.query("SELECT DISTINCT engine FROM annotations WHERE ref LIKE 'issue:%'")}, key=lambda e: e != "jev")
        for engine in engines:  # Jev's judgement wins when an issue was judged by more than one engine
            for p in await pick_issues(ctx.store, _NoCalls(), engine, numbers=numbers, top=200):
                best.setdefault(p.number, p.__dict__ | {"engine": engine})
        open_total = len(candidate_issues(ctx.store, limit=1000))
        return {"weights": WEIGHTS, "picks": sorted(best.values(), key=lambda p: -p["score"])[:60], "open_unlinked": open_total, "annotated": len(best), "unranked": max(0, open_total - len(numbers))}

    @app.get("/api/issues")
    async def issues(repo: str | None = None, _: User = Depends(user)) -> dict[str, Any]:
        return await issues_payload(ctx_for(repo))

    @app.post("/api/issues/rank")
    async def rank_issues(body: RankBody, _: User = Depends(user)) -> StreamingResponse:
        """Judges the next few unranked open issues, one at a time, so the page fills in as it goes."""
        from .annotate import annotate, question_set_for
        from .picker import candidate_issues, pick_issues

        ctx, kind = ctx_for(body.repo), engine_kind(body.engine)
        lock = rank_locks.setdefault(ctx.repo, asyncio.Lock())

        async def job(emit: Emit) -> dict[str, Any]:
            async with lock:  # a second tab waits for the first instead of paying for the same requests
                version = question_set_for("issue").version
                done = {r["ref"] for r in ctx.store.query("SELECT DISTINCT ref FROM annotations WHERE ref LIKE 'issue:%' AND schema_version = ?", (version,))}
                todo = [n for n in candidate_issues(ctx.store, limit=200) if f"issue:{n}" not in done][: body.limit]
                emit("plan", {"todo": [{"number": n, "title": (ctx.store.one("SELECT title FROM issues WHERE number = ?", (n,)) or {"title": ""})["title"]} for n in todo]})
                engine = ctx.engine(kind)
                for n in todo:
                    emit("reading", {"number": n})
                    await annotate(ctx.store, engine, kind, "issue", refs=[f"issue:{n}"], concurrency=1)
                    picked = await pick_issues(ctx.store, _NoCalls(), kind, numbers=[n], top=1)
                    emit("ranked", {"number": n, "pick": (picked[0].__dict__ | {"engine": kind}) if picked else None})
            return await issues_payload(ctx)

        return stream(job)

    @app.get("/api/decisions")
    async def decisions(limit: int = 60, repo: str | None = None, _: User = Depends(user)) -> list[dict[str, Any]]:
        ctx = ctx_for(repo)
        return [dict(r) for r in ctx.log.recent(min(max(limit, 1), 500))]

    @app.get("/api/evals")
    async def eval_results(_: User = Depends(user)) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for name in ("nav", "tour"):
            data = evals.load_results(name)
            out[name] = {m: b.get("summary", {}) for m, b in data.get("methods", {}).items()}
        out["why"] = evals.load_results("why_jev_scores")
        out["injection"] = {}
        for engine in ("jev", "llm"):
            data = evals.load_results(f"injection_{engine}")
            if data:
                cases = [
                    {"id": k, "attack": bool(c.get("attack")), "blocked": bool(c.get("blocked")), "technique": str(c.get("technique", "")), "kind": str(c.get("kind", "")), "p": c.get("p")}
                    for k, c in sorted(data.get("screening", {}).items())
                ]
                out["injection"][engine] = {"summary": data.get("summary", {}), "cases": cases}
        items = evals.load_results("why_jev").get("items", {})
        out["why_items"] = [
            {
                "id": k,
                "question": str(v.get("question", "")),
                "status": str(v.get("status", "")),
                "confidence": v.get("confidence"),
                "claims": len(v.get("claims", [])),
                "verified": sum(1 for c in v.get("claims", []) if c.get("status") == "verified"),
            }
            for k, v in sorted(items.items())
        ]
        return out

    return app


class _NoCalls:
    """Stands in for an engine when every answer must come from stored annotations."""

    log = None
    name = "stored"

    async def decide(self, *args: Any, **kwargs: Any) -> Any:
        raise DecisionError("not annotated yet")


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    # Local runs stay on loopback; a host such as Render sets HOST=0.0.0.0 and PORT.
    uvicorn.run(create_app(), host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")), timeout_keep_alive=75)
