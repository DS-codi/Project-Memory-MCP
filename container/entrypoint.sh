#!/bin/sh
# =============================================================================
# Container Entrypoint
#
# Starts both the MCP server (HTTP transport) and the Dashboard server.
# Uses background processes with signal trapping for graceful shutdown.
#
# Environment variables:
#   MBS_DATA_ROOT    — Data directory (default: /data)
#   MBS_AGENTS_ROOT  — Agents directory (default: /agents)
#   MCP_PORT         — MCP HTTP port (default: 3000)
#   DASHBOARD_PORT   — Dashboard API port (default: 3001)
#   WS_PORT          — Dashboard WebSocket port (default: 3002)
# =============================================================================

# Don't use set -e — we manage exit codes ourselves
MCP_PORT="${MCP_PORT:-3000}"
DASHBOARD_PORT="${DASHBOARD_PORT:-3001}"
WS_PORT="${WS_PORT:-3002}"
MBS_DATA_ROOT="${MBS_DATA_ROOT:-/data}"
MBS_AGENTS_ROOT="${MBS_AGENTS_ROOT:-/agents}"

export MBS_DATA_ROOT MBS_AGENTS_ROOT

echo "=== Project Memory Container ==="
echo "  MCP Server:      port ${MCP_PORT} (streamable-http + sse)"
echo "  Dashboard API:   port ${DASHBOARD_PORT}"
echo "  Dashboard WS:    port ${WS_PORT}"
echo "  Data root:       ${MBS_DATA_ROOT}"
echo "  Agents root:     ${MBS_AGENTS_ROOT}"
echo "================================="

# Ensure data directory exists
mkdir -p "${MBS_DATA_ROOT}/logs"

# Track child PIDs for cleanup
MCP_PID=""
DASHBOARD_PID=""
SHUTTING_DOWN=""

# Flush in-memory state to disk before exit.
# The MCP server writes workspace data to MBS_DATA_ROOT; syncing ensures
# nothing is lost when the container is stopped gracefully.
flush_state() {
  echo "[entrypoint] Flushing state to disk..."
  # Sync any pending writes in MBS_DATA_ROOT
  sync 2>/dev/null || true
  # Touch a shutdown marker so the extension knows it was graceful
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${MBS_DATA_ROOT}/last_graceful_shutdown" 2>/dev/null || true
  echo "[entrypoint] State flush complete."
}

cleanup() {
  if [ -n "$SHUTTING_DOWN" ]; then return; fi
  SHUTTING_DOWN=1
  echo ""
  echo "[entrypoint] Shutting down (signal received)..."

  # Flush state before killing processes
  flush_state

  if [ -n "$MCP_PID" ] && kill -0 "$MCP_PID" 2>/dev/null; then
    echo "[entrypoint] Stopping MCP server (PID $MCP_PID)..."
    kill -TERM "$MCP_PID" 2>/dev/null || true
  fi

  if [ -n "$DASHBOARD_PID" ] && kill -0 "$DASHBOARD_PID" 2>/dev/null; then
    echo "[entrypoint] Stopping Dashboard server (PID $DASHBOARD_PID)..."
    kill -TERM "$DASHBOARD_PID" 2>/dev/null || true
  fi

  # Give children up to 5 seconds to exit gracefully
  WAIT_COUNT=0
  while [ $WAIT_COUNT -lt 10 ]; do
    ALIVE=0
    [ -n "$MCP_PID" ] && kill -0 "$MCP_PID" 2>/dev/null && ALIVE=1
    [ -n "$DASHBOARD_PID" ] && kill -0 "$DASHBOARD_PID" 2>/dev/null && ALIVE=1
    [ $ALIVE -eq 0 ] && break
    sleep 0.5
    WAIT_COUNT=$((WAIT_COUNT + 1))
  done

  # Force-kill anything still alive
  [ -n "$MCP_PID" ] && kill -0 "$MCP_PID" 2>/dev/null && kill -9 "$MCP_PID" 2>/dev/null
  [ -n "$DASHBOARD_PID" ] && kill -0 "$DASHBOARD_PID" 2>/dev/null && kill -9 "$DASHBOARD_PID" 2>/dev/null

  wait 2>/dev/null
  echo "[entrypoint] Shutdown complete."
  exit 0
}

trap cleanup INT TERM QUIT

# ---------- Start MCP Server (HTTP transport) ----------
echo "[entrypoint] Starting MCP server..."
node /app/server/dist/index.js \
  --transport streamable-http \
  --port "${MCP_PORT}" 2>&1 &
MCP_PID=$!
echo "[entrypoint] MCP server PID: ${MCP_PID}"

# ---------- Start Dashboard Server ----------
echo "[entrypoint] Starting Dashboard server..."
PORT="${DASHBOARD_PORT}" WS_PORT="${WS_PORT}" \
  node /app/dashboard/server/dist/index.js 2>&1 &
DASHBOARD_PID=$!
echo "[entrypoint] Dashboard server PID: ${DASHBOARD_PID}"

# ---------- Readiness check ----------
# Wait for the MCP server to respond on /health before declaring ready.
# This lets Podman's healthcheck pass sooner and signals to the extension
# that the container is accepting connections.
echo "[entrypoint] Waiting for MCP server readiness..."
READY_ATTEMPTS=0
MAX_READY_ATTEMPTS=30
while [ $READY_ATTEMPTS -lt $MAX_READY_ATTEMPTS ]; do
  if wget -q -O /dev/null "http://localhost:${MCP_PORT}/health" 2>/dev/null; then
    echo "[entrypoint] MCP server is ready."
    break
  fi
  READY_ATTEMPTS=$((READY_ATTEMPTS + 1))
  sleep 1
done
if [ $READY_ATTEMPTS -ge $MAX_READY_ATTEMPTS ]; then
  echo "[entrypoint] WARNING: MCP server did not become ready within ${MAX_READY_ATTEMPTS}s"
fi

# ---------- Wait for processes (POSIX-compatible) ----------
echo "[entrypoint] Both servers started. Waiting..."

# POSIX wait: wait for all background jobs.
# If either process crashes, the wait returns and we poll.
while true; do
  # Check if either child has died
  if ! kill -0 "$MCP_PID" 2>/dev/null; then
    wait "$MCP_PID" 2>/dev/null
    EXIT_CODE=$?
    echo "[entrypoint] MCP server exited with code ${EXIT_CODE}"
    cleanup
    break
  fi
  if ! kill -0 "$DASHBOARD_PID" 2>/dev/null; then
    wait "$DASHBOARD_PID" 2>/dev/null
    EXIT_CODE=$?
    echo "[entrypoint] Dashboard server exited with code ${EXIT_CODE}"
    cleanup
    break
  fi
  # Sleep briefly to avoid busy-waiting
  sleep 2
done
