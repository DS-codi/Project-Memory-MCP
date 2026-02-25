/**
 * Event log — MCPEvents stored as rows.
 */

import type { EventLogRow } from './types.js';
import { queryAll, run, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function addEventLog(eventType: string, data?: object | null): void {
  run(
    'INSERT INTO event_log (event_type, data, timestamp) VALUES (?, ?, ?)',
    [eventType, data ? JSON.stringify(data) : null, nowIso()]
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getRecentEvents(limit = 50): EventLogRow[] {
  return queryAll<EventLogRow>(
    'SELECT * FROM event_log ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );
}

export function getEventsSince(since: string): EventLogRow[] {
  return queryAll<EventLogRow>(
    'SELECT * FROM event_log WHERE timestamp >= ? ORDER BY timestamp',
    [since]
  );
}

export function getEventsByType(eventType: string, limit = 50): EventLogRow[] {
  return queryAll<EventLogRow>(
    'SELECT * FROM event_log WHERE event_type = ? ORDER BY timestamp DESC LIMIT ?',
    [eventType, limit]
  );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Remove events older than `maxDays` days (default: 30). Returns count deleted. */
export function cleanupOldEvents(maxDays = 30): number {
  const cutoff = new Date(Date.now() - maxDays * 86_400_000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
  const result = run('DELETE FROM event_log WHERE timestamp < ?', [cutoff]);
  return result.changes;
}
