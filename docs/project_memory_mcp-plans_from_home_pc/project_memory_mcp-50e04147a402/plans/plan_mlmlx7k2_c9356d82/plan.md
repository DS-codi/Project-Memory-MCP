# Agent/Instructions/Skills Integration for Interactive Terminal GUI App (Rust+QML) - Continuation

**Plan ID:** plan_mlmlx7k2_c9356d82
**Status:** archived
**Priority:** medium
**Current Phase:** complete
**Current Agent:** None

## Description

Update all agent files, instruction files, and skills to reflect the new interactive terminal GUI system. Update memory_terminal_interactive documentation across agent docs, mcp-usage.instructions.md, and the vscode-custom-tool-cloning skill. Create or update skills for the interactive terminal patterns. Ensure agents know when to use memory_terminal (headless/allowlist) vs memory_terminal_interactive (GUI approval).

## Progress

- [x] **Phase 1: Research Audit:** [research] Audit current agent docs, instruction files, and skills for Interactive Terminal GUI App (Rust+QML) readiness and identify stale/missing guidance.
  - _Completed in Phase 1 with coverage inventory and stale/missing guidance findings._
- [x] **Phase 1: Research Audit:** [analysis] Produce a gap matrix for memory_terminal vs memory_terminal_interactive usage guidance, approval model, and Rust+QML interactive-terminal workflows.
  - _Completed with prioritized gap matrix and explicit file target list in research_notes/phase1-research-audit-interactive-terminal-rust-qml.md._
- [x] **Phase 2: Architecture Planning:** [planning] Create a phased implementation roadmap with atomic file-level tasks, explicit assignees, and validation checkpoints derived from the gap matrix.
  - _Roadmap defined with phased execution, reviewer checkpoints, and tester verification gates._
- [x] **Phase 2: Architecture Planning:** [planning] Refine plan goals and success criteria so scope exactly covers agent coverage gaps, canonical terminal-surface decision guidance, Rust+QML linkage, and stale-reference cleanup.
  - _Refined goals/success criteria to exact scope: missing 10 agent files, canonical terminal decision guidance, Rust+QML linkage, and stale-reference cleanup with validation gates._
- [x] **Phase 3: Canonical Terminal Policy:** [documentation] Update instructions/mcp-usage.instructions.md with a canonical terminal surface selection matrix (memory_terminal vs memory_terminal_interactive vs Rust+QML gateway) and contract-collision warning notes.
  - _Updated instructions/mcp-usage.instructions.md with canonical terminal surface selection matrix (memory_terminal vs memory_terminal_interactive vs Rust+QML gateway), gateway routing rule, and contract-collision warnings._
- [x] **Phase 3: Canonical Terminal Policy:** [validation] Review and validate the canonical policy section for accuracy, role neutrality, and consistency with existing authorization semantics.
  - _Step 5 accepted. Canonical terminal policy section validated as accurate, role-neutral, and semantically consistent with headless allowlist behavior, interactive visible-terminal behavior, and Rust+QML gateway routing language._
- [x] **Phase 4: Agent Coverage - Missing 10 Files:** [documentation] Add terminal-surface guidance to missing agent docs set A: agents/analyst.agent.md, agents/architect.agent.md, agents/archivist.agent.md, agents/brainstorm.agent.md, agents/cognition.agent.md.
  - _Added canonical terminal-surface guidance to set A files: analyst, architect, archivist, brainstorm, cognition._
- [x] **Phase 4: Agent Coverage - Missing 10 Files:** [documentation] Add terminal-surface guidance to missing agent docs set B: agents/coordinator.agent.md, agents/researcher.agent.md, agents/revisionist.agent.md, agents/skill-writer.agent.md, agents/tdd-driver.agent.md.
  - _Added canonical terminal-surface guidance to set B files: coordinator, researcher, revisionist, skill-writer, and tdd-driver._
- [x] **Phase 4: Agent Coverage - Existing 5 Normalization:** [documentation] Normalize existing coverage wording and matrix references in agents/executor.agent.md, agents/reviewer.agent.md, agents/runner.agent.md, agents/tester.agent.md, and agents/worker.agent.md.
  - _Normalized wording/matrix references in existing 5 files (executor, reviewer, runner, tester, worker) to align with canonical terminal selection policy and Rust+QML gateway routing semantics._
- [x] **Phase 4: Agent Coverage - Validation:** [validation] Run cross-agent review to ensure all 15 agent docs use the same terminal decision vocabulary and role-appropriate constraints.
  - _Step 9 re-review passed. All 15 agent docs align on terminal decision vocabulary and role-appropriate constraints. Prior blocker resolved: spoke anti-spawn hub list now consistently includes TDDDriver; no stale omissions found. Recommended next agent: Executor._
- [x] **Phase 5: Operations Instruction Alignment:** [documentation] Update instructions/coordinator-operations.instructions.md, instructions/analyst-operations.instructions.md, and instructions/runner-operations.instructions.md with concise policy cross-links to canonical mcp-usage guidance.
  - _Added concise canonical-policy cross-link sections in coordinator/analyst/runner operations instructions, explicitly referencing instructions/mcp-usage.instructions.md for terminal surface selection and Rust+QML gateway semantics._
