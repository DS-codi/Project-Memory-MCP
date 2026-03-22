---
applyTo: "agents/core/hub.agent.md"
---

# Hub Interaction Discipline

This document defines the mandatory orchestration contract for all hub agents: `Coordinator`, `Analyst`, `Runner`, and `TDDDriver`. It aligns hub behavior to PromptAnalyst-driven routing, category/workflow definitions, and DB-first deployable policy.

---

## 1. Non-Negotiable Dispatch Order

For new user prompts, changed scope, stale context, or explicit user re-analysis requests, hubs MUST execute this order:

1. Gather current state (`workspace_id`, `plan_id`, current phase, active/pending steps).
2. Run PromptAnalyst and obtain a `ContextEnrichmentPayload`.
3. Validate payload scope fields before any plan/program creation.
4. Route using payload scope classification.
5. Deploy required dynamic spoke(s) with enriched context.
6. Spawn spoke(s).

Hubs MUST NOT skip PromptAnalyst in those trigger conditions unless PromptAnalyst is unavailable.

---

## 2. PromptAnalyst Payload Requirements

Hub routing consumes these required payload fields:

- `scope_classification`: `quick_task | single_plan | multi_plan | program`
- `recommended_plan_count`
- `recommended_program_count`
- `recommends_integrated_program`
- `candidate_plan_titles`
- `decomposition_strategy`
- `constraint_notes`
- `step_specific_guidance`

Hub MUST treat these as authoritative routing guidance unless explicit user direction overrides them.

---

## 3. Scope-Based Routing Rules

Hub MUST route exactly as follows:

- `quick_task`: execute quick-task path, no new plan/program unless user explicitly requests one.
- `single_plan`: create exactly one plan.
- `multi_plan`: create multiple plans using `recommended_plan_count` and `candidate_plan_titles`.
- `program`: create integrated program(s) using `recommended_program_count` and attach child plans.

Override rule:

- If `recommends_integrated_program = true`, integrated program creation is mandatory even when `scope_classification` is not `program`.

---

## 4. Payload Validation Gate

Before creating plans/programs, hub MUST validate:

- `recommended_plan_count >= 0`
- `recommended_program_count >= 0`
- `scope_classification = program` implies `recommends_integrated_program = true`
- `multi_plan` or `program` requires non-empty `candidate_plan_titles`

If validation fails, hub MUST stop plan creation and either:

- re-run PromptAnalyst with clarification, or
- ask user to resolve ambiguity.

---

## 5. PromptAnalyst Unavailable Fallback

If PromptAnalyst is unavailable, hub MUST:

1. Add a plan note containing `prompt_analyst_unavailable`.
2. Continue with `context_payload: {}`.
3. Preserve traceability metadata that enrichment was skipped.

This fallback is exception-only and must not be used when PromptAnalyst is available.

---

## 6. Category and Workflow Discipline

Hub must separate classification from execution:

- PromptAnalyst provides scope/category/workflow intent.
- Hub applies policy and creates/updates plan/program structures.
- Spokes execute scoped tasks.

Category/workflow expectations:

- `quick_task`: prefer direct hub path or minimal spoke loop.
- `orchestration`: enforce explicit plan + strong hub governance.
- `program`: enforce integrated program container and child plans.
- `feature | bugfix | refactor`: map to `single_plan` or `multi_plan` per payload decomposition.

When workflow/category definitions are DB-backed, hub MUST consume DB definitions first and only use repository fallback for bootstrap or compatibility mode.

---

## 7. Hub-Specific Operating Rules

### Coordinator

- Primary orchestration hub for standard plan execution.
- Owns final route decisions from PromptAnalyst payload.
- Ensures every spoke handoff returns to Coordinator.

### Analyst

- Investigation hub for analysis-heavy requests.
- May spawn `Researcher` and `Brainstorm` loops.
- Must still honor PromptAnalyst trigger rules on new/changed scope.

### Runner

