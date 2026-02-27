/**
 * agent-materialise.ts — Builds materialised session-scoped agent files
 *
 * A materialised agent file is the fully-formed content written to
 * `.github/agents/sessions/{session_id}/{agent_type}.agent.md` at deploy time.
 *
 * Structure (in order):
 *   1. Base agent content  — raw from agent_definitions.content
 *   2. ## Tool Surface Restrictions — injected from blocked_tools / allowed_tools
 *   3. ## Step Context  — injected from step_indices + context_payload
 *   4. ## PEER_SESSIONS — injected from workspace_session_registry (live at deploy time)
 *   5. ## Hub Customisation Zone — sealed append zone written last
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getAgent } from '../db/agent-definition-db.js';
import {
  upsertSessionRegistry,
  getActivePeerSessions,
} from '../db/workspace-session-registry-db.js';
import type { PeerSessionSummary } from '../db/workspace-session-registry-db.js';
import { nowIso } from '../db/query-helpers.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MaterialiseParams {
  /** Workspace ID (for session registry lookup + path resolution) */
  workspaceId: string;
  /** Workspace filesystem path (absolute) */
  workspacePath: string;
  /** Plan this deployment belongs to */
  planId: string;
  /** Agent type slug — must match name in agent_definitions table */
  agentType: string;
  /** Session ID minted by the caller (memory_session prep) */
  sessionId: string;
  /** Phase this agent is being deployed into */
  phaseName?: string;
  /** Step indices this session will work on */
  stepIndices?: number[];
  /**
   * Free-form context payload injected as step context block.
   * Typically built from memory_context(action: get) data by the Hub.
   */
  contextPayload?: Record<string, unknown>;
  /**
   * Override the DB-level tool surfaces for this specific deployment.
   * If provided, these lists WIN over the persisted agent_definitions values.
   */
  toolOverrides?: {
    allowedTools?: string[];
    blockedTools?: string[];
  };
  /**
   * Files this session is allowed to modify (for cross-session conflict
   * avoidance — persisted to workspace_session_registry).
   */
  filesInScope?: string[];
  /**
   * Current phase within the session (for peer-session visibility).
   */
  currentPhase?: string;
}

