# GCP demo deployment

A short-lived, password-protected deployment on a Compute Engine VM so mentors can try the
whole stack without CDLI infrastructure. **Not the production shape** — that is
[`deploy/framework.md`](../framework.md), where this runs as a submodule of `cdli/framework`.

| | Framework (production) | GCP (demo) |
|---|---|---|
| SPA path | `cdli.earth/chat/` | domain root `/` |
| TLS | framework nginx | Caddy, automatic Let's Encrypt |
| Front proxy | framework nginx | Caddy |
| `/mcp` | public, no auth | public, no auth (same) |
| Identity / funded tier | CakePHP mints a token | unavailable — BYOM only |

A VM rather than Cloud Run: `/paper` takes 1–2 minutes, and a scale-to-zero service would
meet a mentor's first run with a cold start on top of that. The existing compose stack also
runs unchanged here, which Cloud Run would not.

---

## 1. The VM

- **Machine:** `e2-medium` (2 vCPU, 4 GB), Debian 12
- **Firewall:** allow HTTP and HTTPS
- **Networking:** reserve a static external IP

4 GB is not for runtime — the stack measures ~340 MiB idle and ~444 MiB peak. It is for the
image build: `npm ci` plus the Vite build alongside four running containers is where a 2 GB
box runs out of memory.

Cost is roughly **$27/month**, so about **$81** for a 90-day window — well inside $300 of
credit. A static IP adds ~$3/month.

## 2. Docker

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker
```

## 3. Hostname

Let's Encrypt will not issue for a bare IP. Either use a domain you control, or a free
[DuckDNS](https://www.duckdns.org) subdomain pointed at the static IP. Confirm it resolves
before continuing — a failed challenge counts against Let's Encrypt's rate limit.

## 4. Clone and configure

```bash
git clone -b final/deploy <repo-url> cdli-mcp && cd cdli-mcp

# Basic Auth credential. Keep the plaintext; the hash is one-way.
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-password'

cat > .env <<'EOF'
SITE_ADDRESS=cdli-demo.duckdns.org
ALLOWED_HOSTS=cdli-demo.duckdns.org
BASIC_AUTH_USER=demo
BASIC_AUTH_HASH=$$2a$$14$$rest-of-the-hash-unchanged
EOF
```

> **Double every `$` in the hash.** Compose interpolates `$NAME` in `.env` values, so a raw
> `$2a$14$i3j1…` arrives at the container as a 37-character stump with the middle silently
> blanked — and Basic Auth then rejects every login with nothing in the logs to explain it.
> `$$` is an escaped literal `$`. Only the three separators need it; bcrypt's body uses just
> `A–Za–z0–9./`. Using `env_file:` instead does **not** avoid this — it interpolates too.
>
> Verify after starting: `docker compose exec caddy printenv BASIC_AUTH_HASH` must print
> **60 characters** beginning `$2a$14$`.

`ALLOWED_HOSTS` must be the **bare hostname** — no scheme, no port. The MCP SDK's
DNS-rebinding check ignores the port, and a wrong value produces a 403 that looks exactly
like a networking fault.

Set only the public hostname here: the overlay appends `app_cdli_mcp,localhost,127.0.0.1`
itself. Those are needed because chat-backend and agent-paper reach the MCP server over the
internal `app_cdli_mcp` alias, and a value listing only the public hostname fails every
internal call with `Invalid Host: app_cdli_mcp` — which the SPA reports as a generic error.

The chat backend also reads `packages/chat-backend/.env` if present, for
`CHAT_IDENTITY_SECRET` and `FUNDED_MISTRAL_API_KEY`. Both are optional here: without the
CakePHP token route the funded tier is unreachable, so the demo is bring-your-own-key.

## 5. Up

```bash
docker compose -f docker-compose.yml -f deploy/gcp/docker-compose.gcp.yml \
  up -d --build --scale nginx=0
```

`--scale nginx=0` keeps the local-development proxy out of the way; Caddy replaces it, and
compose cannot delete a service an overlay inherits.

First build takes several minutes. Caddy requests a certificate on first request to the
hostname; `docker compose logs caddy` shows the outcome.

## 6. Verify in order

1. `docker compose ps` — five containers up, `nginx` absent
2. `https://<host>/` — browser asks for credentials, then the SPA loads over TLS
3. `curl -X POST https://<host>/mcp -d '{}'` → **406**, with **no credentials**. Correct:
   `/mcp` is deliberately exempt from Basic Auth so any MCP client can connect, and 406
   means Streamable HTTP wants an `Accept` header — so the server is reachable.
4. In the SPA: choose Mistral, paste a key, ask *"Find Ur III tablets from Nippur"* — expect
   a tool indicator and then text arriving **incrementally**. All at once means buffering.
5. `/paper temple offerings at Girsu` — 1–2 minutes, ending in a downloadable PDF. This is
   the real test: it exercises all four services.

| Symptom | Cause |
|---|---|
| `/mcp` returns 403 | `ALLOWED_HOSTS` — bare hostname? |
| No certificate | hostname does not resolve to this VM, or 80/443 blocked |
| Answer arrives in one lump | `flush_interval -1` missing from the Caddyfile |
| 502 on `/chat/api` | chat-backend not up; `docker compose logs chat-backend` |

## 7. Afterwards

```bash
docker compose -f docker-compose.yml -f deploy/gcp/docker-compose.gcp.yml down
```

**Delete the VM and release the static IP when the review window closes** — both bill while
they exist, credits or not.

---

## For mentors

**URL:** *(fill in)*  **Credentials:** *(fill in)*

You need your own LLM API key — the CDLI-funded tier requires CakePHP and is not deployed
here. A free [Mistral](https://console.mistral.ai/) key is enough.

1. Open the URL and enter the Basic Auth credentials.
2. Sidebar: choose **Mistral**, paste your key, set any PIN. The key is encrypted with the PIN
   and kept in your browser — it never reaches the server.
3. Things to try:
   - `Find Ur III administrative tablets from Nippur` — searches the real catalogue
   - `/artifact P100141` — one artifact, metadata and inscription
   - `/cqp w1:[ ( conll:FORM = "lugal" ) ]` — a corpus query
   - `/paper temple offerings at Girsu` — **1–2 minutes**, 15–30 model calls, ends in a PDF

`/mcp` is open, so it can be added to Claude Desktop, Claude Code or any MCP client directly:

```bash
claude mcp add --transport http cdli-demo https://<host>/mcp
```

Note the consequence: an unauthenticated `/mcp` on an unattended VM is an open proxy onto
CDLI's API, and nothing rate-limits it (the per-user limits live in chat-backend, which this
path bypasses). Acceptable for a short review window; worth watching the CDLI-side load.

Known limitations in this demo:

- **Groq does not work for tool calls** — both available models emit malformed calls. Use
  Mistral, OpenAI, Anthropic or Google.
- The PDF's AI-disclosure footer is working wording, not yet approved by CDLI.
- Sign-in and the funded tier are absent; everything is bring-your-own-key.