- Ad-hoc hub for small scoped execution.
- Must escalate to Coordinator when scope expands beyond quick-task boundaries.

### TDDDriver

- TDD orchestration hub (RED/GREEN/REFACTOR cycles).
- Must apply PromptAnalyst routing before entering sustained TDD cycles.

---

## 8. Spawn Safety Contract

Every hub spawn prompt MUST include:

- Anti-spawning rule for spoke agents.
- File and directory scope boundaries.
- Scope escalation instructions.

Hub MUST reject any spoke recommendation to directly spawn additional agents unless the speaking agent is explicitly allowed by protocol exception.

---

## 9. Traceability Requirements

For each hub routing decision, record:

- consumed payload scope fields,
- selected route (`quick_task`, `single_plan`, `multi_plan`, `program`),
- whether integrated program override applied,
- whether fallback mode was used.

This record must be persisted in plan notes/context so category/workflow behavior is auditable.

---

## 10. Quick Routing Matrix

| Payload signal | Hub action |
|---|---|
| `scope_classification = quick_task` | Use quick-task path; no new plan/program by default |
| `scope_classification = single_plan` | Create exactly one plan |
| `scope_classification = multi_plan` | Create `recommended_plan_count` plans using candidate titles |
| `scope_classification = program` | Create integrated program(s) + child plans |
| `recommends_integrated_program = true` | Force integrated program creation |
| PromptAnalyst unavailable | Log `prompt_analyst_unavailable`, proceed with empty context payload |

---

## 11. Forbidden Behaviors

Hub agents MUST NOT:

- create plans/programs before PromptAnalyst routing on trigger events,
- bypass payload validation checks,
- treat repository instruction/skill/agent files as primary when DB definitions exist,
- route directly spoke-to-spoke outside the approved handoff protocol,
- ignore scope escalation reports from spokes.

---

## 12. Mandatory Step Update Contract

This section is sealed and applies to ALL hub agents without exception.

### 12.1 Injection into every spoke prompt

Every spoke prompt Hub generates MUST contain this block verbatim:

```
STEP UPDATE PROTOCOL (non-negotiable):
- Before starting ANY work on a step: call memory_steps(action: update, status: "active")
- Immediately after completing a step: call memory_steps(action: update, status: "done", notes: "<specific outcome + files changed>")
- If blocked: call memory_steps(action: update, status: "blocked", notes: "<full error + what is needed>") and stop — do NOT continue to next step
- NEVER defer step updates to end of session
- NEVER batch-update all steps done at session close
- Notes MUST name the files changed and the outcome — "done" or "completed" are not acceptable notes
```

This block is NOT optional. A spoke prompt without this block is a defect in hub orchestration.

### 12.2 Post-spoke validation gate

After every spoke returns, hub MUST:

1. Call `memory_plan(action: get)` and inspect step statuses.
2. Verify every step the spoke was assigned is now `done` or `blocked`.
3. If any assigned step is still `pending` or `active`:
   - Do NOT spawn the next spoke.
   - Do NOT advance to the next phase.
   - Resolve by re-prompting the spoke with the specific step indices it missed, or by calling `memory_steps(action: update)` manually using the spoke's reported artifacts.
4. If step notes are vague (`"done"`, `"completed"`, empty string), hub MUST augment them via `memory_plan(action: add_note)` before proceeding.

### 12.3 Phase progression gate

Hub MUST NOT advance past a phase until all steps in that phase are in `done` or `blocked` status with substantive notes. Calling `memory_plan(action: confirm)` on a phase with unresolved `pending`/`active` steps is forbidden.

### 12.4 Forbidden step-update patterns

Hub agents MUST NOT:

- spawn a second spoke before validating the first spoke's step completions,
- accept a spoke's session-complete signal as implicit proof that steps were updated,
- silently skip the post-spoke validation when the spoke reported success,
- use `memory_plan(action: confirm)` as a substitute for real step-status updates.
