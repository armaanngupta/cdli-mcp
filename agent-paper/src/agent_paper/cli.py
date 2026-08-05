import argparse
import asyncio
import os

from agent_paper.llm import DEFAULT_MODEL, DEFAULT_PROVIDER
from agent_paper.mcp_client import mcp_url
from agent_paper.runner import describe_patch, stream_run
from agent_paper.state import PaperState


def _parse_filters(pairs: list[str]) -> dict[str, str]:
    filters = {}
    for pair in pairs:
        field, _, value = pair.partition("=")
        if not value:
            raise SystemExit(f"--filter expects field=value, got {pair!r}")
        filters[field] = value
    return filters


async def run(topic: str, filters: dict[str, str], provider: str, key: str, model: str):
    state: PaperState | None = None
    async for node_name, patch, state in stream_run(topic, filters, provider, key, model):
        described = " ".join(f"{k}={v}" for k, v in describe_patch(patch).items())
        print(f"[{node_name:<10}] {described}")
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
