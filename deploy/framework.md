# Deploying into `cdli/framework`

This repo is consumed as a git submodule at `app/tools/cdli-mcp`, following the same
pattern as `app/tools/cqp4rdf`. Nothing here is applied automatically — it is the
reference for the framework-side merge request, which touches four files:

1. `.gitmodules`
2. `dev/docker-compose.yml` (and `.dev.yml` / `.gea.yml` / `.alliance.yml`)
3. `dev/conf/nginx.conf`
4. `dev/config.json`

`dev/cdli.py` reads `config.json` and strips services whose `enabled` is false, keying
off the `# Image--<group>:<name>` marker comments — so every service below needs both a
marker and a `config.json` entry, or it will be silently dropped from the generated
compose file.

---

## 1. `.gitmodules`

```
[submodule "app/tools/cdli-mcp"]
	path = app/tools/cdli-mcp
	url = <final remote — see "Open questions">
```

---

## 2. Compose services

One submodule, four services. Every service builds with **context = the submodule root**
and selects its image via `dockerfile:`. That differs from cqp4rdf (one repo, one service,
Dockerfile at its root) and is not stylistic: the npm workspace lockfile lives at the
submodule root, so a per-package build context cannot resolve dependencies.

```yaml
  # Image--app:cdli-mcp
  app_cdli_mcp:
    build:
      context: ../app/tools/cdli-mcp
      dockerfile: packages/server/Dockerfile
    hostname: app_cdli_mcp
    environment:
      # Port-agnostic bare hostnames. The MCP SDK's DNS-rebinding check reads the Host
      # header, which nginx forwards as the public name — not the container's.
      - ALLOWED_HOSTS=cdli.earth
    networks:
      - nodelocal-private

  # Image--app:cdli-chat
  app_cdli_chat:
    build:
      context: ../app/tools/cdli-mcp
      dockerfile: packages/chat-backend/Dockerfile
    hostname: app_cdli_chat
    environment:
      - PORT=8090
      - MCP_URL=http://app_cdli_mcp:3000/mcp
      - PAPER_URL=http://app_cdli_paper:8100
      - CHAT_IDENTITY_SECRET=${CDLI_CHAT_IDENTITY_SECRET}
      - FUNDED_MISTRAL_API_KEY=${CDLI_FUNDED_MISTRAL_API_KEY}
    depends_on:
      - app_cdli_mcp
    networks:
      - nodelocal          # egress: LLM provider APIs
      - nodelocal-private

  # Image--app:cdli-paper
  app_cdli_paper:
    build:
      context: ../app/tools/cdli-mcp
      dockerfile: agent-paper/Dockerfile
    hostname: app_cdli_paper
    environment:
      - MCP_URL=http://app_cdli_mcp:3000/mcp
    depends_on:
      - app_cdli_mcp
    networks:
      - nodelocal          # egress: LLM provider APIs
      - nodelocal-private

  # Image--app:cdli-chat-web
  app_cdli_chat_web:
    build:
      context: ../app/tools/cdli-mcp
      dockerfile: packages/chat-web/Dockerfile
    hostname: app_cdli_chat_web
    networks:
      - nodelocal-private
```

`app_cdli_paper` holds its own MCP client against `app_cdli_mcp` rather than the public
`/mcp` URL — same service, one less hop through nginx.

No published `ports:` — nginx reaches all four over `nodelocal-private`. Add
`ports:` locally only when probing a service directly.

---

## 3. nginx locations

Insert alongside the existing `^~ /cqp4rdf/` block in `dev/conf/nginx.conf`. `^~` prefix
matches resolve longest-first, so `/chat/api/` wins over `/chat/` regardless of ordering.

These blocks follow the file's existing `set $var` + `proxy_pass $var` idiom, which defers
upstream resolution to request time and therefore depends on the `resolver 127.0.0.11;`
already present in the `http` block (line 56). Without it nginx starts cleanly and then
502s on every request.

```nginx
    # The chat SPA. VITE_BASE bakes /chat/ into asset URLs, so the browser requests
    # /chat/assets/... and the rewrite strips the prefix before the container's nginx.
    location ^~ /chat/ {
      set $cdli_chat_web_proxy_pass "http://app_cdli_chat_web:80";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      rewrite ^/chat/?(.*)$ /$1 break;
      proxy_pass $cdli_chat_web_proxy_pass;
    }

    location ^~ /chat/api/ {
      set $cdli_chat_proxy_pass "http://app_cdli_chat:8090";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # SSE. Without these the stream is buffered and the UI shows nothing until the
      # turn ends; a /paper run pauses minutes between nodes, so the default 60s
      # read timeout would kill it outright.
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_buffering off;
      proxy_cache off;
      chunked_transfer_encoding off;
      proxy_read_timeout 1800s;
      proxy_send_timeout 1800s;

      proxy_pass $cdli_chat_proxy_pass;
    }

    # Public and unauthenticated by design (architecture rule: open CORS, no auth).
    location ^~ /mcp {
      set $cdli_mcp_proxy_pass "http://app_cdli_mcp:3000";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # Streamable HTTP responses are SSE too.
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_buffering off;
      proxy_read_timeout 600s;

      proxy_pass $cdli_mcp_proxy_pass;
    }
```

`proxy_buffering` appears nowhere in the current `nginx.conf`, so it is on by default for
every existing proxy — the directives above are additions, not overrides. The 60s default
`proxy_read_timeout` is also very likely the same gateway timeout that kills CQP
multi-word joins today.

---

## 4. `dev/config.json`

Under `"app"`, beside the existing `cake` and `cqp4rdf` entries:

```json
    "cdli-mcp":      { "is_default": true,  "enabled": true, "scale": 1 },
    "cdli-chat":     { "is_default": false, "enabled": true, "scale": 1 },
    "cdli-paper":    { "is_default": false, "enabled": true, "scale": 1 },
    "cdli-chat-web": { "is_default": false, "enabled": true, "scale": 1 }
```

---

## Open questions for the framework MR

- **Submodule remote.** Existing entries are `github.com/cdli-gh/*` and
  `gitlab.com/cdli/*`. The final URL is a mentor decision.
- **`GET /chat/token`.** The funded-LLM tier is unreachable until the CakePHP route that
  mints the identity JWT exists, and `CHAT_IDENTITY_SECRET` must be byte-identical on both
  sides. Chat still works BYOM-only without it.
- **Secrets.** `CDLI_CHAT_IDENTITY_SECRET` and `CDLI_FUNDED_MISTRAL_API_KEY` follow the
  existing `CDLI_POSTFIX_*` / `CF_TURNSTILE_*` convention of being passed through from the
  host environment, never committed.
