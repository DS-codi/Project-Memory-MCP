/**
 * Tests for the skills system (skills.tools.ts).
 *
 * Covers:
 * 1. listSkills() reads SKILL.md files from skills directory
 * 2. listSkills() parses frontmatter correctly (name, description, category, tags, language_targets, framework_targets)
 * 3. listSkills() handles empty skills directory
 * 4. matchSkillsToContext() returns scored matches above threshold
 * 5. matchSkillsToContext() scores higher for category + language matches
 * 6. matchSkillsToContext() returns empty array when no skills match
 * 7. deploySkillsToWorkspace() copies skill directories to target
 * 8. deploySkillsToWorkspace() handles missing source directory
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

// Mock fs and logging before importing the module under test
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
      stat: vi.fn(),
      readFile: vi.fn(),
      access: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

vi.mock('../../logging/workspace-update-log.js', () => ({
  appendWorkspaceFileUpdate: vi.fn().mockResolvedValue(undefined),
}));

import {
  listSkills,
  matchSkillsToContext,
  deploySkillsToWorkspace,
} from '../../tools/skills.tools.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const SKILL_MD_FULL = `---
name: pyside6-qml-architecture
description: Use this skill when creating PySide6 + QML desktop apps with MVC architecture.
category: architecture
tags:
  - desktop
  - gui
  - mvc
language_targets:
  - python
  - qml
framework_targets:
  - pyside6
  - qt
---

# PySide6 QML MVC Architecture

This skill covers project scaffolding, entry points, and lifecycle management.
`;

const SKILL_MD_MINIMAL = `---
name: simple-skill
description: A minimal skill with no extra fields.
---

# Simple Skill

Basic content here.
`;

const SKILL_MD_NO_FRONTMATTER = `# No Frontmatter Skill

This file has no YAML frontmatter block.
`;

const SKILL_MD_BACKEND = `---
name: backend-api
description: REST API patterns for backend services using TypeScript and Express.
category: backend
tags:
  - rest
  - api
  - http
language_targets:
  - typescript
framework_targets:
  - express
---

# Backend API Patterns

Standard REST patterns.
`;

// =============================================================================
// Helpers
// =============================================================================

function mockDirectory(isDir = true) {
  return { isDirectory: () => isDir };
}

// =============================================================================
// listSkills
// =============================================================================

describe('listSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read SKILL.md files from skills directory', async () => {
    (fs.readdir as Mock).mockResolvedValue(['skill-a', 'skill-b']);
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    (fs.readFile as Mock)
      .mockResolvedValueOnce(SKILL_MD_FULL)
      .mockResolvedValueOnce(SKILL_MD_MINIMAL);

    const result = await listSkills();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data![0].name).toBe('pyside6-qml-architecture');
    expect(result.data![1].name).toBe('simple-skill');
  });

  it('should parse frontmatter correctly with all fields', async () => {
    (fs.readdir as Mock).mockResolvedValue(['arch-skill']);
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    (fs.readFile as Mock).mockResolvedValue(SKILL_MD_FULL);

    const result = await listSkills();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);

    const skill = result.data![0];
    expect(skill.name).toBe('pyside6-qml-architecture');
    expect(skill.description).toContain('PySide6 + QML');
    expect(skill.category).toBe('architecture');
    expect(skill.tags).toEqual(['desktop', 'gui', 'mvc']);
    expect(skill.language_targets).toEqual(['python', 'qml']);
    expect(skill.framework_targets).toEqual(['pyside6', 'qt']);
    expect(skill.content).toBe(SKILL_MD_FULL);
  });

  it('should handle skill with minimal frontmatter (no tags/targets)', async () => {
    (fs.readdir as Mock).mockResolvedValue(['minimal']);
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    (fs.readFile as Mock).mockResolvedValue(SKILL_MD_MINIMAL);

    const result = await listSkills();

    expect(result.success).toBe(true);
    const skill = result.data![0];
    expect(skill.name).toBe('simple-skill');
    expect(skill.description).toBe('A minimal skill with no extra fields.');
    expect(skill.category).toBeUndefined();
    expect(skill.tags).toBeUndefined();
    expect(skill.language_targets).toBeUndefined();
    expect(skill.framework_targets).toBeUndefined();
  });

  it('should use directory name as fallback when frontmatter has no name', async () => {
    (fs.readdir as Mock).mockResolvedValue(['my-dir-name']);
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    (fs.readFile as Mock).mockResolvedValue(SKILL_MD_NO_FRONTMATTER);

    const result = await listSkills();

    expect(result.success).toBe(true);
    const skill = result.data![0];
    expect(skill.name).toBe('my-dir-name');
  });

  it('should return empty array when skills directory is empty', async () => {
    (fs.readdir as Mock).mockResolvedValue([]);

    const result = await listSkills();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should return empty array when skills directory does not exist', async () => {
    (fs.readdir as Mock).mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const result = await listSkills();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should skip non-directory entries', async () => {
    (fs.readdir as Mock).mockResolvedValue(['README.md', 'real-skill']);
    (fs.stat as Mock)
      .mockResolvedValueOnce(mockDirectory(false)) // README.md → not a dir
      .mockResolvedValueOnce(mockDirectory(true));  // real-skill → dir
    (fs.readFile as Mock).mockResolvedValue(SKILL_MD_MINIMAL);

    const result = await listSkills();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe('simple-skill');
  });

  it('should skip directories without SKILL.md', async () => {
    (fs.readdir as Mock).mockResolvedValue(['has-skill', 'no-skill']);
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    (fs.readFile as Mock)
      .mockResolvedValueOnce(SKILL_MD_MINIMAL)
      .mockRejectedValueOnce(new Error('ENOENT'));

    const result = await listSkills();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });
});

// =============================================================================
// matchSkillsToContext
// =============================================================================

describe('matchSkillsToContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper: set up listSkills to return the given fixture skills.
   */
  function setupSkills(...mdContents: { dirName: string; md: string }[]) {
    (fs.readdir as Mock).mockResolvedValue(mdContents.map(s => s.dirName));
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    for (const s of mdContents) {
      (fs.readFile as Mock).mockResolvedValueOnce(s.md);
    }
  }

  it('should return scored matches above threshold', async () => {
    setupSkills(
      { dirName: 'arch', md: SKILL_MD_FULL },
      { dirName: 'api', md: SKILL_MD_BACKEND },
    );

    const result = await matchSkillsToContext({
      task_description: 'Create a python desktop GUI application with PySide6 and MVC architecture',
      min_score: 0.05,
    });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThanOrEqual(1);

    // The architecture skill should appear with a non-zero score
    const archMatch = result.data!.find(m => m.skill_name === 'pyside6-qml-architecture');
    expect(archMatch).toBeDefined();
    expect(archMatch!.relevance_score).toBeGreaterThan(0);
    expect(archMatch!.matched_keywords.length).toBeGreaterThan(0);
  });

  it('should score higher for category + language matches', async () => {
    setupSkills(
      { dirName: 'arch', md: SKILL_MD_FULL },
      { dirName: 'api', md: SKILL_MD_BACKEND },
    );

    // Task mentions "architecture" (category) and "python" (language) → should boost arch skill
    const result = await matchSkillsToContext({
      task_description: 'Set up architecture for a python desktop application',
      min_score: 0.01,
    });

    expect(result.success).toBe(true);
    const archMatch = result.data!.find(m => m.skill_name === 'pyside6-qml-architecture');
    const apiMatch = result.data!.find(m => m.skill_name === 'backend-api');

    expect(archMatch).toBeDefined();
    // The architecture skill should score higher because it matches both category and language
    if (apiMatch) {
      expect(archMatch!.relevance_score).toBeGreaterThan(apiMatch.relevance_score);
    }
  });

  it('should return empty array when no skills match', async () => {
    setupSkills(
      { dirName: 'arch', md: SKILL_MD_FULL },
    );

    const result = await matchSkillsToContext({
      task_description: 'Deploy a Kubernetes cluster on AWS with Terraform',
      min_score: 0.5, // High threshold → nothing should match
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should return empty array when skills directory is empty', async () => {
    (fs.readdir as Mock).mockResolvedValue([]);

    const result = await matchSkillsToContext({
      task_description: 'anything at all',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should require task_description parameter', async () => {
    const result = await matchSkillsToContext({
      task_description: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('task_description');
  });

  it('should sort results by relevance_score descending', async () => {
    setupSkills(
      { dirName: 'arch', md: SKILL_MD_FULL },
      { dirName: 'api', md: SKILL_MD_BACKEND },
    );

    const result = await matchSkillsToContext({
      task_description: 'Build a python desktop GUI with architecture patterns and also a REST API backend using typescript express',
      min_score: 0.01,
    });

    expect(result.success).toBe(true);
    if (result.data!.length >= 2) {
      expect(result.data![0].relevance_score).toBeGreaterThanOrEqual(result.data![1].relevance_score);
    }
  });

  it('should include matched_keywords in results', async () => {
    setupSkills(
      { dirName: 'api', md: SKILL_MD_BACKEND },
    );

    const result = await matchSkillsToContext({
      task_description: 'Create a TypeScript REST API with Express framework',
      min_score: 0.01,
    });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThanOrEqual(1);
    const match = result.data![0];
    expect(match.matched_keywords.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// deploySkillsToWorkspace
// =============================================================================

describe('deploySkillsToWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should copy skill directories to target workspace', async () => {
    (fs.readdir as Mock).mockResolvedValue(['skill-a', 'skill-b']);
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    (fs.access as Mock).mockResolvedValue(undefined);
    (fs.readFile as Mock)
      .mockResolvedValueOnce('# Skill A content')
      .mockResolvedValueOnce('# Skill B content');
    (fs.mkdir as Mock).mockResolvedValue(undefined);
    (fs.writeFile as Mock).mockResolvedValue(undefined);

    const result = await deploySkillsToWorkspace({
      workspace_path: '/my/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data!.deployed).toEqual(['skill-a', 'skill-b']);
    expect(result.data!.target_path).toContain('.github');
    expect(result.data!.target_path).toContain('skills');

    // Verify mkdir was called for each skill target dir
    expect(fs.mkdir).toHaveBeenCalledTimes(2);
    // Verify writeFile was called for each SKILL.md
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
  });

  it('should handle missing source directory gracefully', async () => {
    (fs.readdir as Mock).mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const result = await deploySkillsToWorkspace({
      workspace_path: '/my/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data!.deployed).toEqual([]);
    expect(result.data!.errors).toContain('Skills source directory not found');
  });

  it('should require workspace_path parameter', async () => {
    const result = await deploySkillsToWorkspace({
      workspace_path: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_path');
  });

  it('should skip entries without SKILL.md', async () => {
    (fs.readdir as Mock).mockResolvedValue(['has-skill', 'no-skill']);
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    (fs.access as Mock)
      .mockResolvedValueOnce(undefined)          // has-skill: SKILL.md exists
      .mockRejectedValueOnce(new Error('ENOENT')); // no-skill: no SKILL.md
    (fs.readFile as Mock).mockResolvedValue('# Content');
    (fs.mkdir as Mock).mockResolvedValue(undefined);
    (fs.writeFile as Mock).mockResolvedValue(undefined);

    const result = await deploySkillsToWorkspace({
      workspace_path: '/my/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data!.deployed).toEqual(['has-skill']);
  });

  it('should skip non-directory entries in source', async () => {
    (fs.readdir as Mock).mockResolvedValue(['README.md', 'real-skill']);
    (fs.stat as Mock)
      .mockResolvedValueOnce(mockDirectory(false))
      .mockResolvedValueOnce(mockDirectory(true));
    (fs.access as Mock).mockResolvedValue(undefined);
    (fs.readFile as Mock).mockResolvedValue('# Content');
    (fs.mkdir as Mock).mockResolvedValue(undefined);
    (fs.writeFile as Mock).mockResolvedValue(undefined);

    const result = await deploySkillsToWorkspace({
      workspace_path: '/my/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data!.deployed).toEqual(['real-skill']);
  });

  it('should report errors for individual skill deployment failures', async () => {
    (fs.readdir as Mock).mockResolvedValue(['skill-ok', 'skill-fail']);
    (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
    (fs.access as Mock).mockResolvedValue(undefined);
    (fs.readFile as Mock)
      .mockResolvedValueOnce('# OK content')
      .mockResolvedValueOnce('# Fail content');
    (fs.mkdir as Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Permission denied'));
    (fs.writeFile as Mock).mockResolvedValue(undefined);

    const result = await deploySkillsToWorkspace({
      workspace_path: '/my/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data!.deployed).toContain('skill-ok');
    expect(result.data!.errors!.length).toBeGreaterThan(0);
    expect(result.data!.errors![0]).toContain('skill-fail');
  });
});
