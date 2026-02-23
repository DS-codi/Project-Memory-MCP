# MCP Terminal Tool Consolidation

**Plan ID:** plan_mlov60n5_21207af6
**Status:** archived
**Priority:** high
**Current Phase:** Phase 1: Unified Contract Design
**Current Agent:** None

## Description

Consolidate memory_terminal and memory_terminal_interactive MCP tools into a single unified tool that always routes through the Rust+QML interactive-terminal application. The consolidated tool must merge all actions from both tools into one surface, support a headless execution mode via an action argument for a strict allowlisted subset, make the headless-allowed subset configurable through GUI app settings/preferences, deprecate and remove the separate memory_terminal tool, and update all docs/agent instructions that reference the old split.

## Progress

- [x] **Phase 1: Unified Contract Design:** [planning] Define the unified terminal MCP contract that merges memory_terminal and memory_terminal_interactive actions into one surface, including canonical action names, legacy aliases, runtime mode semantics (`headless|interactive`), and stable PM_TERM error-code compatibility mapping.
  - _Completed unified MCP terminal contract design in docs/mcp-terminal-tool-consolidation-phase1-contract-routing.md covering canonical actions, legacy aliases, runtime mode semantics, and PM_TERM compatibility mapping._
- [x] **Phase 1: Unified Contract Design:** [planning] Produce a routing architecture note that enforces all terminal requests through the Rust+QML interactive-terminal path, while allowing a strict headless execution subset selected via action/runtime mode arguments.
  - _Completed routing architecture note in docs/mcp-terminal-tool-consolidation-phase1-contract-routing.md enforcing Rust+QML interactive-terminal routing and strict headless subset selection by action/runtime mode; phase confirmation gate acknowledged._
- [x] **Phase 2: Server Surface Consolidation:** [code] Implement unified server tool registration and handler wiring so one MCP tool exposes merged actions and internal dispatch for interactive and headless modes.
  - _Completed unified server terminal handler wiring: memory_terminal_interactive now includes unified allowlist actions and server schema updated to treat it as primary terminal surface; memory_terminal moved to compatibility wrapper delegation path._
- [x] **Phase 2: Server Surface Consolidation:** [code] Port allowlist management capabilities (`get_allowlist`/`update_allowlist` equivalents) into the unified tool surface and bind them to the same policy store used by strict headless authorization.
  - _Ported get_allowlist/update_allowlist to memory_terminal_interactive unified surface, routed to terminal.tools handleGetAllowlist/handleUpdateAllowlist (terminal-auth policy store), and added focused tests validating both actions._
- [x] **Phase 2: Server Surface Consolidation:** [refactor] Add explicit deprecation compatibility layer for legacy memory_terminal calls (alias/shim behavior, deterministic warnings, migration-safe responses), plus a staged removal switch/cutover mechanism.
  - _Phase 2 confirmation reapplied sequentially; step finalized. User preference: keep compatibility bridge temporary/minimal for quick transition._
- [x] **Phase 2: Server Surface Consolidation:** [fix] Apply minimal strict-typing compatibility fix in legacy `memory_terminal` shim to remove TS2352 casts (narrow unified result payload/allowlist mapping without broadening bridge behavior) and re-run server build.
  - _Implemented minimal legacy shim typing fix in memory_terminal.ts by replacing unsafe casts with narrow object guards + allowlist payload mapper. Verified with `npm run build` (pass) and `npx vitest run src/__tests__/tools/interactive-terminal.test.ts` (48/48 pass)._
- [x] **Phase 3: GUI Headless Policy Configuration:** [code] Add Rust+QML settings/preferences model for workspace-scoped headless-allowed subset configuration, including bridge-exposed properties/invokables and persistence boundaries.
  - _Implemented Rust+QML workspace-scoped headless policy settings model and persistence with bridge-exposed properties/invokables and minimal UI editor controls in existing drawer._
- [x] **Phase 3: GUI Headless Policy Configuration:** [code] Integrate GUI-configured headless subset with server-side enforcement path so runtime authorization reflects configured preferences safely and deterministically.
  - _Phase 3 confirmed by user; implementation + targeted verification complete. Finalized active Phase 3 integration step._
- [ ] **Phase 4: Extension + Replay Migration:** [refactor] Rollback extension terminal approval UX artifacts that rely on LanguageModelToolResult markdown links/context cache, while preserving unified terminal contract mapping and non-approval behavior.
  - _Pivot: remove extension-local approval-context cache + approve/deny command-link flow; keep canonical request normalization and tool routing intact._
- [ ] **Phase 4: Extension + Replay Migration:** [test] Refactor extension replay/test harness to assert approval-required passthrough semantics and GUI-managed approval lifecycle instead of extension-side approval-context retry semantics.
  - _Migration checkpoint: replay outputs should no longer depend on extension-side approval context issuance/consumption._
- [ ] **Phase 5: Documentation and Instruction Alignment:** [documentation] Update user docs, architecture docs, and agent instruction references to state approval ownership is the interactive-terminal GUI path (not extension tool-result UX), while preserving unified terminal contract guidance.
  - _Checkpoint: docs explicitly separate contract transport from approval UX surface ownership._
- [ ] **Phase 5: Documentation and Instruction Alignment:** [critical] Implement and verify server-to-GUI approval handshake for allowlist mutations using deterministic request IDs and explicit approve/deny outcomes produced by interactive-terminal. ⚠️
  - _Must reject unauthorized/non-interacted mutations with deterministic deny responses and audit evidence._
- [ ] **Phase 5: Documentation and Instruction Alignment:** [documentation] Publish migration guide addendum covering rollback of extension approval UX, replacement GUI-managed flow, compatibility impact, and rollback safeguards.
  - _Include exact removed extension symbols and retained contract guarantees._
