# memory_cartographer — Downstream Handoff Contracts

**Status:** Active  
**Program:** memory_cartographer  
**Phase:** Foundation → downstream planning  
**Owner:** Hub / Coordinator  
**References:**
- `docs/architecture/memory-cartographer/implementation-boundary.md`
- `docs/architecture/memory-cartographer/compatibility-matrix.md`
- `docs/architecture/memory-cartographer/change-control.md`
- `docs/contracts/memory-cartographer-contract.md`
- `docs/qa/memory-cartographer-acceptance.md`

---

## Purpose

This document defines the inputs, outputs, done conditions, blockers, and escalation paths for each downstream plan type that consumes foundation artifacts produced by this plan. Downstream roles are:

- **Executor plans** — implement schema artifacts, adapters, and integration code
- **Reviewer plans** — verify compatibility behavior, contract conformance, and acceptance criteria
- **Tester plans** — run golden fixture scenarios and adversarial edge cases

All downstream plans operate under the change-category rules defined in `docs/architecture/memory-cartographer/change-control.md`.

---

## 1. Executor Downstream Contract

### 1.1 Inputs Required

Before an Executor plan can start, the following must be available and committed:

| Artifact | Location | Required |
|----------|----------|----------|
| Implementation boundary decision | `docs/architecture/memory-cartographer/implementation-boundary.md` | REQUIRED |
| Canonical contract | `docs/contracts/memory-cartographer-contract.md` | REQUIRED |
| Schema JSON artifacts (if applicable) | `docs/contracts/schema/` | REQUIRED when schema fields are in scope |
| Compatibility matrix | `docs/architecture/memory-cartographer/compatibility-matrix.md` | REQUIRED |
| Change control policy | `docs/architecture/memory-cartographer/change-control.md` | REQUIRED |
| Acceptance criteria | `docs/qa/memory-cartographer-acceptance.md` | REQUIRED |
| Plan steps with atomic scope | Plan state (Hub-assigned) | REQUIRED |
| Rollout gate criteria | `docs/plans/memory-cartographer-rollout-gates.md` | REQUIRED — defines done boundary |

### 1.2 Outputs Expected

An Executor plan produces the following artifacts when all assigned steps are complete:

- TypeScript adapter files implementing the contract interface (e.g., `invokePythonCore`, compatibility adapter)
- Python core updates (if within scope — scope is defined by implementation-boundary.md)
- Unit tests covering the adapter surface, including version negotiation paths
- Schema validation fixtures if schema fields changed
- Per-step build verification (build must pass before each step is marked done)

### 1.3 Done Conditions

An Executor plan is **done** when ALL of the following are true:

1. All assigned plan steps are marked `done`
2. Build pipeline passes (`install.ps1 -Component Server` or equivalent)
3. All unit tests introduced in this plan pass
4. No open Category B or C compatibility issues introduced by this plan
5. Files modified match the scope boundaries declared in the plan (no out-of-scope changes)
6. Reviewer has been assigned via `memory_agent(action: handoff, to_agent: "Reviewer")`

### 1.4 Blockers

An Executor plan halts and escalates when it encounters:

| Blocker | Description | Action |
|---------|-------------|--------|
| Contract ambiguity | A field definition or behavior in the contract is undefined or contradictory | Halt; escalate to Architect |
| Scope creep | Work required is outside the plan's declared scope boundaries | Halt; escalate to Hub for scope decision |
| Category C compatibility break discovered | Implementation reveals a MAJOR schema break | Halt; escalate to Hub + Architect |
| Build fails on existing base (pre-change) | Build was already broken before this plan started | Halt; escalate to Revisionist |
| Missing schema artifact | A schema JSON file required by the implementation does not exist | Halt; escalate to Executor (schema step) or Architect |

### 1.5 Escalation Path

```
Category A issue (non-breaking) → Revisionist → continue
Category B issue (minor breaking) → Revisionist + Architect confirm → version bump → continue
Category C issue (major breaking) → Hub + Architect → migration plan → new Executor plan scope
Build failure (pre-existing) → Revisionist → fix → re-assign Executor
Contract ambiguity → Architect (update contract) → re-assign Executor
```

---

## 2. Reviewer Downstream Contract

### 2.1 Inputs Required

Before a Reviewer plan can start, the following must be available:

