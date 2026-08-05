import re

from agent_paper.state import PaperState

# CDLI ids are a P/Q/S prefix plus six digits (see normalizeArtifactId in packages/server).
CITATION_PATTERN = re.compile(r"\b[PQS]\d{6}\b")


def validate_citations(state: PaperState) -> dict:
    """Node 6 — flag any cited id the pipeline never actually ingested.

    Real logic, not a stub: a citation is trustworthy only if it names an artifact we
    fetched and summarized, so the check is a set difference against `summaries`.
    """
    cited = set(CITATION_PATTERN.findall(state["draft"]))
    return {"unverified_citations": sorted(cited - set(state["summaries"]))}
