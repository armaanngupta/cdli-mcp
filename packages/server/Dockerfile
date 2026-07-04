# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
RUN npm ci

COPY packages/server packages/server
RUN npm run build -w @cdli/server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
RUN npm ci --omit=dev

COPY --from=build /app/packages/server/dist packages/server/dist

WORKDIR /app/packages/server
EXPOSE 3000
CMD ["node", "dist/index-http.js"]
