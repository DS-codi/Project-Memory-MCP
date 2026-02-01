import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface MCPEvent {
  id: string;
  type: string;
  timestamp: string;
  workspace_id?: string;
  plan_id?: string;
  agent_type?: string;
  tool_name?: string;
  data: Record<string, unknown>;
}

export type EventType = 
  | 'step_updated'
  | 'plan_created'
  | 'plan_archived'
  | 'plan_deleted'
  | 'plan_duplicated'
  | 'plan_imported'
  | 'note_added'
  | 'agent_session_started'
  | 'agent_session_completed'
  | 'handoff_started'
  | 'handoff_completed'
  | 'workspace_registered'
  | 'workspace_indexed';

function getEventsDir(): string {
  return process.env.MBS_EVENTS_DIR || path.join(globalThis.MBS_DATA_ROOT, 'events');
}

export async function emitEvent(
  type: EventType,
  data: Record<string, unknown>,
  context?: {
    workspace_id?: string;
    plan_id?: string;
    agent_type?: string;
    tool_name?: string;
  }
): Promise<MCPEvent> {
  const eventsDir = getEventsDir();
  await fs.mkdir(eventsDir, { recursive: true });

  const timestamp = new Date().toISOString();
  const id = `evt_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

  const event: MCPEvent = {
    id,
    type,
    timestamp,
    ...context,
    data,
  };

  const filePath = path.join(eventsDir, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(event, null, 2));

  return event;
}

// Clean up old events (keep last 7 days)
export async function cleanupOldEvents(): Promise<number> {
  const eventsDir = getEventsDir();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
  let deleted = 0;

  try {
    const files = await fs.readdir(eventsDir);
    for (const file of files) {
      if (!file.startsWith('evt_') || !file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(eventsDir, file);
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          deleted++;
        }
      } catch (e) {
        // Skip
      }
    }
  } catch (e) {
    // Events dir doesn't exist
  }

  return deleted;
}
