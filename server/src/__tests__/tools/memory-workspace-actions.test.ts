import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryWorkspace } from '../../tools/consolidated/memory_workspace.js';
import type { MemoryWorkspaceParams } from '../../tools/consolidated/memory_workspace.js';
import * as workspaceTools from '../../tools/workspace.tools.js';
import * as store from '../../storage/file-store.js';

vi.mock('../../tools/workspace.tools.js');
vi.mock('../../storage/file-store.js');

const mockWorkspaceId = 'ws_workspace_test_123';

describe('MCP Tool: memory_workspace Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register action', () => {
    it('should require workspace_path', async () => {
      const params: MemoryWorkspaceParams = {
        action: 'register'
      };

      const result = await memoryWorkspace(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_path');
    });

    it('should register workspace when valid', async () => {
      vi.spyOn(workspaceTools, 'registerWorkspace').mockResolvedValue({
        success: true,
        data: {
          workspace: {
            workspace_id: mockWorkspaceId,
            name: 'Test Workspace',
            path: '/test/workspace',
            created_at: '2026-02-04T10:00:00Z',
            active_plans: [],
            archived_plans: []
          },
          first_time: true,
          indexed: true,
          profile: { total_files: 1, total_lines: 10, languages: [], frameworks: [] }
        }
      });

      const params: MemoryWorkspaceParams = {
        action: 'register',
        workspace_path: '/test/workspace'
      };

      const result = await memoryWorkspace(params);

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'register') {
        expect(result.data.data.workspace.workspace_id).toBe(mockWorkspaceId);
      }
    });
  });

  describe('list action', () => {
    it('should list workspaces', async () => {
      vi.spyOn(workspaceTools, 'listWorkspaces').mockResolvedValue({
        success: true,
        data: [
          {
            workspace_id: mockWorkspaceId,
            name: 'Test Workspace',
            path: '/test/workspace',
            created_at: '2026-02-04T10:00:00Z',
            active_plans: [],
            archived_plans: []
          }
        ]
      });

      const result = await memoryWorkspace({ action: 'list' });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list') {
        expect(result.data.data).toHaveLength(1);
      }
    });
  });

  describe('info action', () => {
    it('should require workspace_id', async () => {
      const params: MemoryWorkspaceParams = {
        action: 'info'
      };

      const result = await memoryWorkspace(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
    });

    it('should return workspace not found when missing', async () => {
      vi.spyOn(store, 'getWorkspace').mockResolvedValue(null);

      const result = await memoryWorkspace({
        action: 'info',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workspace not found');
    });

    it('should return workspace info with plan counts', async () => {
      vi.spyOn(store, 'getWorkspace').mockResolvedValue({
        workspace_id: mockWorkspaceId,
        name: 'Test Workspace',
        path: '/test/workspace',
        created_at: '2026-02-04T10:00:00Z',
        active_plans: ['plan_1'],
        archived_plans: ['plan_2']
      });
      vi.spyOn(workspaceTools, 'getWorkspacePlans').mockResolvedValue({
        success: true,
        data: [
          {
            id: 'plan_1',
            workspace_id: mockWorkspaceId,
            title: 'Active Plan',
            description: 'Active',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          {
            id: 'plan_2',
            workspace_id: mockWorkspaceId,
            title: 'Archived Plan',
            description: 'Archived',
            category: 'feature',
            priority: 'low',
            status: 'archived',
            current_phase: 'complete',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          }
        ]
      });

      const result = await memoryWorkspace({
        action: 'info',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'info') {
        expect(result.data.data.active_plans).toBe(1);
        expect(result.data.data.archived_plans).toBe(1);
      }
    });
  });

  describe('reindex action', () => {
    it('should require workspace_id', async () => {
      const params: MemoryWorkspaceParams = {
        action: 'reindex'
      };

      const result = await memoryWorkspace(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
    });

    it('should reindex workspace when valid', async () => {
      vi.spyOn(workspaceTools, 'reindexWorkspace').mockResolvedValue({
        success: true,
        data: {
          workspace_id: mockWorkspaceId,
          new_profile: { total_files: 2, total_lines: 20, languages: [], frameworks: [] },
          changes: {
            languages_changed: false,
            frameworks_changed: false,
            files_delta: 1,
            lines_delta: 10
          }
        }
      });

      const result = await memoryWorkspace({
        action: 'reindex',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'reindex') {
        expect(result.data.data.workspace_id).toBe(mockWorkspaceId);
      }
    });
  });
});
