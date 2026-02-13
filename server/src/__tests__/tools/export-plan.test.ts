/**
 * Tests for exportPlan — copy plan artifacts to workspace for git commits
 *
 * Covers:
 * 1. Creates exports directory structure: .projectmemory/exports/{plan_id}/
 * 2. Copies plan.json, context files, research notes, prompts
 * 3. README.md is generated with plan title and metadata
 * 4. Error handling for missing workspace_path
 * 5. Error handling for missing plan_id or workspace_id
 * 6. Error handling for plan not found
 * 7. Gracefully handles missing context/research/prompts directories
 * 8. Returns correct files_exported list
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      copyFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../../storage/file-store.js', () => ({
  getPlanState: vi.fn(),
  getPlanPath: vi.fn(
    (wsId: string, planId: string) => `/data/${wsId}/plans/${planId}`
  ),
  getResearchNotesPath: vi.fn(
    (wsId: string, planId: string) => `/data/${wsId}/plans/${planId}/research_notes`
  ),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  nowISO: vi.fn().mockReturnValue('2026-02-13T12:00:00.000Z'),
  getWorkspace: vi.fn(),
}));

vi.mock('../../logging/workspace-update-log.js', () => ({
  appendWorkspaceFileUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../events/event-emitter.js', () => ({
  events: { emit: vi.fn() },
}));

vi.mock('../prompt-storage.js', () => ({
  archivePlanPrompts: vi.fn(),
}));

import * as store from '../../storage/file-store.js';
import { exportPlan } from '../../tools/plan/plan-lifecycle.js';

const mockWorkspaceId = 'ws_export_test_123';
const mockPlanId = 'plan_export_test_456';
const mockWorkspacePath = '/test/workspace';

const mockPlanState = {
  id: mockPlanId,
  workspace_id: mockWorkspaceId,
  title: 'Export Test Plan',
  description: 'Plan for testing exportPlan',
  category: 'feature',
  priority: 'medium',
  status: 'active',
  current_phase: 'Phase 1',
  steps: [],
  created_at: '2026-02-13T10:00:00Z',
  updated_at: '2026-02-13T10:00:00Z',
};

describe('exportPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getPlanState).mockResolvedValue(mockPlanState as any);
    vi.mocked(store.getWorkspace).mockResolvedValue(null);
  });

  it('should return error when workspace_id is missing', async () => {
    const result = await exportPlan({ workspace_id: '', plan_id: mockPlanId });

    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_id');
  });

  it('should return error when plan_id is missing', async () => {
    const result = await exportPlan({ workspace_id: mockWorkspaceId, plan_id: '' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_id');
  });

  it('should return error when workspace_path is not resolvable', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue(null);

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      // no workspace_path provided, and getWorkspace returns null
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_path');
  });

  it('should return error when plan is not found', async () => {
    vi.mocked(store.getPlanState).mockResolvedValue(null);

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Plan not found');
  });

  it('should resolve workspace_path from workspace meta when not provided', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: mockWorkspacePath,
    } as any);

    // readdir: no extra context, research, or prompts
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(store.getWorkspace).toHaveBeenCalledWith(mockWorkspaceId);
  });

  it('should create exports directory at .projectmemory/exports/{plan_id}/', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(true);
    expect(store.ensureDir).toHaveBeenCalledWith(
      expect.stringContaining('.projectmemory')
    );
    expect(result.data?.export_path).toContain('.projectmemory');
    expect(result.data?.export_path).toContain('exports');
    expect(result.data?.export_path).toContain(mockPlanId);
  });

  it('should write plan.json to the export directory', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('plan.json'),
      JSON.stringify(mockPlanState, null, 2),
      'utf-8'
    );
    expect(result.data?.files_exported).toContain('plan.json');
  });

  it('should copy context files to context subdirectory', async () => {
    let callCount = 0;
    vi.mocked(fs.readdir).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // plan dir context files
        return ['decision.json', 'state.json', 'analysis.json'] as any;
      }
      throw new Error('ENOENT'); // no research notes or prompts
    });

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(true);
    // Should copy decision.json and analysis.json (skip state.json)
    expect(fs.copyFile).toHaveBeenCalledTimes(2);
    expect(result.data?.files_exported).toContain('context/decision.json');
    expect(result.data?.files_exported).toContain('context/analysis.json');
    // state.json should NOT be in the exported files
    expect(result.data?.files_exported).not.toContain('context/state.json');
  });

  it('should copy research notes when they exist', async () => {
    let callCount = 0;
    vi.mocked(fs.readdir).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return [] as any; // no context files
      if (callCount === 2) return ['note1.md', 'note2.md'] as any; // research notes
      throw new Error('ENOENT'); // no prompts
    });

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(true);
    expect(result.data?.files_exported).toContain('research_notes/note1.md');
    expect(result.data?.files_exported).toContain('research_notes/note2.md');
  });

  it('should copy prompts when they exist', async () => {
    let callCount = 0;
    vi.mocked(fs.readdir).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return [] as any; // no context files
      if (callCount === 2) throw new Error('ENOENT'); // no research notes
      return ['prompt1.md', 'prompt2.md'] as any; // prompts
    });

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(true);
    expect(result.data?.files_exported).toContain('prompts/prompt1.md');
    expect(result.data?.files_exported).toContain('prompts/prompt2.md');
  });

  it('should generate README.md with plan title and metadata', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(true);
    expect(result.data?.files_exported).toContain('README.md');

    // Verify README content was written
    const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
    const readmeCall = writeFileCalls.find(
      (call) => (call[0] as string).includes('README.md')
    );
    expect(readmeCall).toBeDefined();

    const readmeContent = readmeCall![1] as string;
    expect(readmeContent).toContain(mockPlanState.title);
    expect(readmeContent).toContain(mockPlanId);
    expect(readmeContent).toContain(mockWorkspaceId);
    expect(readmeContent).toContain(mockPlanState.status);
    expect(readmeContent).toContain('Project Memory MCP');
  });

  it('should return export_path, files_exported, and timestamp in result', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('export_path');
    expect(result.data).toHaveProperty('files_exported');
    expect(result.data).toHaveProperty('timestamp');
    expect(result.data?.timestamp).toBe('2026-02-13T12:00:00.000Z');
  });

  it('should gracefully handle when no optional directories exist', async () => {
    // All readdir calls fail (no context, no research, no prompts)
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await exportPlan({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      workspace_path: mockWorkspacePath,
    });

    expect(result.success).toBe(true);
    // Should still have plan.json and README.md
    expect(result.data?.files_exported).toContain('plan.json');
    expect(result.data?.files_exported).toContain('README.md');
    expect(result.data?.files_exported.length).toBe(2);
  });
});
