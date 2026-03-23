/**
 * Integration Test — DbRef Verification (Phase 13, Step 34)
 *
 * Validates that DB-backed artifacts return typed DbRef references
 * and that all type infrastructure (schemas, guards, factories) works correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  makeDbRef,
  makeFileRef,
  isDbRef,
  isFileRef,
  toMcpRef,
  toDisplayString,
  DbRefSchema,
  FileRefSchema,
  ArtifactRefSchema,
  type DbRef,
  type FileRef,
  type ArtifactRef,
  type DbArtifactKind,
  type FileArtifactKind,
} from '../../types/db-ref.types.js';

import { toDeprecatedPath, withRefCompat } from '../../utils/ref-compat.js';
import { getDbRefMode, isDbRefStrictMode } from '../../config/dbref-config.js';

// =============================================================================
// DbRef Factory — makeDbRef
// =============================================================================

describe('makeDbRef factory', () => {
  const DB_ARTIFACT_KINDS: Array<{ kind: DbArtifactKind; table: string; rowId: string; display: string }> = [
    { kind: 'plan', table: 'plans', rowId: 'plan_abc123', display: 'My Plan' },
    { kind: 'context', table: 'context_items', rowId: 'ctx_abc123', display: 'context:plan1' },
    { kind: 'handoff', table: 'handoffs', rowId: 'hoff_abc123', display: 'Executor→Reviewer' },
    { kind: 'knowledge', table: 'knowledge', rowId: 'kb_slug', display: 'Knowledge File' },
    { kind: 'workspace', table: 'workspaces', rowId: 'ws_abc123', display: 'test-workspace' },
    { kind: 'session', table: 'agent_sessions', rowId: 'sess_abc123', display: 'Session 1' },
    { kind: 'skill', table: 'skills', rowId: 'skill_testing', display: 'Testing Skill' },
    { kind: 'instruction', table: 'instructions', rowId: 'instr_01', display: 'Coding Standards' },
    { kind: 'event', table: 'events', rowId: 'evt_abc123', display: 'PlanCreated' },
  ];

  for (const { kind, table, rowId, display } of DB_ARTIFACT_KINDS) {
    it(`produces correct DbRef shape for artifact_kind: "${kind}"`, () => {
      const ref = makeDbRef(table, rowId, kind, display);

      expect(ref).toEqual({
        ref_type: 'db',
        database: 'project_memory',
        table,
        row_id: rowId,
        artifact_kind: kind,
        display_name: display,
      });
    });
  }

  it('includes optional column field when provided', () => {
    const ref = makeDbRef('plans', 'plan_1', 'plan', 'Plan 1', 'title');
    expect(ref.column).toBe('title');
  });

  it('omits column field when not provided', () => {
    const ref = makeDbRef('plans', 'plan_1', 'plan', 'Plan 1');
    expect(ref).not.toHaveProperty('column');
  });
});

// =============================================================================
// makeFileRef Factory
// =============================================================================

describe('makeFileRef factory', () => {
  const FILE_ARTIFACT_KINDS: Array<{ kind: FileArtifactKind; path: string; display: string }> = [
    { kind: 'agent_file', path: '/agents/executor.agent.md', display: 'Executor Agent' },
    { kind: 'terminal_allowlist', path: '/data/terminal-allowlist.json', display: 'Terminal Allowlist' },
    { kind: 'investigation_file', path: '/docs/investigation.md', display: 'Investigation' },
    { kind: 'config_file', path: '/config/settings.json', display: 'Config' },
  ];

  for (const { kind, path, display } of FILE_ARTIFACT_KINDS) {
    it(`produces correct FileRef shape for artifact_kind: "${kind}"`, () => {
      const ref = makeFileRef(path, kind, display);

      expect(ref).toEqual({
        ref_type: 'file',
        path,
        artifact_kind: kind,
        display_name: display,
      });
    });
  }
});

// =============================================================================
// Zod Schema Validation — DbRefSchema
// =============================================================================

describe('DbRefSchema', () => {
  it('validates a well-formed DbRef', () => {
    const valid = {
      ref_type: 'db',
      database: 'project_memory',
      table: 'plans',
      row_id: 'plan_abc123',
      artifact_kind: 'plan',
      display_name: 'My Plan',
    };
    expect(DbRefSchema.parse(valid)).toEqual(valid);
  });

  it('validates a DbRef with optional column field', () => {
    const valid = {
      ref_type: 'db',
      database: 'project_memory',
      table: 'plans',
      row_id: 'plan_abc123',
      column: 'title',
      artifact_kind: 'plan',
      display_name: 'My Plan',
    };
    expect(DbRefSchema.parse(valid)).toEqual(valid);
  });

  it('rejects ref_type: "file"', () => {
    expect(() => DbRefSchema.parse({
      ref_type: 'file',
      database: 'project_memory',
      table: 'plans',
      row_id: 'plan_abc123',
      artifact_kind: 'plan',
      display_name: 'Plan',
    })).toThrow();
  });

  it('rejects empty database', () => {
    expect(() => DbRefSchema.parse({
      ref_type: 'db',
      database: '',
      table: 'plans',
      row_id: 'plan_1',
      artifact_kind: 'plan',
      display_name: 'Plan',
    })).toThrow();
  });

  it('rejects empty table', () => {
    expect(() => DbRefSchema.parse({
      ref_type: 'db',
      database: 'project_memory',
      table: '',
      row_id: 'plan_1',
      artifact_kind: 'plan',
      display_name: 'Plan',
    })).toThrow();
  });

  it('rejects empty row_id', () => {
    expect(() => DbRefSchema.parse({
      ref_type: 'db',
      database: 'project_memory',
      table: 'plans',
      row_id: '',
      artifact_kind: 'plan',
      display_name: 'Plan',
    })).toThrow();
  });

  it('rejects invalid artifact_kind', () => {
    expect(() => DbRefSchema.parse({
      ref_type: 'db',
      database: 'project_memory',
      table: 'plans',
      row_id: 'plan_1',
      artifact_kind: 'invalid_kind',
      display_name: 'Plan',
    })).toThrow();
  });
});

// =============================================================================
// Zod Schema Validation — FileRefSchema
// =============================================================================

describe('FileRefSchema', () => {
  it('validates a well-formed FileRef', () => {
    const valid = {
      ref_type: 'file',
      path: '/agents/executor.agent.md',
      artifact_kind: 'agent_file',
      display_name: 'Executor Agent',
    };
    expect(FileRefSchema.parse(valid)).toEqual(valid);
  });

  it('rejects ref_type: "db"', () => {
    expect(() => FileRefSchema.parse({
      ref_type: 'db',
      path: '/agents/executor.agent.md',
      artifact_kind: 'agent_file',
      display_name: 'Executor Agent',
    })).toThrow();
  });

  it('rejects empty path', () => {
    expect(() => FileRefSchema.parse({
      ref_type: 'file',
      path: '',
      artifact_kind: 'agent_file',
      display_name: 'Agent',
    })).toThrow();
  });

  it('rejects invalid artifact_kind', () => {
    expect(() => FileRefSchema.parse({
      ref_type: 'file',
      path: '/some/file',
      artifact_kind: 'plan',
      display_name: 'File',
    })).toThrow();
  });
});

// =============================================================================
// ArtifactRefSchema — Discriminated Union
// =============================================================================

describe('ArtifactRefSchema discriminated union', () => {
  it('parses a DbRef correctly', () => {
    const dbInput = {
      ref_type: 'db',
      database: 'project_memory',
      table: 'plans',
      row_id: 'plan_1',
      artifact_kind: 'plan',
      display_name: 'Plan 1',
    };
    const result = ArtifactRefSchema.parse(dbInput);
    expect(result.ref_type).toBe('db');
    expect((result as DbRef).table).toBe('plans');
  });

  it('parses a FileRef correctly', () => {
    const fileInput = {
      ref_type: 'file',
      path: '/path/to/file',
      artifact_kind: 'agent_file',
      display_name: 'Agent File',
    };
    const result = ArtifactRefSchema.parse(fileInput);
    expect(result.ref_type).toBe('file');
    expect((result as FileRef).path).toBe('/path/to/file');
  });

  it('rejects unknown ref_type', () => {
    expect(() => ArtifactRefSchema.parse({
      ref_type: 'memory',
      foo: 'bar',
    })).toThrow();
  });
});

// =============================================================================
// Type Guards — isDbRef / isFileRef
// =============================================================================

describe('type guards', () => {
  const dbRef: ArtifactRef = makeDbRef('plans', 'plan_1', 'plan', 'Plan 1');
  const fileRef: ArtifactRef = makeFileRef('/agents/exec.md', 'agent_file', 'Exec');

  describe('isDbRef', () => {
    it('returns true for DbRef', () => {
      expect(isDbRef(dbRef)).toBe(true);
    });

    it('returns false for FileRef', () => {
      expect(isDbRef(fileRef)).toBe(false);
    });
  });

  describe('isFileRef', () => {
    it('returns true for FileRef', () => {
      expect(isFileRef(fileRef)).toBe(true);
    });

    it('returns false for DbRef', () => {
      expect(isFileRef(dbRef)).toBe(false);
    });
  });
});

// =============================================================================
// toMcpRef serialization
// =============================================================================

describe('toMcpRef', () => {
  it('serializes DbRef as flat JSON (no path field)', () => {
    const ref = makeDbRef('plans', 'plan_1', 'plan', 'Plan 1');
    const mcp = toMcpRef(ref);

    expect(mcp).toEqual({
      ref_type: 'db',
      database: 'project_memory',
      table: 'plans',
      row_id: 'plan_1',
      artifact_kind: 'plan',
      display_name: 'Plan 1',
    });
    expect(mcp).not.toHaveProperty('path');
  });

  it('serializes FileRef with path field', () => {
    const ref = makeFileRef('/agents/exec.md', 'agent_file', 'Exec');
    const mcp = toMcpRef(ref);

    expect(mcp).toEqual({
      ref_type: 'file',
      path: '/agents/exec.md',
      artifact_kind: 'agent_file',
      display_name: 'Exec',
    });
  });

  it('includes column for DbRef when present', () => {
    const ref = makeDbRef('plans', 'plan_1', 'plan', 'Plan 1', 'title');
    const mcp = toMcpRef(ref);
    expect(mcp.column).toBe('title');
  });
});

// =============================================================================
// toDisplayString
// =============================================================================

describe('toDisplayString', () => {
  it('formats DbRef as [db:table/id] display', () => {
    const ref = makeDbRef('plans', 'plan_abc', 'plan', 'My Plan');
    expect(toDisplayString(ref)).toBe('[db:plans/plan_abc] My Plan');
  });

  it('formats FileRef as [file:kind] path', () => {
    const ref = makeFileRef('/agents/exec.md', 'agent_file', 'Exec');
    expect(toDisplayString(ref)).toBe('[file:agent_file] /agents/exec.md');
  });
});

// =============================================================================
// ref-compat.ts — toDeprecatedPath
// =============================================================================

describe('toDeprecatedPath', () => {
  it('generates legacy path for plans table', () => {
    const ref = makeDbRef('plans', 'plan_abc', 'plan', 'Plan');
    const legacy = toDeprecatedPath(ref, 'ws_test');
    expect(legacy).toContain('ws_test');
    expect(legacy).toContain('plans');
    expect(legacy).toContain('plan_abc');
    expect(legacy).toMatch(/state\.json$/);
  });

  it('generates legacy path for context_items table', () => {
    const ref = makeDbRef('context_items', 'ctx_abc', 'context', 'Context');
    const legacy = toDeprecatedPath(ref, 'ws_test');
    expect(legacy).toContain('ctx_abc');
    expect(legacy).toMatch(/\.json$/);
  });

  it('generates legacy path for handoffs table', () => {
    const ref = makeDbRef('handoffs', 'hoff_abc', 'handoff', 'Handoff');
    const legacy = toDeprecatedPath(ref, 'ws_test');
    expect(legacy).toContain('handoffs');
    expect(legacy).toContain('hoff_abc');
  });

  it('generates legacy path for knowledge table', () => {
    const ref = makeDbRef('knowledge', 'kb_slug', 'knowledge', 'KB');
    const legacy = toDeprecatedPath(ref, 'ws_test');
    expect(legacy).toContain('knowledge');
    expect(legacy).toContain('kb_slug');
  });

  it('generates legacy path for workspaces table', () => {
    const ref = makeDbRef('workspaces', 'ws_abc', 'workspace', 'Workspace');
    const legacy = toDeprecatedPath(ref, 'ws_test');
    expect(legacy).toContain('workspace.meta.json');
  });

  it('generates legacy path for agent_sessions table', () => {
    const ref = makeDbRef('agent_sessions', 'sess_abc', 'session', 'Session');
    const legacy = toDeprecatedPath(ref, 'ws_test');
    expect(legacy).toContain('sessions');
    expect(legacy).toContain('sess_abc');
  });

  it('falls back to table/row_id.json for unknown tables', () => {
    const ref = makeDbRef('custom_table', 'custom_1', 'event', 'Event');
    const legacy = toDeprecatedPath(ref, 'ws_test');
    expect(legacy).toContain('custom_table');
    expect(legacy).toContain('custom_1.json');
  });

  it('uses "unknown-workspace" when no workspaceId provided', () => {
    const ref = makeDbRef('plans', 'plan_1', 'plan', 'Plan');
    const legacy = toDeprecatedPath(ref);
    expect(legacy).toContain('unknown-workspace');
  });
});

// =============================================================================
// ref-compat.ts — withRefCompat
// =============================================================================

describe('withRefCompat', () => {
  it('adds path field for DbRef _ref', () => {
    const ref = makeDbRef('plans', 'plan_1', 'plan', 'Plan 1');
    const response = { _ref: ref, success: true };
    const compat = withRefCompat(response, 'ws_test');

    expect(compat.path).toBeDefined();
    expect(typeof compat.path).toBe('string');
    expect(compat._ref).toEqual(ref);
  });

  it('uses FileRef.path directly for file refs', () => {
    const ref = makeFileRef('/agents/exec.md', 'agent_file', 'Exec');
    const response = { _ref: ref, success: true };
    const compat = withRefCompat(response);

    expect(compat.path).toBe('/agents/exec.md');
  });

  it('returns unchanged when no _ref present', () => {
    const response = { success: true, data: 'test' };
    const compat = withRefCompat(response);

    expect(compat).not.toHaveProperty('path');
    expect(compat.success).toBe(true);
  });
});

// =============================================================================
// dbref-config.ts — getDbRefMode / isDbRefStrictMode
// =============================================================================

describe('dbref-config', () => {
  const originalEnv = process.env.PM_DBREF_MODE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PM_DBREF_MODE = originalEnv;
    } else {
      delete process.env.PM_DBREF_MODE;
    }
  });

  describe('getDbRefMode', () => {
    it('returns "compat" by default (unset env)', () => {
      delete process.env.PM_DBREF_MODE;
      expect(getDbRefMode()).toBe('compat');
    });

    it('returns "compat" when PM_DBREF_MODE=compat', () => {
      process.env.PM_DBREF_MODE = 'compat';
      expect(getDbRefMode()).toBe('compat');
    });

    it('returns "strict" when PM_DBREF_MODE=strict', () => {
      process.env.PM_DBREF_MODE = 'strict';
      expect(getDbRefMode()).toBe('strict');
    });

    it('falls back to "compat" for unrecognised values', () => {
      process.env.PM_DBREF_MODE = 'invalid';
      expect(getDbRefMode()).toBe('compat');
    });
  });

  describe('isDbRefStrictMode', () => {
    it('returns false in compat mode', () => {
      process.env.PM_DBREF_MODE = 'compat';
      expect(isDbRefStrictMode()).toBe(false);
    });

    it('returns true in strict mode', () => {
      process.env.PM_DBREF_MODE = 'strict';
      expect(isDbRefStrictMode()).toBe(true);
    });

    it('returns false when env unset', () => {
      delete process.env.PM_DBREF_MODE;
      expect(isDbRefStrictMode()).toBe(false);
    });
  });
});
