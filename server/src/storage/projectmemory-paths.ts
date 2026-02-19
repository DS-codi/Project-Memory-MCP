/**
 * Path helpers for the .projectmemory/ directory layout.
 *
 * These paths live inside the user's workspace (not the MCP data root),
 * except for investigation paths which use the MCP data root.
 */

import path from 'path';

// ---------------------------------------------------------------------------
// .projectmemory base
// ---------------------------------------------------------------------------

/** Base .projectmemory directory within a workspace */
export function getProjectMemoryDir(workspacePath: string): string {
  return path.join(workspacePath, '.projectmemory');
}

// ---------------------------------------------------------------------------
// Active agents deployment
// ---------------------------------------------------------------------------

/** Active agents deployment directory */
export function getActiveAgentsDir(workspacePath: string): string {
  return path.join(getProjectMemoryDir(workspacePath), 'active_agents');
}

/** Individual agent deployment directory */
export function getAgentDeployDir(workspacePath: string, agentName: string): string {
  return path.join(getActiveAgentsDir(workspacePath), agentName.toLowerCase());
}

/** Agent file path within deployment */
export function getDeployedAgentFile(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), `${agentName.toLowerCase()}.agent.md`);
}

/** Context bundle file path */
export function getContextBundlePath(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'context-bundle.json');
}

/** Manifest file path */
export function getManifestPath(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'manifest.json');
}

// ---------------------------------------------------------------------------
// Agent sub-directories
// ---------------------------------------------------------------------------

/** Agent context subdirectory */
export function getAgentContextDir(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'context');
}

/** Agent instructions subdirectory */
export function getAgentInstructionsDir(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'instructions');
}

/** Agent execution notes subdirectory */
export function getAgentExecutionNotesDir(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'execution_notes');
}

// ---------------------------------------------------------------------------
// Reviewed queue (post-handoff archive)
// ---------------------------------------------------------------------------

/** Reviewed queue directory (where notes go after handoff cleanup) */
export function getReviewedQueueDir(workspacePath: string): string {
  return path.join(getProjectMemoryDir(workspacePath), 'reviewed_queue');
}

/** Reviewed agent dir within queue */
export function getReviewedAgentDir(
  workspacePath: string,
  planId: string,
  agentName: string,
  timestamp: string,
): string {
  return path.join(
    getReviewedQueueDir(workspacePath),
    planId,
    `${agentName.toLowerCase()}_${timestamp}`,
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Identity file (already exists in codebase) */
export function getIdentityPath(workspacePath: string): string {
  return path.join(getProjectMemoryDir(workspacePath), 'identity.json');
}

// ---------------------------------------------------------------------------
// Investigation (MCP data root, not workspace)
// ---------------------------------------------------------------------------

/** Investigation directory in MCP data root */
export function getInvestigationDir(
  dataRoot: string,
  workspaceId: string,
  planId: string,
  investigationId: string,
): string {
  return path.join(dataRoot, workspaceId, 'plans', planId, 'investigations', investigationId);
}
