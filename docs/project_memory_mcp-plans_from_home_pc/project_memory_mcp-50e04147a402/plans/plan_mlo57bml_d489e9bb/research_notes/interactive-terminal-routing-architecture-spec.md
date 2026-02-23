---
plan_id: plan_mlo57bml_d489e9bb
created_at: 2026-02-15T19:40:00.757Z
sanitized: false
injection_attempts: 0
warnings: 0
---

## Step 1 Architecture Spec — Host-only Interactive Routing Contract

### ADR-IT-001 Decision
Adopt a strict dual-lane runtime contract:
- **Headless lane**: process execution path (`memory_terminal`) with existing strict allowlist policy.
- **Interactive lane**: **host-only bridge** path (`host_bridge_local` in local mode, `container_bridge_to_host` in container mode).

No in-process interactive fallback is allowed in canonical interactive execution.

### Mode Resolution State Machine
1. Parse and canonicalize request.
2. Resolve lane (`headless` vs `interactive`).
3. If lane is `interactive`:
   - local mode -> `host_bridge_local`
   - container mode -> `container_bridge_to_host`
   - if bridge unavailable -> fail closed (`bridge_required_no_fallback`).
4. Resolve identity attach order:
   - explicit target identity
   - existing default interactive instance
   - create new instance
5. Authorization:
   - headless -> strict allowlist gate
   - interactive -> approval required unless allowlisted
6. Dispatch and return typed result/error.

### Decision Table (Canonical)
- `execute + headless + local/container` -> headless adapter, no visibility requirement, allowlist policy.
- `execute + interactive + local` -> host bridge local, **visible window required**, approval unless allowlisted.
- `execute + interactive + container` -> container bridge to host, **visible window required**, approval unless allowlisted, no fallback.
- `read_output/terminate` -> route by owning adapter + identity.
- `list` -> aggregate identities across adapters.

### File-by-file Implementation Blueprint (Executor)
- `server/src/tools/interactive-terminal.tools.ts`: remove/retire in-process interactive path from canonical flow; enforce lane resolver + no fallback + attach order + visibility precondition + typed errors.
- `server/src/tools/interactive-terminal-orchestration.ts`: build deterministic adapter resolver (`headless_process`, `host_bridge_local`, `container_bridge_to_host`) used by canonical execution.
- `server/src/tools/interactive-terminal-contract.ts`: tighten normalization and error taxonomy.
- `server/src/tools/interactive-terminal-protocol.ts`: include identity/approval/visibility/adapter metadata in transport payloads.
- `server/src/tools/terminal-auth.ts`: provide shared policy evaluators (headless strict, interactive approval-unless-allowlisted).
- `server/src/tools/consolidated/memory_terminal_interactive.ts`: align action semantics with resolver outputs.
- `interactive-terminal/src/main.rs`: host identity publication and attach/create semantics wiring.
- `interactive-terminal/src/host_bridge_listener.rs`: bridge handshake and existing-instance routing behavior.
- `interactive-terminal/src/protocol.rs`: message schema parity with server protocol fields.
- `vscode-extension/src/chat/tools/terminal-tool.ts`: preserve canonical payload fields for visibility and target identity.
- `server/src/__tests__/tools/interactive-terminal.test.ts`: add/update contract coverage (routing, visibility, approval, reuse).

### Risks + Compatibility/Migration
- **Breaking behavior**: container interactive fallback removed; non-allowlisted interactive now blocks pending approval.
- **Risk**: bridge health false negatives -> mitigate via transport + protocol handshake and bounded retry.
- **Risk**: identity cache drift -> mitigate with authoritative list-before-create and stale eviction.
- **Migration**: update tests/docs that assumed fallback-to-local success in container interactive mode.

### Test Strategy Mapping
- **Step 8**: targeted tests for host-only routing, visibility guarantee, approval policy, existing-instance attach order.
- **Step 9**: parity matrix runs same interactive/headless scenarios in local and container modes and compares observable outcomes.
- **Step 10**: archive evidence includes ADR decision table, parity results, and compatibility notes.