export interface MaterialiseResult {
  /** Absolute path to the written .agent.md file */
  filePath: string;
  /** Session ID registered in workspace_session_registry */
  sessionId: string;
  /** Number of peer sessions injected into the PEER_SESSIONS block */
  peerSessionsCount: number;
  /** Warning messages (non-fatal) */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------

function buildToolSurfaceBlock(
  allowedTools: string[] | null,
  blockedTools: string[] | null,
): string {
  const lines: string[] = ['## Tool Surface Restrictions', ''];
  if (allowedTools && allowedTools.length > 0) {
    lines.push('**Explicitly allowed tool:action patterns:**');
    for (const t of allowedTools) {
      lines.push(`- ✅ \`${t}\``);
    }
    lines.push('');
  }
  if (blockedTools && blockedTools.length > 0) {
    lines.push('**Blocked tool:action patterns (NEVER invoke these):**');
    for (const t of blockedTools) {
      lines.push(`- ❌ \`${t}\``);
    }
    lines.push('');
  }
  lines.push(
    '**Terminal surface mandate:** Use `memory_terminal` or `memory_terminal_interactive`',
    'as the ONLY command-execution surface. Do NOT use system shells or OS commands directly.',
    '',
  );
  return lines.join('\n');
}

function buildStepContextBlock(
  stepIndices: number[] | undefined,
  phaseName: string | undefined,
  contextPayload: Record<string, unknown> | undefined,
): string {
  const lines: string[] = ['## Step Context', ''];
  if (phaseName) {
    lines.push(`**Current phase:** ${phaseName}`, '');
  }
  if (stepIndices && stepIndices.length > 0) {
    lines.push(`**Assigned step indices:** ${stepIndices.join(', ')}`, '');
  }
  if (contextPayload && Object.keys(contextPayload).length > 0) {
    lines.push('**Context payload (from Hub enrichment):**', '');
    lines.push('```json');
    lines.push(JSON.stringify(contextPayload, null, 2));
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

function buildPeerSessionsBlock(peers: PeerSessionSummary[]): string {
  if (peers.length === 0) {
    return [
      '## PEER_SESSIONS',
      '',
      '_No other active sessions on this workspace._',
      '',
    ].join('\n');
  }

  const lines: string[] = ['## PEER_SESSIONS', ''];
  lines.push(
    'The following sessions are concurrently active on this workspace.',
    'Avoid modifying files listed under `files_in_scope` of peer sessions.',
    'If a conflict is detected, stop and call `memory_agent(action: handoff)` with reason `scope_conflict`.',
    '',
  );

  for (const peer of peers) {
    lines.push(`### Session \`${peer.sessionId}\``);
    lines.push(`- **Agent type:** ${peer.agentType}`);
    lines.push(`- **Plan ID:** ${peer.planId}`);
    if (peer.currentPhase) {
      lines.push(`- **Current phase:** ${peer.currentPhase}`);
    }
    if (peer.stepIndicesClaimed.length > 0) {
      lines.push(`- **Steps claimed:** ${peer.stepIndicesClaimed.join(', ')}`);
    }
    if (peer.filesInScope && peer.filesInScope.length > 0) {
      lines.push('- **Files in scope (do NOT modify):**');
      for (const f of peer.filesInScope) {
        lines.push(`  - \`${f}\``);
      }
    }
    if (peer.materialisedPath) {
      lines.push(`- **Materialised path:** \`${peer.materialisedPath}\``);
    }
    lines.push(`- **Status:** ${peer.status}`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildHubCustomisationZone(): string {
  return [
    '## Hub Customisation Zone',
    '',
    '<!-- HUB_CUSTOMISATION_APPEND_START -->',
    '<!-- Hub-injected task-specific rules go here. This section is managed by the Hub at spawn time. -->',
    '<!-- HUB_CUSTOMISATION_APPEND_END -->',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Materialise a session-scoped agent file and register the session.
 *
 * Writes:
 *   `{workspacePath}/.github/agents/sessions/{sessionId}/{agentType}.agent.md`
 *
 * Also upserts the workspace_session_registry row so peer sessions can
 * see this deployment immediately.
 */
export async function materialiseAgent(params: MaterialiseParams): Promise<MaterialiseResult> {
  const warnings: string[] = [];
  const agentSlug = params.agentType.toLowerCase().replace(/\s+/g, '-');

  // 1. Resolve output path
  const sessionsDir = path.join(
    params.workspacePath,
    '.github',
    'agents',
    'sessions',
    params.sessionId,
  );
  const filePath = path.join(sessionsDir, `${agentSlug}.agent.md`);

  // 2. Look up agent definition from DB
  let baseContent = '';
  let allowedTools: string[] | null = null;
  let blockedTools: string[] | null = null;

  const agentDef = getAgent(agentSlug) ?? getAgent(params.agentType);
  if (agentDef) {
    baseContent = agentDef.content;

    // Merge DB values with caller overrides (overrides win)
    const dbAllowed: string[] = agentDef.allowed_tools
      ? JSON.parse(agentDef.allowed_tools)
      : [];
    const dbBlocked: string[] = agentDef.blocked_tools
      ? JSON.parse(agentDef.blocked_tools)
      : [];

    allowedTools =
      params.toolOverrides?.allowedTools ?? (dbAllowed.length > 0 ? dbAllowed : null);
    blockedTools =
      params.toolOverrides?.blockedTools ?? (dbBlocked.length > 0 ? dbBlocked : null);
  } else {
    warnings.push(
      `Agent definition not found in DB for type "${params.agentType}". ` +
        'Materialised file will contain placeholder content only.',
    );
    baseContent = `# ${params.agentType} Agent\n\n_No base definition found in DB. Contact the Hub administrator._\n`;
    allowedTools = params.toolOverrides?.allowedTools ?? null;
    blockedTools = params.toolOverrides?.blockedTools ?? null;
  }

  // 3. Register this session in workspace_session_registry BEFORE querying peers
  //    so that if two concurrent deploys happen, each sees the other.
  const materialisedPath = filePath.replace(params.workspacePath, '').replace(/\\/g, '/');
  try {
    upsertSessionRegistry(params.sessionId, {
      workspaceId: params.workspaceId,
      planId: params.planId,
      agentType: params.agentType,
      currentPhase: params.currentPhase ?? params.phaseName,
      stepIndicesClaimed: params.stepIndices ?? [],
      filesInScope: params.filesInScope ?? [],
      materialisedPath,
    });
  } catch (err) {
    warnings.push(`Session registry upsert failed (non-fatal): ${(err as Error).message}`);
  }

  // 4. Query peer sessions (after registering self)
  let peers: PeerSessionSummary[] = [];
  try {
    peers = getActivePeerSessions(params.workspaceId, params.sessionId);
  } catch (err) {
    warnings.push(`Peer session query failed (non-fatal): ${(err as Error).message}`);
  }

  // 5. Build materialised content
  const sections: string[] = [];

  //   5a. Base content (from DB)
  sections.push(baseContent.trimEnd());
  sections.push('');
  sections.push('---');
  sections.push('<!-- INJECTED SECTIONS — managed by deploy_agent_to_workspace. Do NOT edit manually. -->');
  sections.push('');

  //   5b. Tool surface restrictions
  if (allowedTools || blockedTools) {
    sections.push(buildToolSurfaceBlock(allowedTools, blockedTools));
  }

  //   5c. Step context
  if (params.stepIndices?.length || params.phaseName || params.contextPayload) {
    sections.push(
      buildStepContextBlock(params.stepIndices, params.phaseName, params.contextPayload),
    );
  }

  //   5d. PEER_SESSIONS
  sections.push(buildPeerSessionsBlock(peers));

  //   5e. Hub customisation zone
  sections.push(buildHubCustomisationZone());

  // Add deploy metadata comment at very end
  sections.push(
    `<!-- deploy_agent_to_workspace: sessionId=${params.sessionId} agentType=${params.agentType} deployedAt=${nowIso()} -->`,
  );

  const content = sections.join('\n');

  // 6. Write file
  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');

  return {
    filePath,
    sessionId: params.sessionId,
    peerSessionsCount: peers.length,
    warnings,
  };
}
