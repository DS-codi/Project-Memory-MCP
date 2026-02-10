# =============================================================================
# Project Memory — Containerfile (Podman/Docker)
#
# Multi-stage build packaging the MCP server and dashboard into one image.
#
# Ports:
#   3000 — MCP server (Streamable HTTP + SSE)
#   3001 — Dashboard Express API
#   3002 — Dashboard WebSocket
#
# Volume mount:
#   /data    — Persistent workspace data, plans, context, logs
#   /agents  — Agent instruction files (read-only recommended)
#
# Build:
#   podman build -t project-memory .
#
# Run:
#   podman run -p 3000:3000 -p 3001:3001 -p 3002:3002 \
#     -v ./data:/data -v ./agents:/agents:ro \
#     project-memory
#
# @see Phase 6B of docs/infrastructure-improvement-plan.md
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build MCP server + Dashboard
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /build

# ---- MCP Server ----
COPY server/package*.json server/
COPY server/tsconfig.json server/
COPY server/src/ server/src/

# ---- Dashboard (frontend + Express server) ----
COPY dashboard/package*.json dashboard/
COPY dashboard/tsconfig.json dashboard/
COPY dashboard/tsconfig.node.json dashboard/
COPY dashboard/vite.config.ts dashboard/
COPY dashboard/postcss.config.js dashboard/
COPY dashboard/tailwind.config.js dashboard/
COPY dashboard/index.html dashboard/
COPY dashboard/src/ dashboard/src/
COPY dashboard/public/ dashboard/public/
COPY dashboard/server/ dashboard/server/

# Install & build MCP server
WORKDIR /build/server
RUN npm ci --ignore-scripts && npm run build

# Install & build dashboard frontend + server
WORKDIR /build/dashboard
RUN npm ci --ignore-scripts && \
    npx tsc -p tsconfig.node.json --noEmit || true && \
    npx vite build && \
    npx tsc -p server/tsconfig.json --outDir server/dist || true

# ---------------------------------------------------------------------------
# Stage 2: Runtime image
# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime

# Install tini for proper signal handling (PID 1)
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends tini && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- MCP Server runtime ----
COPY --from=builder /build/server/package*.json server/
COPY --from=builder /build/server/dist/ server/dist/
WORKDIR /app/server
RUN npm ci --omit=dev --ignore-scripts
WORKDIR /app

# ---- Dashboard runtime ----
COPY --from=builder /build/dashboard/package*.json dashboard/
COPY --from=builder /build/dashboard/dist/ dashboard/dist/
COPY --from=builder /build/dashboard/server/dist/ dashboard/server/dist/
COPY --from=builder /build/dashboard/server/package*.json dashboard/server/
# Install dashboard server deps  
WORKDIR /app/dashboard
RUN npm ci --omit=dev --ignore-scripts || true
WORKDIR /app/dashboard/server
RUN npm ci --omit=dev --ignore-scripts || true
WORKDIR /app

# ---- Entrypoint script ----
COPY container/entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# ---- Volume mount points ----
RUN mkdir -p /data /agents

# ---- Environment defaults ----
ENV MBS_DATA_ROOT=/data
ENV MBS_AGENTS_ROOT=/agents
ENV MCP_PORT=3000
ENV DASHBOARD_PORT=3001
ENV WS_PORT=3002
ENV NODE_ENV=production

# ---- Expose ports ----
EXPOSE 3000 3001 3002

# ---- Health check ----
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://localhost:3000/health',res=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.setTimeout(3000,()=>{r.destroy();process.exit(1)})"

# Use tini as PID 1 for signal forwarding
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/entrypoint.sh"]
