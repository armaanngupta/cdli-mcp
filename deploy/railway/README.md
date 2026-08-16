# Railway demo deployment

A short-lived, password-protected deployment so mentors and reviewers can try the whole
stack without CDLI infrastructure. **Not the production shape** — that is
[`deploy/framework.md`](../framework.md), where this runs as a submodule of `cdli/framework`.

Differences from production, on purpose:

| | Framework (production) | Railway (demo) |
|---|---|---|
| SPA path | `cdli.earth/chat/` | domain root `/` |
| TLS | framework nginx | Railway's edge |
| `/mcp` | public, no auth | behind Basic Auth |
| Identity / funded tier | CakePHP mints a token | unavailable — BYOM only |
| Services | 4 + framework nginx | 4 (the public one also proxies) |

---

## Services

Four Railway services from this one repo. Only **web** gets a public domain; the rest talk
over Railway's private network at `<service>.railway.internal`.

| Service | Dockerfile | Port | Public |
|---|---|---|---|
| `web` | `deploy/railway/Dockerfile` | `$PORT` | ✅ |
| `chat-backend` | `packages/chat-backend/Dockerfile` | 8090 | — |
| `mcp` | `packages/server/Dockerfile` | 3000 | — |
| `agent-paper` | `agent-paper/Dockerfile` | 8100 | — |

`web` serves the built SPA *and* proxies `/chat/api` and `/mcp`. Combining them keeps this to
four services rather than five — Railway bills per service, so a container that only routes
would be a real monthly cost.

**Set the root directory to the repo root for every service**, not the package directory:
the npm workspace lockfile lives at the root and the Node builds need it.

---

## Environment variables

**web**
```
CHAT_BACKEND_HOST = chat-backend.railway.internal:8090
MCP_HOST          = mcp.railway.internal:3000
DNS_RESOLVER      = fd12::10          # Railway's internal resolver; see note below
BASIC_AUTH        = demo:$2y$05$...   # output of: htpasswd -nbB demo <password>
```

**chat-backend**
```
PORT                   = 8090
MCP_URL                = http://mcp.railway.internal:3000/mcp
PAPER_URL              = http://agent-paper.railway.internal:8100
CHAT_IDENTITY_SECRET   = (optional; the funded tier is unreachable without CakePHP)
FUNDED_MISTRAL_API_KEY = (optional, same reason)
```

**mcp**
```
ALLOWED_HOSTS = <your-app>.up.railway.app
```
> The MCP SDK's DNS-rebinding check reads the `Host` header and **ignores the port**, so use
> the bare hostname. Getting this wrong produces a 403 that looks exactly like a networking
> fault — check it first if `/mcp` misbehaves.

**agent-paper**
```
MCP_URL = http://mcp.railway.internal:3000/mcp
HOST    = ::        # only needed on environments created before 2025-10-16 (IPv6-only)
```

### Two things that bite

**Private networking and IPv6.** Environments created before 2025-10-16 route private traffic
over IPv6 only, where binding `0.0.0.0` is unreachable. The Node services bind dual-stack
already; uvicorn does not, which is why `agent-paper` takes a `HOST` variable. New
environments support both, so you can usually leave it unset.

**`DNS_RESOLVER`.** nginx resolves the upstreams at request time (they are held in variables,
so one service restarting cannot take nginx down with it), and that needs a resolver address.
Use Railway's internal DNS; if a lookup fails, `docker logs` on the web service will say so
plainly. `8.8.8.8` is the fallback default but will not resolve `.railway.internal`.

---

## Deploying

1. New Railway project → **Deploy from GitHub repo**, pointing at this repository.
2. Create the four services above. For each: root directory `/`, and set the Dockerfile path.
3. Add the environment variables.
4. On `web` only: **Settings → Networking → Generate Domain**.
5. Set `ALLOWED_HOSTS` on `mcp` to that domain, then redeploy `mcp`.

Generate the Basic Auth credential locally:

```bash
docker run --rm alpine:3 sh -c \
  'apk add --no-cache apache2-utils >/dev/null; htpasswd -nbB demo <password>'
```

### Cost

Measured on the local compose stack (`docker stats`), not estimated:

| Service | Idle | Peak |
|---|---|---|
| `agent-paper` | 157 MiB | 261 MiB during a full `/paper` run |
| `chat-backend` | 100 MiB | — |
| `mcp` | 62 MiB | — |
| `web` | ~21 MiB | — |
| **total** | **~340 MiB** | ~444 MiB |

Every service is well inside the Free plan's 0.5 GB per-service cap. At $0.00000386 per
GB-second that is about **$0.13/day**, so ~$1.80 for a two-week review window and ~$3.90 for
the full 30-day trial — the trial's $5 of credits covers it.

**Delete the project when the review window closes** — it bills per second whether anyone
visits or not, and the trial becomes $1/month afterwards.

---

## For mentors

**URL:** *(fill in after step 4)*  **Credentials:** *(fill in)*

You need your own LLM API key — the CDLI-funded tier needs CakePHP and is not deployed here.
A free [Mistral](https://console.mistral.ai/) key is enough.

1. Open the URL and enter the Basic Auth credentials.
2. In the sidebar: choose **Mistral**, paste your key, set any PIN. The key is encrypted with
   the PIN and kept in your browser — it is never stored on the server.
3. Try the starter prompts, or:
   - `Find Ur III administrative tablets from Nippur` — searches the real catalogue
   - `/artifact P100141` — one artifact, metadata and inscription
   - `/cqp w1:[ ( conll:FORM = "lugal" ) ]` — a corpus query
   - `/paper temple offerings at Girsu` — **takes 1–2 minutes** and makes 15–30 model calls,
     so expect it to use some quota. Ends with a downloadable PDF.

Known limitations in this demo:

- **Groq does not work for tool calls** — both available models emit malformed calls. Use
  Mistral, OpenAI, Anthropic or Google.
- The PDF's AI-disclosure footer is working wording, not yet approved by CDLI.
- Sign-in and the funded tier are absent; everything is bring-your-own-key.
