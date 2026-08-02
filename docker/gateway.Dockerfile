# syntax=docker/dockerfile:1.7

# nginx-unprivileged stable-alpine resolved to nginx 1.30.4 on 2026-08-02.
# Pin the multi-architecture OCI index so CI and ACR mirroring cannot drift.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49

ARG BUILD_SHA
ARG BUILD_TIME
LABEL org.opencontainers.image.title="NexusFlow Edge Gateway" \
      org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.base.name="nginxinc/nginx-unprivileged:stable-alpine@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49"

USER 101
EXPOSE 8080
