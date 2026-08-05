import argparse
import asyncio
import os

from agent_paper.graph import build_graph
from agent_paper.llm import DEFAULT_MODEL, DEFAULT_PROVIDER, build_model
from agent_paper.mcp_client import connect, mcp_url
from agent_paper.state import PaperState, initial_state


def _describe(patch: dict) -> str:
    """Compact one-line view of what a node changed — the same signal the SSE
    progress events will carry once the service exists."""
    parts = []
    for key, value in patch.items():
        size = len(value) if isinstance(value, (list, dict, str)) else value
        parts.append(f"{key}={size}")
    return " ".join(parts)


def _parse_filters(pairs: list[str]) -> dict[str, str]:
    filters = {}
    for pair in pairs:
        field, _, value = pair.partition("=")
        if not value:
            raise SystemExit(f"--filter expects field=value, got {pair!r}")
        filters[field] = value
    return filters


async def run(
    topic: str,
    filters: dict[str, str],
    provider: str = DEFAULT_PROVIDER,
    api_key: str = "",
    model_name: str = DEFAULT_MODEL,
) -> PaperState:
    graph = build_graph()
    state = initial_state(topic, filters)
    model = build_model(provider, api_key, model_name)

    # One connection for the whole run, shared with every node through the graph config.
    async with connect() as client:
        config = {"configurable": {"mcp_client": client, "model": model}}
        async for update in graph.astream(state, config, stream_mode="updates"):
            for node_name, patch in update.items():
                state.update(patch)
                print(f"[{node_name:<10}] {_describe(patch)}")

    return state


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="agent-paper", description="Run the CDLI paper-generation pipeline on a topic."
    )
    parser.add_argument("topic", help="Research topic, e.g. 'kingship at Lagash'")
    parser.add_argument(
        "--filter",
        action="append",
        default=[],
        metavar="FIELD=VALUE",
        help="advanced_search filter, repeatable (e.g. --filter provenience=Girsu). "
        "Overrides node 1's query planning entirely.",
    )
    parser.add_argument("--provider", default=DEFAULT_PROVIDER)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    # BYOM only — see llm.build_model for why there is no funded fallback.
    api_key = os.environ.get("PAPER_LLM_KEY", "")
    if not api_key:
        raise SystemExit("Set PAPER_LLM_KEY to your own API key — /paper is bring-your-own-model.")

    print(f"MCP: {mcp_url()}  model: {args.provider}/{args.model}")
    state = asyncio.run(
        run(args.topic, _parse_filters(args.filter), args.provider, api_key, args.model)
    )

    print(f"\n--- draft ---\n{state['draft']}")
    if state["unverified_citations"]:
        print(f"\nUNVERIFIED CITATIONS: {', '.join(state['unverified_citations'])}")


if __name__ == "__main__":
    main()
