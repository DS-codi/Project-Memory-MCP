# memory_cartographer — Rollout Gates

**Status:** Active  
**Program:** memory_cartographer  
**Phase:** Foundation  
**Owner:** Hub / Coordinator  
**References:**
- `docs/architecture/memory-cartographer/implementation-boundary.md`
- `docs/architecture/memory-cartographer/change-control.md`
- `docs/contracts/memory-cartographer-contract.md`
- `docs/qa/memory-cartographer-acceptance.md`
- `docs/plans/memory-cartographer-downstream-handoffs.md`

---

## Purpose

This document defines the **rollout gate criteria** — what must be true before each program phase can be promoted to the next. Gates enforce quality and correctness checkpoints between phases, preventing downstream plans from starting on an unstable foundation.

Gates align with the four program phases:

```
Foundation → Schema Introspection → MCP Surface Integration → Consumer Integration & Validation
    G1              G2                        G3                         G4
```

A gate passes when ALL its criteria are satisfied. A single unmet criterion blocks promotion.

---

## Gate G1: Foundation → Schema Introspection

**Purpose:** Confirm that all foundational architecture decisions, contracts, and planning artifacts are in place before implementation begins.

**Promotion:** Unlocks Schema Introspection Executor plans.

### G1 Criteria

| # | Criterion | Verified By | Status |
|---|-----------|-------------|--------|
| G1-01 | `docs/architecture/memory-cartographer/implementation-boundary.md` present and approved | Reviewer | ✅ |
| G1-02 | `docs/architecture/memory-cartographer/compatibility-matrix.md` present and approved | Reviewer | ✅ |
| G1-03 | `docs/architecture/memory-cartographer/change-control.md` present and approved | Reviewer | ✅ |
| G1-04 | `docs/contracts/memory-cartographer-contract.md` present (canonical contract) | Reviewer | ✅ |
| G1-05 | `docs/qa/memory-cartographer-acceptance.md` present with acceptance criteria | Reviewer | ✅ |
| G1-06 | `docs/plans/memory-cartographer-downstream-handoffs.md` present (this plan's companion) | Reviewer | ✅ |
| G1-07 | `docs/plans/memory-cartographer-rollout-gates.md` present (this document) | Reviewer | ✅ |
| G1-08 | No unresolved Category C compatibility issues open | Hub / Reviewer | Required |
| G1-09 | Foundation plan steps all marked `done` | Hub | Required |

### G1 Notes

- G1 is the gate this plan (Foundation) must pass before downstream phases start.
- All architecture and contract docs are produced by the Foundation plan; they must be committed and reviewed before G1 is declared passed.
- G1-08 (no unresolved Category C issues) is a hard gate — any MAJOR compatibility break discovered during Foundation must be resolved via the Hub migration-plan process before Schema Introspection begins.

---

## Gate G2: Schema Introspection → MCP Surface Integration

**Purpose:** Confirm that the cartography schema artifacts (DB relation graph, migration lineage, code-DB surface map) are available and validated before MCP surface integration begins.

**Promotion:** Unlocks MCP Surface Integration Executor plans.

### G2 Criteria

| # | Criterion | Verified By | Status |
|---|-----------|-------------|--------|
| G2-01 | DB relation-graph artifact committed (`docs/cartography/db/` or equivalent) | Reviewer | Required |
| G2-02 | Migration lineage artifact committed | Reviewer | Required |
| G2-03 | Code-DB surface map artifact committed | Reviewer | Required |
| G2-04 | Schema Introspection Reviewer verdict = PASS or PASS WITH NOTES (non-blocking items only) | Reviewer | Required |
| G2-05 | No open Category B issues without Architect confirmation | Reviewer | Required |
| G2-06 | No open Category C issues | Hub / Reviewer | Required |
| G2-07 | Schema Introspection plan steps all marked `done` | Hub | Required |

### G2 Notes

- **G-01 (Python automation pipeline — `invokePythonCore` + adapter stack) is NOT required to pass G2.** This item is tracked as a CRITICAL non-blocking item (deferred to G3).
- The DB cartography artifacts may be produced by a manual or semi-automated process during Schema Introspection; they do not need to be fully automated yet.
- PASS WITH NOTES is acceptable at G2 **only if** all noted items are non-blocking (i.e., Category A or deferred). Blocking notes prevent G2 from passing.

---

## Gate G3: MCP Surface Integration → Consumer Integration & Validation

**Purpose:** Confirm that the MCP tool/resource endpoints are live, the TypeScript adapter reads from cartography artifacts, and contract conformance has been verified before final consumer integration begins.

**Promotion:** Unlocks Consumer Integration & Validation plans (golden fixture tests, acceptance verification).

### G3 Criteria

| # | Criterion | Verified By | Status |
|---|-----------|-------------|--------|
| G3-01 | MCP tool endpoints for cartography data implemented and responding | Reviewer | Required |
| G3-02 | MCP resource endpoints for cartography data implemented and responding | Reviewer | Required |
| G3-03 | TypeScript adapter reads from cartography artifacts (DB or file source) | Reviewer | Required |
| G3-04 | Contract conformance verified: all envelope fields present, `schema_version` is valid semver | Reviewer | Required |
| G3-05 | Compatibility negotiation behavior verified (MATCH / VERSION_MISMATCH_MINOR / hard fail MAJOR) | Reviewer | Required |
| G3-06 | G-01 (Python automation pipeline) resolved — `invokePythonCore` functional | Reviewer | CRITICAL — must resolve by G3 |
| G3-07 | No blocking adapter stub gaps remain | Reviewer | Required |
| G3-08 | MCP Surface Integration plan steps all marked `done` | Hub | Required |
| G3-09 | No open Category B/C issues | Hub / Reviewer | Required |

### G3 Notes

- G3-06 is the mandatory resolution gate for the G-01 deferred item. The Python automation pipeline (spawning Python as subprocess, JSON over stdin/stdout) must be functional before consumer integration begins. A stub or mock is not sufficient at G3.
- G3-04/G3-05 together constitute full contract conformance. Both must pass for G3 to pass.
- If G3-06 is not met, the MCP Surface Integration plan must be extended (new Executor steps added) before G3 is declared passed.

---

## Gate G4: Consumer Integration & Validation → Production Ready

**Purpose:** Confirm that all acceptance criteria are met, all golden fixture tests pass, and the build/install pipeline is clean before the program is considered production-ready.

**Promotion:** Unlocks production deployment / changelog / user-facing doc updates.

### G4 Criteria

| # | Criterion | Verified By | Status |
|---|-----------|-------------|--------|
| G4-01 | All golden fixture tests pass (small workspace, medium workspace scenarios) | Tester | Required |
| G4-02 | All adversarial edge case scenarios produce expected diagnostics | Tester | Required |
| G4-03 | All acceptance criteria in `docs/qa/memory-cartographer-acceptance.md` verified | Reviewer + Tester | Required |
| G4-04 | Scope guardrail enforcement verified (file caps, deny-lists, depth limits) | Tester | Required |
| G4-05 | Performance guardrail enforcement verified (timeout, OOM, sampling) | Tester | Required |
| G4-06 | Safety guardrail enforcement verified (path traversal rejection, symlink blocking, secrets masking) | Tester | Required |
| G4-07 | Build pipeline passing (`install.ps1 -Component Server` or equivalent) | Reviewer | Required |
| G4-08 | Test pipeline passing (`run-tests.ps1 -Component Server` or equivalent) | Reviewer / Tester | Required |
| G4-09 | Install pipeline passing (`install.ps1` full) | Reviewer | Required |
| G4-10 | Changelog updated with cartographer feature entries | Executor | Required |
| G4-11 | User-facing docs updated (README or guide) | Executor | Required |
| G4-12 | No open issues of any category (A/B/C) | Hub / Reviewer | Required |
| G4-13 | Consumer Integration & Validation plan steps all marked `done` | Hub | Required |

### G4 Notes

- G4 is the final gate. All criteria must pass — there is no PASS WITH NOTES at G4.
- G4-12 (no open issues) is absolute. Category A issues that remain open at G4 must be resolved or explicitly deferred to a follow-up plan (with Hub approval and documented deferral).
- The changelog and user-facing docs (G4-10, G4-11) are required before the program is archived. These are Executor responsibilities assigned in the Consumer Integration plan.

---

## Rollback Triggers

A rollback trigger halts promotion and routes the program back to a prior phase. The following conditions require rollback:

### Rollback from Schema Introspection → Foundation

| Trigger | Condition | Action |
|---------|-----------|--------|
| Architecture doc invalidated | A schema introspection finding contradicts or invalidates a Foundation architecture decision | Hub creates new Foundation step; Architect updates affected doc |
| Contract field conflict | Schema introspection reveals a required contract field is undefined or contradictory | Architect updates `contract.md`; Executor updates schema artifacts |
| Category C break introduced at introspection | Schema structure change is MAJOR (incompatible with any currently supported version) | Hub creates migration plan; rolls back Schema Introspection plan |

### Rollback from MCP Surface Integration → Schema Introspection

| Trigger | Condition | Action |
|---------|-----------|--------|
| Cartography artifacts invalid | Schema introspection artifacts are malformed, incomplete, or missing required fields | Schema Introspection Executor re-runs affected steps |
| G-01 deferred item becomes blocking | Python automation pipeline is blocked in a way that prevents surface integration from proceeding at all | Schema Introspection plan extended; G-01 resolved before re-promoting |
| Compatibility adapter breaks existing consumers | An existing MCP consumer is broken by the adapter changes | Revisionist; if Category C, rollback to Architect/Hub |

### Rollback from Consumer Integration → MCP Surface Integration

| Trigger | Condition | Action |
|---------|-----------|--------|
| Golden fixture catastrophic failure | >50% of golden fixtures fail in ways that indicate fundamental adapter error | MCP Surface Integration Executor + Revisionist |
| Adversarial test exposes security regression | A safety guardrail (path traversal, secrets) is not enforced | HALT — Revisionist + Reviewer; cannot promote until resolved |
| Performance regression (existing functionality) | A new change causes OOM or timeout in scenarios that previously passed | Revisionist; performance fix before re-promotion |

### Rollback from Production Ready → Consumer Integration

| Trigger | Condition | Action |
|---------|-----------|--------|
| Post-merge regression | A regression is discovered after G4 passes and code merges | Bugfix plan created; rollback of deployment if live |
| Changelog/docs missing | G4-10 or G4-11 not met | Executor completes docs; re-run G4 check |

---

## Gate Status Summary

| Gate | Phase Boundary | Key Blocker Risk | Current Status |
|------|---------------|-----------------|----------------|
| G1 | Foundation → Schema Introspection | Category C break, missing doc | Pending final Reviewer verification |
| G2 | Schema Introspection → MCP Integration | Missing artifacts, G-01 deferred | Not yet started |
| G3 | MCP Integration → Consumer Validation | G-01 must resolve here, adapter gaps | Not yet started |
| G4 | Consumer Validation → Production Ready | All tests passing, no open issues | Not yet started |

---

*Document version: 1.0 | Created: 2026-03-05 | Plan: plan_mm9b56wp_c11823dd*
