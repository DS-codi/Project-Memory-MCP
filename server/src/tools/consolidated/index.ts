/**
 * Consolidated MCP Tools Index
 * 
 * This module exports 8 consolidated tools that replace the 39 individual tools:
 * 
 * 1. memory_workspace - Workspace management (4 actions)
 *    Actions: register, list, info, reindex
 * 
 * 2. memory_plan - Plan lifecycle management (17 actions)
 *    Actions: list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates
 * 
 * 3. memory_steps - Step management (9 actions)
 *    Actions: add, update, batch_update, insert, delete, reorder, move, sort, set_order
 * 
 * 4. memory_agent - Agent lifecycle and deployment (9 actions)
 *    Actions: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage
 * 
 * 5. memory_context - Context and research management (12 actions)
 *    Actions: store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store,
 *             workspace_get, workspace_set, workspace_update, workspace_delete
 * 
 * 6. memory_filesystem - Workspace-scoped filesystem operations (10 actions)
 *    Actions: read, write, search, list, tree, delete, move, copy, append, exists
 * 
 * 7. memory_terminal - Terminal tool with GUI approval flow (5 actions)
 *    Actions: run, read_output, kill, get_allowlist, update_allowlist
 * 
 * 8. memory_session - Agent session management & spawn preparation (3 actions)
 *    Actions: prep, list_sessions, get_session
 */

export { memoryWorkspace, type MemoryWorkspaceParams, type WorkspaceAction } from './memory_workspace.js';
export { memoryPlan, type MemoryPlanParams, type PlanAction } from './memory_plan.js';
export { memorySteps, type MemoryStepsParams, type StepsAction } from './memory_steps.js';
export { memoryAgent, type MemoryAgentParams, type AgentAction } from './memory_agent.js';
export { memoryContext, type MemoryContextParams, type ContextAction } from './memory_context.js';
export { memoryFilesystem, type MemoryFilesystemParams, type FilesystemAction } from './memory_filesystem.js';
export { memoryTerminal, type MemoryTerminalParams, type MemoryTerminalAction } from './memory_terminal.js';
export { memorySession, type MemorySessionParams, type SessionAction } from './memory_session.js';
