from collections.abc import AsyncIterator
from typing import Any

from agent_paper.graph import build_graph
from agent_paper.llm import DEFAULT_MODEL, DEFAULT_PROVIDER, build_model
from agent_paper.mcp_client import connect
from agent_paper.state import PaperState, initial_state


def describe_patch(patch: dict[str, Any]) -> dict[str, Any]:
    """Sizes of what a node changed — the payload of a progress event.

    Containers collapse to their length; scalars pass through, since a count is the useful
    signal for a list of summaries but the value itself is what matters for a retry counter.
    """
    return {
        key: len(value) if isinstance(value, (list, dict, str)) else value
        for key, value in patch.items()
    }


async def stream_run(
    topic: str,
    filters: dict[str, str] | None = None,
    provider: str = DEFAULT_PROVIDER,
    api_key: str = "",
    model_name: str = DEFAULT_MODEL,
) -> AsyncIterator[tuple[str, dict[str, Any], PaperState]]:
    """Run the pipeline, yielding (kind, payload, running state) as progress arrives.

    Two kinds: "node" when a graph node finishes, and "section" when synthesis completes one
    section of the draft. A run takes minutes and produces nothing user-visible until the
    draft exists, so callers stream these rather than wait — and synthesis is much the
    longest node, which is why it reports from inside.
    """
    graph = build_graph()
    state = initial_state(topic, filters or {})
    model = build_model(provider, api_key, model_name)

    # One connection for the whole run, shared with every node through the graph config.
    async with connect() as client:
        config = {"configurable": {"mcp_client": client, "model": model}}
        async for mode, chunk in graph.astream(state, config, stream_mode=["updates", "custom"]):
            if mode == "custom":
                yield "section", chunk, state
                continue
            for node_name, patch in chunk.items():
                state.update(patch)
                yield "node", {"name": node_name, "progress": describe_patch(patch)}, state
