/**
 * Knowledge file CRUD (workspace-scoped).
 */

import type { KnowledgeRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface StoreKnowledgeOptions {
  category?:        string | null;
  tags?:            string[] | null;
  created_by_agent?: string | null;
  created_by_plan?:  string | null;
}

export function storeKnowledge(
  workspaceId: string,
  slug:        string,
  title:       string,
  data:        object,
  opts:        StoreKnowledgeOptions = {}
): KnowledgeRow {
  const existing = getKnowledge(workspaceId, slug);
  const now = nowIso();
  const dataJson = JSON.stringify(data);
  const tagsJson = opts.tags ? JSON.stringify(opts.tags) : null;

  if (existing) {
    run(
      `UPDATE knowledge
       SET title = ?, data = ?, category = ?, tags = ?,
           created_by_agent = ?, created_by_plan = ?, updated_at = ?
       WHERE workspace_id = ? AND slug = ?`,
      [
        title, dataJson, opts.category ?? null, tagsJson,
        opts.created_by_agent ?? null, opts.created_by_plan ?? null,
        now, workspaceId, slug,
      ]
    );
    return getKnowledge(workspaceId, slug)!;
  }

  const id = newId();
  run(
    `INSERT INTO knowledge
      (id, workspace_id, slug, title, data, category, tags, created_by_agent, created_by_plan, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, workspaceId, slug, title, dataJson,
      opts.category ?? null, tagsJson,
      opts.created_by_agent ?? null, opts.created_by_plan ?? null,
      now, now,
    ]
  );
  return getKnowledge(workspaceId, slug)!;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getKnowledge(workspaceId: string, slug: string): KnowledgeRow | null {
  return queryOne<KnowledgeRow>(
    'SELECT * FROM knowledge WHERE workspace_id = ? AND slug = ?',
    [workspaceId, slug]
  ) ?? null;
}

export function listKnowledge(workspaceId: string, category?: string): KnowledgeRow[] {
  if (category) {
    return queryAll<KnowledgeRow>(
      'SELECT * FROM knowledge WHERE workspace_id = ? AND category = ? ORDER BY slug',
      [workspaceId, category]
    );
  }
  return queryAll<KnowledgeRow>(
    'SELECT * FROM knowledge WHERE workspace_id = ? ORDER BY slug',
    [workspaceId]
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteKnowledge(workspaceId: string, slug: string): void {
  run('DELETE FROM knowledge WHERE workspace_id = ? AND slug = ?', [workspaceId, slug]);
}
