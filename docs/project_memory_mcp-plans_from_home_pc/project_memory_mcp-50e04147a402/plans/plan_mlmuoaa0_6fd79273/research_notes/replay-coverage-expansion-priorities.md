---
plan_id: plan_mlmuoaa0_6fd79273
created_at: 2026-02-15T06:40:09.030Z
sanitized: false
injection_attempts: 0
warnings: 0
---

## Replay Coverage Expansion Research (2026-02-15)

### Current harness baseline (what exists now)
- Scenario suite footprint is minimal: `src/test/replay/scenarios` contains only `baseline-scenarios.v1.json` + README.
- Current scenario checks cover four check classes: `tool_order`, `auth_outcome`, `flow`, `success_signature`.
- Existing reliability features already in place: strict/warn/info gate modes, retry-once flake triage, deterministic normalization defaults, and migration fallback for legacy `.replay-runs`.

### Priority scenario-pack recommendations (impact vs effort)

| Priority | Scenario pack domain | Why now (impact) | Effort | Likely flake vectors | Stabilization opportunities |
|---|---|---|---|---|---|
| P0 | **Auth Policy Matrix Pack** (allowed / allowed_with_warning / blocked + reason_class transitions) | High regression risk on policy surfaces and gateway routing; directly affects gate classification and operator trust. | M | inconsistent `reason_class`, warning-vs-block drift, terminal-surface-specific auth behavior | add canonical auth fixtures; enforce expected `reason_class` map per outcome; add scenario metadata tags for terminal surface |
| P0 | **Protocol Ordering Pack** (confirm-before-gated-update, handoff-before-complete, coordinator target constraints) | Core flow invariants are hub-and-spoke critical; breaks are high-severity blockers. | M | race between tool events (`plan_step_update`, `confirmation`, `handoff`, `complete`), reordered events under retries | add explicit ordering assertions per event_type; include deterministic wait steps and bounded timestamp deltas |
| P1 | **Artifact Integrity & Fallback Pack** (explicit file, goldens v1, legacy fallback, missing/corrupt artifacts) | High operational value for CI migrations and baseline durability. | M | file resolution nondeterminism, stale latest-run selection, malformed JSON drift | pin deterministic fixture tree; validate resolver precedence in each scenario; include negative-path signatures for expected failures |
| P1 | **Tool Alias & Optional-Tool Drift Pack** (`run/send/create -> execute`, ignore optional tools telemetry/metrics) | Prevents false positives and ensures comparator behavior matches profile intent. | S-M | alias normalization mismatches, optional tool leakage into strict order checks | add profile-variant scenarios with same semantic flow but different raw actions; assert no drift after canonicalization |
| P2 | **Cross-Platform Normalization Pack** (Windows/POSIX paths, locale/timezone text, volatile IDs in payloads) | Reduces noisy regressions and improves reproducibility across runners. | M | path canonicalization gaps, nondeterministic text remnants, ID masking misses | expand payload fuzz fixtures; add parity scenarios asserting equivalent normalized output across OS-style inputs |
| P2 | **Retry Classification Consistency Pack** (deterministic vs intermittent with fingerprint stability checks) | Improves triage confidence and reduces misclassification churn in CI. | S-M | retry recovers but fingerprint changes unexpectedly; flaky pass/fail oscillation | assert triage labels and fingerprint transitions explicitly; capture primary/retry rollups side-by-side |

### Additional domains worth backlog (lower immediate ROI)
- Interactive-terminal visibility nuances (`memory_terminal_interactive`) when warning auth is expected but still allowed.
- Performance/timeout envelope scenarios (`run_timeout_ms`, `step_timeout_ms`) for large packs and slower CI workers.
- Baseline promotion governance scenarios (`--apply/--approve/--force`) for approval guardrails.

### High-confidence flake source map
1. **Event ordering jitter** between synthetic tool_call and derived protocol events.
2. **Path canonicalization edge cases** with mixed separators and workspace-root substrings.
3. **Text volatility leakage** (timestamps/IDs) inside nested payload fields.
4. **Artifact selection nondeterminism** when multiple legacy runs exist.
5. **Retry classification ambiguity** when drift sets differ but severity remains high.

### Stabilization recommendations to pair with expansion
1. Use pack-level deterministic fixtures with frozen seeds/clock deltas and explicit wait budgets.
2. Add scenario tags (`domain`, `surface`, `risk`) to allow selective CI sharding without changing semantics.
3. Make fallback resolver fixtures deterministic by explicit file trees, not ambient workspace state.
4. Add comparator-profile variants as first-class fixtures to avoid overfitting to one default profile.
5. Emit/validate a compact scenario digest (scenario_id + checks + signatures hash) to detect accidental pack drift.

### Suggested execution order for next cycle
1. P0 Auth Policy Matrix Pack
2. P0 Protocol Ordering Pack
3. P1 Artifact Integrity & Fallback Pack
4. P1 Tool Alias & Optional-Tool Drift Pack
5. P2 Cross-Platform Normalization Pack
6. P2 Retry Classification Consistency Pack

### Planning handoff note
This research is complete for step 0 and is ready for Architect planning into concrete scenario-pack backlog slices with acceptance criteria and maintenance budget.
