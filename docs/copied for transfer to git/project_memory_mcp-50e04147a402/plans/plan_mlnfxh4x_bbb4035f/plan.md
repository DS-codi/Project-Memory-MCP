# Align skills source behavior with agents/instructions

**Plan ID:** plan_mlnfxh4x_bbb4035f
**Status:** archived
**Priority:** high
**Current Phase:** Phase 1: Source Resolution
**Current Agent:** None

## Description

Fix skills deployment/listing so source resolution does not use workspace target .github/skills as implicit source, preventing picker from only showing already deployed workspace skills.

## Progress

- [ ] **Phase 1: Source Resolution:** [code] Update skills source resolver to avoid using workspace deployment target as implicit source fallback
  - _Starting resolver fallback behavior update for skills source root.
[STALE_RECOVERY 2026-02-15T07:52:34.711Z] Reset stale active run/session state before continuing orchestration._
- [ ] **Phase 2: Command Alignment:** [code] Update deploy command and dashboard skills listing/deploy handlers to use aligned resolver behavior
- [ ] **Phase 3: Validation:** [test] Adjust/add tests and run targeted test suite for skills source behavior
- [ ] **Phase 4: Review:** [validation] Review correctness and consistency with agents/instructions behavior
- [ ] **Phase 5: Archive:** [documentation] Archive completed plan

## Agent Lineage

- **2026-02-15T07:51:23.941Z**: Executor → Coordinator — _Implementation and targeted validation complete for scoped skills-source bugfix; ready for review pending phase confirmations._
- **2026-02-15T08:01:10.517Z**: Reviewer → Coordinator — _Review passed for skills source resolution, command/dashboard alignment, warning UX, and test validation scope._