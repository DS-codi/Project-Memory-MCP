import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryWorkspace } from '../../tools/consolidated/memory_workspace.js';
import type { MemoryWorkspaceParams } from '../../tools/consolidated/memory_workspace.js';
import * as workspaceTools from '../../tools/workspace.tools.js';
import * as store from '../../storage/db-store.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';
import * as workspaceDbSync from '../../tools/workspace-db-sync.js';
import * as agentDb from '../../db/agent-definition-db.js';
import * as instructionDb from '../../db/instruction-db.js';

vi.mock('../../tools/workspace.tools.js');
vi.mock('../../storage/db-store.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');
vi.mock('../../tools/workspace-db-sync.js');
vi.mock('../../db/agent-definition-db.js');
vi.mock('../../db/instruction-db.js');

const mockWorkspaceId = 'ws_workspace_test_123';

describe('MCP Tool: memory_workspace Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default, validation passes through with the same workspace_id
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    });
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

  describe('set_display_name action', () => {
    it('should require workspace_id', async () => {
      const result = await memoryWorkspace({
        action: 'set_display_name',
        display_name: 'Custom Name'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
    });

    it('should require display_name', async () => {
      const result = await memoryWorkspace({
        action: 'set_display_name',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('display_name');
    });

    it('should reject whitespace-only display_name', async () => {
      const saveWorkspaceSpy = vi.spyOn(store, 'saveWorkspace').mockResolvedValue(undefined);

      const result = await memoryWorkspace({
        action: 'set_display_name',
        workspace_id: mockWorkspaceId,
        display_name: '   '
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty');
      expect(saveWorkspaceSpy).not.toHaveBeenCalled();
    });

    it('should update and persist display_name and name', async () => {
      const workspace = {
        workspace_id: mockWorkspaceId,
        name: 'Old Name',
        path: '/test/workspace',
        registered_at: '2026-02-04T10:00:00Z',
        last_accessed: '2026-02-04T10:00:00Z',
        active_plans: [],
        archived_plans: [],
        active_programs: [],
        indexed: false,
      };

      const saveWorkspaceSpy = vi.spyOn(store, 'saveWorkspace').mockResolvedValue(undefined);
      vi.spyOn(store, 'getWorkspace').mockResolvedValue(workspace);

      const result = await memoryWorkspace({
        action: 'set_display_name',
        workspace_id: mockWorkspaceId,
        display_name: 'Custom Workspace Label'
      });

      expect(result.success).toBe(true);
      expect(saveWorkspaceSpy).toHaveBeenCalledTimes(1);
      expect(workspace.display_name).toBe('Custom Workspace Label');
      expect(workspace.name).toBe('Custom Workspace Label');
      if (result.data && result.data.action === 'set_display_name') {
        expect(result.data.data.workspace.display_name).toBe('Custom Workspace Label');
        expect(result.data.data.workspace.name).toBe('Custom Workspace Label');
      }
    });
  });

  describe('import_context_file action', () => {
    const mockWorkspaceRecord = {
      workspace_id: mockWorkspaceId,
      name: 'Test Workspace',
      workspace_path: '/test/workspace',
      path: '/test/workspace',
      created_at: '2026-02-04T10:00:00Z',
      active_plans: [] as string[],
      archived_plans: [] as string[],
    };

    function makeImportCandidatePreview(kind: 'agent' | 'instruction' = 'agent') {
      return {
        kind,
        file_path: '/test/workspace/.github/agents/my-agent.agent.md',
        relative_path: 'agents/my-agent.agent.md',
        local: {
          filename: 'my-agent.agent.md',
          canonical_name: 'my-agent',
          canonical_filename: 'my-agent.agent.md',
          content: '# My Agent',
          local_size_bytes: 12,
        },
        entry: {
          kind,
          filename: 'my-agent.agent.md',
          relative_path: 'agents/my-agent.agent.md',
          canonical_name: 'my-agent',
          canonical_filename: 'my-agent.agent.md',
          status: 'import_candidate' as const,
          remediation: 'import_context_file',
          comparison_basis: 'local_only' as const,
          policy: {
            sync_managed: true,
            controlled: false,
            import_mode: 'manual' as const,
            canonical_source: 'none' as const,
            canonical_path: null,
            required_workspace_copy: false,
            legacy_mandatory: false,
            validation_errors: [] as string[],
          },
        },
      };
    }

    beforeEach(() => {
      vi.spyOn(store, 'getWorkspace').mockResolvedValue(mockWorkspaceRecord as any);
      vi.spyOn(workspaceDbSync, 'normalizeWorkspaceSyncRelativePath').mockImplementation((p: string) => p);
    });

    it('should require workspace_id', async () => {
      const result = await memoryWorkspace({
        action: 'import_context_file',
        relative_path: 'agents/my-agent.agent.md',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
    });

    it('should require relative_path', async () => {
      const result = await memoryWorkspace({
        action: 'import_context_file',
        workspace_id: mockWorkspaceId,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('relative_path');
    });

    it('should return error when file not found by inspectWorkspaceSyncFile', async () => {
      vi.spyOn(workspaceDbSync, 'inspectWorkspaceSyncFile').mockReturnValue(undefined);
      const result = await memoryWorkspace({
        action: 'import_context_file',
        workspace_id: mockWorkspaceId,
        relative_path: 'agents/nonexistent.agent.md',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('relative_path must reference an existing');
    });

    it('should return preview info without writing when confirm is not set', async () => {
      vi.spyOn(workspaceDbSync, 'inspectWorkspaceSyncFile').mockReturnValue(makeImportCandidatePreview() as any);
      const result = await memoryWorkspace({
        action: 'import_context_file',
        workspace_id: mockWorkspaceId,
        relative_path: 'agents/my-agent.agent.md',
      });
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'import_context_file') {
        expect(result.data.data.imported).toBe(false);
        expect(result.data.data.message).toContain('Preview only');
        expect(result.data.data.kind).toBe('agent');
      }
    });

    it('should call storeAgent and return imported=true when confirm=true', async () => {
      vi.spyOn(workspaceDbSync, 'inspectWorkspaceSyncFile').mockReturnValue(makeImportCandidatePreview('agent') as any);
      const storeAgentSpy = vi.spyOn(agentDb, 'storeAgent').mockReturnValue(undefined as any);
      const result = await memoryWorkspace({
        action: 'import_context_file',
        workspace_id: mockWorkspaceId,
        relative_path: 'agents/my-agent.agent.md',
        confirm: true,
      });
      expect(result.success).toBe(true);
      expect(storeAgentSpy).toHaveBeenCalledTimes(1);
      if (result.data && result.data.action === 'import_context_file') {
        expect(result.data.data.imported).toBe(true);
      }
    });

    it('should reject a PM-controlled file (cull_reason set)', async () => {
      const preview = makeImportCandidatePreview();
      preview.entry.policy.cull_reason = 'superseded_by_canonical';
      vi.spyOn(workspaceDbSync, 'inspectWorkspaceSyncFile').mockReturnValue(preview as any);
      const result = await memoryWorkspace({
        action: 'import_context_file',
        workspace_id: mockWorkspaceId,
        relative_path: 'agents/my-agent.agent.md',
        confirm: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('DB-only by manifest policy');
    });

    it('should reject a metadata-invalid file (validation_errors non-empty)', async () => {
      const preview = makeImportCandidatePreview();
      preview.entry.policy.validation_errors = ['Missing canonical_name header'];
      vi.spyOn(workspaceDbSync, 'inspectWorkspaceSyncFile').mockReturnValue(preview as any);
      const result = await memoryWorkspace({
        action: 'import_context_file',
        workspace_id: mockWorkspaceId,
        relative_path: 'agents/my-agent.agent.md',
        confirm: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid PM metadata');
    });
  });
});
