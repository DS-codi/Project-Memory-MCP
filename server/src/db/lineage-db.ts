/**
 * Lineage (handoff history) recording.
 */

import type { LineageRow } from './types.js';
import { queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface AddLineageData {
  from_agent: string;
  to_agent:   string;
  reason:     string;
  data?:      object | null;
}

export function addLineageEntry(planId: string, entry: AddLineageData): LineageRow {
  const id  = newId();
  const now = nowIso();
  run(
    `INSERT INTO lineage (id, plan_id, from_agent, to_agent, reason, data, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      planId,
      entry.from_agent,
      entry.to_agent,
      entry.reason,
      entry.data ? JSON.stringify(entry.data) : null,
      now,
    ]
  );
  return {
    id,
    plan_id:    planId,
    from_agent: entry.from_agent,
    to_agent:   entry.to_agent,
    reason:     entry.reason,
    data:       entry.data ? JSON.stringify(entry.data) : null,
    timestamp:  now,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getLineage(planId: string): LineageRow[] {
  return queryAll<LineageRow>(
    'SELECT * FROM lineage WHERE plan_id = ? ORDER BY timestamp',
    [planId]
  );
}

export function getRecentLineage(planId: string, limit = 10): LineageRow[] {
  return queryAll<LineageRow>(
    'SELECT * FROM lineage WHERE plan_id = ? ORDER BY timestamp DESC LIMIT ?',
    [planId, limit]
  );
}
