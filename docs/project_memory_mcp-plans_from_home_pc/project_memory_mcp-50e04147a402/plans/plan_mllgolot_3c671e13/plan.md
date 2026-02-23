# Agent/Instructions/Skills Integration

**Plan ID:** plan_mllgolot_3c671e13
**Status:** archived
**Priority:** medium
**Current Phase:** complete
**Current Agent:** Coordinator

## Description

Update all agent files, instruction files, and skills to reflect the new interactive terminal GUI system. Update memory_terminal_interactive documentation across agent docs, mcp-usage.instructions.md, and the vscode-custom-tool-cloning skill. Create or update skills for the interactive terminal patterns. Ensure agents know when to use memory_terminal (headless/allowlist) vs memory_terminal_interactive (GUI approval).

## Progress

- [x] **Skills:** [documentation] Create a reusable CxxQt Windows build/preflight skill using user-provided working projects and build script as references.
  - _Created `.github/skills/cxxqt-windows-build-recovery/SKILL.md` focused on Windows CxxQt/QML build reliability and recovery; includes deterministic fail-fast preflight block, qmake/QMAKE/PATH guidance, cargo build/test/release sequence, and troubleshooting matrix for qmake not found, QMAKE unset, STATUS_DLL_NOT_FOUND, and Qt kit mismatch._
- [x] **Skills:** [documentation] Consolidate cxxqt-windows-build-recovery into cxxqt-rust-gui as single canonical CxxQt skill and remove duplicate content file.
  - _Merged unique Windows preflight/recovery guidance into canonical .github/skills/cxxqt-rust-gui/SKILL.md and removed duplicate .github/skills/cxxqt-windows-build-recovery/SKILL.md._

## Agent Lineage

- **2026-02-14T02:33:15.922Z**: SkillWriter → Coordinator — _Skill file created and step complete; recommend Architect for follow-on integration/review direction._
- **2026-02-14T02:33:50.250Z**: Coordinator → Architect — _User-requested skill file created successfully; recommend Architect only if broader skills/doc integration follow-up is desired._
- **2026-02-14T17:17:32.933Z**: Architect → Coordinator — _Plan structure is already valid; remaining pending step is a skill-file consolidation task best executed by SkillWriter._
- **2026-02-14T17:17:47.389Z**: Architect → Coordinator — _Protocol-compliant handoff for Architect session closure; pending step execution remains a SkillWriter task per plan assignee._
- **2026-02-14T17:21:41.889Z**: SkillWriter → Coordinator — _CxxQt skill consolidation complete; canonical skill updated and duplicate file removed._
- **2026-02-14T17:24:03.842Z**: Coordinator → Coordinator — _Plan archived successfully; orchestration cycle complete with no further implementation required._
- **2026-02-14T17:24:12.698Z**: Coordinator → Architect — _Lifecycle compliance handoff after archival completion; no further execution required._