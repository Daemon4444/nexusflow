# syntax=docker/dockerfile:1.7

FROM node:22.22.1-bookworm-slim AS dependencies
WORKDIR /app
ENV REDISMS_DISABLE_POSTINSTALL=true
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN --mount=type=cache,id=nexusflow-backend-build-npm,target=/root/.npm,sharing=locked \
    npm ci --legacy-peer-deps --workspace backend --include-workspace-root=false

FROM dependencies AS build
ARG BUILD_SHA
ARG BUILD_TIME
ENV BUILD_SHA=${BUILD_SHA} \
    BUILD_TIME=${BUILD_TIME}
COPY backend ./backend
RUN npm run build:backend

FROM node:22.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    REDISMS_DISABLE_POSTINSTALL=true \
    NEXUSFLOW_ENV=production \
    NEXUSFLOW_CONTAINER_RUNTIME=true \
    PORT=3001 \
    GRACEFUL_SHUTDOWN_TIMEOUT_MS=540000

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN --mount=type=cache,id=nexusflow-backend-runtime-npm,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --legacy-peer-deps --workspace backend --include-workspace-root=false \
    && npm cache clean --force
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist

ARG BUILD_SHA
ARG BUILD_TIME
LABEL org.opencontainers.image.title="NexusFlow API" \
      org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}"

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/index.js"]
