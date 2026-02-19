/**
 * Tests for skill-registry.ts
 *
 * Covers:
 * 1. buildSkillRegistry with mock SKILL.md files
 * 2. Keyword extraction correctness
 * 3. Caching behavior (returns same ref on second call)
 * 4. Cache invalidation (manual & via stale mtime)
 * 5. Handling of missing .github/skills/ directory
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  buildSkillRegistry,
  invalidateSkillRegistryCache,
} from '../../tools/skill-registry.js';

// ---------------------------------------------------------------------------
// Mocks
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
    },
  };
});

const mockStat = vi.mocked(fs.stat);
const mockReaddir = vi.mocked(fs.readdir);
const mockReadFile = vi.mocked(fs.readFile);

const WORKSPACE = '/test/workspace';
const SKILLS_DIR = path.join(WORKSPACE, '.github', 'skills');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkillMd(opts: {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  language_targets?: string[];
  framework_targets?: string[];
}): string {
  const lines = ['---'];
  if (opts.name) lines.push(`name: ${opts.name}`);
  if (opts.description) lines.push(`description: "${opts.description}"`);
  if (opts.category) lines.push(`category: ${opts.category}`);
  if (opts.tags?.length) {
    lines.push('tags:');
    for (const t of opts.tags) lines.push(`  - ${t}`);
  }
  if (opts.language_targets?.length) {
    lines.push('language_targets:');
    for (const l of opts.language_targets) lines.push(`  - ${l}`);
  }
  if (opts.framework_targets?.length) {
    lines.push('framework_targets:');
    for (const f of opts.framework_targets) lines.push(`  - ${f}`);
  }
  lines.push('---');
  lines.push('');
  lines.push('# Skill Body');
  return lines.join('\n');
}

/** Helper: configure mocks for a workspace with specific skills */
function setupSkills(
  skills: Record<string, string>,
  dirMtime = 1000,
): void {
  mockStat.mockImplementation(async (p: unknown) => {
    const pStr = String(p);
    if (pStr === SKILLS_DIR) {
      return { mtimeMs: dirMtime, isDirectory: () => true } as any;
    }
    // Skill subdirectories
    for (const name of Object.keys(skills)) {
      if (pStr === path.join(SKILLS_DIR, name)) {
        return { isDirectory: () => true } as any;
      }
    }
    throw new Error(`ENOENT: ${pStr}`);
  });

  mockReaddir.mockImplementation(async (p: unknown) => {
    if (String(p) === SKILLS_DIR) {
      return Object.keys(skills) as any;
    }
    return [];
  });

  mockReadFile.mockImplementation(async (p: unknown) => {
    for (const [name, content] of Object.entries(skills)) {
      if (String(p) === path.join(SKILLS_DIR, name, 'SKILL.md')) {
        return content;
      }
    }
    throw new Error(`ENOENT: ${String(p)}`);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('skill-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSkillRegistryCache();
  });

  // =========================================================================
  // Build Registry
  // =========================================================================

  describe('buildSkillRegistry', () => {
    it('should index skills from SKILL.md files', async () => {
      setupSkills({
        'react-components': makeSkillMd({
          name: 'react-components',
          description: 'React component patterns',
          tags: ['frontend', 'ui'],
          language_targets: ['typescript'],
          framework_targets: ['react'],
        }),
        'bugfix': makeSkillMd({
          name: 'bugfix',
          description: 'Automatic bug-fix orchestrator',
        }),
      });

      const registry = await buildSkillRegistry(WORKSPACE);

      expect(registry.entries).toHaveLength(2);
      expect(registry.workspace_path).toBe(WORKSPACE);
      expect(registry.built_at).toBeTruthy();

      const reactEntry = registry.entries.find((e) => e.name === 'react-components');
      expect(reactEntry).toBeDefined();
      expect(reactEntry!.tags).toEqual(['frontend', 'ui']);
      expect(reactEntry!.language_targets).toEqual(['typescript']);
      expect(reactEntry!.framework_targets).toEqual(['react']);
    });

    it('should use directory name when frontmatter name missing', async () => {
      setupSkills({
        'my-skill': '---\ndescription: "A skill"\n---\n# Body',
      });

      const registry = await buildSkillRegistry(WORKSPACE);
      expect(registry.entries[0].name).toBe('my-skill');
    });

    it('should default category to "general" when not specified', async () => {
      setupSkills({
        'simple': makeSkillMd({ name: 'simple' }),
      });

      const registry = await buildSkillRegistry(WORKSPACE);
      expect(registry.entries[0].category).toBe('general');
    });
  });

  // =========================================================================
  // Keyword Extraction
  // =========================================================================

  describe('keyword extraction', () => {
    it('should extract keywords from name, tags, targets, and description', async () => {
      setupSkills({
        'pyside6-mvc': makeSkillMd({
          name: 'pyside6-mvc',
          description: 'Model View Controller for PySide6',
          category: 'architecture',
          tags: ['desktop', 'gui'],
          language_targets: ['python'],
          framework_targets: ['pyside6'],
        }),
      });

      const registry = await buildSkillRegistry(WORKSPACE);
      const entry = registry.entries[0];

      // Name splits on hyphens
      expect(entry.keywords).toContain('pyside6');
      expect(entry.keywords).toContain('mvc');

      // Tags
      expect(entry.keywords).toContain('desktop');
      expect(entry.keywords).toContain('gui');

      // Category
      expect(entry.keywords).toContain('architecture');

      // Language targets
      expect(entry.keywords).toContain('python');

      // Framework targets (deduplicated with name part)
      expect(entry.keywords).toContain('pyside6');

      // Description words ≥3 chars
      expect(entry.keywords).toContain('model');
      expect(entry.keywords).toContain('view');
      expect(entry.keywords).toContain('controller');
    });

    it('should build keyword_map mapping keywords to skill names', async () => {
      setupSkills({
        'react-components': makeSkillMd({
          name: 'react-components',
          tags: ['frontend'],
          framework_targets: ['react'],
        }),
        'react-testing': makeSkillMd({
          name: 'react-testing',
          tags: ['frontend', 'testing'],
          framework_targets: ['react'],
        }),
      });

      const registry = await buildSkillRegistry(WORKSPACE);

      // Both skills share 'react' keyword
      const reactSkills = registry.keyword_map.get('react');
      expect(reactSkills).toBeDefined();
      expect(reactSkills).toContain('react-components');
      expect(reactSkills).toContain('react-testing');

      // 'testing' keyword only in react-testing
      const testingSkills = registry.keyword_map.get('testing');
      expect(testingSkills).toEqual(['react-testing']);
    });
  });

  // =========================================================================
  // Caching
  // =========================================================================

  describe('caching', () => {
    it('should return cached registry on second call with same mtime', async () => {
      setupSkills({ 'skill-a': makeSkillMd({ name: 'skill-a' }) }, 5000);

      const first = await buildSkillRegistry(WORKSPACE);
      const second = await buildSkillRegistry(WORKSPACE);

      // Same reference = cache hit
      expect(second).toBe(first);
      // stat called twice (cache check + initial build, then cache check only)
      // readdir called only once (initial build)
      expect(mockReaddir).toHaveBeenCalledTimes(1);
    });

    it('should rebuild when directory mtime changes', async () => {
      setupSkills({ 'skill-a': makeSkillMd({ name: 'skill-a' }) }, 5000);
      const first = await buildSkillRegistry(WORKSPACE);

      // Simulate mtime change
      setupSkills(
        {
          'skill-a': makeSkillMd({ name: 'skill-a' }),
          'skill-b': makeSkillMd({ name: 'skill-b' }),
        },
        6000,
      );

      const second = await buildSkillRegistry(WORKSPACE);

      expect(second).not.toBe(first);
      expect(second.entries).toHaveLength(2);
    });

    it('should invalidate cache for specific workspace', async () => {
      setupSkills({ 'skill-a': makeSkillMd({ name: 'skill-a' }) }, 5000);
      await buildSkillRegistry(WORKSPACE);

      invalidateSkillRegistryCache(WORKSPACE);

      // Rebuild from scratch (readdir called again)
      await buildSkillRegistry(WORKSPACE);
      expect(mockReaddir).toHaveBeenCalledTimes(2);
    });

    it('should clear all caches when no path provided', async () => {
      setupSkills({ 'skill-a': makeSkillMd({ name: 'skill-a' }) }, 5000);
      await buildSkillRegistry(WORKSPACE);

      invalidateSkillRegistryCache();

      await buildSkillRegistry(WORKSPACE);
      expect(mockReaddir).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Missing Skills Directory
  // =========================================================================

  describe('missing skills directory', () => {
    it('should return empty registry when .github/skills/ does not exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      mockReaddir.mockRejectedValue(new Error('ENOENT'));

      const registry = await buildSkillRegistry(WORKSPACE);

      expect(registry.entries).toEqual([]);
      expect(registry.keyword_map.size).toBe(0);
      expect(registry.workspace_path).toBe(WORKSPACE);
    });

    it('should skip subdirectories without SKILL.md', async () => {
      mockStat.mockImplementation(async (p: unknown) => {
        const pStr = String(p);
        if (pStr === SKILLS_DIR) {
          return { mtimeMs: 1000, isDirectory: () => true } as any;
        }
        if (pStr === path.join(SKILLS_DIR, 'empty-dir')) {
          return { isDirectory: () => true } as any;
        }
        throw new Error(`ENOENT: ${pStr}`);
      });
      mockReaddir.mockResolvedValue(['empty-dir'] as any);
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const registry = await buildSkillRegistry(WORKSPACE);
      expect(registry.entries).toEqual([]);
    });
  });
});
