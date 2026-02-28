/**
 * Agent definition storage.
 */

import type { AgentDefinitionRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Optional runtime-surface and context config attached to an agent definition. */
export interface AgentSurfaceConfig {
  /** "tool:action" or "tool:*" patterns the agent is allowed to invoke. */
  allowedTools?:         string[];
  /** "tool:action" patterns injected as blocked-surface declarations. */
  blockedTools?:         string[];
  /** Context keys that must be resolved before deploy_agent_to_workspace writes the file. */
  requiredContextKeys?:  string[];
  /**
   * Conditions that embed mandatory plan-update checkpoint rules into every
   * materialised file.  Unset fields default to false.
   */
  checkpointTriggers?: {
    stepComplete?:     boolean;
    blockerDetected?:  boolean;
    scopeEscalation?:  boolean;
    error?:            boolean;
    allStepsDone?:     boolean;
  };
  /** true = permanent on-disk file (hub, prompt-analyst); false = ephemeral. */
  isPermanent?: boolean;
}

export interface StoreAgentInput {
  metadata?:     object | null;
  surfaceConfig?: AgentSurfaceConfig;
}

const PERMANENT_AGENT_NAME_KEYS = new Set(['hub', 'promptanalyst']);

function normalizeAgentNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isPermanentAgentDefinitionName(name: string): boolean {
  return PERMANENT_AGENT_NAME_KEYS.has(normalizeAgentNameKey(name));
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function storeAgent(
  name:     string,
  content:  string,
  opts:     StoreAgentInput = {}
): void {
  const { metadata = null, surfaceConfig = {} } = opts;
  const now = nowIso();

  const allowedTools        = surfaceConfig.allowedTools        ? JSON.stringify(surfaceConfig.allowedTools)        : null;
  const blockedTools        = surfaceConfig.blockedTools        ? JSON.stringify(surfaceConfig.blockedTools)        : null;
  const requiredContextKeys = surfaceConfig.requiredContextKeys ? JSON.stringify(surfaceConfig.requiredContextKeys) : null;
  const checkpointTriggers  = surfaceConfig.checkpointTriggers  ? JSON.stringify(surfaceConfig.checkpointTriggers)  : null;
  const existing = getAgent(name);
  const inferredPermanent = isPermanentAgentDefinitionName(name);
  const isPermanent =
    surfaceConfig.isPermanent !== undefined
      ? (surfaceConfig.isPermanent ? 1 : 0)
      : (existing ? existing.is_permanent : (inferredPermanent ? 1 : 0));

  if (existing) {
    run(
      `UPDATE agent_definitions
          SET content = ?, metadata = ?,
              allowed_tools = ?, blocked_tools = ?,
              required_context_keys = ?, checkpoint_triggers = ?,
              is_permanent = ?, updated_at = ?
        WHERE id = ?`,
      [content, metadata ? JSON.stringify(metadata) : null,
       allowedTools, blockedTools, requiredContextKeys, checkpointTriggers,
       isPermanent, now, existing.id]
    );
  } else {
    run(
      `INSERT INTO agent_definitions
         (id, name, content, metadata,
          allowed_tools, blocked_tools, required_context_keys, checkpoint_triggers,
          is_permanent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), name, content, metadata ? JSON.stringify(metadata) : null,
       allowedTools, blockedTools, requiredContextKeys, checkpointTriggers,
       isPermanent, now, now]
    );
  }
}

/**
 * Update only the surface config columns without replacing the content.
 * Safe to call repeatedly (e.g. from seed or admin tooling).
 */
export function setAgentSurfaceConfig(name: string, config: AgentSurfaceConfig): void {
  const existing = getAgent(name);
  if (!existing) return;

  const now = nowIso();
  run(
    `UPDATE agent_definitions
        SET allowed_tools = ?, blocked_tools = ?,
            required_context_keys = ?, checkpoint_triggers = ?,
            is_permanent = ?, updated_at = ?
      WHERE id = ?`,
    [
      config.allowedTools        ? JSON.stringify(config.allowedTools)        : existing.allowed_tools,
      config.blockedTools        ? JSON.stringify(config.blockedTools)        : existing.blocked_tools,
      config.requiredContextKeys ? JSON.stringify(config.requiredContextKeys) : existing.required_context_keys,
      config.checkpointTriggers  ? JSON.stringify(config.checkpointTriggers)  : existing.checkpoint_triggers,
      config.isPermanent !== undefined ? (config.isPermanent ? 1 : 0) : existing.is_permanent,
      now,
      existing.id,
    ]
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getAgent(name: string): AgentDefinitionRow | null {
  return queryOne<AgentDefinitionRow>(
    'SELECT * FROM agent_definitions WHERE name = ?',
    [name]
  ) ?? null;
}

export function listAgents(): AgentDefinitionRow[] {
  return queryAll<AgentDefinitionRow>(
    'SELECT * FROM agent_definitions ORDER BY name'
  );
}

/** Returns only the 2 permanent agent definitions (hub + prompt-analyst). */
export function listPermanentAgents(): AgentDefinitionRow[] {
  return queryAll<AgentDefinitionRow>(
    'SELECT * FROM agent_definitions WHERE is_permanent = 1 ORDER BY name'
  );
}

/** Parsed helper — returns the blocked_tools array or empty array. */
export function getBlockedTools(name: string): string[] {
  const row = getAgent(name);
  if (!row?.blocked_tools) return [];
  try { return JSON.parse(row.blocked_tools) as string[]; } catch { return []; }
}

/** Parsed helper — returns the required_context_keys array or empty array. */
export function getRequiredContextKeys(name: string): string[] {
  const row = getAgent(name);
  if (!row?.required_context_keys) return [];
  try { return JSON.parse(row.required_context_keys) as string[]; } catch { return []; }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteAgent(name: string): void {
  run('DELETE FROM agent_definitions WHERE name = ?', [name]);
}
