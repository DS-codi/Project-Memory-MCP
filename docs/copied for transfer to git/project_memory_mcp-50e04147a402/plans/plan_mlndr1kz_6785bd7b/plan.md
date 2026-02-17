# Fix skills deploy ENOENT on external workspaces

**Plan ID:** plan_mlndr1kz_6785bd7b
**Status:** archived
**Priority:** high
**Current Phase:** Phase 1: Reproduce & Locate
**Current Agent:** None

## Description

Deploying skills fails with ENOENT when target workspace lacks a top-level skills directory (e.g. expects .github/skills or missing dir). Add robust path resolution and graceful handling for absent skills source/target paths.

## Progress

- [ ] **Phase 1: Reproduce & Locate:** [analysis] Identify deploy-skills code path that assumes root skills directory and triggers ENOENT
  - _Starting code-path analysis for skills deployment ENOENT issue
[STALE_RECOVERY 2026-02-15T06:57:06.989Z] Reset stale active run/session state before continuing orchestration._
- [ ] **Phase 2: Implement Fix:** [code] Update path resolution and existence checks to support .github/skills and handle missing directories gracefully
- [ ] **Phase 3: Validate:** [test] Add/adjust tests for missing-dir and alternate-path behavior; run targeted tests
  - _Running targeted unit tests for skills source resolution behavior
[STALE_RECOVERY 2026-02-15T06:57:06.989Z] Reset stale active run/session state before continuing orchestration._
- [ ] **Phase 4: Review:** [validation] Review code and behavior against success criteria
- [ ] **Phase 5: Archive:** [documentation] Archive completed plan

## Agent Lineage

- **2026-02-15T06:55:33.393Z**: Executor → Coordinator — _Implemented and validated fix for deploy skills ENOENT with fallback handling; ready for review_
- **2026-02-15T07:01:00.315Z**: Reviewer → Coordinator — _Review passed: ENOENT deploy-skills fix validated with compile + targeted tests; recommend archival._