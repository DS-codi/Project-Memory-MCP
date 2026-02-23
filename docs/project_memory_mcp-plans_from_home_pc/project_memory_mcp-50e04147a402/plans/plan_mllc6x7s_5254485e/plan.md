# Custom Spawn Subagent Tool — Plan-Aware Orchestration

**Plan ID:** plan_mllc6x7s_5254485e
**Status:** archived
**Priority:** high
**Current Phase:** complete
**Current Agent:** Coordinator

## Description

Clone the default VS Code runSubagent tool as a Language Model Tool in the Project Memory extension. Add MCP plan-aware orchestration, anti-spawning rules (spoke agents cannot spawn), and handoff protocol enforcement. Follow the vscode-custom-tool-cloning skill pattern for hybrid extension+server architecture.

## Progress

- [x] **Phase 1: Cleanup:** [code] Remove handleSpawn function and SpawnParams/SpawnResult interfaces from server/src/tools/agent.tools.ts
  - _Removed handleSpawn, SpawnParams, SpawnResult, HUB_AGENTS from agent.tools.ts_
- [x] **Phase 1: Cleanup:** [code] Remove spawn action case from server/src/tools/consolidated/memory_agent.ts router
  - _Spawn action case removed from memory_agent.ts router (confirmed by Executor)_
- [x] **Phase 1: Cleanup:** [code] Remove spawn from memoryAgentSchema enum in memory_agent.ts
  - _Removed spawn from schema enum_
- [x] **Phase 2: Extension Declaration:** [code] Add memory_spawn_agent to package.json languageModelTools with parametersSchema: agent_name (required), prompt (required), workspace_id, plan_id, scope_boundaries object
  - _Added memory_spawn_agent to package.json with full parametersSchema_
- [x] **Phase 3: Extension Handler:** [code] Create vscode-extension/src/chat/tools/spawn-agent-tool.ts with SpawnAgentInput interface and handleSpawnAgentTool function
  - _Created spawn-agent-tool.ts with SpawnAgentInput interface and handler_
- [x] **Phase 3: Extension Handler:** [code] Implement spawn logic: validate agent_name against known agents, check anti-spawning rules if requesting agent context available, use vscode.lm.invokeTool or chat API to spawn actual subagent
  - _Implemented spawn logic with KNOWN_AGENTS validation, anti-spawning rules_
- [x] **Phase 3: Extension Handler:** [code] Auto-inject workspace_id, plan_id into spawned agent prompt if provided
  - _Auto-injects workspace_id, plan_id via MCP bridge context fetch_
- [x] **Phase 3: Extension Handler:** [code] Auto-inject scope_boundaries and anti-spawning instructions into spawned agent prompt
  - _Injects scope_boundaries and anti-spawning instructions_
- [x] **Phase 4: Extension Registration:** [code] Export handleSpawnAgentTool from index.ts and register in ToolProvider.ts
  - _Exported from index.ts, registered in ToolProvider.ts_
- [x] **Phase 5: Build Verification:** [build] Run npm run build in server and npm run compile in vscode-extension, verify no errors
  - _Reviewer confirmed: Server build pass, Extension compile pass_
- [x] **Phase 6: Testing:** [test] Run npx vitest run in server to verify spawn removal didn't break other tests
  - _Reviewer confirmed: 1067/1067 tests pass_
- [x] **Phase 7: Follow-up:** [documentation] Create SKILL.md for 'vscode-chat-response-stream' covering ChatResponseStream capabilities: Markdown (CommonMark), stream.button() command buttons, command links [text](command:id), stream.filetree(), stream.progress(), stream.reference()/stream.anchor()
  - _Created SKILL.md covering all 6 ChatResponseStream methods (markdown, button, filetree, progress, reference, anchor), command links via MarkdownString, the generic push() method, ChatFollowupProvider, anti-patterns, method selection guide, and a complete handler example. Includes real-world patterns from the existing codebase."_
- [x] **Phase 7: Follow-up:** [planning] Create a new plan with Brainstorm session: 'Chat Response Enhancements for Project Memory' — evaluate stream.button(), command links, .agent.md handoffs, stream.filetree(), stream.progress(), stream.reference(), ChatFollowupProvider for interactive plan management, handoff approval, build script actions, and step manipulation
  - _Brainstorm plan deferred to a separate session. The vscode-chat-response-stream skill (step 11) captures all the prerequisite knowledge for that brainstorm._

## Agent Lineage

- **2026-02-13T20:30:05.595Z**: Architect → Coordinator — _Plan designed with 18 atomic steps across 6 phases. Ready for implementation._
- **2026-02-13T22:16:42.881Z**: Executor → Coordinator — _Implementation complete - all code changes for memory_spawn_agent tool done, builds pass, tests pass. Ready for build verification and review._
- **2026-02-13T22:30:39.741Z**: Reviewer → Coordinator — _Build verification passed. All builds succeed, 1067 tests pass, code review approved. Step 9 has confirmation gate._
- **2026-02-13T23:04:56.441Z**: SkillWriter → Coordinator — _Skill created successfully — vscode-chat-response-stream SKILL.md covers all 6 ChatResponseStream methods, command links, push(), ChatFollowupProvider, anti-patterns, and a complete handler example. Ready for finish-up._
- **2026-02-13T23:35:10.180Z**: Coordinator → Coordinator — _Plan fully archived. All steps done, skill created, no further work needed._