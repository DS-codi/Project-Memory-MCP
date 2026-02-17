---
plan_id: plan_mlmlx7k2_c9356d82
created_at: 2026-02-14T17:53:20.021Z
sanitized: false
injection_attempts: 0
warnings: 1
---

# Phase 1 Research Audit — Interactive Terminal GUI (Rust+QML)

Date: 2026-02-15
Plan: plan_mlmlx7k2_c9356d82
Scope: Read-only audit of agent docs, instruction files, skills, and interactive-terminal docs.

## Evidence Summary

### What is already solid
- `instructions/mcp-usage.instructions.md` clearly distinguishes `memory_terminal` (server-side/headless/allowlist-only) vs `memory_terminal_interactive` (extension-side/visible terminal).
- `agents/executor.agent.md` includes explicit decision guidance on when to use headless vs interactive terminal modes.
- `skills/vscode-custom-tool-cloning/SKILL.md` has strong warn-vs-block rationale, container-mode implications, and hybrid pattern guidance.
- `interactive-terminal/README.md` is strong for Rust+CxxQt+QML architecture, protocol, and local build/run details.

### Gaps found
- Terminal tool guidance coverage is uneven across agents: only 5/15 agent docs contain `memory_terminal_interactive` references (`executor`, `reviewer`, `runner`, `tester`, `worker`).
- 10/15 agent docs lack interactive-terminal tool guidance entirely: `analyst`, `architect`, `archivist`, `brainstorm`, `cognition`, `coordinator`, `researcher`, `revisionist`, `skill-writer`, `tdd-driver`.
- Rust+QML interactive-terminal app docs are not linked into agent/instruction decision flows, so users lack a single “when to use which surface” policy.
- Contract collision risk is documented in `docs/interactive-terminal-contract-unification-design.md` (same tool name with differing action sets across surfaces), but this is not reflected in canonical instructions.
- Operations instruction files (`coordinator-operations`, `analyst-operations`, `runner-operations`) remain focused on orchestration and do not provide terminal-surface selection policy.

## Concrete Gap Matrix

| Area | Current State | Gap | Impact | Priority |
|---|---|---|---|---|
| `memory_terminal` headless allowlist model | Documented in `instructions/mcp-usage.instructions.md` and partially in select agents | Not consistently referenced by all agents that may run commands indirectly (hub/planning/revision roles) | Tool misuse risk and inconsistent agent behavior | High |
| `memory_terminal_interactive` model | Well-covered in `mcp-usage`, `executor`, and cloning skill; tool handler in extension supports visible terminal workflow | Coverage missing from 10 agent docs and operation instruction playbooks | Uneven readiness and role confusion | High |
| Approval/authorization behavior and tool choice policy | Good local descriptions exist (`mcp-usage`, cloning skill, executor) | No single canonical “decision tree” shared across all agent and operations docs; no explicit mapping to Rust GUI approval model | Conflicting guidance and onboarding friction | High |
| Rust+QML interactive-terminal workflow guidance | App README and CxxQt skill are strong independently | Missing integration link: no canonical path from MCP tool docs → Rust GUI app protocol/ops; CxxQt skill not contextualized to this interactive-terminal app | Architecture knowledge silo; difficult cross-team handoff | High |
| Cross-surface contract clarity (`memory_terminal_interactive`) | Design doc captures dual-surface action mismatch | Canonical instructions do not surface this collision or migration policy | Implementation drift and incorrect action usage | Medium-High |
| Instruction source-of-truth consistency (`.github/instructions` vs `instructions/`) | Active guidance appears concentrated in `instructions/` | `.github/instructions/` in this repo has only a subset, increasing ambiguity of canonical source | Maintenance drift risk | Medium |

## Exact Files Needing Updates + What Should Change

### Agent docs (terminal-policy coverage normalization)
1. `agents/analyst.agent.md`
   - Add terminal-tool table rows (`memory_terminal`, `memory_terminal_interactive`) and a short selection rubric.
   - Clarify analyst role should prefer policy-level guidance and only invoke terminal tools when investigation requires reproducible command evidence.
