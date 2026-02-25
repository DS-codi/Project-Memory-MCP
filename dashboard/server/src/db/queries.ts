/**
 * dashboard/server/src/db/queries.ts
 *
 * Read-only prepared-statement helpers for the dashboard API routes.
 * These replace the old file-scanner approach with direct SQLite queries.
 *
 * All functions call `getDb()` lazily so the connection is opened on first use
 * and shared across requests.
 */

import { getDb } from './connection.js';
import type {
  WorkspaceRow,
  PlanRow,
  PhaseRow,
  StepRow,
  SessionRow,
  LineageRow,
  PlanNoteRow,
  ContextItemRow,
  KnowledgeRow,
  EventLogRow,
  BuildScriptRow,
  ProgramPlanRow,
} from './types.js';

// Re-export the types so routes only need to import from one place
export type {
  WorkspaceRow,
  PlanRow,
  PhaseRow,
  StepRow,
  SessionRow,
  LineageRow,
  PlanNoteRow,
  ContextItemRow,
  KnowledgeRow,
  EventLogRow,
  BuildScriptRow,
  ProgramPlanRow,
};

// ============================================================
// WORKSPACES
// ============================================================

export function listWorkspaces(): WorkspaceRow[] {
  return getDb()
    .prepare('SELECT * FROM workspaces ORDER BY registered_at DESC')
    .all() as WorkspaceRow[];
}

export function getWorkspace(id: string): WorkspaceRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(id) as WorkspaceRow | undefined) ?? null
  );
}

// ============================================================
// PLANS
// ============================================================

export function getPlansByWorkspace(workspaceId: string, includeArchived = false): PlanRow[] {
  const sql = includeArchived
    ? 'SELECT * FROM plans WHERE workspace_id = ? ORDER BY created_at DESC'
    : "SELECT * FROM plans WHERE workspace_id = ? AND status != 'archived' ORDER BY created_at DESC";
  return getDb().prepare(sql).all(workspaceId) as PlanRow[];
}

export function getPlan(planId: string): PlanRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM plans WHERE id = ?')
      .get(planId) as PlanRow | undefined) ?? null
  );
}

export function getAllPlans(includeArchived = false): PlanRow[] {
  const sql = includeArchived
    ? 'SELECT * FROM plans ORDER BY created_at DESC'
    : "SELECT * FROM plans WHERE status != 'archived' ORDER BY created_at DESC";
  return getDb().prepare(sql).all() as PlanRow[];
}

export function getPlanPhases(planId: string): PhaseRow[] {
  return getDb()
    .prepare('SELECT * FROM phases WHERE plan_id = ? ORDER BY order_index ASC')
    .all(planId) as PhaseRow[];
}

export function getPlanSteps(planId: string): StepRow[] {
  return getDb()
    .prepare('SELECT * FROM steps WHERE plan_id = ? ORDER BY order_index ASC')
    .all(planId) as StepRow[];
}

export function getPlanSessions(planId: string, limit = 20): SessionRow[] {
  return getDb()
    .prepare(
      'SELECT * FROM sessions WHERE plan_id = ? ORDER BY started_at DESC LIMIT ?'
    )
    .all(planId, limit) as SessionRow[];
}

export function getPlanLineage(planId: string): LineageRow[] {
  return getDb()
    .prepare('SELECT * FROM lineage WHERE plan_id = ? ORDER BY timestamp ASC')
    .all(planId) as LineageRow[];
}

export function getPlanNotes(planId: string): PlanNoteRow[] {
  return getDb()
    .prepare('SELECT * FROM plan_notes WHERE plan_id = ? ORDER BY created_at ASC')
    .all(planId) as PlanNoteRow[];
}

// ============================================================
// CONTEXT ITEMS
// ============================================================

export function getPlanContext(planId: string, type?: string): ContextItemRow[] {
  if (type) {
    return getDb()
      .prepare(
        "SELECT * FROM context_items WHERE parent_type = 'plan' AND parent_id = ? AND type = ? ORDER BY updated_at DESC"
      )
      .all(planId, type) as ContextItemRow[];
  }
  return getDb()
    .prepare(
      "SELECT * FROM context_items WHERE parent_type = 'plan' AND parent_id = ? ORDER BY updated_at DESC"
    )
    .all(planId) as ContextItemRow[];
}

export function getWorkspaceContext(workspaceId: string, type?: string): ContextItemRow[] {
  if (type) {
    return getDb()
      .prepare(
        "SELECT * FROM context_items WHERE parent_type = 'workspace' AND parent_id = ? AND type = ? ORDER BY updated_at DESC"
      )
      .all(workspaceId, type) as ContextItemRow[];
  }
  return getDb()
    .prepare(
      "SELECT * FROM context_items WHERE parent_type = 'workspace' AND parent_id = ? ORDER BY updated_at DESC"
    )
    .all(workspaceId) as ContextItemRow[];
}

// ============================================================
// EVENTS  (event_log table)
// ============================================================

export function getRecentEvents(limit = 50): EventLogRow[] {
  return getDb()
    .prepare('SELECT * FROM event_log ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as EventLogRow[];
}

export function getEventsSince(since: string, limit = 200): EventLogRow[] {
  return getDb()
    .prepare('SELECT * FROM event_log WHERE timestamp > ? ORDER BY timestamp ASC LIMIT ?')
    .all(since, limit) as EventLogRow[];
}

export function getEventsByWorkspace(workspaceId: string, limit = 100): EventLogRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM event_log WHERE json_extract(data, '$.workspace_id') = ? ORDER BY timestamp DESC LIMIT ?"
    )
    .all(workspaceId, limit) as EventLogRow[];
}

// ============================================================
// KNOWLEDGE
// ============================================================

