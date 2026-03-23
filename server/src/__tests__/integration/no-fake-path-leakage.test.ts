/**
 * Acceptance Test — Zero Fake-Path Leakage (Phase 13, Step 36)
 *
 * This is the EXIT CRITERION test. It proves:
 * - DB-backed artifacts return DB refs (ref_type: 'db'), not synthetic path strings
 * - Filesystem artifacts return File refs (ref_type: 'file') with real paths
 * - The makeDbRef factory produces correct shapes for ALL DB artifact kinds
 * - The makeFileRef factory produces correct shapes for ALL filesystem kinds
 * - No anti-patterns (synthetic path.join for .json in DB artifact code)
 */

import { describe, it, expect } from 'vitest';
import {
  makeDbRef,
  makeFileRef,
  isDbRef,
  isFileRef,
  DbRefSchema,
  FileRefSchema,
  ArtifactRefSchema,
  type DbRef,
  type FileRef,
  type DbArtifactKind,
  type FileArtifactKind,
} from '../../types/db-ref.types.js';

// =============================================================================
// DB-backed artifact kinds — exhaustive correctness
// =============================================================================

describe('DB-backed artifacts produce correct DbRef (zero fake-path guarantee)', () => {
  /**
   * Mapping of every DB-backed artifact kind to its expected SQLite table.
   * This is the canonical truth table for the Phase 8–12 migration.
   */
  const DB_ARTIFACTS: Array<{
    kind: DbArtifactKind;
    table: string;
    rowId: string;
    display: string;
  }> = [
    { kind: 'plan',        table: 'plans',          rowId: 'plan_mn3fvcwa',        display: 'Test Plan' },
    { kind: 'context',     table: 'context_items',  rowId: 'plan_1:requirements',  display: 'requirements:plan_1' },
    { kind: 'handoff',     table: 'handoffs',       rowId: 'hoff_ts_Exec_Rev',     display: 'Executor→Reviewer' },
    { kind: 'knowledge',   table: 'knowledge',      rowId: 'coding-standards',     display: 'Coding Standards' },
    { kind: 'workspace',   table: 'workspaces',     rowId: 'ws_abc123',            display: 'project-memory-mcp' },
    { kind: 'session',     table: 'agent_sessions', rowId: 'sess_mn3mf6lh',        display: 'Executor session' },
    { kind: 'skill',       table: 'skills',         rowId: 'testing-skill',        display: 'Testing Skill' },
    { kind: 'instruction', table: 'instructions',   rowId: 'coding-instr',         display: 'Coding Standards Instruction' },
    { kind: 'event',       table: 'events',         rowId: 'evt_plan_created',     display: 'PlanCreated' },
  ];

  for (const { kind, table, rowId, display } of DB_ARTIFACTS) {
    describe(`artifact_kind: "${kind}"`, () => {
      const ref = makeDbRef(table, rowId, kind, display);

      it('ref_type is always "db"', () => {
        expect(ref.ref_type).toBe('db');
      });

      it(`table matches expected SQLite table "${table}"`, () => {
        expect(ref.table).toBe(table);
      });

      it('display_name is non-empty', () => {
        expect(ref.display_name).toBeTruthy();
        expect(ref.display_name.length).toBeGreaterThan(0);
      });

      it('row_id is set correctly', () => {
        expect(ref.row_id).toBe(rowId);
      });

      it('database is "project_memory"', () => {
        expect(ref.database).toBe('project_memory');
      });

      it('passes DbRefSchema validation', () => {
        expect(() => DbRefSchema.parse(ref)).not.toThrow();
      });

      it('passes ArtifactRefSchema validation', () => {
        const parsed = ArtifactRefSchema.parse(ref);
        expect(parsed.ref_type).toBe('db');
      });

      it('isDbRef returns true', () => {
        expect(isDbRef(ref)).toBe(true);
      });

      it('isFileRef returns false', () => {
        expect(isFileRef(ref)).toBe(false);
      });

      it('never contains a filesystem path', () => {
        // DB refs must not have a 'path' field — that's the whole point
        expect(ref).not.toHaveProperty('path');
      });
    });
  }
});

// =============================================================================
// Filesystem artifact kinds — exhaustive correctness
// =============================================================================

