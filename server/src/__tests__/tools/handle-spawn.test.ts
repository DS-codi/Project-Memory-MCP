import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSpawn } from '../../tools/agent.tools.js';
import { AGENT_BOUNDARIES } from '../../types/index.js';
import type { AgentType } from '../../types/index.js';

// Mock dependencies
vi.mock('../../storage/file-store.js', () => ({
  getWorkspace: vi.fn(),
  getPlanState: vi.fn(),
}));

vi.mock('../../utils/agent-loader.js', () => ({
  validateAgentExists: vi.fn(),
  loadAgentInstructions: vi.fn(),
  listKnownAgentNames: vi.fn(),
}));

import * as store from '../../storage/file-store.js';
import * as agentLoader from '../../utils/agent-loader.js';

const mockWorkspaceId = 'ws_spawn_test_123';
const mockPlanId = 'plan_spawn_456';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockValidAgent(name: string = 'Executor') {
  const lowerName = name.toLowerCase();
  vi.mocked(agentLoader.validateAgentExists).mockResolvedValue({
    name,
    filename: `${lowerName}.agent.md`,
    filepath: `/agents/${lowerName}.agent.md`,
  });
  vi.mocked(agentLoader.loadAgentInstructions).mockResolvedValue({
    agent: {
      name,
      filename: `${lowerName}.agent.md`,
      filepath: `/agents/${lowerName}.agent.md`,
    },
    instructions: `# ${name} Agent\nInstructions for ${name}.`,
  });
  vi.mocked(agentLoader.listKnownAgentNames).mockReturnValue([
    'Coordinator', 'Analyst', 'Researcher', 'Architect',
    'Executor', 'Reviewer', 'Tester', 'Revisionist',
    'Archivist', 'Brainstorm', 'Runner', 'SkillWriter',
    'Worker', 'TDDDriver', 'Cognition',
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleSpawn — validation & context injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Required parameter validation
  // =========================================================================

  describe('required parameter validation', () => {
    it('returns error when agent_name is missing', async () => {
      const result = await handleSpawn({ agent_name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('agent_name is required');
    });

    it('returns error when agent_name is undefined-ish', async () => {
      // Simulate missing agent_name via empty string (TS prevents true undefined)
      const result = await handleSpawn({ agent_name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // Agent name validation
  // =========================================================================

  describe('agent name validation', () => {
    it('accepts a valid agent name (e.g. "Executor")', async () => {
      mockValidAgent('Executor');

      const result = await handleSpawn({
        agent_name: 'Executor',
        workspace_id: mockWorkspaceId,
      });

      expect(result.success).toBe(true);
      expect(result.data?.agent_name).toBe('Executor');
      expect(result.data?.agent_file).toBe('executor.agent.md');
      expect(result.data?.agent_instructions).toContain('Executor');
    });

    it('rejects an unknown/invalid agent name', async () => {
      vi.mocked(agentLoader.validateAgentExists).mockResolvedValue(null);
      vi.mocked(agentLoader.listKnownAgentNames).mockReturnValue([
        'Coordinator', 'Executor', 'Tester',
      ]);

      const result = await handleSpawn({ agent_name: 'FakeAgent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent not found');
      expect(result.error).toContain('FakeAgent');
      expect(result.error).toContain('Known agents');
    });

    it('accepts all canonical agent types', async () => {
      const canonicalAgents: AgentType[] = [
        'Coordinator', 'Analyst', 'Researcher', 'Architect',
        'Executor', 'Reviewer', 'Tester', 'Revisionist',
        'Archivist', 'Brainstorm', 'Runner', 'Worker', 'TDDDriver', 'Cognition',
      ];

      for (const agentName of canonicalAgents) {
        mockValidAgent(agentName);

        const result = await handleSpawn({ agent_name: agentName });

        expect(result.success).toBe(true);
        expect(result.data?.agent_name).toBe(agentName);
      }
    });
  });

  // =========================================================================
  // Cognition agent — read-only enforcement
  // =========================================================================

  describe('Cognition agent (read-only enforcement)', () => {
    it('Cognition boundaries forbid implementation actions', () => {
      const cognition = AGENT_BOUNDARIES['Cognition'];

      expect(cognition).toBeDefined();
      expect(cognition.can_implement).toBe(false);
      expect(cognition.can_finalize).toBe(false);
      expect(cognition.forbidden_actions).toContain('create files');
      expect(cognition.forbidden_actions).toContain('edit code');
      expect(cognition.forbidden_actions).toContain('modify plans');
      expect(cognition.forbidden_actions).toContain('modify steps');
      expect(cognition.forbidden_actions).toContain('store context');
    });

    it('Cognition is classified as a spoke (no hub/spawn flags)', () => {
      const cognition = AGENT_BOUNDARIES['Cognition'];

      expect(cognition.is_hub).toBeUndefined();
      expect(cognition.can_spawn_subagents).toBeUndefined();
    });

    it('Cognition must hand off to Coordinator only', () => {
      const cognition = AGENT_BOUNDARIES['Cognition'];

      expect(cognition.must_handoff_to).toEqual(['Coordinator']);
    });

    it('spawn accepts Cognition as a valid agent', async () => {
      mockValidAgent('Cognition');

      const result = await handleSpawn({ agent_name: 'Cognition' });

      expect(result.success).toBe(true);
      expect(result.data?.agent_name).toBe('Cognition');
    });
  });

  // =========================================================================
  // Context injection — workspace metadata
  // =========================================================================

  describe('workspace context injection', () => {
    it('includes workspace metadata when workspace_id is provided', async () => {
      mockValidAgent('Executor');
      vi.mocked(store.getWorkspace).mockResolvedValue({
        id: mockWorkspaceId,
        path: '/workspace/project',
        registered_at: '2026-01-15T00:00:00Z',
      } as any);

      const result = await handleSpawn({
        agent_name: 'Executor',
        workspace_id: mockWorkspaceId,
      });

      expect(result.success).toBe(true);
      expect(result.data?.workspace_context).toEqual(
        expect.objectContaining({
          workspace_id: mockWorkspaceId,
          workspace_path: '/workspace/project',
          registered_at: '2026-01-15T00:00:00Z',
        })
      );
    });

    it('workspace context is empty object when workspace_id is omitted', async () => {
      mockValidAgent('Executor');

      const result = await handleSpawn({ agent_name: 'Executor' });

      expect(result.success).toBe(true);
      expect(result.data?.workspace_context).toEqual({});
    });

    it('handles workspace lookup failure gracefully', async () => {
      mockValidAgent('Executor');
      vi.mocked(store.getWorkspace).mockRejectedValue(new Error('disk error'));

      const result = await handleSpawn({
        agent_name: 'Executor',
        workspace_id: mockWorkspaceId,
      });

      // Should still succeed — workspace lookup failure is non-fatal
      expect(result.success).toBe(true);
      expect(result.data?.workspace_context).toEqual(
        expect.objectContaining({
          workspace_id: mockWorkspaceId,
          error: expect.stringContaining('Could not load'),
        })
      );
    });
  });

  // =========================================================================
  // Context injection — plan state
  // =========================================================================

  describe('plan context injection', () => {
    it('includes plan state summary when plan_id + workspace_id are provided', async () => {
      mockValidAgent('Tester');
      vi.mocked(store.getWorkspace).mockResolvedValue({
        id: mockWorkspaceId,
        path: '/workspace/project',
        registered_at: '2026-01-01T00:00:00Z',
      } as any);
      vi.mocked(store.getPlanState).mockResolvedValue({
        id: mockPlanId,
        title: 'Spawn Test Plan',
        status: 'active',
        current_phase: 'Implementation',
        current_agent: 'Executor',
        steps: [
          { status: 'done' },
          { status: 'active' },
          { status: 'pending' },
          { status: 'pending' },
          { status: 'blocked' },
        ],
      } as any);

      const result = await handleSpawn({
        agent_name: 'Tester',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        task_context: 'Run unit tests for week 1',
      });

      expect(result.success).toBe(true);
      expect(result.data?.plan_context).toEqual(
        expect.objectContaining({
          plan_id: mockPlanId,
          title: 'Spawn Test Plan',
          status: 'active',
          current_phase: 'Implementation',
          step_summary: {
            total: 5,
            pending: 2,
            active: 1,
            done: 1,
            blocked: 1,
          },
          task_context: 'Run unit tests for week 1',
        })
      );
    });

    it('plan context is empty when plan_id is omitted', async () => {
      mockValidAgent('Executor');

      const result = await handleSpawn({
        agent_name: 'Executor',
        workspace_id: mockWorkspaceId,
      });

      expect(result.success).toBe(true);
      expect(result.data?.plan_context).toEqual({});
    });

    it('plan context is empty when workspace_id is omitted (even with plan_id)', async () => {
      mockValidAgent('Executor');

      const result = await handleSpawn({
        agent_name: 'Executor',
        plan_id: mockPlanId,
      });

      expect(result.success).toBe(true);
      expect(result.data?.plan_context).toEqual({});
    });

    it('handles plan state lookup failure gracefully', async () => {
      mockValidAgent('Executor');
      vi.mocked(store.getWorkspace).mockResolvedValue({
        id: mockWorkspaceId,
        path: '/workspace/project',
        registered_at: '2026-01-01T00:00:00Z',
      } as any);
      vi.mocked(store.getPlanState).mockRejectedValue(new Error('corrupt file'));

      const result = await handleSpawn({
        agent_name: 'Executor',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
      });

      // Should still succeed — plan lookup failure is non-fatal
      expect(result.success).toBe(true);
      expect(result.data?.plan_context).toEqual(
        expect.objectContaining({
          plan_id: mockPlanId,
          error: expect.stringContaining('Could not load'),
        })
      );
    });
  });

  // =========================================================================
  // Edge cases — agent that exists on disk but lacks boundaries
  // =========================================================================

  describe('boundaries edge cases', () => {
    it('rejects agent with no defined role boundaries', async () => {
      // Agent exists on disk but is not in AGENT_BOUNDARIES
      vi.mocked(agentLoader.validateAgentExists).mockResolvedValue({
        name: 'Phantom',
        filename: 'phantom.agent.md',
        filepath: '/agents/phantom.agent.md',
      });

      const result = await handleSpawn({ agent_name: 'Phantom' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No role boundaries');
      expect(result.error).toContain('Phantom');
    });

    it('rejects agent when instruction file cannot be loaded', async () => {
      vi.mocked(agentLoader.validateAgentExists).mockResolvedValue({
        name: 'Executor',
        filename: 'executor.agent.md',
        filepath: '/agents/executor.agent.md',
      });
      vi.mocked(agentLoader.loadAgentInstructions).mockResolvedValue(null);

      const result = await handleSpawn({ agent_name: 'Executor' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('could not be loaded');
    });
  });
});