export function listKnowledge(workspaceId: string, category?: string): KnowledgeRow[] {
  if (category) {
    return getDb()
      .prepare(
        'SELECT * FROM knowledge WHERE workspace_id = ? AND category = ? ORDER BY created_at DESC'
      )
      .all(workspaceId, category) as KnowledgeRow[];
  }
  return getDb()
    .prepare('SELECT * FROM knowledge WHERE workspace_id = ? ORDER BY created_at DESC')
    .all(workspaceId) as KnowledgeRow[];
}

export function getKnowledgeItem(workspaceId: string, slug: string): KnowledgeRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM knowledge WHERE workspace_id = ? AND slug = ?')
      .get(workspaceId, slug) as KnowledgeRow | undefined) ?? null
  );
}

// ============================================================
// PROGRAMS  (plans with is_program = 1)
// ============================================================

export function listPrograms(workspaceId?: string): PlanRow[] {
  if (workspaceId) {
    return getDb()
      .prepare(
        'SELECT * FROM plans WHERE is_program = 1 AND workspace_id = ? ORDER BY created_at DESC'
      )
      .all(workspaceId) as PlanRow[];
  }
  return getDb()
    .prepare('SELECT * FROM plans WHERE is_program = 1 ORDER BY created_at DESC')
    .all() as PlanRow[];
}

export function getProgramChildPlans(programId: string): PlanRow[] {
  return getDb()
    .prepare(
      `SELECT p.* FROM plans p
       JOIN program_plans pp ON pp.plan_id = p.id
       WHERE pp.program_id = ?
       ORDER BY pp.created_at ASC`
    )
    .all(programId) as PlanRow[];
}

// ============================================================
// BUILD SCRIPTS
// ============================================================

export function getBuildScripts(workspaceId: string): BuildScriptRow[] {
  return getDb()
    .prepare(
      'SELECT * FROM build_scripts WHERE workspace_id = ? ORDER BY created_at DESC'
    )
    .all(workspaceId) as BuildScriptRow[];
}

// ============================================================
// SEARCH
// ============================================================

export function searchPlans(query: string, workspaceId?: string): PlanRow[] {
  const likeQuery = `%${query}%`;
  if (workspaceId) {
    return getDb()
      .prepare(
        `SELECT * FROM plans
         WHERE workspace_id = ?
           AND (title LIKE ? OR description LIKE ?)
         ORDER BY updated_at DESC
         LIMIT 50`
      )
      .all(workspaceId, likeQuery, likeQuery) as PlanRow[];
  }
  return getDb()
    .prepare(
      `SELECT * FROM plans
       WHERE title LIKE ? OR description LIKE ?
       ORDER BY updated_at DESC
       LIMIT 50`
    )
    .all(likeQuery, likeQuery) as PlanRow[];
}

export function searchSteps(query: string, workspaceId?: string): StepRow[] {
  const likeQuery = `%${query}%`;
  if (workspaceId) {
    return getDb()
      .prepare(
        `SELECT s.* FROM steps s
         JOIN plans p ON p.id = s.plan_id
         WHERE p.workspace_id = ? AND s.task LIKE ?
         ORDER BY s.updated_at DESC
         LIMIT 50`
      )
      .all(workspaceId, likeQuery) as StepRow[];
  }
  return getDb()
    .prepare('SELECT * FROM steps WHERE task LIKE ? ORDER BY updated_at DESC LIMIT 50')
    .all(likeQuery) as StepRow[];
}

// ============================================================
// METRICS
// ============================================================

export interface WorkspaceMetrics {
  totalPlans:      number;
  activePlans:     number;
  archivedPlans:   number;
  totalSteps:      number;
  completedSteps:  number;
  blockedSteps:    number;
  totalSessions:   number;
  activeSessions:  number;
  totalKnowledge:  number;
}

export function getWorkspaceMetrics(workspaceId: string): WorkspaceMetrics {
  const db = getDb();

  const planCounts = db.prepare(
    `SELECT
       COUNT(*)                                      AS total,
       SUM(CASE WHEN status != 'archived' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status  = 'archived' THEN 1 ELSE 0 END) AS archived
     FROM plans WHERE workspace_id = ?`
  ).get(workspaceId) as { total: number; active: number; archived: number };

  const stepCounts = db.prepare(
    `SELECT
       COUNT(*)                                        AS total,
       SUM(CASE WHEN s.status = 'done'    THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN s.status = 'blocked' THEN 1 ELSE 0 END) AS blocked
     FROM steps s
     JOIN plans p ON p.id = s.plan_id
     WHERE p.workspace_id = ?`
  ).get(workspaceId) as { total: number; completed: number; blocked: number };

  const sessionCounts = db.prepare(
    `SELECT
       COUNT(*)                                              AS total,
       SUM(CASE WHEN s.completed_at IS NULL THEN 1 ELSE 0 END) AS active
     FROM sessions s
     JOIN plans p ON p.id = s.plan_id
     WHERE p.workspace_id = ?`
  ).get(workspaceId) as { total: number; active: number };

  const knowledgeCount = db.prepare(
    'SELECT COUNT(*) AS total FROM knowledge WHERE workspace_id = ?'
  ).get(workspaceId) as { total: number };

  return {
    totalPlans:     planCounts.total     ?? 0,
    activePlans:    planCounts.active    ?? 0,
    archivedPlans:  planCounts.archived  ?? 0,
    totalSteps:     stepCounts.total     ?? 0,
    completedSteps: stepCounts.completed ?? 0,
    blockedSteps:   stepCounts.blocked   ?? 0,
    totalSessions:  sessionCounts.total  ?? 0,
    activeSessions: sessionCounts.active ?? 0,
    totalKnowledge: knowledgeCount.total ?? 0,
  };
}
