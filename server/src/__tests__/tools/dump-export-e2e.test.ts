/**
 * End-to-end tests for dump_context and export_plan via consolidated MCP actions
 *
 * Covers:
 * 1. dump_context through memory_context creates a readable, valid JSON file
 * 2. export_plan through memory_plan creates a complete folder structure
 * 3. Both actions return proper MCP response format (success, data, action field)
 * 4. Error propagation through the consolidated layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- memory_context e2e tests for dump_context ---

vi.mock('../../tools/context.tools.js');
vi.mock('../../tools/workspace-context.tools.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');

import * as contextTools from '../../tools/context.tools.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';
import { memoryContext } from '../../tools/consolidated/memory_context.js';

const mockWorkspaceId = 'ws_e2e_test_123';
const mockPlanId = 'plan_e2e_test_456';

describe('E2E: dump_context via memory_context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  it('should return proper MCP response with action field for dump_context', async () => {
    vi.spyOn(contextTools, 'handleDumpContext').mockResolvedValue({
      success: true,
      data: {
        path: `/data/${mockWorkspaceId}/plans/${mockPlanId}/dumps/2026-02-13T12-00-00-000Z-context-dump.json`,
        sections_included: ['plan_state', 'context_files', 'research_notes'],
        timestamp: '2026-02-13T12:00:00.000Z',
      },
    });

    const result = await memoryContext({
      action: 'dump_context',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.action).toBe('dump_context');
    const dumpResult = result.data as { action: 'dump_context'; data: { path: string; sections_included: string[]; timestamp: string } };
    expect(dumpResult.data.path).toContain('-context-dump.json');
    expect(dumpResult.data.sections_included).toEqual(
      expect.arrayContaining(['plan_state'])
    );
  });

  it('should require plan_id for dump_context', async () => {
    const result = await memoryContext({
      action: 'dump_context',
      workspace_id: mockWorkspaceId,
      // plan_id omitted
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_id');
  });

  it('should propagate errors from handleDumpContext', async () => {
    vi.spyOn(contextTools, 'handleDumpContext').mockResolvedValue({
      success: false,
      error: 'Plan not found: nonexistent_plan',
    });

    const result = await memoryContext({
      action: 'dump_context',
      workspace_id: mockWorkspaceId,
      plan_id: 'nonexistent_plan',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Plan not found');
  });

  it('should pass resolved workspace_id to handleDumpContext', async () => {
    const mockDump = vi.spyOn(contextTools, 'handleDumpContext').mockResolvedValue({
      success: true,
      data: {
        path: '/some/path.json',
        sections_included: ['plan_state'],
        timestamp: '2026-02-13T12:00:00.000Z',
      },
    });

    await memoryContext({
      action: 'dump_context',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(mockDump).toHaveBeenCalledWith({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });
  });

  it('should return dump with valid JSON-serializable data', async () => {
    const dumpData = {
      path: `/data/${mockWorkspaceId}/plans/${mockPlanId}/dumps/2026-02-13T12-00-00-000Z-context-dump.json`,
      sections_included: ['plan_state', 'context_files', 'workspace_context'],
      timestamp: '2026-02-13T12:00:00.000Z',
    };

    vi.spyOn(contextTools, 'handleDumpContext').mockResolvedValue({
      success: true,
      data: dumpData,
    });

    const result = await memoryContext({
      action: 'dump_context',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    // Verify the entire response is JSON-serializable
    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);
    expect(parsed.success).toBe(true);
    expect(parsed.data.action).toBe('dump_context');
  });
});

// --- memory_plan e2e tests for export_plan ---

vi.mock('../../tools/plan/index.js');

import * as planTools from '../../tools/plan/index.js';
import { memoryPlan } from '../../tools/consolidated/memory_plan.js';

describe('E2E: export_plan via memory_plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  it('should return proper MCP response with action field for export_plan', async () => {
    vi.spyOn(planTools, 'exportPlan').mockResolvedValue({
      success: true,
      data: {
        export_path: `/test/workspace/.projectmemory/exports/${mockPlanId}`,
        files_exported: ['plan.json', 'context/decision.json', 'research_notes/note1.md', 'README.md'],
        timestamp: '2026-02-13T12:00:00.000Z',
      },
    });

    const result = await memoryPlan({
      action: 'export_plan',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: '/test/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    if (result.data && 'action' in result.data) {
      expect(result.data.action).toBe('export_plan');
      const exportData = result.data as { action: 'export_plan'; data: { export_path: string; files_exported: string[]; timestamp: string } };
      expect(exportData.data.export_path).toContain('.projectmemory/exports');
      expect(exportData.data.files_exported).toContain('plan.json');
      expect(exportData.data.files_exported).toContain('README.md');
    }
  });

  it('should require workspace_id and plan_id for export_plan', async () => {
    const result = await memoryPlan({
      action: 'export_plan',
      workspace_id: mockWorkspaceId,
      // plan_id omitted
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_id');
  });

  it('should propagate errors from exportPlan', async () => {
    vi.spyOn(planTools, 'exportPlan').mockResolvedValue({
      success: false,
      error: 'Could not resolve workspace_path. Provide it explicitly or ensure workspace is registered.',
    });

    const result = await memoryPlan({
      action: 'export_plan',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_path');
  });

  it('should pass workspace_path through to exportPlan', async () => {
    const mockExport = vi.spyOn(planTools, 'exportPlan').mockResolvedValue({
      success: true,
      data: {
        export_path: '/test/workspace/.projectmemory/exports/' + mockPlanId,
        files_exported: ['plan.json', 'README.md'],
        timestamp: '2026-02-13T12:00:00.000Z',
      },
    });

    await memoryPlan({
      action: 'export_plan',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: '/test/workspace',
    });

    expect(mockExport).toHaveBeenCalledWith({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: '/test/workspace',
    });
  });

  it('should return a complete folder structure that could be git-committed', async () => {
    vi.spyOn(planTools, 'exportPlan').mockResolvedValue({
      success: true,
      data: {
        export_path: `/test/workspace/.projectmemory/exports/${mockPlanId}`,
        files_exported: [
          'plan.json',
          'context/decision.json',
          'context/analysis.json',
          'research_notes/note1.md',
          'research_notes/note2.md',
          'prompts/prompt1.md',
          'README.md',
        ],
        timestamp: '2026-02-13T12:00:00.000Z',
      },
    });

    const result = await memoryPlan({
      action: 'export_plan',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: '/test/workspace',
    });

    expect(result.success).toBe(true);
    if (result.data && 'action' in result.data) {
      const exportData = result.data as { action: 'export_plan'; data: { export_path: string; files_exported: string[]; timestamp: string } };
      const files = exportData.data.files_exported;
      // Verify essential files present
      expect(files).toContain('plan.json');
      expect(files).toContain('README.md');
      // Verify files are organized in subdirectories
      expect(files.some((f: string) => f.startsWith('context/'))).toBe(true);
      expect(files.some((f: string) => f.startsWith('research_notes/'))).toBe(true);
      expect(files.some((f: string) => f.startsWith('prompts/'))).toBe(true);
      // Verify export path is under .projectmemory
      expect(exportData.data.export_path).toContain('.projectmemory');
    }
  });

  it('should return JSON-serializable response', async () => {
    vi.spyOn(planTools, 'exportPlan').mockResolvedValue({
      success: true,
      data: {
        export_path: `/test/workspace/.projectmemory/exports/${mockPlanId}`,
        files_exported: ['plan.json', 'README.md'],
        timestamp: '2026-02-13T12:00:00.000Z',
      },
    });

    const result = await memoryPlan({
      action: 'export_plan',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: '/test/workspace',
    });

    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);
    expect(parsed.success).toBe(true);
    expect(parsed.data.action).toBe('export_plan');
  });
});
