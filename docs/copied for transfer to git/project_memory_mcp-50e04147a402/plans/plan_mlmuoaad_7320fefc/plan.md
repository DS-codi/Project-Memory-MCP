# Replay Model Matrix

**Plan ID:** plan_mlmuoaad_7320fefc
**Status:** archived
**Priority:** medium
**Current Phase:** complete
**Current Agent:** None

## Description

Support comparative replay runs across model and profile variants with scored outputs.

## Progress

- [x] **Phase 1: Research:** [research] Consolidate matrix dimensions, scoring formulas, and anti-noise controls into planning inputs.
  - _Dimensions: model identity metadata, comparator profile, scenario tags, execution surface, gate/retry mode, determinism normalization. Metrics: WDS, SPR, ECI, BBR, CMS._
- [x] **Phase 2: Planning:** [planning] Define phased implementation roadmap for model-matrix orchestration, comparative scoring, and reporting.
  - _Roadmap expanded from starter plan with Executor→Reviewer→Tester flow and verifiable outcomes._
- [x] **Phase 3: Execution:** [code] Define matrix run-contract schema covering axes, run metadata, risk tags, and deterministic control flags.
  - _Added typed replay matrix run-contract schema (axes, run metadata, risk tiers, deterministic control flags) and parser/loader in replay core._
- [x] **Phase 3: Execution:** [code] Implement matrix expansion and orchestration flow to schedule and execute replay cells across model/profile combinations.
  - _Implemented matrix cell expansion and execution orchestration path (`runReplayMatrix`) with CLI `run-matrix` command support and per-cell scenario selection by tag-slice._
- [x] **Phase 3: Execution:** [code] Implement comparative scoring pipeline with WDS, SPR, ECI, BBR, and CMS calculations including clamp/penalty rules.
  - _Added scoring pipeline in `MatrixScoring.ts` implementing WDS/SPR/ECI/BBR/CMS with clamp and flake penalty semantics._
- [x] **Phase 3: Execution:** [code] Implement anti-noise guardrails in run execution (fixed TZ/locale, normalization enabled, retry-once classification, fingerprint stability checks).
  - _Implemented anti-noise controls in `MatrixRunner.ts`: fixed TZ/locale env, normalization-required overlay, retry-once comparison classification, and fingerprint stability check._
- [x] **Phase 3: Execution:** [code] Implement result aggregation contract with per-cell outputs, axis rollups, risk-tier summaries, and promotion eligibility flags.
  - _Implemented matrix result aggregation contract in `MatrixScoring.ts`/`MatrixRunner.ts` with per-cell output objects, axis rollups, risk-tier summaries, and promotable flags._
- [x] **Phase 3: Execution:** [documentation] Document report payload semantics for score interpretation and deterministic-regression handling in comparative outputs.
  - _Coordinator recorded user phase confirmation and finalized Phase 3 documentation step._
- [x] **Phase 4: Review:** [validation] Review orchestration and scoring implementation against defined formulas, severity weighting, and anti-noise requirements.
  - _Review step confirmed and completed._
- [x] **Phase 4: Review:** [validation] Review comparative report structure for completeness, traceability, and actionability across matrix dimensions.
  - _Review step confirmed and completed._
- [x] **Phase 5: Test:** [test] Run targeted tests for matrix expansion correctness, scoring determinism, and formula integrity across representative fixtures.
  - _Executed registered Replay test script (`npm test -- --grep "Replay"`): passing coverage includes matrix run-contract expansion, scoring determinism, and formula integrity (WDS/SPR/ECI/BBR/CMS + promotable checks)._
- [x] **Phase 5: Test:** [test] Run anti-noise and flake-classification validation tests to verify retry behavior, fingerprint stability, and non-promotable regression handling.
  - _Replay gate evaluator tests passed for anti-noise controls: retry-once intermittent flake classification, fingerprint evidence handling, and deterministic regression/non-promotable behavior._
- [x] **Phase 5: Test:** [test] Run end-to-end matrix replay smoke and verify comparative report outputs, risk-tier summaries, and gating decisions.
  - _Phase 5 confirmed by user; end-to-end matrix replay smoke and comparative report checks passed._

## Agent Lineage

- **2026-02-15T07:14:40.832Z**: Researcher → Coordinator — _Research complete for replay model/profile matrix dimensions, scoring metrics, and anti-noise constraints; ready for planning._
- **2026-02-15T07:17:25.189Z**: Architect → Coordinator — _Planning complete: starter plan expanded into phased Executor→Reviewer→Tester roadmap for model-matrix orchestration, comparative scoring, and reporting._
- **2026-02-15T07:35:16.598Z**: Executor → Coordinator — _Phase 3 implementation slice is stable and validated; steps 2-6 complete, step 7 blocked by phase confirmation gate._
- **2026-02-15T07:43:02.332Z**: Reviewer → Coordinator — _Phase 4 review passed for matrix orchestration/scoring/reporting; build-check scripts succeeded. Steps 8/9 are blocked only by explicit confirmation gate, not by defects._
- **2026-02-15T07:43:31.161Z**: Reviewer → Coordinator — _Review passed for scoped matrix orchestration/scoring/reporting and build-check scripts passed; recommend Tester next. Steps 8/9 are blocked only by required confirmation gate._
- **2026-02-15T07:46:47.452Z**: Tester → Coordinator — _Phase 5 RUN tests passed (196/196) for matrix/scoring/anti-noise/report checks. Step 12 remains blocked by required Phase 5 confirmation gate; recommend Revisionist per blocker-routing policy, otherwise proceed to confirmation then Archivist._