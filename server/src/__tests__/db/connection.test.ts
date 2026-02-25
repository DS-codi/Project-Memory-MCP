/**
 * Tests: DB connection manager and migration runner.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb } from './fixtures.js';
import { getDb, getDbPath } from '../../db/connection.js';
import { runMigrations, migrationStatus } from '../../db/migration-runner.js';

describe('connection', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('opens the database and returns the singleton', () => {
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
    expect(db1.open).toBe(true);
  });

  it('sets WAL journal mode', () => {
    const db = getDb();
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(row.journal_mode).toBe('wal');
  });

  it('enforces foreign key constraints', () => {
    const db = getDb();
    const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
  });

  it('sets busy timeout', () => {
    const db = getDb();
    const row = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };
    expect(row.timeout).toBeGreaterThan(0);
  });

  it('reports a non-null DB path after opening', () => {
    expect(getDbPath()).not.toBeNull();
    expect(getDbPath()).toMatch(/project-memory\.db$/);
  });
});

describe('migration-runner', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('creates the _migrations tracking table', () => {
    const db = getDb();
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    ).get();
    expect(row).toBeTruthy();
  });

  it('applies 001-initial-schema.sql', () => {
    const statuses = migrationStatus();
    const applied = statuses.find(s => s.filename === '001-initial-schema.sql');
    expect(applied).toBeDefined();
    expect(applied?.applied).toBe(true);
  });

  it('creates expected tables', () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map(t => t.name);
    expect(names).toContain('workspaces');
    expect(names).toContain('plans');
    expect(names).toContain('phases');
    expect(names).toContain('steps');
    expect(names).toContain('sessions');
    expect(names).toContain('lineage');
    expect(names).toContain('plans_archive');
    expect(names).toContain('steps_archive');
  });

  it('is idempotent — running again does not re-apply migrations', () => {
    const before = migrationStatus();
    runMigrations();
    const after  = migrationStatus();
    expect(after).toHaveLength(before.length);
    // Applied timestamps exist
    expect(after[0]?.appliedAt).toBe(before[0]?.appliedAt);
  });
});
