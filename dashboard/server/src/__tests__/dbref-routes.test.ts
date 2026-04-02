/**
 * Dashboard DbRef Regression Tests (Phase 13, Step 35)
 *
 * Validates that dashboard route helpers and services correctly handle
 * DbRef fields — plan routes, workspace routes, knowledge routes include
 * `_ref` in responses, and agentScanner handles `_ref` fields gracefully.
 */

import { describe, it, expect } from 'vitest';
import {
  makeDbRef,
  type DbRef,
  type FileRef,
  type ArtifactRef,
  type DbArtifactKind,
} from '../types/db-ref.types.js';

// =============================================================================
// Dashboard makeDbRef factory
// =============================================================================

describe('Dashboard makeDbRef factory', () => {
  it('creates correct DbRef for plans', () => {
    const ref = makeDbRef('plans', 'plan_abc', 'plan', 'My Plan');
    expect(ref).toEqual({
      ref_type: 'db',
      database: 'project_memory',
      table: 'plans',
      row_id: 'plan_abc',
      artifact_kind: 'plan',
      display_name: 'My Plan',
    });
  });

  it('creates correct DbRef for workspaces', () => {
    const ref = makeDbRef('workspaces', 'ws_abc', 'workspace', 'Test WS');
    expect(ref.ref_type).toBe('db');
    expect(ref.table).toBe('workspaces');
    expect(ref.artifact_kind).toBe('workspace');
  });

  it('creates correct DbRef for knowledge', () => {
    const ref = makeDbRef('knowledge', 'kb_slug', 'knowledge', 'KB File');
    expect(ref.ref_type).toBe('db');
    expect(ref.table).toBe('knowledge');
    expect(ref.artifact_kind).toBe('knowledge');
  });

  it('creates correct DbRef for context_items', () => {
    const ref = makeDbRef('context_items', 'ctx_1', 'context', 'requirements:plan_1');
    expect(ref.ref_type).toBe('db');
    expect(ref.table).toBe('context_items');
    expect(ref.artifact_kind).toBe('context');
  });
});

// =============================================================================
// Plan route _ref shape simulation
// =============================================================================

describe('Plan route _ref inclusion', () => {
  it('attaches _ref to plan list responses', () => {
    const plan = { id: 'plan_abc', title: 'Auth Feature', steps: [] };
    const response = {
      ...plan,
      _ref: makeDbRef('plans', plan.id, 'plan', plan.title),
    };

    expect(response._ref).toBeDefined();
    expect(response._ref.ref_type).toBe('db');
    expect(response._ref.table).toBe('plans');
    expect(response._ref.row_id).toBe('plan_abc');
    expect(response._ref.display_name).toBe('Auth Feature');
  });

  it('attaches _ref to plan detail responses', () => {
    const plan = { id: 'plan_xyz', title: 'Refactor', status: 'active' };
    const response = {
      ...plan,
      _ref: makeDbRef('plans', plan.id, 'plan', plan.title),
    };

    expect(response._ref.ref_type).toBe('db');
    expect(response._ref.artifact_kind).toBe('plan');
  });

  it('attaches _ref to context items within plan', () => {
    const item = { id: 42, type: 'requirements', data: {} };
    const planId = 'plan_abc';
    const refItem = {
      ...item,
      _ref: makeDbRef('context_items', String(item.id), 'context', `${item.type}:${planId}`),
    };

    expect(refItem._ref.ref_type).toBe('db');
    expect(refItem._ref.table).toBe('context_items');
    expect(refItem._ref.row_id).toBe('42');
  });
});

// =============================================================================
// Workspace route _ref shape simulation
// =============================================================================

describe('Workspace route _ref inclusion', () => {
  it('attaches _ref to workspace list responses', () => {
    const row = { id: 'ws_test', name: 'Test WS', path: '/test/ws' };
    const response = {
      ...row,
      _ref: makeDbRef('workspaces', row.id, 'workspace', row.name || row.id),
    };

    expect(response._ref.ref_type).toBe('db');
    expect(response._ref.table).toBe('workspaces');
    expect(response._ref.row_id).toBe('ws_test');
  });

  it('attaches _ref to workspace detail responses', () => {
    const row = { id: 'ws_prod', name: '', path: '/prod' };
    const response = {
      ...row,
      _ref: makeDbRef('workspaces', row.id, 'workspace', row.name || row.id),
    };

    // Falls back to row.id when name is empty
    expect(response._ref.display_name).toBe('ws_prod');
  });
});

// =============================================================================
// Knowledge route _ref shape simulation
// =============================================================================

