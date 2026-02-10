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

cleanup() {
  if [ -n "$SHUTTING_DOWN" ]; then return; fi
  SHUTTING_DOWN=1
  echo ""
  echo "[entrypoint] Shutting down..."
  
  if [ -n "$MCP_PID" ] && kill -0 "$MCP_PID" 2>/dev/null; then
    echo "[entrypoint] Stopping MCP server (PID $MCP_PID)..."
    kill -TERM "$MCP_PID" 2>/dev/null || true
  fi
  
  if [ -n "$DASHBOARD_PID" ] && kill -0 "$DASHBOARD_PID" 2>/dev/null; then
    echo "[entrypoint] Stopping Dashboard server (PID $DASHBOARD_PID)..."
    kill -TERM "$DASHBOARD_PID" 2>/dev/null || true
  fi
  
  # Wait for children to exit
  wait 2>/dev/null
  echo "[entrypoint] Shutdown complete."
  exit 0
}

trap cleanup INT TERM

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
