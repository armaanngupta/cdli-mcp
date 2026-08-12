import json
import logging

from fastapi import FastAPI, Response
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from agent_paper.llm import DEFAULT_MODEL, DEFAULT_PROVIDER
from agent_paper.pdf import render_pdf
from agent_paper.runner import stream_run

log = logging.getLogger(__name__)

app = FastAPI(title="CDLI paper agent")


class PaperRequest(BaseModel):
    topic: str
    # BYOM only: /paper costs 15-30 LLM calls per run, so the caller always supplies the
    # key. The chat backend forwards the user's; there is no funded fallback.
    api_key: str = Field(min_length=1)
    provider: str = DEFAULT_PROVIDER
    model: str = DEFAULT_MODEL
    filters: dict[str, str] = Field(default_factory=dict)


def _event(name: str, payload: dict) -> dict:
    return {"event": name, "data": json.dumps(payload)}


def _describe_error(err: BaseException) -> str:
    """Unwrap nested ExceptionGroups down to the underlying cause.

    Both LangGraph and the MCP client run nodes inside anyio task groups, so a failure
    surfaces as "unhandled errors in a TaskGroup" — which tells the user nothing. The
    leaf exception is the one carrying the real message (a 401, a timeout, a bad model id).
    """
    while isinstance(err, BaseExceptionGroup) and err.exceptions:
        err = err.exceptions[0]
    return f"{type(err).__name__}: {err}"


@app.post("/paper")
async def paper(request: PaperRequest) -> EventSourceResponse:
    """Run a paper and stream node-transition progress.

    A run takes minutes, so progress is the point: the chat backend proxies these events
    straight into its own SSE stream rather than holding a silent connection open.
    """

    async def events():
        state = None
        try:
            yield _event("node", {"name": "discovery", "status": "started"})
            async for kind, payload, state in stream_run(
                request.topic,
                request.filters,
                request.provider,
                request.api_key,
                request.model,
            ):
                if kind == "section":
                    yield _event("section", payload)
                else:
                    yield _event("node", {**payload, "status": "finished"})
            yield _event(
                "done",
                {
                    "draft": state["draft"],
                    "unverified_citations": state["unverified_citations"],
                    "artifact_ids": state["ranked_ids"],
                },
            )
        except Exception as err:
            # The stream is already open by the time most failures happen, so an error has
            # to travel as an event — the status code was sent long ago.
            log.exception("paper run failed")
            yield _event("error", {"message": _describe_error(err)})

    return EventSourceResponse(
        events(),
        # Belt-and-braces with nginx's `proxy_buffering off`: disables buffering per
        # response even if a proxy in front missed that config.
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache, no-transform"},
    )


class PdfRequest(BaseModel):
    # The finished Markdown the browser already holds — rendering it costs nothing, so a
    # download never re-runs the (paid, minutes-long) pipeline.
    markdown: str = Field(min_length=1)


@app.post("/paper/pdf")
def paper_pdf(request: PdfRequest) -> Response:
    return Response(content=render_pdf(request.markdown), media_type="application/pdf")
