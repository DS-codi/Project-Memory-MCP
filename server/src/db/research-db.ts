/**
 * Research document storage — polymorphic parent (workspace, plan, phase, step).
 */

import type { ResearchDocumentRow } from './types.js';
import { queryOne, queryAll, run, nowIso } from './query-helpers.js';

export type ResearchParentType = 'workspace' | 'plan' | 'phase' | 'step';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Append `content` to a research document identified by
 * (workspaceId, parentType, parentId, filename).
 *
 * Creates the document if it does not exist; otherwise appends with a
 * newline separator.
 *
 * @param workspaceId  Owning workspace
 * @param parentType   'workspace' | 'plan' | 'phase' | 'step'
 * @param parentId     ID of the parent entity (null only allowed for workspace-level)
 * @param filename     Filename (e.g. 'codebase-analysis.md')
 * @param content      Text to append
 */
export function appendResearch(
  workspaceId: string,
  parentType:  ResearchParentType,
  parentId:    string | null,
  filename:    string,
  content:     string
): void {
  const existing = getResearchDoc(workspaceId, parentType, parentId, filename);
  const now = nowIso();

  if (existing) {
    const merged = existing.content ? `${existing.content}\n${content}` : content;
    run(
      'UPDATE research_documents SET content = ?, updated_at = ? WHERE id = ?',
      [merged, now, existing.id]
    );
  } else {
    run(
      `INSERT INTO research_documents
         (workspace_id, parent_type, parent_id, filename, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [workspaceId, parentType, parentId ?? null, filename, content, now, now]
    );
  }
}

// Backward-compat wrapper — plan-scoped research.
export function appendPlanResearch(
  planId:      string,
  workspaceId: string,
  filename:    string,
  content:     string
): void {
  appendResearch(workspaceId, 'plan', planId, filename, content);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function getResearchDoc(
  workspaceId: string,
  parentType:  ResearchParentType,
  parentId:    string | null,
  filename:    string
): ResearchDocumentRow | null {
  if (parentId !== null) {
    return queryOne<ResearchDocumentRow>(
      `SELECT * FROM research_documents
       WHERE workspace_id = ? AND parent_type = ? AND parent_id = ? AND filename = ?`,
      [workspaceId, parentType, parentId, filename]
    ) ?? null;
  }
  return queryOne<ResearchDocumentRow>(
    `SELECT * FROM research_documents
     WHERE workspace_id = ? AND parent_type = ? AND parent_id IS NULL AND filename = ?`,
    [workspaceId, parentType, filename]
  ) ?? null;
}

export function getResearch(
  workspaceId: string,
  parentType:  ResearchParentType,
  parentId:    string | null,
  filename:    string
): string | null {
  return getResearchDoc(workspaceId, parentType, parentId, filename)?.content ?? null;
}

export function listResearch(
  workspaceId: string,
  parentType:  ResearchParentType,
  parentId:    string | null
): string[] {
  if (parentId !== null) {
    const rows = queryAll<{ filename: string }>(
      `SELECT filename FROM research_documents
       WHERE workspace_id = ? AND parent_type = ? AND parent_id = ?
       ORDER BY filename`,
      [workspaceId, parentType, parentId]
    );
    return rows.map(r => r.filename);
  }
  const rows = queryAll<{ filename: string }>(
    `SELECT filename FROM research_documents
     WHERE workspace_id = ? AND parent_type = ? AND parent_id IS NULL
     ORDER BY filename`,
    [workspaceId, parentType]
  );
  return rows.map(r => r.filename);
}

// Backward-compat wrapper — plan-scoped research listing.
export function listPlanResearch(planId: string, workspaceId: string): string[] {
  return listResearch(workspaceId, 'plan', planId);
}

export function listWorkspaceResearch(workspaceId: string): ResearchDocumentRow[] {
  return queryAll<ResearchDocumentRow>(
    `SELECT * FROM research_documents
     WHERE workspace_id = ? AND (parent_type = 'workspace' OR parent_id IS NULL)
     ORDER BY filename`,
    [workspaceId]
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteResearch(
  workspaceId: string,
  parentType:  ResearchParentType,
  parentId:    string | null,
  filename:    string
): void {
  if (parentId !== null) {
    run(
      `DELETE FROM research_documents
       WHERE workspace_id = ? AND parent_type = ? AND parent_id = ? AND filename = ?`,
      [workspaceId, parentType, parentId, filename]
    );
  } else {
    run(
      `DELETE FROM research_documents
       WHERE workspace_id = ? AND parent_type = ? AND parent_id IS NULL AND filename = ?`,
      [workspaceId, parentType, filename]
    );
  }
}
