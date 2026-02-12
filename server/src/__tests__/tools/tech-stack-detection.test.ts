/**
 * Tests for detectWorkspaceTechStack (skills.tools.ts).
 *
 * Covers:
 * 1. Detects TypeScript from tsconfig.json
 * 2. Detects Python from requirements.txt
 * 3. Detects React/Vue from package.json dependencies
 * 4. Returns empty array when no indicators found
 * 5. Detects multiple technologies simultaneously
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

import { detectWorkspaceTechStack } from '../../tools/skills.tools.js';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Set up fs mocks for tech stack detection.
 * The function checks files in this order:
 * 1. fs.readFile('package.json')       → javascript/nodejs + framework detection
 * 2. fs.access('tsconfig.json')        → typescript
 * 3. fs.access('pyproject.toml')       → python
 * 4. fs.access('requirements.txt')     → python (fallback if no pyproject.toml)
 * 5. fs.access('Cargo.toml')           → rust
 * 6. fs.access('go.mod')               → go/golang
 */
function setupDetectionMocks(opts: {
  packageJson?: Record<string, unknown> | null;
  tsconfig?: boolean;
  pyprojectToml?: boolean;
  requirementsTxt?: boolean;
  cargoToml?: boolean;
  goMod?: boolean;
} = {}) {
  // 1. package.json
  if (opts.packageJson) {
    (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify(opts.packageJson));
  } else {
    (fs.readFile as Mock).mockRejectedValueOnce(new Error('ENOENT'));
  }

  // 2. tsconfig.json
  if (opts.tsconfig) {
    (fs.access as Mock).mockResolvedValueOnce(undefined);
  } else {
    (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));
  }

  // 3. pyproject.toml
  if (opts.pyprojectToml) {
    (fs.access as Mock).mockResolvedValueOnce(undefined);
  } else {
    (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));

    // 4. requirements.txt (only checked if pyproject.toml is absent)
    if (opts.requirementsTxt) {
      (fs.access as Mock).mockResolvedValueOnce(undefined);
    } else {
      (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));
    }
  }

  // 5. Cargo.toml
  if (opts.cargoToml) {
    (fs.access as Mock).mockResolvedValueOnce(undefined);
  } else {
    (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));
  }

  // 6. go.mod
  if (opts.goMod) {
    (fs.access as Mock).mockResolvedValueOnce(undefined);
  } else {
    (fs.access as Mock).mockRejectedValueOnce(new Error('ENOENT'));
  }
}

// =============================================================================
// detectWorkspaceTechStack
// =============================================================================

describe('detectWorkspaceTechStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect TypeScript from tsconfig.json', async () => {
    setupDetectionMocks({ tsconfig: true });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('typescript');
  });

  it('should detect Python from requirements.txt', async () => {
    setupDetectionMocks({ requirementsTxt: true });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('python');
  });

  it('should detect Python from pyproject.toml', async () => {
    setupDetectionMocks({ pyprojectToml: true });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('python');
  });

  it('should detect React from package.json dependencies', async () => {
    setupDetectionMocks({
      packageJson: {
        name: 'my-app',
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
      },
    });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('javascript');
    expect(stack).toContain('nodejs');
    expect(stack).toContain('react');
  });

  it('should detect Vue from package.json dependencies', async () => {
    setupDetectionMocks({
      packageJson: {
        name: 'my-vue-app',
        dependencies: {
          vue: '^3.0.0',
        },
      },
    });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('javascript');
    expect(stack).toContain('nodejs');
    expect(stack).toContain('vue');
  });

  it('should detect frameworks from devDependencies as well', async () => {
    setupDetectionMocks({
      packageJson: {
        name: 'my-app',
        devDependencies: {
          vitest: '^1.0.0',
          tailwindcss: '^3.0.0',
        },
      },
    });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('vitest');
    expect(stack).toContain('tailwind');
  });

  it('should return empty array when no indicators found', async () => {
    setupDetectionMocks({});

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toEqual([]);
  });

  it('should detect multiple technologies simultaneously', async () => {
    setupDetectionMocks({
      packageJson: {
        name: 'fullstack-app',
        dependencies: {
          react: '^18.0.0',
          express: '^4.0.0',
        },
        devDependencies: {
          vitest: '^1.0.0',
        },
      },
      tsconfig: true,
    });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('javascript');
    expect(stack).toContain('nodejs');
    expect(stack).toContain('typescript');
    expect(stack).toContain('react');
    expect(stack).toContain('express');
    expect(stack).toContain('vitest');
  });

  it('should detect Rust from Cargo.toml', async () => {
    setupDetectionMocks({ cargoToml: true });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('rust');
  });

  it('should detect Go from go.mod', async () => {
    setupDetectionMocks({ goMod: true });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    expect(stack).toContain('go');
    expect(stack).toContain('golang');
  });

  it('should deduplicate detected technologies', async () => {
    // package.json already adds 'javascript'; ensure no duplicates
    setupDetectionMocks({
      packageJson: {
        name: 'app',
        dependencies: { express: '^4.0.0' },
      },
    });

    const stack = await detectWorkspaceTechStack('/test/workspace');

    const jsCount = stack.filter(t => t === 'javascript').length;
    expect(jsCount).toBe(1);
  });
});
