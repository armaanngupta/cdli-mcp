# syntax=docker/dockerfile:1

FROM python:3.11-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.10.9 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_LINK_MODE=copy

# Dependencies resolve from the lockfile alone, so they cache independently of source edits.
COPY agent-paper/pyproject.toml agent-paper/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY agent-paper/src ./src
# --no-editable installs the built wheel rather than linking ./src, so a packaging
# mistake (a missing asset, say) fails here instead of silently at render time.
RUN uv sync --frozen --no-dev --no-editable

ENV PATH="/app/.venv/bin:$PATH"

# The packaged `agent-paper` script is the CLI; the HTTP service is a separate entrypoint.
EXPOSE 8100
CMD ["uvicorn", "agent_paper.service:app", "--host", "0.0.0.0", "--port", "8100"]
