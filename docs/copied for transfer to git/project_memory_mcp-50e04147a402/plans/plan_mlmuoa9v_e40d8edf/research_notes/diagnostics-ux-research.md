---
plan_id: plan_mlmuoa9v_e40d8edf
created_at: 2026-02-15T04:32:59.920Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Replay Diagnostics UX Research

## Scope
Read-only audit of replay reporting in `vscode-extension/src/test/replay` plus observed run artifacts in `vscode-extension/.replay-runs`.

## 1) Current-state audit of replay reporting outputs

### JSON artifacts
- `manifest.json` (from `ReplayOrchestrator`): run metadata + artifact file paths (`baseline/candidate` raw and normalized).
- `comparison.json` (from `writeReplayReport`): `ReplayComparisonResult` with scenario pass/fail, drift list, and severity counts.
- `gate-summary.json` (from CLI `writeGateSummaryArtifacts`, optional path override): wraps gate evaluation + report file pointers + flake control info.
- Raw traces: `baseline.raw.jsonl`, `candidate.raw.jsonl` (event envelopes with `run_id/profile/scenario/event`).
- Normalized traces: `baseline.norm.json`, `candidate.norm.json`.

### Markdown artifacts
- `report.md`: high-level replay drift report (header, summary counts, per-scenario drift bullets).
- `gate-summary.md`: gate status markdown summary.

### CLI summaries
- `run`/`compare` commands print:
  - Manifest path
  - Comparison path
  - Markdown path
  - Rendered gate summary markdown
  - Gate summary JSON/markdown locations
- Optional GitHub annotation emission via `--emit-github-annotations true` (annotation lines on stdout).

### Annotation outputs
- `toGitHubAnnotations` emits one annotation per drift:
  - format includes severity, classification, scenario id, check id, message.
  - no file/line anchors and no structured remediation data.

### Important implementation notes
- Drift structure is currently minimal: `{scenario_id, check_id, severity, message, details?}`.
- Gate classification currently supports: `clean`, `deterministic_regression`, `intermittent_flake`.
- Triage labels are coarse string tags (`replay`, `flake`, etc.).

---

## 2) Operator pain points in triaging drift today

1. **Root-cause discovery is manual**
   - Output is mostly check-level and message-level; operators must inspect trace artifacts to infer root cause.
2. **No explicit confidence signal**
   - Gate provides classification and retry state, but not confidence/uncertainty score per finding.
3. **No remediation hints in first-class schema**
   - Operators see “what drifted,” not “what to do next.”
4. **Cross-artifact navigation overhead**
   - Triage often requires opening `comparison.json`, `report.md`, and raw traces separately.
5. **Message-centric drift identity is brittle**
   - Fingerprints include drift message text; textual changes can change identity without semantic change.
6. **Annotations are low-context**
   - GitHub annotations omit drill-down handles (event indexes, evidence refs, trace pointers).
7. **Severity is present but not action-oriented**
   - Counts by severity exist, but no operator-focused bucketing (blocker/actionable/monitor).
8. **Path portability inconsistency in observed artifacts**
   - Existing observed manifests used absolute Windows paths; this creates friction in shared/CI contexts.

---

## 3) Recommended explanation patterns for operators

### A. Root-cause grouping
Group drifts by stable cause taxonomy (in addition to check id):
- `flow_protocol`
- `authorization_policy`
- `tool_sequence`
- `success_signature`
- `artifact_integrity`

For each group provide:
- impacted scenarios
- representative drifts
- aggregate severity
- suggested owner/team

### B. Confidence model
Add per-group and per-drift confidence bands:
- `high` (strong deterministic evidence)
- `medium` (likely deterministic, partial evidence)
- `low` (potentially flaky/noisy)

Inputs: retry outcome, fingerprint stability, number of corroborating checks, and event alignment quality.

### C. Remediation hints
Attach structured hints:
- `likely_causes`: array of likely contributors
- `recommended_actions`: ordered short actions
- `verification_steps`: concrete replay/compare steps to confirm fix

### D. Severity bucketing for operators
Keep raw severity, add operator bucket:
- `blocker`: CI-gating/high-confidence regressions
- `actionable`: medium confidence or medium severity with repeated pattern
- `monitor`: low-confidence or low impact drift

### E. Evidence linking
Each drift should reference evidence pointers:
- baseline/candidate event indices
- artifact file + scenario id + check id
- optional normalized payload snippet hash

---

## 4) Data contract suggestions (non-breaking)

### Guiding principle
**Additive evolution only**: keep existing fields and semantics intact; add optional explainability sections.

### Proposed additive fields

#### Extend `ReplayDrift`
- `category?: string` (taxonomy key)
- `confidence?: { level: 'low'|'medium'|'high'; score?: number; rationale?: string[] }`
- `operator_bucket?: 'blocker'|'actionable'|'monitor'`
- `remediation?: {
    likely_causes?: string[];
    recommended_actions?: string[];
    verification_steps?: string[];
  }`
- `evidence?: {
    baseline_event_indexes?: number[];
    candidate_event_indexes?: number[];
    artifact_refs?: Array<{ file: string; scenario_id: string; check_id: string }>;
    fingerprint?: string;
  }`

#### Extend `ReplayComparisonResult`
- `explainability?: {
    groups: Array<{
      category: string;
      scenario_ids: string[];
      drift_count: number;
      highest_severity: 'low'|'medium'|'high';
      confidence: 'low'|'medium'|'high';
      operator_bucket: 'blocker'|'actionable'|'monitor';
      summary: string;
    }>;
    generated_by?: { module: string; version?: string };
  }`

#### Extend `ReplayGateEvaluation`
- `explainability_rollup?: {
    blocker_count: number;
    actionable_count: number;
    monitor_count: number;
    top_groups: string[];
  }`

### Compatibility safeguards
- Do not rename/remove current fields (`summary`, `scenarios.drifts[]`, `classification`, `triage_labels`).
- Keep current markdown sections; append a new optional explainability section.
- Keep current annotation format; append optional suffix tokens only when present.
- Version with optional `schema_revision` string while preserving existing contracts.

---

## 5) Prioritized opportunities (impact vs complexity)

1. **Add explainability groups + operator buckets to JSON outputs**
   - Impact: **High**
   - Complexity: **Medium**
   - Why first: directly improves triage speed while preserving current consumers.

2. **Add remediation and evidence pointers per drift**
   - Impact: **High**
   - Complexity: **Medium**
   - Why: converts findings into actionable operator workflows.

3. **Add confidence scoring (simple heuristic first)**
   - Impact: **Medium-High**
   - Complexity: **Medium**
   - Why: helps distinguish deterministic regressions vs noisy drift.

4. **Enhance markdown rendering with grouped root-cause section**
   - Impact: **Medium**
   - Complexity: **Low-Medium**
   - Why: immediate readability improvement for humans and PR reviewers.

5. **Enhance GitHub annotations with evidence/fingerprint handles**
   - Impact: **Medium**
   - Complexity: **Low**
   - Why: low effort, improves downstream debugging from CI surfaces.

6. **Normalize/verify path portability in manifest outputs**
   - Impact: **Medium**
   - Complexity: **Low**
   - Why: reduces environment-specific friction in shared triage.

---

## Proposed handoff focus for Architect
- Define additive explainability schema and rendering strategy (JSON + markdown + annotations).
- Preserve existing contracts and tests while introducing optional fields.
- Prioritize group/bucket/remediation/evidence as MVP explanation layer.