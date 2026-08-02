# syntax=docker/dockerfile:1.7

FROM node:22.22.1-bookworm-slim AS dependencies
WORKDIR /app
ENV REDISMS_DISABLE_POSTINSTALL=true
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN --mount=type=cache,id=nexusflow-frontend-build-npm,target=/root/.npm,sharing=locked \
    npm ci --legacy-peer-deps --workspace frontend --include-workspace-root=false

FROM dependencies AS build
ARG BUILD_SHA
ARG BACKEND_URL=http://nexusflow-api:3001
ENV BUILD_SHA=${BUILD_SHA} \
    BACKEND_URL=${BACKEND_URL} \
    NEXT_TELEMETRY_DISABLED=1
COPY frontend ./frontend
RUN npm run build:frontend

FROM node:22.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    BACKEND_URL=http://nexusflow-api:3001

COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public

ARG BUILD_SHA
ARG BUILD_TIME
LABEL org.opencontainers.image.title="NexusFlow Web" \
      org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}"

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]
