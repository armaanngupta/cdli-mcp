# agent-paper

Research-paper generation agent for the CDLI chat interface — the Phase-3 `/paper` command.

A LangGraph state machine walks a fixed sequence of nodes, calling the CDLI MCP server for
corpus data and an LLM for judgment at each step, and returns a short Markdown research note
in which every claim cites a CDLI P-number.

Not an npm workspace: it is Python, with its own tooling. It lives in this repo for cloning
and versioning only.

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)
- A running CDLI MCP server (`npm run dev:http -w @cdli/server`, port 3000)

```bash
uv sync
```

## Configuration

Both variables are read from the process environment. **There is no `.env` support** — set
them in your shell (or via the container/service manager in deployment).

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `MCP_URL` | both entrypoints | `http://localhost:3000/mcp` | CDLI MCP server. Public and unauthenticated, so the agent connects directly rather than through the chat backend. |
| `PAPER_LLM_KEY` | **CLI only** | — | Your own LLM API key. Required by the CLI; never read by the service. |

### How the service gets its key

`/paper` is **bring-your-own-model**: a run costs roughly 15–30 LLM calls against 1–2 for a
chat turn, so there is no CDLI-funded path here and no server-held key to configure.

The HTTP service takes `api_key` as a **required request field**. In the real flow it
originates in the user's browser, is decrypted there with their PIN, and is forwarded by the
chat backend:

```
browser (decrypted BYOM key, in memory)
  -> POST /chat/api/paper   { topic, provider, byomKey, ... }   chat-backend
  -> POST /paper            { topic, provider, api_key,  ... }   agent-paper
```

`PAPER_LLM_KEY` exists so the CLI can run without the web stack. It plays no part in a real
user request.

## Running

### CLI — one run, straight to stdout

```bash
export PAPER_LLM_KEY=...            # your own key
uv run agent-paper "temple offerings at Girsu"
```

Options:

- `--filter FIELD=VALUE` (repeatable) — pins the search instead of letting node 1 plan it,
  e.g. `--filter provenience=Girsu --filter genre=Administrative`
- `--provider` — LangChain provider id, default `mistralai`. Providers other than Mistral
  need their own `langchain-*` integration package installed.
- `--model` — default `mistral-small-latest`

### Service — HTTP + SSE, for the chat backend

```bash
uv run uvicorn agent_paper.service:app --port 8100
```

`POST /paper` streams a `node` event per graph transition, then a `done` event carrying the
draft. A run takes minutes and produces nothing user-visible until synthesis, so the
progress events are the point.

```
event: node   {"name": "discovery", "status": "finished", "progress": {"cards": 50, ...}}
event: node   {"name": "ingestion", "status": "finished", "progress": {"summaries": 10}}
event: done   {"draft": "# Temple Offerings at Girsu...", "unverified_citations": [], ...}
```

Errors after the stream opens arrive as `event: error` — the status code was sent long ago.

## The pipeline

| Node | MCP tools | Role |
|---|---|---|
| 1 · discovery | `advanced_search` | Plan up to 3 catalogue queries from the topic, collect candidates |
| 2 · scoping | — | Rank candidates down to the 10 most relevant |
| 3 · ingestion | `get_inscription` | Fetch each artifact's ATF, summarize, discard the transliteration |
| 3.5 · clustering | — | Group summaries into labeled themes |
| 4 · evaluation | — | Judge whether the themes are strong enough to write from |
| 5 · synthesis | — | Write the Markdown draft, every claim citing a P-number |
| 6 · citations | — | Flag cited ids that were never ingested |

Node 4 loops back to node 2 while the evidence is weak, at most `MAX_RESCOPES` (2) times.
On a retry, node 2 is told its previous selection was insufficient and asked for a
materially different set — re-running an identical ranking would loop on the same artifacts.

Node 4 is a deterministic structural check rather than a model call, since it runs on every
pass of that loop. Node 6 is likewise real code: verifying a citation is a set difference
against what was actually ingested, so there is nothing for a model to decide.

Raw transliteration never enters the graph state. It is summarized at node 3 and dropped —
it is by far the bulkiest field and nothing downstream reads it.

## Known limitations

- **Shallow sampling.** Each query reads only the first page of results (25), and node 2
  keeps 10. A topic matching thousands of tablets is sampled thinly; deep paging via
  `search_after` is not wired in.
- **No domain gate.** Unlike chat (which restricts scope in its system prompt), an
  off-topic run is not refused up front — it produces unusable queries, finds no artifacts,
  and fails with `No artifacts found for topic ...`, after node 1's LLM call has been spent.
- **Cancellation unverified.** A client disconnect closes the stream, but whether in-flight
  LLM work actually stops has not been confirmed.
- **`get_metadata` is not called**, though `project.md` lists it for node 3: the
  `advanced_search` cards already carry the compressed metadata, so a per-artifact call
  would add a round-trip for fields already in hand.

## Development

```bash
uv run ruff format src
uv run ruff check src
```

No test suite yet — the repo defers tests to a project-wide pass.
