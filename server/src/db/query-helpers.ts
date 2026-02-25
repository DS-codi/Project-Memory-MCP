/**
 * Generic typed query helpers.
 *
 * Thin wrappers around `better-sqlite3` that add TypeScript generics,
 * making query results narrowly typed without repeating casts everywhere.
 */

import type { RunResult } from 'better-sqlite3';
import { getDb } from './connection.js';

// Re-export RunResult so callers don't need to import better-sqlite3 directly.
export type { RunResult };

// ---------------------------------------------------------------------------
// Single-row query
// ---------------------------------------------------------------------------

/**
 * Execute a SELECT and return the first row cast to `T`, or `undefined`
 * if no rows matched.
 *
 * @example
 *   const ws = queryOne<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [id]);
 */
export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

// ---------------------------------------------------------------------------
// Multi-row query
// ---------------------------------------------------------------------------

/**
 * Execute a SELECT and return all matching rows cast to `T`.
 *
 * @example
 *   const plans = queryAll<PlanRow>('SELECT * FROM plans WHERE workspace_id = ?', [wsId]);
 */
export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

// ---------------------------------------------------------------------------
// Mutation (INSERT / UPDATE / DELETE)
// ---------------------------------------------------------------------------

/**
 * Execute an INSERT, UPDATE, or DELETE statement.
 *
 * @returns `RunResult` with `lastInsertRowid` and `changes` properties.
 *
 * @example
 *   const result = run('INSERT INTO tools (id, name) VALUES (?, ?)', [id, name]);
 */
export function run(sql: string, params: unknown[] = []): RunResult {
  return getDb().prepare(sql).run(...params);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * Wrap `fn` in an immediate SQLite transaction.
 *
 * If `fn` throws, the transaction is automatically rolled back and the
 * error is re-thrown.  Otherwise, the transaction is committed and the
 * return value of `fn` is returned.
 *
 * @example
 *   const result = transaction(() => {
 *     run('UPDATE plans SET status = ? WHERE id = ?', ['archived', planId]);
 *     run('INSERT INTO plans_archive SELECT * FROM plans WHERE id = ?', [planId]);
 *     run('DELETE FROM plans WHERE id = ?', [planId]);
 *     return 'ok';
 *   });
 */
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

// ---------------------------------------------------------------------------
// Utility: generate a compact unique ID
// ---------------------------------------------------------------------------

/**
 * Generate a compact random ID (16 hex chars).
 *
 * Uses `crypto.randomUUID()` and strips hyphens.  Suitable for primary
 * keys of new rows.
 */
export function newId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}

/**
 * Return the current UTC datetime as an ISO-8601 string, compatible with
 * SQLite's `datetime()` format: `YYYY-MM-DD HH:MM:SS`.
 */
export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}
