import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  discoverAgents,
  validateAgentExists,
  loadAgentInstructions,
  listKnownAgentNames,
} from '../../utils/agent-loader.js';
import type { AgentFileInfo } from '../../utils/agent-loader.js';

// ---------------------------------------------------------------------------
// Mock the fs module — we control what the "agents/" directory looks like
// ---------------------------------------------------------------------------

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
      access: vi.fn(),
      readFile: vi.fn(),
    },
  };
});

// Capture the agents root used internally (mirrors agent-loader.ts default)
const AGENTS_ROOT = process.env.MBS_AGENTS_ROOT || path.join(process.cwd(), '..', 'agents');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALL_AGENT_FILES = [
  'coordinator.agent.md',
  'analyst.agent.md',
  'researcher.agent.md',
  'architect.agent.md',
  'executor.agent.md',
  'reviewer.agent.md',
  'tester.agent.md',
  'revisionist.agent.md',
  'archivist.agent.md',
  'brainstorm.agent.md',
  'runner.agent.md',
  'skill-writer.agent.md',
  'worker.agent.md',
  'tdd-driver.agent.md',
  'cognition.agent.md',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agent-loader — discoverAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers all expected agent files', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(ALL_AGENT_FILES as any);

    const agents = await discoverAgents();

    expect(agents).toHaveLength(ALL_AGENT_FILES.length);
    const filenames = agents.map(a => a.filename);
    for (const file of ALL_AGENT_FILES) {
      expect(filenames).toContain(file);
    }
  });

  it('returns correct AgentFileInfo shape for each agent', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['executor.agent.md'] as any);

    const agents = await discoverAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toEqual(
      expect.objectContaining({
        name: 'Executor',
        filename: 'executor.agent.md',
        filepath: expect.stringContaining('executor.agent.md'),
      })
    );
  });

  it('filters out non-agent files in the directory', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      'executor.agent.md',
      'README.md',
      'config.json',
      '.gitkeep',
      'tester.agent.md',
    ] as any);

    const agents = await discoverAgents();

    expect(agents).toHaveLength(2);
    expect(agents.map(a => a.filename)).toEqual([
      'executor.agent.md',
      'tester.agent.md',
    ]);
  });

  it('handles special naming: tdd-driver → TDDDriver', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['tdd-driver.agent.md'] as any);

    const agents = await discoverAgents();

    expect(agents[0].name).toBe('TDDDriver');
  });

  it('handles special naming: skill-writer → SkillWriter', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['skill-writer.agent.md'] as any);

    const agents = await discoverAgents();

    expect(agents[0].name).toBe('SkillWriter');
  });

  it('throws when agents directory does not exist', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
    );

    await expect(discoverAgents()).rejects.toThrow('Failed to discover agents');
  });

  it('returns empty array when directory exists but has no agent files', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['README.md', '.gitkeep'] as any);

    const agents = await discoverAgents();

    expect(agents).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('agent-loader — validateAgentExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns AgentFileInfo for a valid canonical agent', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const result = await validateAgentExists('Executor');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Executor');
    expect(result!.filename).toBe('executor.agent.md');
  });

  it('is case-insensitive for agent names', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const result = await validateAgentExists('eXeCuToR');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Executor');
  });

  it('returns null for a completely unknown agent', async () => {
    // Not in canonical map AND filesystem discovery finds nothing
    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    const result = await validateAgentExists('NonExistentBot');

    expect(result).toBeNull();
  });

  it('returns null when canonical file does not exist on disk', async () => {
    vi.mocked(fs.access).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );

    const result = await validateAgentExists('Executor');

    expect(result).toBeNull();
  });

  it('validates Cognition agent', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const result = await validateAgentExists('cognition');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Cognition');
    expect(result!.filename).toBe('cognition.agent.md');
  });

  it('validates TDDDriver agent (special casing)', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const result = await validateAgentExists('tdddriver');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('TDDDriver');
    expect(result!.filename).toBe('tdd-driver.agent.md');
  });

  it('falls back to filesystem discovery for agents not in canonical map', async () => {
    // Agent not in AGENT_FILE_MAP but found via discoverAgents
    vi.mocked(fs.readdir).mockResolvedValue(['custom.agent.md'] as any);

    const result = await validateAgentExists('custom');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Custom');
    expect(result!.filename).toBe('custom.agent.md');
  });
});

// ---------------------------------------------------------------------------

describe('agent-loader — loadAgentInstructions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads instructions for a valid agent', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('# Executor\nImplement code changes.' as any);

    const result = await loadAgentInstructions('Executor');

    expect(result).not.toBeNull();
    expect(result!.agent.name).toBe('Executor');
    expect(result!.instructions).toContain('Executor');
    expect(result!.instructions).toContain('Implement code changes');
  });

  it('returns null for an unknown agent', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    const result = await loadAgentInstructions('FakeAgent');

    expect(result).toBeNull();
  });

  it('throws when file exists but cannot be read', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockRejectedValue(new Error('permission denied'));

    await expect(loadAgentInstructions('Executor')).rejects.toThrow(
      'could not be read'
    );
  });
});

// ---------------------------------------------------------------------------

describe('agent-loader — listKnownAgentNames', () => {
  it('returns a non-empty array of agent names', () => {
    const names = listKnownAgentNames();

    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
  });

  it('includes core agent types', () => {
    const names = listKnownAgentNames();

    expect(names).toContain('Coordinator');
    expect(names).toContain('Executor');
    expect(names).toContain('Tester');
    expect(names).toContain('Reviewer');
    expect(names).toContain('Archivist');
  });

  it('includes newer agent types', () => {
    const names = listKnownAgentNames();

    expect(names).toContain('Cognition');
    expect(names).toContain('TDDDriver');
    expect(names).toContain('Worker');
    expect(names).toContain('SkillWriter');
  });

  it('returns capitalized names (not lowercase keys)', () => {
    const names = listKnownAgentNames();

    for (const name of names) {
      // Each name should start with an uppercase letter
      expect(name[0]).toBe(name[0].toUpperCase());
    }
  });

  it('returns exactly 15 known agents', () => {
    const names = listKnownAgentNames();

    // coordinator, analyst, researcher, architect, executor,
    // reviewer, tester, revisionist, archivist, brainstorm,
    // runner, skillwriter, worker, tdddriver, cognition
    expect(names).toHaveLength(15);
  });
});
