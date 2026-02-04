import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryPlan } from '../../tools/consolidated/memory_plan.js';
import type { MemoryPlanParams } from '../../tools/consolidated/memory_plan.js';
import * as fileStore from '../../storage/file-store.js';

/**
 * Integration Tests for Build Script MCP Tool Actions (Step 40)
 * 
 * Tests the 4 new MCP tool actions in memory_plan:
 * - add_build_script: validation and script creation
 * - list_build_scripts: returns merged results from workspace + plan
 * - run_build_script: executes and returns output
 * - delete_build_script: authorization and deletion
 */

// Mock file store
vi.mock('../../storage/file-store.js');

const mockWorkspaceId = 'ws_mcp_test_123';
const mockPlanId = 'plan_mcp_test_456';

describe('MCP Tool: memory_plan Build Script Actions', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // add_build_script action - Validation and script creation
  // =========================================================================

  describe('add_build_script action', () => {
    
    it('should add workspace-level build script with valid parameters', async () => {
      const mockScript = {
        id: 'script_new_001',
        name: 'Build Dashboard',
        description: 'Build frontend dashboard',
        command: 'npm run build',
        directory: '/workspace/dashboard',
        workspace_id: mockWorkspaceId,
        created_at: '2024-01-20T10:00:00Z',
      };

      vi.spyOn(fileStore, 'addBuildScript').mockResolvedValue(mockScript);

      const params: MemoryPlanParams = {
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        script_name: 'Build Dashboard',
        script_description: 'Build frontend dashboard',
        script_command: 'npm run build',
        script_directory: '/workspace/dashboard',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data && result.data.action === 'add_build_script') {
        expect(result.data.action).toBe('add_build_script');
        expect(result.data.data.script).toEqual(mockScript);
      }
      
      expect(fileStore.addBuildScript).toHaveBeenCalledWith(
        mockWorkspaceId,
        {
          name: 'Build Dashboard',
          description: 'Build frontend dashboard',
          command: 'npm run build',
          directory: '/workspace/dashboard',
          mcp_handle: undefined,
        },
        undefined
      );
    });

    it('should add plan-level build script when plan_id provided', async () => {
      const mockScript = {
        id: 'script_plan_001',
        name: 'Run Tests',
        description: 'Execute test suite',
        command: 'npm test',
        directory: '/workspace',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        created_at: '2024-01-20T11:00:00Z',
      };

      vi.spyOn(fileStore, 'addBuildScript').mockResolvedValue(mockScript);

      const params: MemoryPlanParams = {
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        script_name: 'Run Tests',
        script_description: 'Execute test suite',
        script_command: 'npm test',
        script_directory: '/workspace',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(fileStore.addBuildScript).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.any(Object),
        mockPlanId
      );
    });

    it('should include mcp_handle when provided', async () => {
      const mockScript = {
        id: 'script_mcp_001',
        name: 'Deploy',
        description: 'Deploy to staging',
        command: 'npm run deploy:staging',
        directory: '/workspace',
        workspace_id: mockWorkspaceId,
        mcp_handle: 'deploy:staging',
        created_at: '2024-01-20T12:00:00Z',
      };

      vi.spyOn(fileStore, 'addBuildScript').mockResolvedValue(mockScript);

      const params: MemoryPlanParams = {
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        script_name: 'Deploy',
        script_description: 'Deploy to staging',
        script_command: 'npm run deploy:staging',
        script_directory: '/workspace',
        script_mcp_handle: 'deploy:staging',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(fileStore.addBuildScript).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.objectContaining({
          mcp_handle: 'deploy:staging',
        }),
        undefined
      );
    });

    it('should validate required parameter: workspace_id', async () => {
      const params: MemoryPlanParams = {
        action: 'add_build_script',
        script_name: 'Test',
        script_command: 'test',
        script_directory: '/test',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
      expect(result.error).toContain('required');
    });

    it('should validate required parameter: script_name', async () => {
      const params: MemoryPlanParams = {
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        script_command: 'test',
        script_directory: '/test',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('script_name');
      expect(result.error).toContain('required');
    });

    it('should validate required parameter: script_command', async () => {
      const params: MemoryPlanParams = {
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        script_name: 'Test',
        script_directory: '/test',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('script_command');
      expect(result.error).toContain('required');
    });

    it('should validate required parameter: script_directory', async () => {
      const params: MemoryPlanParams = {
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        script_name: 'Test',
        script_command: 'test',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('script_directory');
      expect(result.error).toContain('required');
    });

    it('should allow empty description', async () => {
      const mockScript = {
        id: 'script_no_desc_001',
        name: 'Quick Script',
        description: '',
        command: 'npm run quick',
        directory: '/workspace',
        workspace_id: mockWorkspaceId,
        created_at: '2024-01-20T13:00:00Z',
      };

      vi.spyOn(fileStore, 'addBuildScript').mockResolvedValue(mockScript);

      const params: MemoryPlanParams = {
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        script_name: 'Quick Script',
        script_command: 'npm run quick',
        script_directory: '/workspace',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(fileStore.addBuildScript).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.objectContaining({
          description: '',
        }),
        undefined
      );
    });
  });

  // =========================================================================
  // list_build_scripts action - Returns merged results
  // =========================================================================

  describe('list_build_scripts action', () => {
    
    it('should list workspace-level scripts only', async () => {
      const mockScripts = [
        {
          id: 'script_ws_001',
          name: 'Build All',
          description: 'Build everything',
          command: 'npm run build:all',
          directory: '/workspace',
          workspace_id: mockWorkspaceId,
          created_at: '2024-01-20T10:00:00Z',
        },
      ];

      vi.spyOn(fileStore, 'getBuildScripts').mockResolvedValue(mockScripts);

      const params: MemoryPlanParams = {
        action: 'list_build_scripts',
        workspace_id: mockWorkspaceId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data && result.data.action === 'list_build_scripts') {
        expect(result.data.action).toBe('list_build_scripts');
        expect(result.data.data.scripts).toEqual(mockScripts);
      }
      
      expect(fileStore.getBuildScripts).toHaveBeenCalledWith(mockWorkspaceId, undefined);
    });

    it('should list merged workspace + plan scripts', async () => {
      const mockScripts = [
        {
          id: 'script_ws_001',
          name: 'Workspace Script',
          description: 'WS level',
          command: 'npm run ws',
          directory: '/workspace',
          workspace_id: mockWorkspaceId,
          created_at: '2024-01-20T10:00:00Z',
        },
        {
          id: 'script_plan_001',
          name: 'Plan Script',
          description: 'Plan level',
          command: 'npm run plan',
          directory: '/workspace',
          workspace_id: mockWorkspaceId,
          plan_id: mockPlanId,
          created_at: '2024-01-20T11:00:00Z',
        },
      ];

      vi.spyOn(fileStore, 'getBuildScripts').mockResolvedValue(mockScripts);

      const params: MemoryPlanParams = {
        action: 'list_build_scripts',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list_build_scripts') {
        expect(result.data.data.scripts).toHaveLength(2);
      }
      
      expect(fileStore.getBuildScripts).toHaveBeenCalledWith(mockWorkspaceId, mockPlanId);
    });

    it('should return empty array when no scripts exist', async () => {
      vi.spyOn(fileStore, 'getBuildScripts').mockResolvedValue([]);

      const params: MemoryPlanParams = {
        action: 'list_build_scripts',
        workspace_id: mockWorkspaceId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list_build_scripts') {
        expect(result.data.data.scripts).toEqual([]);
      }
    });

    it('should validate required parameter: workspace_id', async () => {
      const params: MemoryPlanParams = {
        action: 'list_build_scripts',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
      expect(result.error).toContain('required');
    });
  });

  // =========================================================================
  // run_build_script action - Executes and returns output
  // =========================================================================

  describe('run_build_script action', () => {
    
    it('should execute script and return success with output', async () => {
      const scriptId = 'script_run_001';
      const mockResult = {
        success: true,
        output: 'Build successful\nAll tests passed\n',
      };

      vi.spyOn(fileStore, 'runBuildScript').mockResolvedValue(mockResult);

      const params: MemoryPlanParams = {
        action: 'run_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data && result.data.action === 'run_build_script') {
        expect(result.data.action).toBe('run_build_script');
        expect(result.data.data.success).toBe(true);
        expect(result.data.data.output).toContain('Build successful');
      }
      
      expect(fileStore.runBuildScript).toHaveBeenCalledWith(mockWorkspaceId, scriptId);
    });

    it('should return error when script execution fails', async () => {
      const scriptId = 'script_fail_001';
      const mockResult = {
        success: false,
        output: 'Build started\n',
        error: 'Error: Command failed with exit code 1\nTests failed',
      };

      vi.spyOn(fileStore, 'runBuildScript').mockResolvedValue(mockResult);

      const params: MemoryPlanParams = {
        action: 'run_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true); // Tool call succeeds
      if (result.data && result.data.action === 'run_build_script') {
        expect(result.data.data.success).toBe(false); // But script failed
        expect(result.data.data.error).toBeDefined();
        expect(result.data.data.error).toContain('failed');
      }
    });

    it('should validate required parameter: workspace_id', async () => {
      const params: MemoryPlanParams = {
        action: 'run_build_script',
        script_id: 'script_001',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
      expect(result.error).toContain('required');
    });

    it('should validate required parameter: script_id', async () => {
      const params: MemoryPlanParams = {
        action: 'run_build_script',
        workspace_id: mockWorkspaceId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('script_id');
      expect(result.error).toContain('required');
    });

    it('should handle script not found error', async () => {
      const scriptId = 'script_nonexistent';
      const mockResult = {
        success: false,
        output: '',
        error: `Script ${scriptId} not found`,
      };

      vi.spyOn(fileStore, 'runBuildScript').mockResolvedValue(mockResult);

      const params: MemoryPlanParams = {
        action: 'run_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'run_build_script') {
        expect(result.data.data.success).toBe(false);
        expect(result.data.data.error).toContain('not found');
      }
    });

    it('should include both stdout and stderr in output', async () => {
      const scriptId = 'script_warn_001';
      const mockResult = {
        success: true,
        output: 'Build complete\n\nSTDERR:\nWarning: deprecated API usage\n',
      };

      vi.spyOn(fileStore, 'runBuildScript').mockResolvedValue(mockResult);

      const params: MemoryPlanParams = {
        action: 'run_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'run_build_script') {
        expect(result.data.data.output).toContain('Build complete');
        expect(result.data.data.output).toContain('STDERR:');
        expect(result.data.data.output).toContain('deprecated');
      }
    });
  });

  // =========================================================================
  // delete_build_script action - Authorization and deletion
  // =========================================================================

  describe('delete_build_script action', () => {
    
    it('should delete workspace-level script', async () => {
      const scriptId = 'script_ws_001';

      vi.spyOn(fileStore, 'deleteBuildScript').mockResolvedValue(true);

      const params: MemoryPlanParams = {
        action: 'delete_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data && result.data.action === 'delete_build_script') {
        expect(result.data.action).toBe('delete_build_script');
        expect(result.data.data.deleted).toBe(true);
        expect(result.data.data.script_id).toBe(scriptId);
      }
      
      expect(fileStore.deleteBuildScript).toHaveBeenCalledWith(
        mockWorkspaceId,
        scriptId,
        undefined
      );
    });

    it('should delete plan-level script with plan_id', async () => {
      const scriptId = 'script_plan_001';

      vi.spyOn(fileStore, 'deleteBuildScript').mockResolvedValue(true);

      const params: MemoryPlanParams = {
        action: 'delete_build_script',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        script_id: scriptId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(fileStore.deleteBuildScript).toHaveBeenCalledWith(
        mockWorkspaceId,
        scriptId,
        mockPlanId
      );
    });

    it('should validate required parameter: workspace_id', async () => {
      const params: MemoryPlanParams = {
        action: 'delete_build_script',
        script_id: 'script_001',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
      expect(result.error).toContain('required');
    });

    it('should validate required parameter: script_id', async () => {
      const params: MemoryPlanParams = {
        action: 'delete_build_script',
        workspace_id: mockWorkspaceId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('script_id');
      expect(result.error).toContain('required');
    });

    it('should handle deletion failure gracefully', async () => {
      const scriptId = 'script_fail_001';

      vi.spyOn(fileStore, 'deleteBuildScript').mockRejectedValue(
        new Error('Workspace not found')
      );

      const params: MemoryPlanParams = {
        action: 'delete_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      };

      await expect(memoryPlan(params)).rejects.toThrow('Workspace not found');
    });

    it('should return false when script does not exist', async () => {
      const scriptId = 'script_nonexistent';

      vi.spyOn(fileStore, 'deleteBuildScript').mockResolvedValue(false);

      const params: MemoryPlanParams = {
        action: 'delete_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'delete_build_script') {
        expect(result.data.data.deleted).toBe(false);
      }
    });
  });

  // =========================================================================
  // Integration: Complete workflow tests
  // =========================================================================

  describe('Integration: Complete Workflow', () => {
    
    it('should support full CRUD workflow: add → list → run → delete', async () => {
      const scriptId = 'script_workflow_001';
      
      // 1. Add script
      const addedScript = {
        id: scriptId,
        name: 'Workflow Test',
        description: 'Complete workflow test',
        command: 'echo "test"',
        directory: '/workspace',
        workspace_id: mockWorkspaceId,
        created_at: '2024-01-20T10:00:00Z',
      };
      
      vi.spyOn(fileStore, 'addBuildScript').mockResolvedValue(addedScript);
      
      const addResult = await memoryPlan({
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        script_name: 'Workflow Test',
        script_description: 'Complete workflow test',
        script_command: 'echo "test"',
        script_directory: '/workspace',
      });
      
      expect(addResult.success).toBe(true);
      
      // 2. List scripts
      vi.spyOn(fileStore, 'getBuildScripts').mockResolvedValue([addedScript]);
      
      const listResult = await memoryPlan({
        action: 'list_build_scripts',
        workspace_id: mockWorkspaceId,
      });
      
      expect(listResult.success).toBe(true);
      if (listResult.data && listResult.data.action === 'list_build_scripts') {
        expect(listResult.data.data.scripts).toHaveLength(1);
      }
      
      // 3. Run script
      vi.spyOn(fileStore, 'runBuildScript').mockResolvedValue({
        success: true,
        output: 'test\n',
      });
      
      const runResult = await memoryPlan({
        action: 'run_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      });
      
      expect(runResult.success).toBe(true);
      if (runResult.data && runResult.data.action === 'run_build_script') {
        expect(runResult.data.data.success).toBe(true);
      }
      
      // 4. Delete script
      vi.spyOn(fileStore, 'deleteBuildScript').mockResolvedValue(true);
      
      const deleteResult = await memoryPlan({
        action: 'delete_build_script',
        workspace_id: mockWorkspaceId,
        script_id: scriptId,
      });
      
      expect(deleteResult.success).toBe(true);
      if (deleteResult.data && deleteResult.data.action === 'delete_build_script') {
        expect(deleteResult.data.data.deleted).toBe(true);
      }
    });

    it('should support plan-specific script workflow', async () => {
      const scriptId = 'script_plan_workflow_001';
      
      // Add plan-level script
      const planScript = {
        id: scriptId,
        name: 'Plan Script',
        description: 'Plan-specific script',
        command: 'npm test',
        directory: '/workspace',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        created_at: '2024-01-20T11:00:00Z',
      };
      
      vi.spyOn(fileStore, 'addBuildScript').mockResolvedValue(planScript);
      
      const addResult = await memoryPlan({
        action: 'add_build_script',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        script_name: 'Plan Script',
        script_description: 'Plan-specific script',
        script_command: 'npm test',
        script_directory: '/workspace',
      });
      
      expect(addResult.success).toBe(true);
      expect(fileStore.addBuildScript).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.any(Object),
        mockPlanId
      );
      
      // List includes plan scripts
      vi.spyOn(fileStore, 'getBuildScripts').mockResolvedValue([planScript]);
      
      const listResult = await memoryPlan({
        action: 'list_build_scripts',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
      });
      
      expect(listResult.success).toBe(true);
      
      // Delete from plan
      vi.spyOn(fileStore, 'deleteBuildScript').mockResolvedValue(true);
      
      const deleteResult = await memoryPlan({
        action: 'delete_build_script',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        script_id: scriptId,
      });
      
      expect(deleteResult.success).toBe(true);
      expect(fileStore.deleteBuildScript).toHaveBeenCalledWith(
        mockWorkspaceId,
        scriptId,
        mockPlanId
      );
    });
  });
});
