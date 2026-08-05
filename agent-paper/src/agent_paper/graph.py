from langgraph.graph import END, START, StateGraph

from agent_paper.nodes import (
    cluster,
    discover,
    evaluate,
    ingest,
    scope,
    synthesize,
    validate_citations,
)
from agent_paper.state import PaperState

MAX_RESCOPES = 2


def route_after_evaluation(state: PaperState) -> str:
    """Loop back to scoping while the evidence is weak, up to `MAX_RESCOPES` times.

    Kept separate from `evaluate` so the cap can be exercised without running the graph.
    """
    if state["evidence_is_weak"] and state["rescope_count"] <= MAX_RESCOPES:
        return "scoping"
    return "synthesis"


def build_graph():
    graph = StateGraph(PaperState)

    graph.add_node("discovery", discover)
    graph.add_node("scoping", scope)
    graph.add_node("ingestion", ingest)
    graph.add_node("clustering", cluster)
    graph.add_node("evaluation", evaluate)
    graph.add_node("synthesis", synthesize)
    graph.add_node("citations", validate_citations)

    graph.add_edge(START, "discovery")
    graph.add_edge("discovery", "scoping")
    graph.add_edge("scoping", "ingestion")
    graph.add_edge("ingestion", "clustering")
    graph.add_edge("clustering", "evaluation")
    graph.add_conditional_edges(
        "evaluation",
        route_after_evaluation,
        {"scoping": "scoping", "synthesis": "synthesis"},
    )
    graph.add_edge("synthesis", "citations")
    graph.add_edge("citations", END)

    return graph.compile()
