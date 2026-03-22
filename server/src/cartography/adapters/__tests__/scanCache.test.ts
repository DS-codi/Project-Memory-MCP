import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema, getCached, setCached, evict } from '../scanCache.js';

describe('scanCache', () => {
  it('round-trips a cached result', () => {
    const db = new Database(':memory:');
    ensureSchema(db);

    const mockResult = { files: [], diagnostics: { file_count: 42 } };
    setCached(db, '/workspace', 'abc123', 'summary', mockResult, 1500);

    const retrieved = getCached(db, '/workspace', 'abc123', 'summary');
    expect(retrieved).toEqual(mockResult);
  });

  it('returns null for cache miss', () => {
    const db = new Database(':memory:');
    ensureSchema(db);

    const result = getCached(db, '/workspace', 'abc123', 'summary');
    expect(result).toBeNull();
  });

  it('evicts old entries', () => {
    const db = new Database(':memory:');
    ensureSchema(db);

    // Insert with very old timestamp
    db.prepare(
      `INSERT INTO scan_cache (workspace_path, git_head, scan_mode, result_json, created_at, elapsed_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('/workspace', 'old123', 'summary', '{}', 0, 100);

    evict(db);

    const result = getCached(db, '/workspace', 'old123', 'summary');
    expect(result).toBeNull();
  });

  it('cache miss when git HEAD changes', () => {
    const db = new Database(':memory:');
    ensureSchema(db);

    setCached(db, '/workspace', 'head1', 'summary', { data: 1 }, 100);
    const result = getCached(db, '/workspace', 'head2', 'summary');
    expect(result).toBeNull();
  });
});
