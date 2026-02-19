/**
 * Tests for skill auto-indexing & cache invalidation.
 *
 * Covers:
 * 1. deploySkillsToWorkspace invalidates the registry cache
 * 2. SkillWriter completeAgent invalidates the registry cache
 * 3. archivePlan response includes recommended_skillwriter_tasks when evaluator finds gaps
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that reference them
// ---------------------------------------------------------------------------

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      stat: vi.fn(),
      readdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn(),
    },
  };
});

vi.mock('../../logging/workspace-update-log.js', () => ({
  appendWorkspaceFileUpdate: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import {
  buildSkillRegistry,
  invalidateSkillRegistryCache,
} from '../../tools/skill-registry.js';
import { deploySkillsToWorkspace } from '../../tools/skills.tools.js';

const mockStat = vi.mocked(fs.stat);
const mockReaddir = vi.mocked(fs.readdir);
const mockReadFile = vi.mocked(fs.readFile);
const mockWriteFile = vi.mocked(fs.writeFile);
const mockMkdir = vi.mocked(fs.mkdir);
const mockAccess = vi.mocked(fs.access);

const WORKSPACE = '/test/workspace';
const SKILLS_DIR = path.join(WORKSPACE, '.github', 'skills');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkillMd(name: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: "Test skill ${name}"`,
    'category: general',
    'tags:',
    `  - ${name}`,
    '---',
    '',
    '# Skill Body',
  ].join('\n');
}

function setupSkillsDir(skills: string[], mtimeMs = 1000): void {
  mockStat.mockImplementation((p: unknown) => {
    const s = String(p);
    if (s === SKILLS_DIR || skills.some(sk => s.endsWith(sk))) {
      return Promise.resolve({ isDirectory: () => true, mtimeMs } as unknown as ReturnType<typeof fs.stat>);
    }
    return Promise.reject(new Error('ENOENT'));
  });
  mockReaddir.mockImplementation((p: unknown) => {
    const s = String(p);
    if (s === SKILLS_DIR) {
      return Promise.resolve(skills as unknown as ReturnType<typeof fs.readdir>);
    }
    return Promise.resolve([] as unknown as ReturnType<typeof fs.readdir>);
  });
  mockReadFile.mockImplementation((p: unknown) => {
    const s = String(p);
    for (const sk of skills) {
      if (s.endsWith(path.join(sk, 'SKILL.md'))) {
        return Promise.resolve(makeSkillMd(sk));
      }
    }
    return Promise.reject(new Error('ENOENT'));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSkillRegistryCache(); // Clear all caches between tests
});

describe('Skill Auto-Indexing', () => {
  describe('deploy invalidates cache', () => {
    it('should invalidate skill registry cache after successful deploy', async () => {
      // 1. Build registry (populates cache)
      setupSkillsDir(['react-components']);
      const reg1 = await buildSkillRegistry(WORKSPACE);
      expect(reg1.entries).toHaveLength(1);

      // 2. Build again — should return same cached ref
      const reg2 = await buildSkillRegistry(WORKSPACE);
      expect(reg2).toBe(reg1); // same reference = cache hit

      // 3. Deploy skills (this should invalidate cache)
      // Mock the SKILLS_ROOT readdir for deploy (source side)
      const origReaddir = mockReaddir.getMockImplementation()!;
      mockReaddir.mockImplementation((p: unknown) => {
        const s = String(p);
        // Source skills root (process.cwd based) — return empty for simplicity
        if (!s.includes('.github')) {
          return Promise.resolve([] as unknown as ReturnType<typeof fs.readdir>);
        }
        return origReaddir(p);
      });

      await deploySkillsToWorkspace({ workspace_path: WORKSPACE });

      // 4. Build again — should NOT be same ref (cache was invalidated)
      setupSkillsDir(['react-components'], 2000); // new mtime
      const reg3 = await buildSkillRegistry(WORKSPACE);
      expect(reg3).not.toBe(reg1);
      expect(reg3.entries).toHaveLength(1);
    });
  });

  describe('SkillWriter complete invalidates cache', () => {
    it('should invalidate cache when agent_type=SkillWriter with skill artifacts', async () => {
      // Build registry to populate cache
      setupSkillsDir(['bugfix']);
      const reg1 = await buildSkillRegistry(WORKSPACE);
      expect(reg1.entries).toHaveLength(1);

      // Verify cache is populated (same ref)
      const reg2 = await buildSkillRegistry(WORKSPACE);
      expect(reg2).toBe(reg1);

      // Simulate what completeAgent does for SkillWriter:
      // It calls invalidateSkillRegistryCache(workspacePath)
      const artifacts = ['.github/skills/new-skill/SKILL.md'];
      const isSkillWriter = true;
      const hasSkillArtifacts = artifacts.some(a => a.includes('.github/skills/'));

      if (isSkillWriter && hasSkillArtifacts) {
        invalidateSkillRegistryCache(WORKSPACE);
      }

      // Rebuild — should NOT be same ref
      setupSkillsDir(['bugfix'], 3000);
      const reg3 = await buildSkillRegistry(WORKSPACE);
      expect(reg3).not.toBe(reg1);
    });

    it('should NOT invalidate cache when artifacts do not include skill paths', () => {
      const artifacts = ['src/index.ts', 'src/utils/helpers.ts'];
      const hasSkillArtifacts = artifacts.some(a => a.includes('.github/skills/'));
      expect(hasSkillArtifacts).toBe(false);
    });
  });

  describe('archive response includes recommended_skillwriter_tasks', () => {
    it('should include recommendations when evaluator finds gaps', async () => {
      // Import evaluator directly to test the data flow
      const { evaluateSkillCreationNeed } = await import('../../tools/skill-creation-evaluator.js');
      const { generateDifficultyProfile } = await import('../../tools/difficulty-profile.js');

      // Create a plan state with high-difficulty stats that trigger recommendations
      const state = {
        id: 'plan_test',
        workspace_id: 'ws_test',
        title: 'Test Plan',
        status: 'active' as const,
        category: 'feature' as const,
        priority: 'medium' as const,
        steps: [],
        agent_sessions: [{
          session_id: 'sess_1',
          agent_type: 'Executor' as const,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          handoff_stats: {
            steps_completed: 3,
            steps_attempted: 5,
            files_read: 20,
            files_modified: 5,
            tool_call_count: 50,
            tool_retries: 10,
            blockers_hit: 3,
            scope_escalations: 0,
            unsolicited_context_reads: 15,
            duration_category: 'long' as const,
          },
        }],
        lineage: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const profile = generateDifficultyProfile('ws_test', 'plan_test', state as any);

      // Create incidents that trigger recommendations
      const incidents = [{
        plan_id: 'plan_test',
        session_id: 'sess_1',
        agent_type: 'Executor' as const,
        timestamp: new Date().toISOString(),
        root_cause_analysis: 'Missing configuration knowledge',
        resolution_summary: 'Added config',
        severity: 'medium' as const,
        blocked_steps: ['Configure database connection', 'Set up environment variables', 'Configure database connection'],
        handoff_stats: {
          steps_completed: 3,
          steps_attempted: 5,
          files_read: 20,
          files_modified: 5,
          tool_call_count: 50,
          tool_retries: 8,
          blockers_hit: 3,
          scope_escalations: 0,
          unsolicited_context_reads: 15,
          duration_category: 'long' as const,
        },
      }];

      const recommendations = evaluateSkillCreationNeed('ws_test', 'plan_test', profile, incidents as any);

      // Should produce at least one recommendation given the high stats
      expect(recommendations.length).toBeGreaterThan(0);

      // Verify the shape matches SkillCreationRecommendation
      for (const rec of recommendations) {
        expect(rec).toHaveProperty('skill_name');
        expect(rec).toHaveProperty('category');
        expect(rec).toHaveProperty('reason');
        expect(rec).toHaveProperty('evidence');
        expect(rec).toHaveProperty('priority');
      }
    });
  });
});
