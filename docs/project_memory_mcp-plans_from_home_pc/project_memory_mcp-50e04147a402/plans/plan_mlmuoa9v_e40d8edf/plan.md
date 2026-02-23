# Replay Diagnostics UX

**Plan ID:** plan_mlmuoa9v_e40d8edf
**Status:** archived
**Priority:** high
**Current Phase:** complete
**Current Agent:** None

## Description

Add rich drift explainers and operator-facing diagnostics for replay failures.

## Progress

- [x] **Phase 1: Research:** [research] Research current replay report pain points and identify high-value drift explanation patterns for operators.
  - _Completed. Findings captured in research_notes/diagnostics-ux-research.md and research context._
- [x] **Phase 2: Planning:** [planning] Design diagnostics report UX and explanation architecture with JSON/Markdown compatibility, low-noise operator triage, and additive/non-breaking contracts.
  - _Architecture synthesized from completed research. Plan expanded to implementation, review, test authoring, and test-run readiness flow._
- [x] **Phase 3: Implementation:** [code] Define additive explainability contract for replay diagnostics (drift/category/confidence/operator_bucket/remediation/evidence, explainability groups, gate rollup) with optional fields only and no removals/renames.
  - _Implemented additive explainability contract in replay diagnostics types only: added optional drift fields (category/confidence/operator_bucket/remediation/evidence), optional scenario explainability_groups, optional summary explainability_rollup, optional gate annotation evidence_fingerprint, and optional gate-level explainability_rollup. Preserved all existing fields/keys unchanged._
- [x] **Phase 3: Implementation:** [code] Implement explainability derivation in replay comparison pipeline: root-cause grouping taxonomy, confidence heuristic bands, operator buckets, and remediation/evidence population from existing comparison inputs.
  - _Diagnosed app-smoke WARN as replay flow-policy mismatch (confirmation required before plan_step_update). Added explicit memory_plan confirm step to baseline replay scenario before memory_steps updates in src/test/replay/scenarios/baseline-scenarios.v1.json; replay gate now PASS clean._
- [x] **Phase 3: Implementation:** [code] Wire explainability rollup into gate-summary JSON artifacts while keeping existing gate classification and triage labels intact.
  - _Implemented additive explainability rollup wiring into gate-summary flow. Added explainability derivation/grouping heuristics in replay comparator (taxonomy, confidence bands, operator buckets, remediation/evidence), propagated rollup through gate evaluation output, and included top-level explainability_rollup in gate-summary JSON payloads while preserving classification and triage label behavior. Targeted validation passed: npm run compile; npm test -- --grep "Replay"._
- [x] **Phase 3: Implementation:** [code] Enhance markdown replay report rendering with an appended explainability section (group summaries, bucket rollups, top actions, evidence handles) while preserving existing section order/content.
  - _Implemented additive markdown explainability append in replay report renderer: section emits only when explainability inputs exist (rollup/groups/actions/evidence), preserving legacy section order/content when absent. Validation passed: npm run compile; npm test -- --grep "Replay"._
- [x] **Phase 3: Implementation:** [code] Enhance GitHub annotation rendering with optional evidence/fingerprint suffix tokens for faster triage, preserving existing annotation prefix format and compatibility.
  - _Implemented additive GitHub annotation suffix token rendering: optional evidence_refs and evidence_fingerprint suffixes are appended only when present, while preserving existing annotation prefix format for compatibility. Added tests for both suffix-emission and legacy-no-suffix paths. Validation passed via registered scripts: npm run compile and npm test -- --grep "Replay"._
- [x] **Phase 3: Implementation:** [code] Normalize artifact/evidence path handling for portability in diagnostics outputs (relative/stable refs where possible) without changing existing required manifest fields.
  - _Done after user-confirmed Phase 3 gate. Implementation and targeted validation were already complete before confirmation._
- [x] **Phase 4: Review:** [validation] Review implementation for strict additive contract evolution, diagnostics UX clarity, and low-noise explainability behavior against research findings.
  - _Review PASS. Additive contract evolution validated, diagnostics UX clarity and low-noise behavior validated, no regression in report/annotation outputs. Build-check passed using registered scripts: VSCode Extension Compile and VSCode Extension Replay Tests (187 passing, exit code 0)._
- [x] **Phase 5: Test Authoring:** [test] Add/update tests for JSON compatibility and explainability fields (optional presence, backward compatibility when absent, stable grouping/bucket semantics).
  - _Added JSON compatibility coverage in replay harness tests: asserts legacy comparison JSON omits explainability fields when absent; added stable explainability grouping/operator-bucket semantic assertions from comparator output. Verified with compile + replay-targeted test run (pass)._