2. `agents/architect.agent.md`
   - Add “terminal surface decision constraints” section for plans (when to prescribe headless vs visible execution).
3. `agents/archivist.agent.md`
   - Add minimal terminal usage policy for archive verification/reindex checks.
4. `agents/brainstorm.agent.md`
   - Add brief note: ideation-only default, but if prototyping commands are needed, choose terminal surface via policy.
5. `agents/cognition.agent.md`
   - Explicitly state read-only/no execution and reference terminal policy for recommendations only.
6. `agents/coordinator.agent.md`
   - Add coordinator-level routing rule: which downstream agent/mode to pick for headless CI-like runs vs interactive visible runs.
7. `agents/researcher.agent.md`
   - Add explicit prohibition/exception note for command execution and reference to terminal policy for evidence runs.
8. `agents/revisionist.agent.md`
   - Add terminal tool selection guidance for remediation workflows.
9. `agents/skill-writer.agent.md`
   - Add guidance for documenting both terminal surfaces in generated skills when relevant.
10. `agents/tdd-driver.agent.md`
   - Add terminal policy for RED/GREEN/REFACTOR phases (e.g., default headless test runs; interactive terminal for exploratory/manual diagnostics).

### Agent docs (already covered but should be tightened)
11. `agents/reviewer.agent.md`
12. `agents/runner.agent.md`
13. `agents/tester.agent.md`
14. `agents/worker.agent.md`
15. `agents/executor.agent.md`
   - Normalize wording to one canonical decision matrix and add a direct reference to Rust+QML interactive-terminal app integration path.

### Instruction docs
16. `instructions/mcp-usage.instructions.md`
   - Add one canonical decision tree:
     - `memory_terminal` for strict allowlisted, server-side, automated runs.
     - `memory_terminal_interactive` for visible VS Code terminal operations.
     - Rust+QML interactive-terminal app for human approval gateway over TCP protocol.
   - Add a “surface mapping” warning note to prevent action-contract confusion.
17. `instructions/coordinator-operations.instructions.md`
18. `instructions/analyst-operations.instructions.md`
19. `instructions/runner-operations.instructions.md`
   - Add concise cross-links to `mcp-usage` terminal policy and role-appropriate usage constraints.

### Skills
20. `skills/vscode-custom-tool-cloning/SKILL.md`
   - Add explicit subsection linking extension interactive terminal tool to Rust+QML gateway architecture; include when to clone vs when to route through gateway.
   - Add contract-collision cautions and canonical naming/action strategy references.
21. `skills/cxxqt-rust-gui/SKILL.md`
   - Add app-specific profile for the interactive-terminal project (approval queue, protocol event flow, bridge responsibilities, integration hooks).
   - Add cross-reference to terminal policy docs so GUI implementation choices align with MCP tool behaviors.

### Interactive Terminal docs
22. `interactive-terminal/README.md`
   - Add explicit “Integration with MCP tools” section:
     - relation to `memory_terminal` and `memory_terminal_interactive`
     - when to use this GUI gateway vs VS Code interactive tool
     - expected operational topology in local/container modes.

### Design/contract docs
23. `docs/interactive-terminal-contract-unification-design.md`
   - Promote or cross-link from canonical instructions; currently high-value but discoverability is low.

### Source-of-truth alignment
24. `.github/instructions/*` and `.github/skills/*` vs `instructions/*` and `skills/*`
   - Decide and document one canonical path (or enforce sync policy) to avoid dual-tree drift.

## Recommended Phase-2 Architecture Inputs
- Create a single reusable “Terminal Surface Selection Matrix” snippet and reference it from all agent docs + key operation instructions.
- Introduce one short “Rust+QML Interactive Gateway Integration” section shared between `mcp-usage.instructions.md`, `vscode-custom-tool-cloning` skill, and `interactive-terminal/README.md`.
- Add a small compatibility note for cross-surface `memory_terminal_interactive` action semantics where relevant (to avoid name/action ambiguity).

## Ready-for-Architect Handoff
Research outputs now include:
- Coverage audit (agents/instructions/skills/docs)
- Concrete gap matrix (terminal behaviors + approval model + Rust+QML workflow linkage)
- Exact file update targets with change intent