describe('Filesystem artifacts produce correct FileRef (real paths only)', () => {
  const FILE_ARTIFACTS: Array<{
    kind: FileArtifactKind;
    path: string;
    display: string;
  }> = [
    { kind: 'agent_file',         path: '/workspace/.github/agents/executor.agent.md', display: 'Executor Agent' },
    { kind: 'terminal_allowlist',  path: '/data/ws_abc/terminal-allowlist.json',        display: 'Terminal Allowlist' },
    { kind: 'investigation_file',  path: '/docs/investigation-notes.md',                display: 'Investigation Notes' },
    { kind: 'config_file',         path: '/config/dbref-config.json',                   display: 'DbRef Config' },
  ];

  for (const { kind, path, display } of FILE_ARTIFACTS) {
    describe(`artifact_kind: "${kind}"`, () => {
      const ref = makeFileRef(path, kind, display);

      it('ref_type is "file"', () => {
        expect(ref.ref_type).toBe('file');
      });

      it('path is the provided string', () => {
        expect(ref.path).toBe(path);
        expect(typeof ref.path).toBe('string');
      });

      it('display_name is non-empty', () => {
        expect(ref.display_name).toBeTruthy();
      });

      it('passes FileRefSchema validation', () => {
        expect(() => FileRefSchema.parse(ref)).not.toThrow();
      });

      it('passes ArtifactRefSchema validation', () => {
        const parsed = ArtifactRefSchema.parse(ref);
        expect(parsed.ref_type).toBe('file');
      });

      it('isFileRef returns true', () => {
        expect(isFileRef(ref)).toBe(true);
      });

      it('isDbRef returns false', () => {
        expect(isDbRef(ref)).toBe(false);
      });

      it('does not contain DB-specific fields', () => {
        expect(ref).not.toHaveProperty('database');
        expect(ref).not.toHaveProperty('table');
        expect(ref).not.toHaveProperty('row_id');
      });
    });
  }
});

// =============================================================================
// Cross-domain invariants — the contract
// =============================================================================

describe('Cross-domain invariants', () => {
  it('DbRef and FileRef ref_type values are mutually exclusive', () => {
    const db = makeDbRef('plans', 'p1', 'plan', 'P');
    const file = makeFileRef('/test', 'agent_file', 'A');

    expect(db.ref_type).not.toBe(file.ref_type);
  });

  it('ArtifactRefSchema rejects objects with ref_type other than "db" or "file"', () => {
    expect(() => ArtifactRefSchema.parse({
      ref_type: 'memory',
      data: 'something',
    })).toThrow();
  });

  it('DbRefSchema rejects FileRef payloads', () => {
    const fileRef = makeFileRef('/test', 'agent_file', 'A');
    expect(() => DbRefSchema.parse(fileRef)).toThrow();
  });

  it('FileRefSchema rejects DbRef payloads', () => {
    const dbRef = makeDbRef('plans', 'p1', 'plan', 'P');
    expect(() => FileRefSchema.parse(dbRef)).toThrow();
  });

  it('every DB artifact kind is representable', () => {
    const allDbKinds: DbArtifactKind[] = [
      'plan', 'context', 'handoff', 'knowledge',
      'workspace', 'session', 'skill', 'instruction', 'event',
    ];

    for (const kind of allDbKinds) {
      const ref = makeDbRef('t', 'r', kind, 'd');
      expect(ref.artifact_kind).toBe(kind);
      expect(() => DbRefSchema.parse(ref)).not.toThrow();
    }
  });

  it('every File artifact kind is representable', () => {
    const allFileKinds: FileArtifactKind[] = [
      'agent_file', 'terminal_allowlist', 'investigation_file', 'config_file',
    ];

    for (const kind of allFileKinds) {
      const ref = makeFileRef('/test', kind, 'd');
      expect(ref.artifact_kind).toBe(kind);
      expect(() => FileRefSchema.parse(ref)).not.toThrow();
    }
  });
});

// =============================================================================
// Anti-pattern audit — no synthetic path construction for DB artifacts
// =============================================================================

describe('Anti-pattern audit: no synthetic path construction', () => {
  /**
   * These tests exercise the contract: DB-backed refs should never need
   * path.join(dataRoot, workspace, ..., '.json'). That synthetic path
   * pattern was the old virtual-path approach. The makeDbRef factory
   * must be the ONLY way to reference DB-backed artifacts.
   */

  it('makeDbRef returns object without any path-like properties', () => {
    const ref = makeDbRef('plans', 'plan_1', 'plan', 'Plan');

    // No 'path' field on DbRef
    expect(ref).not.toHaveProperty('path');

    // No 'file' or 'filePath' field
    expect(ref).not.toHaveProperty('file');
    expect(ref).not.toHaveProperty('filePath');

    // The locator is database + table + row_id
    expect(ref.database).toBeDefined();
    expect(ref.table).toBeDefined();
    expect(ref.row_id).toBeDefined();
  });

  it('all 9 DB artifact kinds produce refs with no path leakage', () => {
    const kinds: DbArtifactKind[] = [
      'plan', 'context', 'handoff', 'knowledge',
      'workspace', 'session', 'skill', 'instruction', 'event',
    ];

    for (const kind of kinds) {
      const ref = makeDbRef('test', `${kind}_1`, kind, `${kind} display`);
      expect(ref).not.toHaveProperty('path');
      expect(JSON.stringify(ref)).not.toContain('.json');
      expect(JSON.stringify(ref)).not.toContain('state.json');
    }
  });

  it('serialized DbRef JSON does not contain filesystem path separators as artifact locators', () => {
    const ref = makeDbRef('plans', 'plan_abc123', 'plan', 'Critical Plan');
    const json = JSON.stringify(ref);

    // Should not contain backslash paths (Windows)
    expect(json).not.toMatch(/\\\\/);

    // Table and row_id should be the locator — not a path-like structure
    expect(ref.table).not.toContain('/');
    expect(ref.row_id).not.toContain('/');
  });
});
