#!/usr/bin/env bash
#
# Run the whole stack natively, without Docker, with hot reload on every service.
#
#   ./scripts/dev.sh          then open http://localhost:5173/
#
# No nginx is involved: Vite's dev server proxies /chat/api to the chat backend, and
# VITE_BASE is unset so the SPA is served from / rather than /chat/. Use docker-compose.yml
# instead when you need the production-shaped routing.
#
# agent-paper reads no .env file by design — MCP_URL is exported below. The LLM key is
# supplied per request by the SPA, not by the environment.
#
# Ctrl+C stops all four.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

MCP_PORT=3000
CHAT_PORT=8090
PAPER_PORT=8100
WEB_PORT=5173

fail() {
  echo "error: $*" >&2
  exit 1
}

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3<&- && return 0
  return 1
}

command -v node >/dev/null || fail "node not found (Node >= 20 required)"
command -v npm >/dev/null || fail "npm not found"
[ -d node_modules ] || fail "dependencies not installed — run: npm install"

# /paper is optional: the chat stack is fully usable without it, so a missing uv degrades
# rather than blocks.
RUN_PAPER=1
if ! command -v uv >/dev/null; then
  echo "warning: uv not found — skipping agent-paper, /paper will be unavailable"
  RUN_PAPER=0
fi

for entry in "$MCP_PORT mcp" "$CHAT_PORT chat-backend" "$WEB_PORT chat-web"; do
  set -- $entry
  port_busy "$1" && fail "port $1 already in use (needed by $2)"
done
if [ "$RUN_PAPER" = 1 ] && port_busy "$PAPER_PORT"; then
  fail "port $PAPER_PORT already in use (needed by agent-paper)"
fi

[ -f packages/chat-backend/.env ] ||
  echo "note: packages/chat-backend/.env missing — BYOM works, funded tier does not"

cleanup() {
  trap - INT TERM EXIT
  echo
  echo "stopping..."
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

start() {
  local name=$1
  shift
  "$@" 2>&1 | sed -u "s/^/[$name] /" &
}

export MCP_URL="http://localhost:$MCP_PORT/mcp"
export PAPER_URL="http://localhost:$PAPER_PORT"

start mcp npm run dev:http -w @cdli/server
start chat npm run dev -w @cdli/chat-backend
[ "$RUN_PAPER" = 1 ] &&
  start paper uv run --directory agent-paper uvicorn agent_paper.service:app --port "$PAPER_PORT"
start web npm run dev -w @cdli/chat-web

echo
echo "  SPA         http://localhost:$WEB_PORT/"
echo "  chat api    http://localhost:$CHAT_PORT/chat/api/message"
echo "  mcp         http://localhost:$MCP_PORT/mcp"
[ "$RUN_PAPER" = 1 ] && echo "  paper       http://localhost:$PAPER_PORT/paper"
echo

wait
