# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/chat-backend/package.json packages/chat-backend/package.json
RUN npm ci

COPY packages/chat-backend packages/chat-backend
RUN npm run build -w @cdli/chat-backend

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/chat-backend/package.json packages/chat-backend/package.json
RUN npm ci --omit=dev

COPY --from=build /app/packages/chat-backend/dist packages/chat-backend/dist

WORKDIR /app/packages/chat-backend
EXPOSE 8090
CMD ["node", "dist/index.js"]
