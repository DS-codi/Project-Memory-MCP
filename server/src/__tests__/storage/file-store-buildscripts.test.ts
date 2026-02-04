import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fileStore from '../../storage/file-store.js';
import type { BuildScript, PlanState, WorkspaceMeta } from '../../types/index.js';

/**
 * Unit Tests for BuildScript Storage Methods
 * 
 * These tests verify the BuildScript interface and error handling.
 * Full integration tests for file operations are in the MCP tool tests.
 * 
 * Note: Due to ES module internal function calls, spying on exported functions
 * doesn't intercept internal calls. The comprehensive tests are in:
 * - memory-plan-buildscripts.test.ts (26 tests - MCP tool level)
 */

const mockWorkspaceId = 'ws_test_buildscripts_123';
const mockPlanId = 'plan_test_abc456';

describe('FileStore: BuildScript Storage Methods', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // getBuildScripts() - Test via spying on getWorkspace/getPlanState
  // =========================================================================

  describe('getBuildScripts()', () => {
    
    it('should return empty array when workspace returns null', async () => {
      vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue(null);

      const scripts = await fileStore.getBuildScripts(mockWorkspaceId);
      
      expect(scripts).toEqual([]);
    });

    it('should return empty array when workspace has no build scripts', async () => {
      const mockWorkspace: WorkspaceMeta = {
        workspace_id: mockWorkspaceId,
        path: '/test/workspace',
        name: 'Test Workspace',
        registered_at: '2024-01-15T10:00:00Z',
        last_accessed: '2024-01-20T14:30:00Z',
        active_plans: [],
        archived_plans: [],
        indexed: false,
        // No workspace_build_scripts property
      };

      vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue(mockWorkspace);

      const scripts = await fileStore.getBuildScripts(mockWorkspaceId);
      
      expect(scripts).toEqual([]);
    });

    it('should handle plan returning null', async () => {
      const mockWorkspace: WorkspaceMeta = {
        workspace_id: mockWorkspaceId,
        path: '/test/workspace',
        name: 'Test Workspace',
        registered_at: '2024-01-15T10:00:00Z',
        last_accessed: '2024-01-20T14:30:00Z',
        active_plans: [],
        archived_plans: [],
        indexed: false,
      };

      vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue(mockWorkspace);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(null);

      const scripts = await fileStore.getBuildScripts(mockWorkspaceId, mockPlanId);
      
      expect(scripts).toEqual([]);
    });
  });

  // =========================================================================
  // addBuildScript() - Error handling tests
  // =========================================================================

  describe('addBuildScript()', () => {
    
    it('should throw error when workspace not found', async () => {
      const scriptData = {
        name: 'Test Script',
        description: 'Test',
        command: 'echo test',
        directory: '/test',
      };

      await expect(
        fileStore.addBuildScript('ws_nonexistent', scriptData)
      ).rejects.toThrow('not found');
    });

    it('should throw error when plan not found', async () => {
      const scriptData = {
        name: 'Test Script',
        description: 'Test',
        command: 'echo test',
        directory: '/test',
      };

      await expect(
        fileStore.addBuildScript(mockWorkspaceId, scriptData, 'plan_nonexistent')
      ).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // runBuildScript() - Tests that can work with spies
  // =========================================================================

  describe('runBuildScript()', () => {
    
    it('should return error when script not found', async () => {
      const scriptId = 'script_nonexistent';
      
      vi.spyOn(fileStore, 'getBuildScripts').mockResolvedValue([]);

      const result = await fileStore.runBuildScript(mockWorkspaceId, scriptId);
      
      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('not found');
    });

    it('should find matching script by id', async () => {
      const scriptId = 'script_target';
      const scripts: BuildScript[] = [
        {
          id: 'script_other',
          name: 'Other',
          description: '',
          command: 'echo other',
          directory: '/test',
          workspace_id: mockWorkspaceId,
          created_at: '2024-01-01',
        },
        {
          id: scriptId,
          name: 'Target',
          description: '',
          command: 'echo target',
          directory: '/test',
          workspace_id: mockWorkspaceId,
          created_at: '2024-01-01',
        },
      ];
      
      // Return only the non-matching script to test "not found" path
      vi.spyOn(fileStore, 'getBuildScripts').mockResolvedValue([scripts[0]]);
      
      const result = await fileStore.runBuildScript(mockWorkspaceId, scriptId);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // =========================================================================
  // BuildScript interface validation
  // =========================================================================

  describe('BuildScript interface', () => {
    
    it('should have required properties', () => {
      const script: BuildScript = {
        id: 'script_001',
        name: 'Test Build',
        description: 'Test description',
        command: 'npm run build',
        directory: '/test/workspace',
        workspace_id: 'ws_test',
        created_at: '2024-01-20T10:00:00Z',
      };

      expect(script.id).toBeDefined();
      expect(script.name).toBeDefined();
      expect(script.command).toBeDefined();
      expect(script.directory).toBeDefined();
      expect(script.workspace_id).toBeDefined();
      expect(script.created_at).toBeDefined();
    });

    it('should support optional plan_id', () => {
      const workspaceScript: BuildScript = {
        id: 'script_ws',
        name: 'Workspace Script',
        description: '',
        command: 'npm run build',
        directory: '/test',
        workspace_id: 'ws_test',
        created_at: '2024-01-20T10:00:00Z',
      };

      const planScript: BuildScript = {
        id: 'script_plan',
        name: 'Plan Script',
        description: '',
        command: 'npm test',
        directory: '/test',
        workspace_id: 'ws_test',
        plan_id: 'plan_123',
        created_at: '2024-01-20T10:00:00Z',
      };

      expect(workspaceScript.plan_id).toBeUndefined();
      expect(planScript.plan_id).toBe('plan_123');
    });
  });
});
