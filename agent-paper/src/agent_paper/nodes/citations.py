import re

from agent_paper.state import PaperState

# CDLI ids are a P/Q/S prefix plus six digits (see normalizeArtifactId in packages/server).
CITATION_PATTERN = re.compile(r"\b[PQS]\d{6}\b")


def _references(cited_ids: list[str], cards: dict) -> str:
    """A 'Cited artifacts' list linking each cited id to its CDLI page.

    Built only from ids that were actually ingested, so a fabricated citation never gets a
    real-looking link — the reference list can't launder a hallucination.
    """
    lines = ["## Cited artifacts", ""]
    for pid in cited_ids:
        card = cards.get(pid, {})
        designation = card.get("designation") or "(no designation)"
        url = card.get("url") or f"https://cdli.earth/artifacts/{pid}"
        lines.append(f"- [{pid}]({url}) — {designation}")
    return "\n".join(lines)


def validate_citations(state: PaperState) -> dict:
    """Node 6 — flag any cited id the pipeline never ingested, and append a references list.

    A citation is trustworthy only if it names an artifact we fetched and summarized, so the
    check is a set difference against `summaries`. Verified citations are then listed with
    their CDLI links, which both closes the loop and reads as proper scholarly apparatus.
    """
    cited = set(CITATION_PATTERN.findall(state["draft"]))
    ingested = set(state["summaries"])
    verified = sorted(cited & ingested)

    draft = state["draft"]
    if verified:
        draft = f"{draft}\n\n{_references(verified, state['cards'])}"

    return {"unverified_citations": sorted(cited - ingested), "draft": draft}
