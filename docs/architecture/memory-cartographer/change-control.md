# Change Control — memory_cartographer

## Purpose
Change control rules define how the memory_cartographer contract, guardrails, and
engine implementations may be modified after initial delivery. All changes must be
evaluated against compatibility impact before deployment.

---

## Change Categories

### Category A — Non-Breaking (no version bump required)
- Adding a new optional field to an existing schema section
- Adding a new `DiagnosticCode` enum member
- Tightening a guardrail limit (lower file count cap, shorter timeout)
- Adding a new language to `LANGUAGE_EXTENSION_MAP`

**Approval:** Executor implements → Reviewer verifies → merge

### Category B — Minor Breaking (minor version bump required, `1.x.0 → 1.x+1.0`)
- Removing or renaming an optional schema field
- Changing default guardrail values (looser limits)
- Adding a new required field with a default value
- Adding a new `DbKind` dialect

**Approval:** Architect confirms impact → Executor implements → Reviewer verifies → bump version in `version.ts` + `version.py` → merge

### Category C — Major Breaking (major version bump required, `1.0.0 → 2.0.0`)
- Removing or renaming a required schema field
- Changing the `schema_version` negotiation protocol
- Restructuring the top-level envelope
- Removing a `DiagnosticCode` enum member

**Approval:** Hub creates a migration plan → Architect designs new contract → Executor implements both versions → Reviewer verifies backward compatibility shim → deprecation period confirmed → merge

---

## Compatibility Break Response Protocol

If a compatibility break is discovered during implementation or review:

1. **Identify severity** — Category A, B, or C (see above)
2. **Halt the affected step** — mark `blocked`, do NOT continue
3. **Record the break** — `memory_context(type: review_findings)` with:
   - Affected schema fields
   - Affected consumers (which downstream plans/agents read the field)
   - Proposed fix (additive vs. breaking)
4. **Route to**: Revisionist (Category A/B) or Architect + Hub (Category C)
5. **Bump version if required** in both `version.ts` and `version.py`
6. **Update** `compatibility-matrix.md` with the new row

---

## Rollback Rules

### Patch rollback (within a minor version)
- Permitted if the change was Category A and caused a regression
- Executor reverts the specific file change
- Reviewer re-verifies the prior state

### Minor version rollback
- Not permitted without Hub authorization
- Requires confirming all consumers are compatible with the prior version
- Version numbers are **not** decremented — a new patch release is issued instead

### Major version rollback
- Not permitted without explicit program-level decision
- Migration shim must remain active for the defined deprecation period
- Deprecation period default: 2 major sprints

---

## File Ownership & Review Requirements

| File | Owner | Required Reviewer |
|------|-------|------------------|
| `memory-cartographer-contract.md` | Architect | Hub |
| `memory-cartographer.schema.json` | Architect | Hub + Executor |
| `version.ts` / `version.py` | Executor | Reviewer |
| `compatibility-matrix.md` | Architect | Reviewer |
| `scope-guardrails.md` | Architect | Reviewer |
| `performance-guardrails.md` | Architect | Reviewer |
| `safety-guardrails.md` | Architect | Reviewer |
| `scopeConfig.ts` / `scope_limits.py` | Executor | Reviewer |
| `perf_budget.py` / `metrics.ts` | Executor | Reviewer |
| `safety.py` / `policies.ts` | Executor | Reviewer |
| `database_cartography.py` | Executor | Reviewer + Tester |
| `test_contract_golden.py` | Tester | Reviewer |

---

## Emergency Change Procedure

For production incidents requiring immediate patching:

1. Hub creates an expedited bugfix plan (category `bugfix`)
2. Executor implements the minimum fix in an isolated step
3. Reviewer does an expedited single-pass review
4. No adversarial test suite required — targeted regression test only
5. Full test suite run within 24 hours post-merge
6. Change-control record created retroactively within 48 hours