- [x] **Phase 5: Skills + Rust/QML Integration:** [documentation] Update skills/vscode-custom-tool-cloning/SKILL.md with explicit integration guidance between extension interactive terminal tooling and Rust+QML approval gateway usage.
  - _Updated .github/skills/vscode-custom-tool-cloning/SKILL.md with explicit Rust+QML approval-gateway integration topology, contract boundary rules, and canonical policy cross-reference to instructions/mcp-usage.instructions.md._
- [x] **Phase 5: Skills + Rust/QML Integration:** [documentation] Update skills/cxxqt-rust-gui/SKILL.md with interactive-terminal app profile details (approval queue, event flow, bridge responsibilities) and policy cross-reference hooks.
  - _Updated skills/cxxqt-rust-gui/SKILL.md with interactive-terminal profile details: approval queue model, event flow, bridge responsibilities, and canonical policy cross-references._
- [x] **Phase 5: Product Doc Linkage:** [documentation] Update interactive-terminal/README.md with explicit MCP integration topology and add discoverability link path to docs/interactive-terminal-contract-unification-design.md.
  - _Added MCP integration topology section to interactive-terminal/README.md and linked docs/interactive-terminal-contract-unification-design.md for canonical contract-unification guidance._
- [x] **Phase 6: Consistency + Stale Reference Cleanup:** [documentation] Perform cross-file stale-reference cleanup and source-of-truth alignment checks across agents/, instructions/, skills/, interactive-terminal/, and docs/ for terminal-surface semantics.
  - _Completed scoped stale-reference/source-of-truth alignment checks across instructions/, skills/, interactive-terminal/, and docs/. Added one cleanup note in docs/interactive-terminal-contract-unification-design.md to mark mcp-usage as canonical for active policy semantics; verified targeted cross-links/topology text via grep._
- [x] **Phase 6: Verification Gate:** [test] Execute targeted verification pass (grep/search checks) confirming all required files contain canonical decision guidance and no conflicting legacy terminal instructions remain.
  - _PASS: Re-ran Step 15 targeted grep/search checks across required scope including mirrored .github/skills/cxxqt-rust-gui/SKILL.md. Canonical terminal decision guidance is present across scoped files and prior mirror-gap blocker is resolved._
- [x] **Phase 6: Final Review Gate:** [validation] Run final reviewer acceptance against goals/success criteria and produce approve-or-revise recommendation for Coordinator.
  - _Final acceptance PASS. All 4 goals and all 6 success criteria satisfied based on completed step notes and latest lineage (including Step 15 re-verification pass after mirrored .github cxxqt skill fix). Recommendation: Archivist._

## Agent Lineage

- **2026-02-14T17:54:11.569Z**: Researcher → Coordinator — _Phase 1 Research Audit complete (Steps 0 and 1). Gap matrix and file-level update map are ready for implementation planning._
- **2026-02-14T17:58:26.345Z**: Architect → Coordinator — _Phase 2 Architecture Planning complete; phased implementation roadmap, refined goals/success criteria, and architecture rationale are ready._
- **2026-02-14T18:08:26.814Z**: Executor → Coordinator — _Step 4 complete. Recommend Reviewer for validation of canonical terminal policy wording and semantics in instructions/mcp-usage.instructions.md._
- **2026-02-14T18:10:49.870Z**: Reviewer → Coordinator — _Step 5 review passed. Canonical terminal policy section accepted for semantic accuracy, role neutrality, and consistency with authorization/routing semantics._
- **2026-02-14T18:19:40.165Z**: Executor → Coordinator — _Phase 4 implementation steps 6-8 completed and verified; canonical terminal-surface guidance aligned across targeted agent docs._
- **2026-02-14T18:21:59.029Z**: Reviewer → Coordinator — _Step 9 blocked: cross-agent role-constraint inconsistency found; recommend Revisionist for targeted doc fixes._
- **2026-02-14T18:24:59.987Z**: Revisionist → Coordinator — _Step 9 blocker fixed via targeted spoke-doc consistency correction. Recommend Reviewer to re-run Step 9 validation._
- **2026-02-14T18:27:10.123Z**: Reviewer → Coordinator — _Step 9 re-review fully resolved. Terminal vocabulary and role constraints are consistent across all 15 agent docs; blocker fixed. Recommendation: Executor._
- **2026-02-14T18:33:33.880Z**: Executor → Coordinator — _Completed Steps 10-14 with scoped doc/skill updates and targeted verification; recommend Tester for verification gate step 15._
- **2026-02-14T18:37:54.009Z**: Tester → Coordinator — _Step 15 verification blocked due missing canonical guidance in mirrored skill file; recommend Revisionist._
- **2026-02-14T18:40:05.128Z**: Revisionist → Coordinator — _Step 15 blocker resolved with scoped mirrored skill sync; recommend Tester re-run Step 15 targeted verification._
- **2026-02-14T18:42:17.067Z**: Tester → Coordinator — _Step 15 re-verification PASS after Revisionist fix; targeted grep/search checks across required scope including mirrored .github/skills path succeeded. Recommendation: Reviewer._
- **2026-02-14T18:44:36.589Z**: Reviewer → Coordinator — _Step 16 final acceptance PASS: all goals and success criteria satisfied; recommend Archivist._