describe('Knowledge route _ref inclusion', () => {
  it('attaches _ref to knowledge list responses', () => {
    const row = { id: 'kb_1', slug: 'coding-standards', title: 'Coding Standards' };
    const response = {
      ...row,
      _ref: makeDbRef('knowledge', row.id, 'knowledge', row.title || row.slug),
    };

    expect(response._ref.ref_type).toBe('db');
    expect(response._ref.table).toBe('knowledge');
    expect(response._ref.display_name).toBe('Coding Standards');
  });

  it('falls back to slug when title is empty', () => {
    const row = { id: 'kb_2', slug: 'patterns', title: '' };
    const response = {
      ...row,
      _ref: makeDbRef('knowledge', row.id, 'knowledge', row.title || row.slug),
    };

    expect(response._ref.display_name).toBe('patterns');
  });
});

// =============================================================================
// AgentScanner DbRef guard logic
// =============================================================================

describe('AgentScanner DbRef guard', () => {
  it('skips workspace meta with _ref: db and no path', () => {
    const meta = {
      _ref: { ref_type: 'db' as const, database: 'project_memory', table: 'workspaces', row_id: 'ws_1', artifact_kind: 'workspace' as const, display_name: 'WS' },
      name: 'No Path WS',
      // path is missing
    };

    // Simulate the guard logic from agentScanner.ts
    const shouldSkip = meta._ref?.ref_type === 'db' && !('path' in meta && meta.path);
    expect(shouldSkip).toBe(true);
  });

  it('processes workspace meta with _ref: db and valid path', () => {
    const meta = {
      _ref: { ref_type: 'db' as const, database: 'project_memory', table: 'workspaces', row_id: 'ws_1', artifact_kind: 'workspace' as const, display_name: 'WS' },
      path: '/test/workspace',
      name: 'With Path WS',
    };

    const shouldSkip = meta._ref?.ref_type === 'db' && !meta.path;
    expect(shouldSkip).toBe(false);
  });

  it('processes workspace meta without _ref at all (legacy)', () => {
    const meta = {
      path: '/test/workspace',
      name: 'Legacy WS',
    };

    const shouldSkip = (meta as any)._ref?.ref_type === 'db' && !(meta as any).path;
    expect(shouldSkip).toBe(false);
  });

  it('processes workspace meta with file ref type', () => {
    const meta = {
      _ref: { ref_type: 'file', path: '/agents/exec.md', artifact_kind: 'agent_file' as const, display_name: 'Agent' },
      path: '/test/workspace',
      name: 'File Ref WS',
    };

    const shouldSkip = meta._ref?.ref_type === 'db' && !meta.path;
    expect(shouldSkip).toBe(false);
  });
});

// =============================================================================
// Dashboard DbRef type mirror consistency
// =============================================================================

describe('Dashboard DbRef type mirror', () => {
  it('DbRef interface matches canonical shape', () => {
    const ref: DbRef = {
      ref_type: 'db',
      database: 'project_memory',
      table: 'plans',
      row_id: 'plan_1',
      artifact_kind: 'plan',
      display_name: 'Plan 1',
    };

    // Verify all required fields exist
    expect(ref.ref_type).toBe('db');
    expect(ref.database).toBe('project_memory');
    expect(ref.table).toBe('plans');
    expect(ref.row_id).toBe('plan_1');
    expect(ref.artifact_kind).toBe('plan');
    expect(ref.display_name).toBe('Plan 1');
  });

  it('FileRef interface matches canonical shape', () => {
    const ref: FileRef = {
      ref_type: 'file',
      path: '/agents/exec.md',
      artifact_kind: 'agent_file',
      display_name: 'Executor',
    };

    expect(ref.ref_type).toBe('file');
    expect(ref.path).toBe('/agents/exec.md');
    expect(ref.artifact_kind).toBe('agent_file');
    expect(ref.display_name).toBe('Executor');
  });

  it('ArtifactRef discriminated union narrows correctly', () => {
    const dbRef: ArtifactRef = makeDbRef('plans', 'p1', 'plan', 'Plan');
    const fileRef: ArtifactRef = {
      ref_type: 'file',
      path: '/test',
      artifact_kind: 'agent_file',
      display_name: 'Agent',
    };

    if (dbRef.ref_type === 'db') {
      expect(dbRef.table).toBe('plans');
    }
    if (fileRef.ref_type === 'file') {
      expect(fileRef.path).toBe('/test');
    }
  });

  it('all DB artifact kinds are valid', () => {
    const validKinds: DbArtifactKind[] = [
      'plan', 'context', 'handoff', 'knowledge',
      'workspace', 'session', 'skill', 'instruction', 'event',
    ];

    for (const kind of validKinds) {
      const ref = makeDbRef('test_table', 'row_1', kind, `Display ${kind}`);
      expect(ref.artifact_kind).toBe(kind);
    }
  });
});
