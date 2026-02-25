/**
 * migration/migrate-events.ts — Phase 8: Event & Log Migration
 *
 * Reads:
 *   - data/events/evt_*.json     → event_log rows
 *   - data/events/events.log     → NDJSON event_log rows
 *   - data/logs/*.log            → server_logs (optional metadata)
 */

import fs   from 'node:fs';
import path from 'node:path';

import { run, queryOne }      from '../db/query-helpers.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateEvents(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 8: Event & Log Migration');

  // ── evt_*.json files ───────────────────────────────────────────────────
  const eventsDir = path.join(dataRoot, 'events');
  if (fs.existsSync(eventsDir)) {
    migrateEventFiles(eventsDir, report, dryRun);
    migrateNdjsonLog(eventsDir, report, dryRun);
  } else {
    report.skip('events/', 'directory not found');
  }

  // ── Daily log files (diagnostic, best-effort) ─────────────────────────
  const logsDir = path.join(dataRoot, 'logs');
  if (fs.existsSync(logsDir)) {
    migrateLogFiles(logsDir, report, dryRun);
  } else {
    report.skip('logs/', 'directory not found');
  }
}

// ---------------------------------------------------------------------------
// evt_*.json files
// ---------------------------------------------------------------------------

function migrateEventFiles(eventsDir: string, report: ReportBuilder, dryRun: boolean): void {
  const files = fs.readdirSync(eventsDir)
    .filter(f => f.startsWith('evt_') && f.endsWith('.json'));

  for (const filename of files) {
    const filePath = path.join(eventsDir, filename);
    let evt: EventRecord;
    try {
      evt = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as EventRecord;
    } catch (err) {
      report.error(filePath, `corrupt JSON: ${(err as Error).message}`);
      continue;
    }

    if (!dryRun) {
      try {
        insertEventLog(evt);
      } catch (err) {
        report.error(filePath, `DB insert failed: ${(err as Error).message}`);
        continue;
      }
    }
    report.increment('events');
  }
}

// ---------------------------------------------------------------------------
// events.log (NDJSON)
// ---------------------------------------------------------------------------

function migrateNdjsonLog(eventsDir: string, report: ReportBuilder, dryRun: boolean): void {
  const logPath = path.join(eventsDir, 'events.log');
  if (!fs.existsSync(logPath)) return;

  const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    let evt: EventRecord;
    try {
      evt = JSON.parse(line) as EventRecord;
    } catch {
      report.skip(`events.log:${lineNo}`, 'invalid JSON line');
      continue;
    }

    if (!dryRun) {
      try {
        insertEventLog(evt);
      } catch (err) {
        report.error(`events.log:${lineNo}`, `DB insert failed: ${(err as Error).message}`);
        continue;
      }
    }
    report.increment('events_ndjson');
  }
}

// ---------------------------------------------------------------------------
// Log files (diagnostic / operational metadata)
// ---------------------------------------------------------------------------

const PRIORITY_LOGS = ['dashboard-errors.log', 'process-audit.log'];

function migrateLogFiles(logsDir: string, report: ReportBuilder, dryRun: boolean): void {
  const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));

  let migratedCount = 0;
  for (const filename of files) {
    // Only priority logs (and any daily logs named *.log) get stored
    const isPriority = PRIORITY_LOGS.includes(filename);
    if (!isPriority) {
      report.skip(`logs/${filename}`, 'non-priority log — skipped');
      continue;
    }

    const filePath = path.join(logsDir, filename);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      report.error(filePath, `read error: ${(err as Error).message}`);
      continue;
    }

    if (!dryRun) {
      // Store as a 'server_log' event_log entry
      run(
        `INSERT INTO event_log (event_type, data, timestamp)
         VALUES ('server_log', ?, datetime('now'))
         ON CONFLICT DO NOTHING`,
        [JSON.stringify({ filename, content: content.slice(0, 50_000) })]
      );
    }
    migratedCount++;
    report.increment('log_files');
  }
}

// ---------------------------------------------------------------------------
// DB helper
// ---------------------------------------------------------------------------

function insertEventLog(evt: EventRecord): void {
  const eventType = evt.event_type ?? evt.type ?? 'unknown';
  const timestamp = evt.timestamp  ?? new Date().toISOString();

  // Build the data payload, preserving the original event ID inside it
  let dataObj = evt.data ?? omitKnownKeys(evt);
  if (evt.id) {
    dataObj = { original_event_id: evt.id, ...(typeof dataObj === 'object' ? dataObj : { raw: dataObj }) };
  }
  const dataJson = JSON.stringify(dataObj);

  // Deduplicate: check if this exact event was already inserted (by original id in data)
  if (evt.id) {
    const existing = queryOne<{ id: number }>(
      `SELECT id FROM event_log WHERE event_type = ? AND data LIKE ? LIMIT 1`,
      [eventType, `%"original_event_id":"${evt.id}"%`]
    );
    if (existing) return;
  }

  // Let SQLite auto-generate the INTEGER PRIMARY KEY
  run(
    'INSERT INTO event_log (event_type, data, timestamp) VALUES (?, ?, ?)',
    [eventType, dataJson, timestamp]
  );
}

function omitKnownKeys(evt: EventRecord): object {
  const { id, event_type, type, timestamp, ...rest } = evt;
  return rest;
}

// ---------------------------------------------------------------------------
// Loose types
// ---------------------------------------------------------------------------

interface EventRecord {
  id?:          string;
  event_type?:  string;
  type?:        string;
  timestamp?:   string;
  data?:        object;
  [key: string]: unknown;
}
