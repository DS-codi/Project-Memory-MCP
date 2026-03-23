/**
 * Action Parameter Specs — memory_workspace, memory_terminal, memory_filesystem
 *
 * Per-action required/optional parameter definitions derived from the Zod
 * schemas in server/src/index.ts.
 */

import type { ActionParamDef } from './action-params-plan.js';

// =============================================================================
// memory_workspace
// =============================================================================

export const WORKSPACE_PARAMS: Record<string, ActionParamDef> = {

  register: {
    required: [
      { name: 'workspace_path', type: 'string', description: 'Absolute path to workspace directory' },
    ],
    optional: [
      { name: 'force', type: 'boolean', description: 'Force registration even if directory overlaps' },
    ],
  },

  list: {
    required: [],
    optional: [
      { name: 'hierarchical', type: 'boolean', description: 'Group child workspaces under parents' },
    ],
  },

  info: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [],
  },

  reindex: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [],
  },

  merge: {
    required: [
      { name: 'source_workspace_id', type: 'string', description: 'Source workspace/ghost folder ID' },
      { name: 'target_workspace_id', type: 'string', description: 'Target canonical workspace ID' },
    ],
    optional: [
      { name: 'dry_run', type: 'boolean', description: 'Preview merge without changes (default true)' },
    ],
  },

  scan_ghosts: {
    required: [],
    optional: [],
  },

  migrate: {
    required: [
      { name: 'workspace_path', type: 'string', description: 'Absolute path to workspace' },
    ],
    optional: [],
  },

  link: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Parent workspace ID' },
      { name: 'child_workspace_id', type: 'string', description: 'Child workspace ID' },
    ],
    optional: [
      { name: 'mode', type: 'string', description: 'link or unlink (default: link)' },
    ],
  },

  export_pending: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'output_filename', type: 'string', description: 'Custom output filename' },
    ],
  },

  generate_focused_workspace: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [
      { name: 'files_allowed', type: 'string[]', description: 'Individual files to include in scope' },
      { name: 'directories_allowed', type: 'string[]', description: 'Directories to include in scope' },
      { name: 'base_workspace_path', type: 'string', description: 'Path to base .code-workspace to merge' },
      { name: 'output_filename', type: 'string', description: 'Custom output filename' },
      { name: 'session_id', type: 'string', description: 'Active session ID for scope registration' },
    ],
  },

  list_focused_workspaces: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'plan_id', type: 'string', description: 'Filter by plan ID' },
    ],
  },

  set_display_name: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'display_name', type: 'string', description: 'New display name for the workspace' },
    ],
    optional: [],
  },

  check_context_sync: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [],
  },

  import_context_file: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'relative_path', type: 'string', description: 'Workspace-relative or .github-relative path' },
    ],
    optional: [
      { name: 'confirm', type: 'boolean', description: 'When true, performs the import; otherwise previews' },
      { name: 'expected_kind', type: 'string', description: 'Optional safety check: agent or instruction' },
    ],
  },
};

// =============================================================================
// memory_terminal
// =============================================================================

export const TERMINAL_PARAMS: Record<string, ActionParamDef> = {

  run: {
    required: [
      { name: 'command', type: 'string', description: 'Command to execute' },
    ],
    optional: [
      { name: 'args', type: 'string[]', description: 'Command arguments' },
      { name: 'cwd', type: 'string', description: 'Working directory' },
      { name: 'timeout_ms', type: 'number', description: 'Execution timeout in milliseconds' },
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'env', type: 'object', description: 'Per-request environment variables for the spawned process (for run). Supports Gemini/Google API key alias auto-expansion.' },
    ],
  },

  spawn_cli_session: {
    required: [
      { name: 'provider', type: 'string', description: 'Provider to launch (gemini or copilot)' },
    ],
    optional: [
      { name: 'cwd', type: 'string', description: 'Working directory for the spawned session' },
      { name: 'prompt', type: 'string', description: 'Startup prompt for provider launch' },
      { name: 'context', type: 'object', description: 'Structured launch context (requesting_agent/plan/session/notes/files/output/session_mode)' },
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'session_id', type: 'string', description: 'Session ID override (optional)' },
      { name: 'session_target', type: 'string', description: 'Run-session routing behavior (selected/default/specific)' },
      { name: 'timeout_ms', type: 'number', description: 'Execution timeout in milliseconds' },
      { name: 'env', type: 'object', description: 'Per-request environment variable overrides' },
    ],
  },

  read_output: {
    required: [
      { name: 'session_id', type: 'string', description: 'Session ID' },
    ],
    optional: [],
  },

  kill: {
    required: [
      { name: 'session_id', type: 'string', description: 'Session ID to terminate' },
    ],
    optional: [],
  },

  get_allowlist: {
    required: [],
    optional: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
  },

  update_allowlist: {
    required: [
      { name: 'patterns', type: 'string[]', description: 'Allowlist patterns' },
      { name: 'operation', type: 'string', description: 'How to modify: add, remove, or set' },
    ],
    optional: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
  },
};

// =============================================================================
// memory_filesystem
// =============================================================================

export const FILESYSTEM_PARAMS: Record<string, ActionParamDef> = {

  read: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'path', type: 'string', description: 'File path relative to workspace root' },
    ],
    optional: [],
  },

  write: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'path', type: 'string', description: 'File path relative to workspace root' },
      { name: 'content', type: 'string', description: 'File content' },
    ],
    optional: [
      { name: 'create_dirs', type: 'boolean', description: 'Auto-create parent directories (default true)' },
    ],
  },

  search: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'pattern', type: 'string', description: 'Glob pattern' },
      { name: 'regex', type: 'string', description: 'Regex pattern (alternative to glob)' },
      { name: 'include', type: 'string', description: 'File include filter (e.g. "*.ts")' },
    ],
  },

  discover_codebase: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'prompt_text', type: 'string', description: 'Prompt text used to derive keywords for ranked codebase discovery' },
    ],
    optional: [
      { name: 'task_text', type: 'string', description: 'Optional task text appended before keyword extraction' },
      { name: 'limit', type: 'number', description: 'Maximum results to return (default 20, max 100)' },
    ],
  },

  list: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'path', type: 'string', description: 'Directory path' },
      { name: 'recursive', type: 'boolean', description: 'Recurse into subdirectories' },
    ],
  },

  tree: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'path', type: 'string', description: 'Root path for tree' },
      { name: 'max_depth', type: 'number', description: 'Maximum depth (default 3, max 10)' },
    ],
  },

  delete: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'path', type: 'string', description: 'Path to delete' },
      { name: 'confirm', type: 'boolean', description: 'Must be true to confirm deletion' },
    ],
    optional: [
      { name: 'dry_run', type: 'boolean', description: 'Preview without side effects' },
    ],
  },

  move: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'source', type: 'string', description: 'Source path' },
      { name: 'destination', type: 'string', description: 'Destination path' },
    ],
    optional: [
      { name: 'overwrite', type: 'boolean', description: 'Overwrite destination (default false)' },
      { name: 'dry_run', type: 'boolean', description: 'Preview without side effects' },
    ],
  },

  copy: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'source', type: 'string', description: 'Source path' },
      { name: 'destination', type: 'string', description: 'Destination path' },
    ],
    optional: [
      { name: 'overwrite', type: 'boolean', description: 'Overwrite destination (default false)' },
    ],
  },

  append: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'path', type: 'string', description: 'File path' },
      { name: 'content', type: 'string', description: 'Content to append' },
    ],
    optional: [],
  },

  exists: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'path', type: 'string', description: 'Path to check' },
    ],
    optional: [],
  },
};
