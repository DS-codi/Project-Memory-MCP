# Host-only Interactive Terminal + MCP Integration Contract

**Plan ID:** plan_mlo57bml_d489e9bb
**Status:** active
**Priority:** critical
**Current Phase:** Phase 5: Verification
**Current Agent:** Coordinator

## Description

Update interactive terminal and MCP integration so GUI terminal always runs on host, always appears visibly for non-headless command sends, enforces approval except allowlist, behaves identically in local/container app modes, and reuses existing terminal instances for command dispatch.

## Progress

- [x] **Phase 1: Contract Audit:** [analysis] Analyze interactive terminal MCP routing paths and define canonical host-only execution contract (interactive vs headless)
  - _Research completed: current routing/visibility/approval/session-reuse gaps mapped; canonical host-only interactive contract proposed with target files._
- [x] **Phase 1: Contract Audit:** [planning] Produce architecture spec for bridge/runtime selection so GUI commands always route to host in both local and container modes
  - _Architecture spec completed (ADR-IT-001) with state machine, file blueprint, migration and test mapping._
- [x] **Phase 2: Host Routing Enforcement:** [code] Implement guardrails preventing GUI interactive execution in container runtime and forcing host bridge routing
  - _Enforced host-routed interactive execution with fail-closed container bridge preflight and no local fallback; narrowed runtime adapter semantics to local/container bridge only._
- [x] **Phase 2: Host Routing Enforcement:** [code] Implement deterministic adapter selection so non-headless sends use visible interactive terminal and headless sends use dedicated headless path
  - _Deterministic adapter selection enforced for interactive host-routing vs dedicated headless path per ADR-IT-001._
- [x] **Phase 3: Visibility + Session Reuse:** [code] Implement/adjust existing-instance discovery and attach flow so MCP sends commands to existing interactive instance when available
  - _Existing-instance attach/dispatch metadata ordering implemented and covered by targeted tests._
- [x] **Phase 3: Visibility + Session Reuse:** [code] Ensure non-headless sends bring terminal window into visible state and only bypass visibility when explicit headless flag is set
  - _Interactive command requests/responses now explicitly carry visibility=visible semantics for non-headless execution._
- [x] **Phase 4: Approval Policy:** [code] Implement unified approval gate: require approval unless command matches allowlist, with identical behavior in local and container modes
  - _Approval metadata/policy path updated so non-allowlisted interactive commands require approval semantics._
- [x] **Phase 5: Verification:** [validation] Review implementation against behavioral contract and verify no regression in interactive/headless command surfaces
  - _Review pass: contract checks 1-5 satisfied; targeted server vitest suite passed (41/41) for interactive/headless surfaces._
- [x] **Phase 5: Verification:** [test] Add and run targeted tests for host-only routing, visibility semantics, approval/allowlist behavior, and existing-instance command dispatch
  - _Augmented targeted integration coverage in `server/src/__tests__/tools/interactive-terminal.test.ts` to explicitly verify MCP `memory_terminal_interactive` interactive execute path carries viewer/session lifecycle semantics and to assert no unintended headless fallback when container-bridge interactive path is unavailable. Validation: `npx vitest run src/__tests__/tools/interactive-terminal.test.ts --reporter=verbose` => 43/43 passed._
- [ ] **Phase 5: Verification:** [test] Run parity validation matrix in local mode and container mode to confirm identical externally observable behavior 🚫
  - _Execution evidence is PASS but status transition is blocked by required Phase 5 confirmation gate. Test results: local parity assertion 1/1 pass; container-mode contract assertions 3/3 pass; no feature-scope failures. Unblock by confirming Phase 5, then set step to done._
- [ ] **Phase 6: Closeout:** [documentation] Archive completed plan with summary of enforced contract and validation evidence
  - _Starting user-requested MCP-interactive-viewer integration test coverage.
[STALE_RECOVERY 2026-02-15T20:23:10.635Z] Reset stale active run/session state before continuing orchestration._

## Agent Lineage

- **2026-02-15T19:37:49.541Z**: Researcher → Coordinator — _Step 0 research complete: routing map + requirement gap analysis + canonical contract proposal delivered; recommend Architect for Step 1 architecture spec._
- **2026-02-15T19:40:39.496Z**: Architect → Coordinator — _Step 1 architecture spec complete; implementation blueprint and contract are ready for execution._
- **2026-02-15T19:51:34.391Z**: Executor → Coordinator — _Implementation for steps 2–6 completed with targeted tests passing, but plan transitions for steps 3/4/6 are blocked by required phase confirmation gates._
- **2026-02-15T19:51:46.856Z**: Executor → Coordinator — _Implementation and targeted checks are complete; recommend Reviewer to validate contract changes and coordinate phase confirmation-gated statuses._
- **2026-02-15T20:20:03.042Z**: Reviewer → Coordinator — _Step 7 review passed: behavioral contract validated and no regressions detected in interactive/headless surfaces._
- **2026-02-15T20:22:10.774Z**: Tester → Coordinator — _Step 8 targeted verification passed and Step 9 parity matrix passed at feature scope; recommend Archivist after confirmation gate handling._
- **2026-02-15T20:25:00.987Z**: Tester → Coordinator — _Added and validated MCP interactive-terminal tool-path integration tests for viewer/session flow; verification complete._