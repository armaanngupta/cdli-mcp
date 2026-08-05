import argparse
import asyncio

from agent_paper.graph import build_graph
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


async def run(topic: str, filters: dict[str, str]) -> PaperState:
    graph = build_graph()
    state = initial_state(topic, filters)

    # One connection for the whole run, shared with every node through the graph config.
    async with connect() as client:
        config = {"configurable": {"mcp_client": client}}
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
        help="advanced_search filter, repeatable (e.g. --filter provenience=Lagash). "
        "Required until node 1 generates queries from the topic itself.",
    )
    args = parser.parse_args()

    print(f"MCP: {mcp_url()}")
    state = asyncio.run(run(args.topic, _parse_filters(args.filter)))

    print(f"\n--- draft ---\n{state['draft']}")
    if state["unverified_citations"]:
        print(f"\nUNVERIFIED CITATIONS: {', '.join(state['unverified_citations'])}")


if __name__ == "__main__":
    main()
