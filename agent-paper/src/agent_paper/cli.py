import argparse

from agent_paper.graph import build_graph
from agent_paper.state import PaperState, initial_state


def _describe(patch: dict) -> str:
    """Compact one-line view of what a node changed — the same signal the SSE
    progress events will carry once the service exists."""
    parts = []
    for key, value in patch.items():
        size = len(value) if isinstance(value, (list, dict, str)) else value
        parts.append(f"{key}={size}")
    return " ".join(parts)


def run(topic: str) -> PaperState:
    graph = build_graph()
    state = initial_state(topic)

    for update in graph.stream(state, stream_mode="updates"):
        for node_name, patch in update.items():
            state.update(patch)
            print(f"[{node_name:<10}] {_describe(patch)}")

    return state


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="agent-paper", description="Run the CDLI paper-generation pipeline on a topic."
    )
    parser.add_argument("topic", help="Research topic, e.g. 'kingship at Lagash'")
    args = parser.parse_args()

    state = run(args.topic)

    print(f"\n--- draft ---\n{state['draft']}")
    if state["unverified_citations"]:
        print(f"\nUNVERIFIED CITATIONS: {', '.join(state['unverified_citations'])}")


if __name__ == "__main__":
    main()
