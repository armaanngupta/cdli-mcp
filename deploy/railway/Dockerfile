# syntax=docker/dockerfile:1
#
# The public-facing service for a Railway demo deployment: it serves the built SPA *and*
# proxies /chat/api and /mcp to the private services. Combining them keeps the deployment
# to four services rather than five — Railway bills per service, so the extra container
# would be a real monthly cost for a pure routing hop.
#
# Build context is the repo root (the npm workspace lockfile lives there).

FROM node:20-alpine AS build
WORKDIR /app

# Served from the domain root here, unlike the framework deployment which mounts the SPA
# under /chat/. Nothing needs rebasing: the API calls in src/api/ are absolute.
ARG VITE_BASE=/
ENV VITE_BASE=${VITE_BASE}

COPY package.json package-lock.json ./
COPY packages/chat-web/package.json packages/chat-web/package.json
RUN npm ci

COPY packages/chat-web packages/chat-web
RUN npm run build -w @cdli/chat-web

FROM nginx:1.29.3-alpine AS runtime

# The nginx image runs envsubst over /etc/nginx/templates/*.template at startup, then any
# scripts in /docker-entrypoint.d — which is how the upstream hostnames, listen port and
# demo credentials are injected without baking them into the image.
COPY deploy/railway/nginx.conf.template /etc/nginx/templates/default.conf.template
# .envsh (sourced), not .sh (executed in a subshell) — an exported variable has to survive
# into the envsubst step that renders the config. Must be executable either way.
COPY deploy/railway/10-basic-auth.envsh /docker-entrypoint.d/10-basic-auth.envsh
RUN chmod +x /docker-entrypoint.d/10-basic-auth.envsh

COPY --from=build /app/packages/chat-web/dist /usr/share/nginx/html
