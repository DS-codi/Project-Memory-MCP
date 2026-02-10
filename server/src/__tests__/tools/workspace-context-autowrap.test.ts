/**
 * Tests for auto-wrapping flat data as sections in workspace context.
 *
 * When callers pass data without a `sections` key, non-reserved keys
 * should be auto-wrapped into WorkspaceContextSection objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as workspaceContextTools from '../../tools/workspace-context.tools.js';
import * as store from '../../storage/file-store.js';

vi.mock('../../storage/file-store.js');
vi.mock('../../logging/workspace-update-log.js', () => ({
  appendWorkspaceFileUpdate: vi.fn().mockResolvedValue(undefined)
}));

const WORKSPACE_ID = 'test-workspace-autowrap';
const WORKSPACE_PATH = '/test/workspace';

const mockWorkspaceMeta = {
  workspace_id: WORKSPACE_ID,
  workspace_path: WORKSPACE_PATH,
  name: 'Test Workspace',
  created_at: '2026-01-01T00:00:00.000Z'
};

describe('Workspace context auto-wrapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getWorkspace).mockResolvedValue(mockWorkspaceMeta as never);
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/tmp/workspace.context.json');
    vi.mocked(store.getWorkspaceIdentityPath).mockReturnValue(`${WORKSPACE_PATH}/.projectmemory/identity.json`);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-11T00:00:00.000Z');
    vi.mocked(store.writeJsonLocked).mockResolvedValue(undefined);
    vi.mocked(store.readJson).mockResolvedValue(null);
  });

  describe('setWorkspaceContext with flat data', () => {
    it('should auto-wrap string values as section summaries', async () => {
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          description: 'A TypeScript MCP server',
          architecture: 'Monorepo with server, dashboard, and agents'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections).toEqual({
        description: { summary: 'A TypeScript MCP server' },
        architecture: { summary: 'Monorepo with server, dashboard, and agents' }
      });
    });

    it('should auto-wrap array of strings as section items', async () => {
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          key_patterns: ['Hub-and-spoke agent model', 'Plan lifecycle tracking']
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections.key_patterns).toEqual({
        items: [
          { title: 'Hub-and-spoke agent model' },
          { title: 'Plan lifecycle tracking' }
        ]
      });
    });

    it('should auto-wrap array of objects with title as section items', async () => {
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          conventions: [
            { title: 'Use TypeScript strict mode', description: 'Enforced via tsconfig' },
            { title: 'Max 300 lines per file' }
          ]
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections.conventions).toEqual({
        items: [
          { title: 'Use TypeScript strict mode', description: 'Enforced via tsconfig' },
          { title: 'Max 300 lines per file' }
        ]
      });
    });

    it('should auto-wrap object values as JSON summary', async () => {
      const techStack = { server: 'TypeScript', dashboard: 'React' };
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          tech_stack: techStack
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections.tech_stack).toEqual({
        summary: JSON.stringify(techStack)
      });
    });

    it('should skip reserved keys during auto-wrapping', async () => {
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          name: 'My Workspace',
          schema_version: '2.0.0',
          description: 'This should be a section'
        }
      });

      expect(result.success).toBe(true);
      // 'name' and 'schema_version' are reserved, only 'description' becomes a section
      expect(Object.keys(result.data!.context.sections)).toEqual(['description']);
      expect(result.data?.context.sections.description).toEqual({
        summary: 'This should be a section'
      });
      // Reserved keys are used for their original purpose
      expect(result.data?.context.name).toBe('My Workspace');
      expect(result.data?.context.schema_version).toBe('2.0.0');
    });

    it('should still support explicit sections format', async () => {
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          sections: {
            project: {
              summary: 'An MCP server project',
              items: [{ title: 'TypeScript' }, { title: 'React dashboard' }]
            }
          }
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections).toEqual({
        project: {
          summary: 'An MCP server project',
          items: [{ title: 'TypeScript' }, { title: 'React dashboard' }]
        }
      });
    });

    it('should handle data with only reserved keys (empty sections)', async () => {
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          name: 'Just a name update'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections).toEqual({});
    });

    it('should handle mixed types in flat data', async () => {
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          purpose: 'Memory management',
          features: ['Plans', 'Steps', 'Context'],
          config: { port: 3000, debug: true }
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections.purpose).toEqual({
        summary: 'Memory management'
      });
      expect(result.data?.context.sections.features).toEqual({
        items: [{ title: 'Plans' }, { title: 'Steps' }, { title: 'Context' }]
      });
      expect(result.data?.context.sections.config).toEqual({
        summary: JSON.stringify({ port: 3000, debug: true })
      });
    });
  });

  describe('updateWorkspaceContext with flat data', () => {
    const existingContext = {
      schema_version: '1.0.0',
      workspace_id: WORKSPACE_ID,
      workspace_path: WORKSPACE_PATH,
      name: 'Test Workspace',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-15T00:00:00.000Z',
      sections: {
        purpose: { summary: 'Original purpose' }
      }
    };

    it('should auto-wrap flat data and merge with existing sections', async () => {
      vi.mocked(store.readJson).mockResolvedValue(existingContext);

      const result = await workspaceContextTools.updateWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          tech_stack: 'TypeScript, React, Node.js'
        }
      });

      expect(result.success).toBe(true);
      // Existing 'purpose' section preserved, new 'tech_stack' added
      expect(result.data?.context.sections.purpose).toEqual({ summary: 'Original purpose' });
      expect(result.data?.context.sections.tech_stack).toEqual({ summary: 'TypeScript, React, Node.js' });
    });
  });
});
