/**
 * Build Script Type Definitions
 *
 * Types for build scripts and their MCP tool action results.
 */

// =============================================================================
// Build Scripts
// =============================================================================

export interface BuildScript {
  id: string;
  name: string;
  description: string;
  command: string;
  directory: string;
  created_at: string;
  plan_id?: string;       // If associated with a specific plan
  workspace_id: string;   // Workspace this script belongs to
  mcp_handle?: string;    // Optional MCP tool handle for programmatic execution
  directory_path?: string; // Absolute directory path resolved by the MCP tool
  command_path?: string;   // Absolute command path when command is a file path
}

// Build Script Result Types for MCP Tool Actions
export interface AddBuildScriptResult {
  script: BuildScript;
}

export interface ListBuildScriptsResult {
  scripts: BuildScript[];
}

export interface RunBuildScriptResult {
  script_id: string;
  script_name: string;
  command: string;
  directory: string;
  directory_path: string;
  command_path?: string;
  message: string;
}

export interface DeleteBuildScriptResult {
  deleted: boolean;
  script_id: string;
}