- [x] **Phase 5: Test Authoring:** [test] Add/update markdown and annotation tests to verify explainability section/suffix emission rules, low-noise defaults, and unchanged legacy output when explainability inputs are absent.
  - _Completed markdown + annotation explainability coverage: verified explainability rollup lines emit when data exists, legacy markdown output remains unchanged when absent, and no-evidence annotation output remains parse-compatible with exact legacy string while evidence/fingerprint suffix remains optional/additive. Focused compile + replay-targeted test run passed._
- [x] **Phase 6: Test Run Readiness:** [fix] Apply minimal replay comparator regression fix for RUN-gate mismatches, then execute targeted replay diagnostics test runs and gate checks using registered scripts.
  - _Applied minimal comparator regression fix in compareFlow/compareSuccessSignatures: (1) enforce handoff-before-complete only when complete event exists, (2) set missing-confirmation flow drift severity to medium, (3) align success-signature drift severity to check severity. Validation: npm run compile PASS; npm test -- --grep "Replay" PASS (192 passing, 0 failing)._

## Agent Lineage

- **2026-02-15T04:33:51.944Z**: Researcher → Coordinator — _Research complete for Replay Diagnostics UX Step 0. Recommend Architect to design explainability-first report UX and additive JSON/Markdown/annotation contracts based on stored findings._
- **2026-02-15T04:38:37.211Z**: Architect → Coordinator — _Planning complete: replaced minimal plan with phased implementation/review/test roadmap for Replay Diagnostics UX._
- **2026-02-15T04:43:02.434Z**: Executor → Coordinator — _Completed first pending implementation step (additive explainability contract types) with targeted compile/test validation passing._
- **2026-02-15T04:47:31.500Z**: Reviewer → Coordinator — _Step 2 review/build-check passed: additive non-breaking explainability contract types validated; ready for next implementation step._
- **2026-02-15T04:48:15.892Z**: Executor → Coordinator — _Replay app-smoke warning resolved with minimal scoped fix and validation is green._
- **2026-02-15T04:55:31.707Z**: Reviewer → Coordinator — _Review/build-check passed for explainability derivation and gate-summary wiring updates; recommend Executor to proceed to next implementation step._
- **2026-02-15T05:35:25.530Z**: Executor → Coordinator — _Phase 3 step 5 complete: markdown replay report explainability section implemented additively with targeted compile/replay validation passing._
- **2026-02-15T05:38:34.202Z**: Reviewer → Coordinator — _Review/build-check passed for implementation index 5 markdown explainability append behavior; recommend Executor for next implementation step._
- **2026-02-15T05:42:50.652Z**: Executor → Coordinator — _Phase 3 step 6 complete: additive GitHub annotation evidence/fingerprint suffix tokens implemented with compatibility preserved and targeted validation passing._
- **2026-02-15T05:46:04.525Z**: Reviewer → Coordinator — _Step index 6 review passed. Compile and replay-focused tests succeeded; annotation prefix compatibility preserved and evidence/fingerprint suffix remains optional/additive. Recommend Executor for next implementation step (index 7)._
- **2026-02-15T05:51:25.355Z**: Executor → Coordinator — _Step 7 implementation complete and validated; phase confirmation gate prevents done transition without Coordinator/user confirmation._
- **2026-02-15T05:54:52.094Z**: Reviewer → Coordinator — _Phase 4 review (step 8) passed with compile + Replay-focused validation green; ready for test authoring._
- **2026-02-15T06:09:06.863Z**: Tester → Coordinator — _WRITE-mode test authoring complete for steps 9 and 10 with focused replay verification passing; recommend Tester for RUN mode on step 11._
- **2026-02-15T06:11:57.645Z**: Tester → Coordinator — _RUN mode step 11 blocked by replay diagnostics regressions; recommend Revisionist._
- **2026-02-15T06:15:03.402Z**: Revisionist → Coordinator — _Plan pivoted to unblock step 11 with minimal deterministic fix scope; recommend Executor for targeted comparator/test alignment repair._
- **2026-02-15T06:31:19.208Z**: Executor → Coordinator — _Step 11 comparator regression fix and RUN-gate checks completed successfully; ready for review._
- **2026-02-15T06:34:41.190Z**: Reviewer → Coordinator — _Final verification passed (compile + replay tests green, success criteria met); recommend Archivist._