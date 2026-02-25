import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryAgent } from '../../tools/consolidated/memory_agent.js';
import type { MemoryAgentParams } from '../../tools/consolidated/memory_agent.js';
import * as handoffTools from '../../tools/handoff.tools.js';
import * as agentTools from '../../tools/agent.tools.js';
import * as validationTools from '../../tools/agent-validation.tools.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';
import * as agentDeploy from '../../tools/agent-deploy.js';
import * as fileStore from '../../storage/db-store.js';

vi.mock('../../tools/handoff.tools.js');
vi.mock('../../tools/agent.tools.js');
vi.mock('../../tools/agent-validation.tools.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../tools/agent-deploy.js');
vi.mock('../../storage/db-store.js');
vi.mock('../../storage/workspace-identity.js');

const mockWorkspaceId = 'ws_agent_test_123';
const mockPlanId = 'plan_agent_test_456';

describe('MCP Tool: memory_agent Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
    vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue({
      id: mockWorkspaceId,
      workspace_path: '/test/workspace',
    } as any);
    vi.spyOn(agentDeploy, 'cleanupAgent').mockResolvedValue(undefined);
  });

  describe('init action', () => {
    it('should require agent_type', async () => {
      const params: MemoryAgentParams = {
        action: 'init'
      };

      const result = await memoryAgent(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('agent_type');
    });

    it('should return init data even when success=false', async () => {
      vi.spyOn(handoffTools, 'initialiseAgent').mockResolvedValue({
        success: false,
        error: 'Needs handoff',
        data: {
          session_id: 'sess_1',
          agent_type: 'Executor',
          started_at: '2026-02-04T10:00:00Z'
        }
      });

      const result = await memoryAgent({
        action: 'init',
        agent_type: 'Executor'
      });

      expect(result.success).toBe(false);
      if (result.data && result.data.action === 'init') {
        expect(result.data.data.agent_type).toBe('Executor');
      }
    });
  });

  describe('complete action', () => {
    it('should require workspace_id, plan_id, agent_type, and summary', async () => {
      const result = await memoryAgent({
        action: 'complete',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        agent_type: 'Executor'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('summary');
    });

    it('should complete agent when valid', async () => {
      vi.spyOn(handoffTools, 'completeAgent').mockResolvedValue({
        success: true,
        data: {
          session_id: 'sess_2',
          agent_type: 'Executor',
          started_at: '2026-02-04T10:00:00Z',
          completed_at: '2026-02-04T12:00:00Z',
          context: {},
          summary: 'Done'
        }
      });

      const result = await memoryAgent({
        action: 'complete',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        agent_type: 'Executor',
        summary: 'Done'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'complete') {
        expect(result.data.data.summary).toBe('Done');
      }
      expect(agentDeploy.cleanupAgent).toHaveBeenCalledWith('/test/workspace', 'Executor', mockPlanId);
    });

    it('should preserve successful completion when cleanup throws (non-fatal)', async () => {
      vi.spyOn(handoffTools, 'completeAgent').mockResolvedValue({
        success: true,
        data: {
          session_id: 'sess_2b',
          agent_type: 'Executor',
          started_at: '2026-02-04T10:00:00Z',
          completed_at: '2026-02-04T12:00:00Z',
          context: {},
          summary: 'Done with cleanup warning'
        }
      });
      vi.spyOn(agentDeploy, 'cleanupAgent').mockRejectedValue(new Error('cleanup failed'));

      const result = await memoryAgent({
        action: 'complete',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        agent_type: 'Executor',
        summary: 'Done with cleanup warning'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'complete') {
        expect(result.data.data.summary).toContain('cleanup warning');
      }
    });
  });

  describe('handoff action', () => {
    it('should require workspace_id, plan_id, from_agent, to_agent, and reason', async () => {
      const result = await memoryAgent({
        action: 'handoff',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_agent: 'Executor',
        to_agent: 'Reviewer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('reason');
    });

    it('should handoff when valid', async () => {
      vi.spyOn(handoffTools, 'handoff').mockResolvedValue({
        success: true,
        data: {
          timestamp: '2026-02-04T10:00:00Z',
          from_agent: 'Executor',
          to_agent: 'Reviewer',
          reason: 'Review',
          verification: { valid: true, issues: [] },
          coordinator_instruction: 'ok'
        }
      });

      const result = await memoryAgent({
        action: 'handoff',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_agent: 'Executor',
        to_agent: 'Reviewer',
        reason: 'Review'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'handoff') {
        expect(result.data.data.to_agent).toBe('Reviewer');
      }
      expect(agentDeploy.cleanupAgent).toHaveBeenCalledWith('/test/workspace', 'Executor', mockPlanId);
    });

    it('should preserve successful handoff when cleanup throws (non-fatal)', async () => {
      vi.spyOn(handoffTools, 'handoff').mockResolvedValue({
        success: true,
        data: {
          timestamp: '2026-02-04T10:00:00Z',
          from_agent: 'Executor',
          to_agent: 'Reviewer',
          reason: 'Review',
          verification: { valid: true, issues: [] },
          coordinator_instruction: 'ok'
        }
      });
      vi.spyOn(agentDeploy, 'cleanupAgent').mockRejectedValue(new Error('cleanup failed'));

      const result = await memoryAgent({
        action: 'handoff',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_agent: 'Executor',
        to_agent: 'Reviewer',
        reason: 'Review'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'handoff') {
        expect(result.data.data.to_agent).toBe('Reviewer');
      }
    });
  });

  describe('validate action', () => {
    it('should require workspace_id, plan_id, and agent_type', async () => {
      const result = await memoryAgent({
        action: 'validate',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('agent_type');
    });

    it('should return error for unknown agent type', async () => {
      const result = await memoryAgent({
        action: 'validate',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        agent_type: 'Unknown' as any
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No validation function');
    });

    it('should validate when agent type is supported', async () => {
      vi.spyOn(validationTools, 'validateExecutor').mockResolvedValue({
        success: true,
        data: {
          valid: true,
          issues: []
        }
      });

      const result = await memoryAgent({
        action: 'validate',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        agent_type: 'Executor'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'validate') {
        expect(result.data.data.valid).toBe(true);
      }
    });

    it('should validate when Reviewer agent type is supported', async () => {
      vi.spyOn(validationTools, 'validateReviewer').mockResolvedValue({
        success: true,
        data: {
          valid: true,
          issues: []
        }
      });

      const result = await memoryAgent({
        action: 'validate',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        agent_type: 'Reviewer'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'validate') {
        expect(result.data.data.valid).toBe(true);
      }
    });
  });

  describe('list action', () => {
    it('should list agents', async () => {
      vi.spyOn(agentTools, 'listAgents').mockResolvedValue({
        success: true,
        data: ['executor.agent.md']
      });

      const result = await memoryAgent({ action: 'list' });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list') {
        expect(result.data.data).toHaveLength(1);
      }
    });
  });

  describe('get_instructions action', () => {
    it('should require agent_name', async () => {
      const result = await memoryAgent({ action: 'get_instructions' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('agent_name');
    });

    it('should return instructions when valid', async () => {
      vi.spyOn(agentTools, 'getAgentInstructions').mockResolvedValue({
        success: true,
        data: { filename: 'executor.agent.md', content: 'content' }
      });

      const result = await memoryAgent({
        action: 'get_instructions',
        agent_name: 'executor'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'get_instructions') {
        expect(result.data.data.filename).toContain('executor');
      }
    });
  });

  describe('deploy action', () => {
    it('should require workspace_path', async () => {
      const result = await memoryAgent({ action: 'deploy' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_path');
    });

    it('should deploy agents when valid', async () => {
      vi.spyOn(agentTools, 'deployAgentsToWorkspace').mockResolvedValue({
        success: true,
        data: {
          deployed: ['executor.agent.md'],
          prompts_deployed: [],
          instructions_deployed: [],
          target_path: '/test/workspace/.github/agents'
        }
      });

      const result = await memoryAgent({
        action: 'deploy',
        workspace_path: '/test/workspace'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'deploy') {
        expect(result.data.data.deployed).toHaveLength(1);
      }
    });
  });

  describe('get_briefing action', () => {
    it('should require workspace_id and plan_id', async () => {
      const result = await memoryAgent({ action: 'get_briefing', workspace_id: mockWorkspaceId });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should return briefing when valid', async () => {
      vi.spyOn(handoffTools, 'getMissionBriefing').mockResolvedValue({
        success: true,
        data: {
          plan_id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Plan',
          description: 'Desc',
          goals: [],
          success_criteria: [],
          steps: [],
          warnings: []
        }
      });

      const result = await memoryAgent({
        action: 'get_briefing',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'get_briefing') {
        expect(result.data.data.plan_id).toBe(mockPlanId);
      }
    });
  });

  describe('get_lineage action', () => {
    it('should require workspace_id and plan_id', async () => {
      const result = await memoryAgent({ action: 'get_lineage', workspace_id: mockWorkspaceId });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should return lineage when valid', async () => {
      vi.spyOn(handoffTools, 'getLineage').mockResolvedValue({
        success: true,
        data: [
          {
            timestamp: '2026-02-04T10:00:00Z',
            from_agent: 'Executor',
            to_agent: 'Reviewer',
            reason: 'Review'
          }
        ]
      });

      const result = await memoryAgent({
        action: 'get_lineage',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'get_lineage') {
        expect(result.data.data[0].to_agent).toBe('Reviewer');
      }
    });
  });
});
