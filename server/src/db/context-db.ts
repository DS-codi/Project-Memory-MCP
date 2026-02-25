/**
 * Polymorphic context CRUD + full-text search.
 *
 * Context items are attached to workspaces, plans, phases, or steps
 * via `(parent_type, parent_id)`.
 */

import type { ContextItemRow, ContextParentType } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function storeContext(
  parentType: ContextParentType,
  parentId:   string,
  type:       string,
  data:       object
): ContextItemRow {
  // Upsert: if a row with the same (parent_type, parent_id, type) exists,
  // replace its data and bump updated_at.
  const existing = queryOne<ContextItemRow>(
    'SELECT * FROM context_items WHERE parent_type = ? AND parent_id = ? AND type = ?',
    [parentType, parentId, type]
  );

  const now = nowIso();
  const dataJson = JSON.stringify(data);

  if (existing) {
    run(
      'UPDATE context_items SET data = ?, updated_at = ? WHERE id = ?',
      [dataJson, now, existing.id]
    );
    return { ...existing, data: dataJson, updated_at: now };
  }

  const id = newId();
  run(
    `INSERT INTO context_items (id, parent_type, parent_id, type, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, parentType, parentId, type, dataJson, now, now]
  );
  return {
    id,
    parent_type: parentType,
    parent_id:   parentId,
    type,
    data:        dataJson,
    created_at:  now,
    updated_at:  now,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getContext(
  parentType: ContextParentType,
  parentId:   string,
  type?:      string
): ContextItemRow[] {
  if (type) {
    return queryAll<ContextItemRow>(
      'SELECT * FROM context_items WHERE parent_type = ? AND parent_id = ? AND type = ?',
      [parentType, parentId, type]
    );
  }
  return queryAll<ContextItemRow>(
    'SELECT * FROM context_items WHERE parent_type = ? AND parent_id = ? ORDER BY created_at',
    [parentType, parentId]
  );
}

export function getContextItem(id: string): ContextItemRow | null {
  return queryOne<ContextItemRow>('SELECT * FROM context_items WHERE id = ?', [id]) ?? null;
}

export function listContextTypes(
  parentType: ContextParentType,
  parentId:   string
): string[] {
  const rows = queryAll<{ type: string }>(
    'SELECT DISTINCT type FROM context_items WHERE parent_type = ? AND parent_id = ?',
    [parentType, parentId]
  );
  return rows.map(r => r.type);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchContextOptions {
  parentType?: ContextParentType;
  parentId?:   string;
  type?:       string;
  since?:      string;  // ISO datetime
  limit?:      number;
}

/**
 * Search context items by a substring match against the JSON `data` column.
 *
 * For future performance improvement, this can be upgraded to FTS5 virtual
 * tables.  For now a LIKE search is sufficient for typical plan sizes.
 */
export function searchContext(
  query:   string,
  opts:    SearchContextOptions = {}
): ContextItemRow[] {
  const conditions: string[] = ['data LIKE ?'];
  const params: unknown[] = [`%${query}%`];

  if (opts.parentType) { conditions.push('parent_type = ?'); params.push(opts.parentType); }
  if (opts.parentId)   { conditions.push('parent_id = ?');   params.push(opts.parentId); }
  if (opts.type)       { conditions.push('type = ?');        params.push(opts.type); }
  if (opts.since)      { conditions.push('created_at >= ?'); params.push(opts.since); }

  const limit = opts.limit ?? 50;
  params.push(limit);

  return queryAll<ContextItemRow>(
    `SELECT * FROM context_items WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`,
    params
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteContext(id: string): void {
  run('DELETE FROM context_items WHERE id = ?', [id]);
}

export function deleteAllContext(
  parentType: ContextParentType,
  parentId:   string
): void {
  run('DELETE FROM context_items WHERE parent_type = ? AND parent_id = ?', [parentType, parentId]);
}
