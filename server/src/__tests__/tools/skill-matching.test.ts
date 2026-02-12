/**
 * Tests for matchWorkspaceSkillsToContext (skills.tools.ts).
 *
 * Covers:
 * 1. matchWorkspaceSkillsToContext returns scored skills for matching workspace
 * 2. Skills below threshold (0.3) are filtered out
 * 3. Top results include full content
 * 4. Category matching boosts score
 * 5. Language target matching boosts score
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { promises as fs } from 'fs';

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

import { matchWorkspaceSkillsToContext } from '../../tools/skills.tools.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const SKILL_MD_ARCHITECTURE = `---
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

Standard REST patterns for TypeScript services.
`;

const SKILL_MD_TESTING = `---
name: testing-patterns
description: Testing patterns and best practices for unit and integration tests.
category: testing
tags:
  - unit
  - integration
  - vitest
language_targets:
  - typescript
  - javascript
framework_targets:
  - vitest
  - jest
---

# Testing Patterns

Best practices for writing and organizing tests.
`;

// =============================================================================
// Helpers
// =============================================================================

function mockDirectory(isDir = true) {
  return { isDirectory: () => isDir };
}

/**
 * Set up the workspace .github/skills directory with given skill entries.
 * The first call to fs.readdir returns workspace skill dirs,
 * subsequent calls (e.g., for fallback to server skills) return empty.
 */
function setupWorkspaceSkills(
  ...skills: { dirName: string; md: string }[]
) {
  // First readdir call = workspace skills
  (fs.readdir as Mock).mockResolvedValueOnce(skills.map(s => s.dirName));
  (fs.stat as Mock).mockResolvedValue(mockDirectory(true));
  for (const s of skills) {
    (fs.readFile as Mock).mockResolvedValueOnce(s.md);
  }
}

/**
 * Mock workspace config files for tech stack detection.
 */
function setupTechStackFiles(opts: {
  tsconfig?: boolean;
  packageJson?: string | null;
  requirementsTxt?: boolean;
}) {
  // After workspace skills are read, matchWorkspaceSkillsToContext calls
  // detectWorkspaceTechStack which checks for config files.
  // We need to set up fs.readFile and fs.access mocks for these checks.

  if (opts.packageJson) {
    // fs.readFile for package.json
    (fs.readFile as Mock).mockResolvedValueOnce(opts.packageJson);
  } else {
    (fs.readFile as Mock).mockRejectedValueOnce(new Error('ENOENT'));
  }

  if (opts.tsconfig) {
    (fs.access as Mock).mockResolvedValueOnce(undefined);
  } else {
    (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));
  }

  // pyproject.toml
  (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));

  if (opts.requirementsTxt) {
    (fs.access as Mock).mockResolvedValueOnce(undefined);
  } else {
    (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));
  }

  // Cargo.toml
  (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));
  // go.mod
  (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));
}

// =============================================================================
// matchWorkspaceSkillsToContext
// =============================================================================

describe('matchWorkspaceSkillsToContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return scored skills for matching workspace', async () => {
    setupWorkspaceSkills(
      { dirName: 'arch', md: SKILL_MD_ARCHITECTURE },
      { dirName: 'api', md: SKILL_MD_BACKEND },
    );
    setupTechStackFiles({ tsconfig: false });

    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '/test/workspace',
      task_description: 'Create a python desktop GUI application with PySide6 and MVC architecture',
      min_score: 0.05,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.length).toBeGreaterThanOrEqual(1);

    // Each result should have the expected shape
    const match = result.data![0];
    expect(match).toHaveProperty('skill_name');
    expect(match).toHaveProperty('relevance_score');
    expect(match).toHaveProperty('matched_keywords');
    expect(match.relevance_score).toBeGreaterThan(0);
  });

  it('should filter out skills below threshold (0.3 default)', async () => {
    setupWorkspaceSkills(
      { dirName: 'arch', md: SKILL_MD_ARCHITECTURE },
      { dirName: 'api', md: SKILL_MD_BACKEND },
      { dirName: 'test', md: SKILL_MD_TESTING },
    );
    setupTechStackFiles({ tsconfig: false });

    // Task that clearly matches architecture but not backend/testing
    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '/test/workspace',
      task_description: 'Set up PySide6 QML desktop application with MVC architecture pattern for a python GUI',
      // min_score defaults to 0.3
    });

    expect(result.success).toBe(true);
    // All returned results should be >= 0.3
    for (const match of result.data!) {
      expect(match.relevance_score).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('should include full content in top results', async () => {
    setupWorkspaceSkills(
      { dirName: 'arch', md: SKILL_MD_ARCHITECTURE },
    );
    setupTechStackFiles({ tsconfig: false });

    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '/test/workspace',
      task_description: 'Build python desktop app with PySide6 architecture and MVC',
      min_score: 0.05,
    });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThanOrEqual(1);

    // matchWorkspaceSkillsToContext includes content for matches
    const topResult = result.data![0];
    expect(topResult.content).toBeDefined();
    expect(topResult.content).toContain('PySide6');
  });

  it('should boost score for category matching', async () => {
    setupWorkspaceSkills(
      { dirName: 'arch', md: SKILL_MD_ARCHITECTURE },
      { dirName: 'api', md: SKILL_MD_BACKEND },
    );
    setupTechStackFiles({ tsconfig: false });

    // Task mentions "architecture" category match for arch skill
    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '/test/workspace',
      task_description: 'Set up architecture for a desktop application project structure',
      min_score: 0.01,
    });

    expect(result.success).toBe(true);
    const archMatch = result.data!.find(m => m.skill_name === 'pyside6-qml-architecture');
    const apiMatch = result.data!.find(m => m.skill_name === 'backend-api');

    expect(archMatch).toBeDefined();
    // Architecture skill should score higher due to category match
    if (apiMatch) {
      expect(archMatch!.relevance_score).toBeGreaterThan(apiMatch.relevance_score);
    }
  });

  it('should boost score for language target matching', async () => {
    setupWorkspaceSkills(
      { dirName: 'arch', md: SKILL_MD_ARCHITECTURE },
      { dirName: 'api', md: SKILL_MD_BACKEND },
    );
    setupTechStackFiles({ tsconfig: false });

    // Task mentions "python" which is a language_target for arch skill
    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '/test/workspace',
      task_description: 'python application with project scaffolding',
      min_score: 0.01,
    });

    expect(result.success).toBe(true);
    const archMatch = result.data!.find(m => m.skill_name === 'pyside6-qml-architecture');

    expect(archMatch).toBeDefined();
    // Should include "python" in matched keywords since it's a language target
    expect(archMatch!.matched_keywords).toContain('python');
  });

  it('should respect max_results parameter', async () => {
    setupWorkspaceSkills(
      { dirName: 'arch', md: SKILL_MD_ARCHITECTURE },
      { dirName: 'api', md: SKILL_MD_BACKEND },
      { dirName: 'test', md: SKILL_MD_TESTING },
    );
    setupTechStackFiles({ tsconfig: true });

    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '/test/workspace',
      task_description: 'Build a full desktop and backend application with tests using python typescript architecture patterns',
      min_score: 0.01,
      max_results: 2,
    });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeLessThanOrEqual(2);
  });

  it('should return empty array when no skills match above threshold', async () => {
    setupWorkspaceSkills(
      { dirName: 'arch', md: SKILL_MD_ARCHITECTURE },
    );
    setupTechStackFiles({ tsconfig: false });

    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '/test/workspace',
      task_description: 'Deploy Kubernetes cluster on AWS with Terraform',
      min_score: 0.8, // Very high threshold
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should require workspace_path and task_description', async () => {
    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '',
      task_description: 'anything',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_path');
  });

  it('should fall back to server skills when workspace has no .github/skills/', async () => {
    // First readdir for workspace skills fails → falls back to server skill matching
    (fs.readdir as Mock)
      .mockRejectedValueOnce(new Error('ENOENT'))
      // Fallback server skills directory read (from matchSkillsToContext)
      .mockResolvedValueOnce([]);

    const result = await matchWorkspaceSkillsToContext({
      workspace_path: '/test/workspace',
      task_description: 'some task',
      min_score: 0.05,
    });

    expect(result.success).toBe(true);
    // Falls back to matchSkillsToContext which reads server skills
  });
});
