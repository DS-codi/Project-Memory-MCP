# MCP Terminal Tool Consolidation — Phase 1 Contract & Routing Design

Date: 2026-02-16
Plan: `plan_mlov60n5_21207af6`
Phase: `Phase 1: Unified Contract Design` (Steps 0-1)
Status: Design approved for downstream implementation phases

## Scope and Constraints

- This document defines only Phase 1 design deliverables.
- No implementation/code migration is performed in this phase.
- Terminal requests must route through the Rust+QML interactive-terminal path.
- Headless execution is permitted only as a strict, policy-controlled subset selected by action/runtime mode.

---

## 1) Unified MCP Terminal Contract (Step 0)

### 1.1 Authoritative Tool Surface

Use a single terminal tool surface with this canonical action set:

- `execute`
- `read_output`
- `terminate`
- `list`

This unified surface supersedes split assumptions between prior server/extension terminal tools.

### 1.2 Legacy Alias Compatibility

Legacy action compatibility is deterministic and one-way:

| Legacy action | Canonical action | Notes |
| --- | --- | --- |
| `run` | `execute` | Command execution semantics preserved |
| `send` | `execute` | Interactive attach/send maps to execute |
| `create` | `execute` | Must set intent `open_only` |
| `kill` | `terminate` | Session/terminal target preserved |
| `close` | `terminate` | Terminal close maps to terminate |
| `list` | `list` | No semantic change |

Compatibility behavior requirements:

1. Alias resolution must be explicit in response metadata.
2. Unknown aliases fail with a canonical migration hint.
3. Alias support remains active only during migration window; removal requires Phase 4+ gate approval.

### 1.3 Canonical Request Semantics

Required top-level request fields:

- `action`
- `invocation.mode` where mode is `interactive` or `headless`
- `runtime` (optional execution runtime hints)
- `execution` (command payload when applicable)
- `target` (session/terminal identity for follow-up operations)
- `compat` (legacy call-shape bridge metadata)

Execution intent semantics:

- `open_only`: open/prepare interactive terminal without command execution.
- `execute_command`: run the provided command payload.

### 1.4 Runtime Mode Semantics

#### Interactive mode

- Default mode for terminal operations.
- Routed through Rust+QML interactive-terminal orchestration path.
- Supports visible terminal lifecycle and interactive command dispatch.

#### Headless mode

- Explicit mode only (never implicit fallback by default).
- Restricted to approved, strict subset of operations/commands.
- Authorization controlled by allowlist policy and destructive-command protections.
- Must still traverse unified routing policy (no legacy bypass surface).

### 1.5 PM_TERM Error Compatibility Mapping

Canonical error taxonomy for compatibility and deterministic handling:

| Error code | Meaning | Compatibility behavior |
| --- | --- | --- |
| `PM_TERM_INVALID_ACTION` | Unknown action/alias | Return canonical action hints |
| `PM_TERM_INVALID_PAYLOAD` | Request schema/field violation | Return field-level validation hints |
| `PM_TERM_INVALID_MODE` | Unsupported runtime mode | Return allowed mode set |
| `PM_TERM_DECLINED` | User declined interactive execution | No auto-retry |
| `PM_TERM_TIMEOUT` | Request timed out | Retriable by policy |
| `PM_TERM_DISCONNECTED` | Transport/bridge dropped | Retriable with reconnect guidance |
| `PM_TERM_GUI_UNAVAILABLE` | Rust+QML path unavailable | Retriable; no silent bypass to removed legacy surface |
| `PM_TERM_BLOCKED_DESTRUCTIVE` | Safety policy blocked command | Non-retriable until command/policy changes |
| `PM_TERM_NOT_FOUND` | Session/terminal identity missing | Suggest `list` then retry |
| `PM_TERM_INTERNAL` | Internal unclassified failure | Sanitized diagnostics, trace-linked |

Compatibility invariants:

1. Same input class + same failure class => same error code.
2. Error payloads must include stable machine-readable code and migration-safe message shape.
3. Legacy alias callers receive equivalent PM_TERM codes after canonical normalization.

---

## 2) Routing Architecture Note (Step 1)

### 2.1 Routing Principle

All terminal requests are mediated by unified contract dispatch and routed through Rust+QML interactive-terminal orchestration.

There is no direct external bypass path to the deprecated split tool surface.

### 2.2 Routing Decision Matrix

| Canonical action | Mode | Routing path | Policy gate |
| --- | --- | --- | --- |
| `execute` | `interactive` | Unified dispatcher -> Rust+QML interactive-terminal -> terminal runtime | Interactive safety + user mediation |
| `execute` | `headless` | Unified dispatcher -> headless subset gate -> Rust+QML orchestration path | Strict allowlist + destructive block |
| `read_output` | `interactive` | Unified dispatcher -> Rust+QML session/terminal read | Identity ownership validation |
| `read_output` | `headless` | Unified dispatcher -> headless session read path | Session existence + policy |
| `terminate` | `interactive` | Unified dispatcher -> Rust+QML terminate | Identity validation |
| `terminate` | `headless` | Unified dispatcher -> headless session terminate | Session existence + policy |
| `list` | any | Unified dispatcher -> active identity registry | Scope filtering by mode/context |

### 2.3 Strict Headless Subset Model

Headless mode is selected by request mode/action and constrained by these rules:

1. Only approved action-intent combinations are allowed in headless mode.
2. Command execution requires allowlist approval.
3. Destructive command classes remain blocked.
4. Policy decisions are deterministic and auditable.
5. GUI-configurable policy settings (introduced in later phases) are authoritative for headless subset eligibility.

### 2.4 Non-Bypass Requirement

Mandatory constraints for downstream implementation:

- Do not add direct invocation path that skips Rust+QML orchestration for interactive requests.
- Do not reintroduce split-surface external contract for old `memory_terminal` behavior.
- Compatibility adapters may normalize legacy payloads, but must dispatch through unified routing.

---

## 3) Downstream Implementation Guidance

To avoid ambiguity in Phase 2+ implementation:

1. Treat canonical action names as source-of-truth API vocabulary.
2. Keep alias handling in compatibility layer, not in core mode-routing logic.
3. Apply PM_TERM code mapping after canonical normalization and before response emission.
4. Keep headless gate evaluation explicit, deterministic, and independently testable.
5. Record whether alias normalization occurred in response metadata for migration observability.

## 4) Acceptance Criteria for Phase 1 Completion

Phase 1 (steps 0-1) is complete when:

- Unified contract semantics are documented with canonical actions and legacy alias mapping.
- Runtime mode semantics (`interactive` vs `headless`) are documented and unambiguous.
- PM_TERM compatibility mapping is defined for downstream implementation and tests.
- Routing architecture enforces Rust+QML path with strict headless subset gating.
- No Phase 2+ code modifications are introduced in this phase.