| Artifact | Location | Required |
|----------|----------|----------|
| Executor's completed implementation | Git (all steps done, build passing) | REQUIRED |
| Acceptance criteria doc | `docs/qa/memory-cartographer-acceptance.md` | REQUIRED |
| Compatibility matrix | `docs/architecture/memory-cartographer/compatibility-matrix.md` | REQUIRED |
| Change control policy | `docs/architecture/memory-cartographer/change-control.md` | REQUIRED |
| Canonical contract | `docs/contracts/memory-cartographer-contract.md` | REQUIRED |
| Handoff notes from Executor | Plan state / handoff notes | REQUIRED — describes what was implemented |
| Build verification status | Terminal output / CI log | REQUIRED — build must be passing on entry |

### 2.2 Outputs Expected

A Reviewer plan produces the following when all steps are complete:

- Review findings document (pass / pass-with-notes / fail) — stored in plan context
- Build verification result (pass/fail with log excerpt if failed)
- Per-criterion verdict table mapped to `docs/qa/memory-cartographer-acceptance.md`
- List of any unresolved issues by category (A/B/C)
- Handoff recommendation: merge (pass), fix-required (Revisionist), or escalate (Architect/Hub)

### 2.3 Done Conditions

A Reviewer plan is **done** when ALL of the following are true:

1. All acceptance criteria in `docs/qa/memory-cartographer-acceptance.md` have been evaluated
2. Build pipeline passes at the reviewed commit
3. No unresolved Category B or C issues remain open
4. Contract conformance verified: all envelope fields present, schema_version is valid semver, workspace_identity populated
5. Compatibility boundary behaviors verified (version match, VERSION_MISMATCH_MINOR, hard fail on MAJOR)
6. Verdict recorded and handoff issued

### 2.4 Blockers

A Reviewer plan halts and escalates when it encounters:

| Blocker | Description | Action |
|---------|-------------|--------|
| Build failure at review | Build does not pass at the commit under review | Halt; escalate to Revisionist |
| Missing test coverage | Acceptance criteria require test coverage that does not exist | Halt; escalate to Executor (add tests) |
| Undocumented compatibility behavior | Adapter behavior diverges from compatibility matrix without explanation | Halt; escalate to Architect + Executor |
| Unresolved Category C issue | A MAJOR compatibility break is present in the implementation | Halt; escalate to Hub + Architect |
| Contract field missing | A required envelope field is absent from the implementation | Halt; escalate to Executor |

### 2.5 Escalation Path

```
Build failure → Revisionist → fix → re-run Reviewer
Missing tests → Executor (add test coverage) → re-run Reviewer
Undocumented compatibility behavior → Architect (update compatibility-matrix.md) → Executor → re-run Reviewer
Category C issue unresolved → Hub + Architect → migration plan decision
Contract field missing → Executor (fix) → re-run Reviewer
```

---

## 3. Tester Downstream Contract

### 3.1 Inputs Required

Before a Tester plan can start, the following must be available:

| Artifact | Location | Required |
|----------|----------|----------|
| Implemented adapter stack | Git (Executor plan done, Reviewer approved) | REQUIRED |
| Golden fixture definitions | `docs/qa/memory-cartographer-acceptance.md` (fixture section) | REQUIRED |
| Test environment | Local or CI environment with Python + Node.js | REQUIRED |
| Acceptance criteria | `docs/qa/memory-cartographer-acceptance.md` | REQUIRED |
| Contract doc | `docs/contracts/memory-cartographer-contract.md` | REQUIRED |
| Compatibility matrix | `docs/architecture/memory-cartographer/compatibility-matrix.md` | REQUIRED |

### 3.2 Outputs Expected

A Tester plan produces the following when all steps are complete:

- Test results for all golden fixture scenarios (small workspace, medium workspace)
- Adversarial edge case results:
  - Path traversal attempt → expected: rejected
  - Symlink escape → expected: rejected
  - Oversized workspace (exceeds file cap) → expected: sampling + diagnostic
  - Timeout scenario → expected: timeout diagnostic
  - OOM scenario → expected: OOM diagnostic
  - Secrets pattern in output → expected: masked
- Coverage report (if applicable)
- Final test verdict: PASS / PASS WITH NOTES / FAIL

### 3.3 Done Conditions

A Tester plan is **done** when ALL of the following are true:

1. All golden fixture scenarios run and produce expected output
2. All adversarial edge cases produce expected diagnostics (not unexpected crashes or panics)
3. Scope guardrail enforcement verified: file caps, deny-lists, depth limits respected
4. Performance guardrail enforcement verified: timeout, OOM, sampling behavior
5. Safety guardrail enforcement verified: path traversal rejection, symlink blocking, secrets masking
6. Coverage report generated (or explicitly noted as not applicable)
7. Final verdict recorded and handoff issued

### 3.4 Blockers

A Tester plan halts and escalates when it encounters:

| Blocker | Description | Action |
|---------|-------------|--------|
| Missing golden fixtures | Fixture files referenced in acceptance.md do not exist | Halt; escalate to Executor (add fixture data) |
| Adapter stubs not implemented | Required adapter methods are stubs (not functional) | Halt; escalate to Executor |
| Missing test environment | Python or Node.js environment not available or misconfigured | Halt; escalate to Hub (environment setup) |
| Test failures (non-fixture) | Unexpected behavior in non-fixture scenarios | Halt; escalate to Revisionist |
| Fixture definition gap | Acceptance criteria describe behavior not covered by any fixture | Halt; escalate to Executor (define fixture) + Architect (confirm coverage) |

### 3.5 Escalation Path

```
Missing fixtures → Executor (add fixture data files) → re-run Tester
Adapter stubs not implemented → Executor (implement stubs) → re-run Tester
Missing test environment → Hub (provision environment) → re-run Tester
Test failures → Revisionist → fix → re-run Tester
Fixture definition gap → Executor + Architect → update acceptance.md + fixture data → re-run Tester
```

---

## 4. Escalation Decision Tree

Use this tree to determine the correct escalation target when a blocker is encountered. Severity is based on the change category (A/B/C) defined in `docs/architecture/memory-cartographer/change-control.md`.

```
BLOCKER ENCOUNTERED
│
├── Is it a BUILD FAILURE?
│   ├── Pre-existing (before this plan's changes) → Revisionist
│   └── Caused by this plan's changes → Revisionist (fix) or Executor (if scope issue)
│
├── Is it a COMPATIBILITY BREAK?
│   ├── Category A (non-breaking) → Revisionist can fix inline; no escalation required
│   ├── Category B (minor breaking, MINOR version bump) → Revisionist + Architect confirm → continue
│   └── Category C (major breaking, MAJOR version bump) → HALT → Hub + Architect → migration plan
│
├── Is it a CONTRACT AMBIGUITY or ARCHITECTURAL GAP?
│   └── → Architect → update contract/architecture docs → re-assign downstream plan
│
├── Is it MISSING ARTIFACTS (fixtures, stubs, test data)?
│   └── → Executor (add missing artifacts) → re-run blocked plan
│
├── Is it a SCOPE ISSUE?
│   ├── Executor doing out-of-scope work → Hub (scope decision) → update plan boundaries
│   └── Reviewer finding out-of-scope changes → Revisionist (revert) → re-run Reviewer
│
└── Is it ENVIRONMENTAL?
    └── → Hub (provision/fix environment) → re-run blocked plan
```

### Severity Quick Reference

| Severity | Change Category | Escalation Target | Can Continue? |
|----------|----------------|-------------------|---------------|
| Low | Category A | Revisionist | Yes, after fix |
| Medium | Category B | Revisionist + Architect confirm | Yes, after version bump |
| High | Category C | Hub + Architect | No — requires new migration plan |
| Critical | Build broken pre-existing | Revisionist | No — fix first |

---

## 5. Cross-Contract Dependency Notes

- **Executor → Reviewer:** Executor must NOT hand off until build passes. Reviewer stops immediately on build failure.
- **Reviewer → Tester:** Tester starts only after Reviewer approves. Tester does NOT re-verify contract conformance — that belongs to Reviewer.
- **Any role → Hub:** Any Category C blocker routes to Hub first, not directly to Architect. Hub decides whether to create a migration plan or defer.
- **Rollout gates:** Each role's done conditions align with the rollout gate criteria in `docs/plans/memory-cartographer-rollout-gates.md`. Downstream plans must verify their gate before promoting.

---

*Document version: 1.0 | Created: 2026-03-05 | Plan: plan_mm9b56wp_c11823dd*
