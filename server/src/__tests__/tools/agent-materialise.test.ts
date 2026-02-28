import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../db/agent-definition-db.js', () => ({
  getAgent: vi.fn(),
}));

vi.mock('../../db/workspace-session-registry-db.js', () => ({
  upsertSessionRegistry: vi.fn(),
  getActivePeerSessions: vi.fn(),
}));

import { getAgent } from '../../db/agent-definition-db.js';
import {
  upsertSessionRegistry,
  getActivePeerSessions,
} from '../../db/workspace-session-registry-db.js';
import { materialiseAgent } from '../../tools/agent-materialise.js';

const mockGetAgent = vi.mocked(getAgent);
const mockUpsertSessionRegistry = vi.mocked(upsertSessionRegistry);
const mockGetActivePeerSessions = vi.mocked(getActivePeerSessions);

describe('materialiseAgent', () => {
  let workspacePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-materialise-'));

    mockGetAgent.mockReturnValue({
      id: 'executor',
      name: 'executor',
      content: '# Executor Agent\n\nBase content',
      allowed_tools: JSON.stringify(['memory_plan:*']),
      blocked_tools: JSON.stringify(['memory_terminal:*']),
      source_path: null,
      source_hash: null,
      version: 1,
      enabled: true,
      is_permanent: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    mockGetActivePeerSessions.mockReturnValue([]);
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('returns injected section manifest with source attribution', async () => {
    mockGetActivePeerSessions.mockReturnValueOnce([
      {
        sessionId: 'peer-1',
        agentType: 'Reviewer',
        planId: 'plan-peer',
        currentPhase: 'Peer Phase',
        stepIndicesClaimed: [7],
        filesInScope: ['src/a.ts'],
        materialisedPath: '/.github/agents/sessions/peer-1/reviewer.agent.md',
        status: 'active',
      },
    ] as any);

    const result = await materialiseAgent({
      workspaceId: 'ws1',
      workspacePath,
      planId: 'plan1',
      agentType: 'Executor',
      sessionId: 'sess-1',
      phaseName: 'Phase 1',
      stepIndices: [1, 2],
      contextPayload: { goal: 'implement feature' },
    });

    expect(result.injectedSections.tool_surface_restrictions).toEqual({
      included: true,
      source: 'agent_definition',
    });
    expect(result.injectedSections.step_context).toEqual({
      included: true,
      source: 'runtime_context_payload',
    });
    expect(result.injectedSections.peer_sessions).toEqual({
      included: true,
      source: 'workspace_session_registry',
    });
    expect(result.injectedSections.hub_customisation_zone).toEqual({
      included: true,
      source: 'deploy_template',
    });

    expect(mockUpsertSessionRegistry).toHaveBeenCalledTimes(1);

    const content = await fs.readFile(result.filePath, 'utf-8');
    expect(content).toContain('---\nagent_type: Executor');
    expect(content).toContain('session_id: sess-1');
    expect(content).toContain('plan_id: plan1');
    expect(content).toContain('workspace_id: ws1');
    expect(content).toContain('step_indices: [1, 2]');
    expect(content).toContain('## Tool Surface Restrictions');
    expect(content).toContain('## Step Context');
    expect(content).toContain('### Step 1');
    expect(content).toContain('### Step 2');
    expect(content).toContain('##PEER_SESSIONS');
    expect(content).toContain('"session_id"');
    expect(content).toContain('**Conflict-avoidance rules (always enforce):**');
    expect(content).toContain('File-lock advisory: if a peer session claims a file in `files_in_scope`, add a plan note before modifying that file.');
    expect(content).toContain('Plan-note conflict check: before adding a note to the same step, check if a peer note was added in the last 60 seconds; if yes, do not add a competing note.');
    expect(content).toContain('Step-index exclusivity: do NOT start a step index that is already `active` in a peer session.');
    expect(content).toContain('Escalation path: on conflict, call `memory_plan(action: add_note)` with conflict details, then halt and call `memory_agent(action: handoff)`.');
    expect(content).toContain('## Plan Update Checkpoint Rules');
    expect(content).toContain('## Hub Customisation Protocol');
    expect(content).toContain('Sealed sections (Hub MUST NOT modify)');
    expect(content).toContain('## Hub Customisation Zone');
  });

  it('marks tool surface source as tool_overrides when overrides are provided', async () => {
    const result = await materialiseAgent({
      workspaceId: 'ws2',
      workspacePath,
      planId: 'plan2',
      agentType: 'Executor',
      sessionId: 'sess-2',
      toolOverrides: {
        allowedTools: ['memory_steps:update'],
      },
    });

    expect(result.injectedSections.tool_surface_restrictions).toEqual({
      included: true,
      source: 'tool_overrides',
    });
  });

  it('is idempotent and overwrites the same materialised file path on repeat deploy', async () => {
    const first = await materialiseAgent({
      workspaceId: 'ws3',
      workspacePath,
      planId: 'plan3',
      agentType: 'Executor',
      sessionId: 'sess-3',
      phaseName: 'Phase Alpha',
    });

    const second = await materialiseAgent({
      workspaceId: 'ws3',
      workspacePath,
      planId: 'plan3',
      agentType: 'Executor',
      sessionId: 'sess-3',
      phaseName: 'Phase Beta',
    });

    expect(second.filePath).toBe(first.filePath);
    expect(mockUpsertSessionRegistry).toHaveBeenCalledTimes(2);

    const content = await fs.readFile(second.filePath, 'utf-8');
    expect(content).toContain('**Current phase:** Phase Beta');
    expect(content).not.toContain('**Current phase:** Phase Alpha');
  });
});