- [ ] **Phase 6: Validation and Build Review:** [validation] Run targeted and integration validations for unified terminal flows with GUI-managed approval (interactive mode, headless mode, allowlist CRUD, alias compatibility, deprecation warnings) and capture pass/fail evidence.
  - _Use registered build/test scripts where available; add script entries if missing for repeatable validation._
- [ ] **Phase 6: Validation and Build Review:** [test] Execute full test pass for server, extension, and interactive-terminal affected suites, verify no regressions in authorization boundaries, and confirm migration checkpoints are satisfied.
  - _Final checkpoint: approve only when compatibility + deprecation + docs criteria are all met._
- [ ] **Phase 6: Cutover Decision:** [validation] Perform final deprecation gate review: confirm unified surface is authoritative, legacy memory_terminal compatibility window obligations are met, and approve/remove remaining split-tool references per migration plan.
  - _Release checkpoint: do not finalize removal if any compatibility or documentation criterion remains unmet._
- [x] **Phase 4: Extension + Replay Migration:** [code] Remove extension-side terminal approval-context UX primitives (Approve/Deny command links and local approval context issuance/validation) from chat terminal tool implementation.
  - _Removed extension-side terminal approval-context UX primitives from terminal tool flow and command wiring. Deleted local approval context cache/helpers and Approve/Deny command-link generation path; canonical and legacy terminal payload routing preserved. Removed tool exports, extension command registrations, and package command contributions for projectMemory.approveTerminalApprovalContext / denyTerminalApprovalContext. Validation: vscode-extension compile passed; targeted replay harness suite passed (20/20); extension test run with Replay grep passed (199 passing); server interactive-terminal targeted suite passed (52/52)._
- [x] **Phase 4: Extension + Replay Migration:** [critical] Implement GUI-managed approval path for all non-allowlisted terminal actions (interactive/headless), requiring interactive-terminal approve/deny decision before execution. ⚠️
  - _Implemented GUI-managed approval lifecycle path for non-allowlisted terminal actions. Added explicit approval-context validation and deterministic PM_TERM approval-required/invalid errors for execute and allowlist mutation flows; preserved blocked destructive command behavior._
- [ ] **Phase 4: Extension + Replay Migration:** [critical] Implement a separate topmost interactive-terminal GUI approval dialog for chat-origin terminal requests that presents request details and returns explicit Approve/Deny decisions to the waiting terminal tool request lifecycle. ⚠️
  - _Dialog must be visually on top, low-latency to open, and wired to deterministic response correlation (request_id/context_id) for tool completion._
- [ ] **Phase 4: Extension + Replay Migration:** [code] Keep the user-facing 'Run headlessly' option mapped to unified runtime semantics while ensuring its approval gating uses GUI-managed flow for non-allowlisted commands.
  - _Preserve already-working mode mapping and avoid unrelated UX additions._
- [ ] **Phase 6: Validation and Build Review:** [validation] Add security validation proving agents cannot autonomously approve or execute non-allowlisted actions and that approval decisions originate only from explicit interactive-terminal GUI actions.
  - _Capture audit evidence for approve/deny/expired/unauthorized flows under GUI-managed authority._

## Agent Lineage

- **2026-02-16T07:48:24.083Z**: Researcher → Coordinator — _Research complete on terminal tool consolidation; recommend Architect to design unified tool contract and migration plan._
- **2026-02-16T07:48:38.323Z**: Researcher → Coordinator — _Research complete. Recommend Architect for solution design and migration architecture._
- **2026-02-16T07:52:50.507Z**: Architect → Coordinator — _Implementation roadmap complete with phased steps, migration checkpoints, and validation gates; recommend Executor to begin implementation._
- **2026-02-16T08:01:01.383Z**: Executor → Coordinator — _Phase 1 steps 0-1 completed with unified contract and routing design artifact; ready for review._
- **2026-02-16T08:09:23.051Z**: Executor → Coordinator — _Phase 2 steps 2-4 implementation completed for server terminal consolidation; ready for Reviewer validation with confirmation-gate note._
- **2026-02-16T08:16:56.315Z**: Reviewer → Coordinator — _Phase 2 review failed due blocking TypeScript build errors in legacy compatibility shim; recommend Revisionist._
- **2026-02-16T08:18:47.620Z**: Revisionist → Coordinator — _Plan pivot applied for TS2352 legacy shim blocker with strict minimal-bridge scope; ready for implementation retry._
- **2026-02-16T08:23:59.003Z**: Executor → Coordinator — _Inserted Phase 2 blocker-fix step 5 completed and verified; ready for review._
- **2026-02-16T08:26:26.543Z**: Reviewer → Coordinator — _Blocker-fix review passed; TS2352 legacy shim issue closed with fresh build/test verification._
- **2026-02-16T09:18:31.646Z**: Executor → Coordinator — _Phase 3 implementation complete and verified; ready for review/build-check with confirmation-gate note._
- **2026-02-16T09:44:16.683Z**: Reviewer → Coordinator — _Phase 3 focused review closeout passed with fresh build/test evidence; recommend proceeding to Phase 4 implementation._
- **2026-02-16T11:31:26.755Z**: Revisionist → Coordinator — _Plan pivot applied: rollback extension-side terminal approval UX and shift approval authority to interactive-terminal GUI-managed flow._
- **2026-02-16T12:57:53.788Z**: Executor → Coordinator — _Step 16 rollback pivot implemented and validated; ready for review/build-check._
- **2026-02-16T13:12:35.322Z**: Executor → Coordinator — _Implementation and targeted validation complete for topmost approval dialog and deterministic request correlation; step 18 requires explicit user confirmation gate before status update. Recommend Coordinator obtain confirmation, then route to Reviewer._