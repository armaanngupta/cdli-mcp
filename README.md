# CDLI MCP

An [MCP](https://modelcontextprotocol.io) server that lets LLM clients (Claude Desktop, Claude
Code, or any MCP-compatible host) query the [CDLI](https://cdli.earth) cuneiform corpus —
400k+ tablets, inscriptions, bibliography, and vocabulary — through natural language, via a set
of tools wrapping the CDLI REST and CQP4RDF APIs.

This is a GSoC project. It's currently a monorepo with one workspace, **`packages/server`**
(the MCP server, Phase 1); a chat interface (widget) and a research-paper generation agent are
planned as later phases and will land as additional packages.

## Repository layout

```
packages/
  server/     # the MCP server — tools, transports, CDLI API client (this is what's built so far)
```

## Setup

Requires Node.js >= 20.

```bash
git clone <repo-url>
cd cdli-mcp
npm install
npm run build
```

Optional environment variables (copy `packages/server/.env.example` to `packages/server/.env`):

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Port for the Streamable HTTP transport | `3000` |
| `ALLOWED_HOSTS` | Comma-separated hostname allowlist (DNS-rebinding protection) | unset (disabled) |
| `CQP_BASE_URL` | Base URL of the CQP4RDF query API used by `cqp_query` | deployed `cdli.earth` endpoint |

## Testing the server

### MCP Inspector

```bash
npm run inspect
```

Launches the server over STDIO with the official `@modelcontextprotocol/inspector`, so you can
list tools and try calls interactively in the browser UI it opens.

### Claude Desktop (STDIO)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cdli-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/cdli-mcp/packages/server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then ask it something like "Find Ur III tablets from Nippur" — it should
pick up the `cdli-mcp` tools automatically.

### Streamable HTTP

Run locally with `npm run dev:http` (or `npm run serve` after `npm run build`), which serves the
MCP endpoint at `http://localhost:3000/mcp`.

A hosted instance is also available while development continues, so you can test the HTTP
transport without running anything locally:

```
https://cdli-mcp.onrender.com/mcp
```

#### Claude Desktop (Streamable HTTP)

Remote/HTTP MCP servers are **not** added via `claude_desktop_config.json` — that file is
validated for STDIO servers only, and a `url` entry there is silently dropped (or breaks startup).
Instead, add it as a custom connector through the UI, same flow as on claude.ai:

1. Open Claude Desktop → **Settings → Connectors**.
2. Click **Add custom connector**.
3. Paste the server URL: `https://cdli-mcp.onrender.com/mcp` (or your local
   `http://localhost:3000/mcp` if running it yourself — note a local URL only works if Claude
   Desktop can reach it, which may require a tunnel since connectors are brokered through
   Anthropic's servers, not your machine directly).
4. Leave **Advanced settings** (OAuth) blank — this server is fully public, no auth required.
5. Click **Add**.

To use it in a chat:

1. Start a **new chat**.
2. Click the **+** (tools/attachments) button above the message box → **Search and tools**.
3. Toggle **cdli-mcp** on for that conversation.
4. Ask a question — Claude will call the CDLI tools as needed.

**Starter prompts to try:**

- "Find Ur III period tablets from Nippur written in Sumerian."
- "Show me the inscription for artifact P100065."
- "Search for tablets whose transliteration mentions barley rations."
- "What periods does CDLI recognize that are close to 'Ur 3'?"
- "Get the bibliography for artifact P005984."
- "Run a CQP query for the lemma 'lugal'."

### Docker

```bash
docker build -f packages/server/Dockerfile -t cdli-mcp-server .
docker run -p 3000:3000 cdli-mcp-server
```
