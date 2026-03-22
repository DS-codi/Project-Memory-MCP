/**
 * scanCache.ts
 *
 * SQLite-backed result cache for cartographer scan results.
 * Cache key: (workspace_path, git_head, scan_mode)
 * Invalidation: git HEAD change; TTL: 24h; size limit: 50MB per row eviction.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export type CartographerDb = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scan_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_path TEXT    NOT NULL,
  git_head       TEXT    NOT NULL,
  scan_mode      TEXT    NOT NULL,
  result_json    TEXT    NOT NULL,
  created_at     INTEGER NOT NULL,
  elapsed_ms     INTEGER NOT NULL,
  UNIQUE (workspace_path, git_head, scan_mode)
);
CREATE INDEX IF NOT EXISTS idx_scan_cache_lookup
  ON scan_cache (workspace_path, git_head, scan_mode);
`;

const TTL_MS = 86_400_000;        // 24h
const MAX_ROW_BYTES = 52_428_800; // 50 MB

export function openDb(workspacePath: string): CartographerDb {
  const dbDir = path.join(workspacePath, '.projectmemory', 'cartographer');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, 'cache.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  ensureSchema(db);
  return db;
}

export function ensureSchema(db: CartographerDb): void {
  db.exec(SCHEMA);
}

export function getCached(
  db: CartographerDb,
  workspacePath: string,
  gitHead: string,
  scanMode: string,
): object | null {
  const row = db.prepare(
    'SELECT result_json FROM scan_cache WHERE workspace_path = ? AND git_head = ? AND scan_mode = ?'
  ).get(workspacePath, gitHead, scanMode) as { result_json: string } | undefined;

  if (!row) return null;

  try {
    return JSON.parse(row.result_json) as object;
  } catch {
    return null;
  }
}

export function setCached(
  db: CartographerDb,
  workspacePath: string,
  gitHead: string,
  scanMode: string,
  result: object,
  elapsedMs: number,
): void {
  const resultJson = JSON.stringify(result);
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO scan_cache
       (workspace_path, git_head, scan_mode, result_json, created_at, elapsed_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(workspacePath, gitHead, scanMode, resultJson, now, elapsedMs);
}

export function evict(db: CartographerDb): void {
  const cutoff = Date.now() - TTL_MS;
  db.prepare(
    'DELETE FROM scan_cache WHERE created_at < ? OR length(result_json) > ?'
  ).run(cutoff, MAX_ROW_BYTES);
}
