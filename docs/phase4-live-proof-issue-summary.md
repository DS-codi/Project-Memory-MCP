# Phase 4 Live Proof Issue Summary

## Current Issue

The current blocker is a container-to-host connectivity failure during LIVE PROOF execution of the MCP `memory_terminal` tool.

- Command attempted through MCP tool: `echo hello world`
- Result: tool call failed before approval flow could complete
- Error observed:
  - `Terminal run error: TCP connect failed in container mode after trying 4 host candidate(s) on port 45459`
  - `host.containers.internal:45459 -> ECONNREFUSED 169.254.1.2:45459`
  - `host.docker.internal:45459 -> ECONNREFUSED 169.254.1.2:45459`
  - `127.0.0.1:45459 -> ECONNREFUSED 127.0.0.1:45459`
  - `localhost:45459 -> ECONNREFUSED 127.0.0.1:45459`

## Verified Facts

- The interactive terminal app is running on Windows host and listening on port `45459`.
  - `netstat` output confirms `LISTENING` on `0.0.0.0:45459` and `127.0.0.1:45459`.
- MCP server container is healthy (`project-memory`), but currently exposes only `3000-3002` externally.
- The failure is no longer the previous `/bin/sh ENOENT` issue; that was replaced by explicit TCP bridge connection failure diagnostics.

## Impact

- LIVE PROOF gate cannot pass yet because end-to-end flow stops at TCP connect from containerized MCP server to host GUI bridge.
- Approval dialog verification cannot be completed until this network path is reachable.

## Brief Plan Overview

Plan: `plan_mlp8qxtq_ad821ebf`  
Title: **MCP Terminal Tool & GUI Approval Flow**

- Phase 0-3: Completed (clean slate, protocol alignment, MCP tool surface, TCP adapter)
- Phase 4 implementation work: Completed (tray mode, auto-start, approval dialog behavior, perf monitor)
- Phase 4 resilience fix: Completed (container host-candidate fallback + diagnostics in TCP adapter)
- Phase 4 LIVE PROOF: Still pending/blocking due to container-to-host TCP connectivity
- Phase 5+ work: Not started (gated behind LIVE PROOF)

## Next Step

Establish working connectivity from the MCP server container to the host GUI bridge on `45459`, then rerun LIVE PROOF with the required sequence:

1. Launch GUI app
2. Verify process and listener
3. Execute non-allowlisted command through `memory_terminal`
4. Confirm approval dialog and returned decision path end-to-end
