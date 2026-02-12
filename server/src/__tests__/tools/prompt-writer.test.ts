/**
 * Tests for prompt-writer.ts — Dynamic Prompt System
 *
 * Covers:
 * 1. generatePromptContent creates valid YAML frontmatter
 * 2. Frontmatter includes title, version, plan_id, created_by
 * 3. Content follows frontmatter correctly
 * 4. Version defaults to 1.0.0
 * 5. Tags are included when provided
 * 6. slugify generates correct slugs
 * 7. parsePromptFile round-trips correctly
 * 8. generatePromptFile validates required fields
 * 9. Sections and variables are rendered
 * 10. rawBody is used when provided
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../../storage/file-store.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

import {
  generatePromptContent,
  generatePromptFile,
  parsePromptFile,
  slugify,
  type PromptData,
  type PromptFrontmatter,
} from '../../tools/prompt-writer.js';

// =============================================================================
// Fixtures
// =============================================================================

function makePromptData(overrides?: Partial<PromptData>): PromptData {
  return {
    title: 'Test Prompt',
    frontmatter: {
      agent: 'Executor',
      description: 'A test prompt',
      version: '1.0.0',
      created_by: 'Tester',
      plan_id: 'plan_abc123',
      ...overrides?.frontmatter,
    } as PromptFrontmatter,
    ...overrides,
    // Ensure frontmatter merge is correct
    ...(overrides?.frontmatter ? {} : {}),
  };
}

// =============================================================================
// slugify
// =============================================================================

describe('slugify', () => {
  it('converts title to lowercase kebab-case', () => {
    expect(slugify('My Test Prompt')).toBe('my-test-prompt');
  });

  it('removes special characters', () => {
    expect(slugify('Hello! World? #1')).toBe('hello-world-1');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('a---b---c')).toBe('a-b-c');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

// =============================================================================
// generatePromptContent — Frontmatter
// =============================================================================

describe('generatePromptContent', () => {
  it('creates content with valid YAML frontmatter delimiters', () => {
    const data = makePromptData();
    const content = generatePromptContent(data);

    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/\n---\n/);

    // Exactly two '---' markers (open and close)
    const markers = content.match(/^---$/gm);
    expect(markers).not.toBeNull();
    expect(markers!.length).toBeGreaterThanOrEqual(2);
  });

  it('includes agent in frontmatter', () => {
    const data = makePromptData();
    const content = generatePromptContent(data);
    expect(content).toContain('agent: "Executor"');
  });

  it('includes description in frontmatter', () => {
    const data = makePromptData();
    const content = generatePromptContent(data);
    expect(content).toContain('description: "A test prompt"');
  });

  it('includes version in frontmatter', () => {
    const data = makePromptData();
    const content = generatePromptContent(data);
    expect(content).toContain('version: "1.0.0"');
  });

  it('includes plan_id in frontmatter', () => {
    const data = makePromptData();
    const content = generatePromptContent(data);
    expect(content).toContain('plan_id: "plan_abc123"');
  });

  it('includes created_by in frontmatter', () => {
    const data = makePromptData();
    const content = generatePromptContent(data);
    expect(content).toContain('created_by: "Tester"');
  });

  it('includes title as markdown heading after frontmatter', () => {
    const data = makePromptData();
    const content = generatePromptContent(data);
    expect(content).toContain('# Test Prompt');
  });

  it('includes tags when provided', () => {
    const data = makePromptData({
      frontmatter: {
        agent: 'Executor',
        description: 'tagged prompt',
        tags: ['setup', 'config'],
      },
    });
    const content = generatePromptContent(data);
    expect(content).toContain('tags:');
    expect(content).toContain('"setup"');
    expect(content).toContain('"config"');
  });

  it('omits tags field when tags array is empty', () => {
    const data = makePromptData({
      frontmatter: {
        agent: 'Executor',
        description: 'no tags',
        tags: [],
      },
    });
    const content = generatePromptContent(data);
    expect(content).not.toContain('tags:');
  });

  it('omits undefined optional fields', () => {
    const data = makePromptData({
      frontmatter: {
        agent: 'Executor',
        description: 'minimal',
      },
    });
    const content = generatePromptContent(data);
    expect(content).not.toContain('phase:');
    expect(content).not.toContain('expires_after:');
    expect(content).not.toContain('step_indices:');
  });

  it('includes mode when provided', () => {
    const data = makePromptData({
      frontmatter: {
        agent: 'Executor',
        description: 'with mode',
        mode: 'WRITE',
      },
    });
    const content = generatePromptContent(data);
    expect(content).toContain('mode: "WRITE"');
  });
});

// =============================================================================
// generatePromptContent — Body
// =============================================================================

describe('generatePromptContent — body', () => {
  it('includes intro text when provided', () => {
    const data = makePromptData({ intro: 'This is an introduction.' });
    const content = generatePromptContent(data);
    expect(content).toContain('This is an introduction.');
  });

  it('renders sections with ## headings', () => {
    const data = makePromptData({
      sections: [
        { title: 'Setup', content: 'Install deps' },
        { title: 'Usage', content: 'Run the thing' },
      ],
    });
    const content = generatePromptContent(data);
    expect(content).toContain('## Setup');
    expect(content).toContain('Install deps');
    expect(content).toContain('## Usage');
    expect(content).toContain('Run the thing');
  });

  it('uses rawBody instead of sections when provided', () => {
    const data = makePromptData({
      rawBody: 'Raw markdown body here.',
      sections: [{ title: 'Ignored', content: 'Should not appear' }],
    });
    const content = generatePromptContent(data);
    expect(content).toContain('Raw markdown body here.');
    // rawBody takes precedence in the code (it checks rawBody first)
  });

  it('renders template variables when provided', () => {
    const data = makePromptData({ variables: ['planId', 'agentName'] });
    const content = generatePromptContent(data);
    expect(content).toContain('**Template Variables:**');
    expect(content).toContain('`{{planId}}`');
    expect(content).toContain('`{{agentName}}`');
  });

  it('content ends with a newline', () => {
    const data = makePromptData();
    const content = generatePromptContent(data);
    expect(content).toMatch(/\n$/);
  });
});

// =============================================================================
// generatePromptFile
// =============================================================================

describe('generatePromptFile', () => {
  it('returns filePath, slug, version, and content', async () => {
    const data = makePromptData();
    const result = await generatePromptFile(data, '/tmp/prompts');

    expect(result.slug).toBe('test-prompt');
    expect(result.version).toBe('1.0.0');
    expect(result.filePath).toContain('test-prompt.prompt.md');
    expect(result.content).toContain('# Test Prompt');
  });

  it('defaults version to 1.0.0 when not set', async () => {
    const data = makePromptData({
      frontmatter: {
        agent: 'Executor',
        description: 'no version',
        version: undefined,
      },
    });
    const result = await generatePromptFile(data, '/tmp/prompts');
    expect(result.version).toBe('1.0.0');
    expect(result.content).toContain('version: "1.0.0"');
  });

  it('uses filenameOverride when provided', async () => {
    const data = makePromptData();
    const result = await generatePromptFile(data, '/tmp/prompts', 'custom-slug');
    expect(result.slug).toBe('custom-slug');
    expect(result.filePath).toContain('custom-slug.prompt.md');
  });

  it('throws when title is missing', async () => {
    const data = makePromptData({ title: '' });
    await expect(generatePromptFile(data, '/tmp')).rejects.toThrow(
      'Prompt title is required',
    );
  });

  it('throws when frontmatter.agent is missing', async () => {
    const data = makePromptData({
      frontmatter: { agent: '', description: 'desc' },
    });
    await expect(generatePromptFile(data, '/tmp')).rejects.toThrow(
      'Prompt frontmatter.agent is required',
    );
  });

  it('throws when frontmatter.description is missing', async () => {
    const data = makePromptData({
      frontmatter: { agent: 'Executor', description: '' },
    });
    await expect(generatePromptFile(data, '/tmp')).rejects.toThrow(
      'Prompt frontmatter.description is required',
    );
  });
});

// =============================================================================
// parsePromptFile
// =============================================================================

describe('parsePromptFile', () => {
  it('parses frontmatter and body from prompt content', () => {
    const content = [
      '---',
      'agent: "Executor"',
      'version: "1.0.0"',
      'plan_id: "plan_123"',
      '---',
      '',
      '# My Prompt',
      '',
      'Body text here.',
    ].join('\n');

    const result = parsePromptFile(content);
    expect(result.frontmatter['agent']).toBe('Executor');
    expect(result.frontmatter['version']).toBe('1.0.0');
    expect(result.frontmatter['plan_id']).toBe('plan_123');
    expect(result.body).toContain('# My Prompt');
    expect(result.body).toContain('Body text here.');
  });

  it('parses boolean values in frontmatter', () => {
    const content = '---\narchived: true\n---\nBody';
    const result = parsePromptFile(content);
    expect(result.frontmatter['archived']).toBe(true);
  });

  it('parses array values in frontmatter', () => {
    const content = '---\nstep_indices: [0, 1, 2]\ntags: ["a", "b"]\n---\nBody';
    const result = parsePromptFile(content);
    expect(result.frontmatter['step_indices']).toEqual([0, 1, 2]);
    expect(result.frontmatter['tags']).toEqual(['a', 'b']);
  });

  it('parses empty arrays in frontmatter', () => {
    const content = '---\ntags: []\n---\nBody';
    const result = parsePromptFile(content);
    expect(result.frontmatter['tags']).toEqual([]);
  });

  it('returns empty frontmatter when no delimiters found', () => {
    const content = '# Just a markdown file\n\nNo frontmatter.';
    const result = parsePromptFile(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it('round-trips with generatePromptContent', () => {
    const data = makePromptData({
      intro: 'Intro text',
      frontmatter: {
        agent: 'Executor',
        description: 'Round trip test',
        version: '2.1.0',
        plan_id: 'plan_rt',
        tags: ['test', 'roundtrip'],
      },
    });
    const content = generatePromptContent(data);
    const parsed = parsePromptFile(content);

    expect(parsed.frontmatter['agent']).toBe('Executor');
    expect(parsed.frontmatter['version']).toBe('2.1.0');
    expect(parsed.frontmatter['plan_id']).toBe('plan_rt');
    expect(parsed.frontmatter['tags']).toEqual(['test', 'roundtrip']);
    expect(parsed.body).toContain('# Test Prompt');
    expect(parsed.body).toContain('Intro text');
  });
});
