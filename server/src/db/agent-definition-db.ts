/**
 * Agent definition storage.
 */

import type { AgentDefinitionRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function storeAgent(
  name:     string,
  content:  string,
  metadata: object | null = null
): void {
  const now = nowIso();
  const existing = getAgent(name);

  if (existing) {
    run(
      'UPDATE agent_definitions SET content = ?, metadata = ?, updated_at = ? WHERE id = ?',
      [content, metadata ? JSON.stringify(metadata) : null, now, existing.id]
    );
  } else {
    run(
      `INSERT INTO agent_definitions (id, name, content, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), name, content, metadata ? JSON.stringify(metadata) : null, now, now]
    );
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getAgent(name: string): AgentDefinitionRow | null {
  return queryOne<AgentDefinitionRow>(
    'SELECT * FROM agent_definitions WHERE name = ?',
    [name]
  ) ?? null;
}

export function listAgents(): AgentDefinitionRow[] {
  return queryAll<AgentDefinitionRow>(
    'SELECT * FROM agent_definitions ORDER BY name'
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteAgent(name: string): void {
  run('DELETE FROM agent_definitions WHERE name = ?', [name]);
}
