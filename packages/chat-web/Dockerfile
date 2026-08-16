# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app

# Path the SPA is served under. Only affects generated asset URLs — the API calls in
# src/api/ are absolute (/chat/api/...) and are unaffected.
ARG VITE_BASE=/chat/
ENV VITE_BASE=${VITE_BASE}

COPY package.json package-lock.json ./
COPY packages/chat-web/package.json packages/chat-web/package.json
RUN npm ci

COPY packages/chat-web packages/chat-web
RUN npm run build -w @cdli/chat-web

FROM nginx:1.29.3-alpine AS runtime
COPY packages/chat-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/chat-web/dist /usr/share/nginx/html
EXPOSE 80
