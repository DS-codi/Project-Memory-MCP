# New Systems Test Checklist (Post-Tag)

Baseline:
- Compare current HEAD against tag `work-machine-snapshot-2026-02-21`
- Scope is newly added or expanded systems after the tagged stable build

## 1) Supervisor Core + Control Plane

- [ ] Build `supervisor` crate cleanly
- [ ] Validate single-instance lock behavior (second launch is rejected/attached)
- [ ] Verify named-pipe control endpoint responds to status command
- [ ] Verify handshake rejection for invalid identity payload
- [ ] Verify backend switch flow (`node` <-> `container`) updates registry state
- [ ] Verify reconnect state machine transitions after simulated endpoint drop
- [ ] Validate observability logs redact secrets and include transition reason fields

## 2) VS Code Extension Supervisor Integration

- [ ] Extension activation succeeds when supervisor already running
- [ ] Extension activation auto-starts supervisor when missing (startup mode allows)
- [ ] Startup timeout path enters degraded mode with actionable messaging
- [ ] `startupMode=off` suppresses auto-launch behavior
- [ ] Detect timeout settings are honored and do not stall activation

## 3) Program v2 Storage + Tools

- [ ] Create/read/update/archive program lifecycle operations
- [ ] Program manifest add/remove/list plan behavior
- [ ] Program dependency graph cycle detection blocks invalid edges
- [ ] Phase announcer unblocks dependent plan phase as expected
- [ ] Risk detector classifies blocker notes into expected risk categories
- [ ] Migration advisor identifies legacy patterns without false positives on v2 plans

## 4) Preflight + Contract Validation

- [ ] Action-to-parameter mapping validates required fields for tool actions
- [ ] Invalid action param combinations fail preflight with clear error
- [ ] Contract builder output remains consistent with tool schemas
- [ ] Preflight does not reject valid existing workflows (regression pass)

## 5) GUI Forms + Brainstorm/Approval Routing

- [ ] `pm-gui-forms` protocol parsing tests pass (questions/answers/refinement)
- [ ] Approval routing returns expected envelope and timeout behavior
- [ ] Brainstorm routing returns expected structure and refinement fields
- [ ] Supervisor-client bridge handles unavailable GUI host gracefully
- [ ] End-to-end routing fallback path works when GUI cannot launch

## 6) Dashboard Schema-v2 UX Additions

- [ ] Phase list view renders grouped phase cards with correct progress
- [ ] Risk register panel displays severity/status correctly
- [ ] Session/handoff stats panels render with non-empty lineage data
- [ ] Skill match panel and categorization badges render for v2 plans
- [ ] Program detail enhanced dependency graph and risk overview render
- [ ] Legacy (v1) plans still render without runtime errors/regressions

## 7) Cross-System Regression Gates

- [ ] Server TypeScript compile passes (`server`)
- [ ] Extension compile passes (`vscode-extension`)
- [ ] Supervisor Rust tests pass
- [ ] GUI crates build (`pm-gui-forms`, `pm-approval-gui`, `pm-brainstorm-gui`)
- [ ] No regression to protected program route/data for `plan_mlkjmemm_f04cebfc`

## 8) Suggested Execution Order

1. Build + static checks (server, extension, Rust crates)
2. Supervisor control-plane tests
3. Program/preflight server tool tests
4. GUI routing tests
5. Dashboard behavior tests (v2 then v1 compatibility)
6. Final integration sanity pass on active program routes
