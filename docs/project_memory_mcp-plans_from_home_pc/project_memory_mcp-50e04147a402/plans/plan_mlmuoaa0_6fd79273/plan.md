# Replay Coverage Expansion

**Plan ID:** plan_mlmuoaa0_6fd79273
**Status:** archived
**Priority:** high
**Current Phase:** complete
**Current Agent:** None

## Description

Expand scenario packs and stabilization controls to broaden harness regression coverage.

## Progress

- [x] **Phase 1: Research:** [research] Research additional scenario domains and flake sources to prioritize next replay packs.
  - _Research completed and confirmed by user; priorities and stabilization recommendations captured in research artifacts._
- [x] **Phase 2: Planning:** [planning] Design phased execution roadmap for replay scenario-pack expansion and stabilization controls with maintenance constraints.
  - _Detailed phased roadmap created, goals/success criteria set, and architecture context stored for Executor→Reviewer→Tester flow._
- [x] **Phase 3: Executor Implementation:** [code] Define scenario-pack contract updates: scenario metadata tags (domain/surface/risk/priority), deterministic scenario digest hashing, and acceptance thresholds for drift detection.
  - _Extended replay contract: tag metadata (domain/surface/risk/priority), deterministic scenario digest hashing, and acceptance thresholds for drift detection._
- [x] **Phase 3: Executor Implementation:** [code] Implement shared stabilization controls for new packs: deterministic fixture seeds, frozen clock deltas, explicit wait budgets, and deterministic resolver fixture trees.
  - _Implemented shared stabilization controls in schema normalization (fixture seed/clock delta/wait budget/resolver fixture tree) with deterministic wait-budget capping._
- [x] **Phase 3: Executor Implementation:** [code] Implement P0 Auth Policy Matrix Pack covering allowed/allowed_with_warning/blocked outcomes with canonical reason_class mapping assertions.
  - _Added P0 Auth Policy Matrix scenario pack with canonical auth checks and P0 tags._
- [x] **Phase 3: Executor Implementation:** [code] Implement P0 Protocol Ordering Pack to assert confirm-before-gated-update, handoff-before-complete, and coordinator-target invariants under replay sequencing.
  - _Added P0 Protocol Ordering scenario pack asserting confirm-before-update and handoff-before-complete invariants._
- [x] **Phase 3: Executor Implementation:** [code] Implement P1 Artifact Integrity & Fallback Pack covering explicit artifact file, goldens v1 resolution, legacy fallback, and missing/corrupt artifact negatives.
  - _Added P1 Artifact Integrity & Fallback scenario pack with migration-resolver surface tagging and thresholds._
- [x] **Phase 3: Executor Implementation:** [code] Implement P1 Tool Alias & Optional-Tool Drift Pack validating action alias canonicalization and optional-tool exclusion from strict ordering checks.
  - _Added P1 Tool Alias & Optional-Tool Drift scenario pack and validated alias/optional behavior via replay checks._
- [x] **Phase 3: Executor Implementation:** [code] Implement P2 Cross-Platform Normalization Pack validating Windows/POSIX path parity, volatile text masking, and normalization equivalence across OS-style payloads.
  - _Added P2 Cross-Platform Normalization scenario pack with normalization-focused tagging and stabilization settings._
- [x] **Phase 3: Executor Implementation:** [code] Implement P2 Retry Classification Consistency Pack validating deterministic vs intermittent triage labels and fingerprint stability across primary/retry comparisons.
  - _Added P2 Retry Classification Consistency scenario pack with retry/gate-evaluator coverage and thresholds._
- [x] **Phase 3: Executor Implementation:** [build] Add scenario tagging and CI shard execution matrix (domain/surface/risk) to run packs selectively without changing comparator semantics.
  - _Coordinator recorded user phase confirmation and finalized step after Executor completion._
- [x] **Phase 4: Reviewer Validation:** [validation] Review scenario-pack completeness, overlap, and maintenance budget constraints; confirm coverage maps cleanly to P0/P1/P2 priorities and flake vectors.
  - _Reviewed scenario-pack completeness and mapping: all six planned domains present with P0/P1/P2 risk+priority tags, stabilization controls, and acceptance thresholds in baseline-scenarios.v1.json; schema/type coverage validates metadata normalization and deterministic digesting._
- [x] **Phase 4: Reviewer Validation:** [build] Run registered replay validation/build scripts and review signal quality for false positives/false negatives introduced by new packs and controls.
  - _Ran registered replay validation/build scripts and replay checks: npm run compile (Exit code 0), npm test -- --grep "Replay" (196 passing, exit 0), npm run replay -- run -- --scenario AUTH_POLICY_MATRIX_P0 --gate-mode warn (Gate PASS clean, 0 drifts). Signal quality review: no false-positive/false-negative regressions observed for changed replay coverage scope._
- [x] **Phase 5: Tester Verification:** [test] Execute deterministic replay test runs for all new packs (single-run and repeated-run matrix), capture pass/fail/flake evidence, and compare against acceptance thresholds.
  - _Deterministic replay matrix completed: compile + replay suite pass; six scenario-pack single-run strict gates all PASS; three repeated full-pack strict runs PASS with zero drift and zero failed scenarios._
- [x] **Phase 5: Tester Verification:** [test] Stress mixed ordering/path/artifact/retry scenarios to verify stabilization controls hold under replay variability and certify regression-readiness.
  - _Mixed stress validation completed using protocol-ordering + cross-platform normalization + artifact-integrity/fallback + retry-classification pack set; strict gate PASS with zero drifts and no retry-required flake._

## Agent Lineage

- **2026-02-15T06:40:50.379Z**: Researcher → Coordinator — _Research complete for replay coverage expansion priorities. Recommend Architect to plan scenario-pack implementation and stabilization controls after Phase 1 confirmation._
- **2026-02-15T06:44:05.025Z**: Architect → Coordinator — _Planning complete: expanded phased roadmap for replay coverage expansion and stabilization controls is ready for implementation._
- **2026-02-15T06:56:37.459Z**: Executor → Coordinator — _Phase 3 replay implementation slice is stable and validated; ready for review. Step 10 status transition remains confirmation-gated._
- **2026-02-15T07:01:44.558Z**: Reviewer → Coordinator — _Phase 4 Reviewer validation passed; replay coverage and build-checks are green. Recommend Tester for Phase 5 verification matrix._
- **2026-02-15T07:07:41.485Z**: Tester → Coordinator — _Phase 5 tester verification passed: deterministic matrix and mixed stress replay validations are green with zero drift; recommend Archivist._