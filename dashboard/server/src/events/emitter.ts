import * as crypto from 'crypto';
import { eventBus } from './eventBus.js';

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
  | 'plan_resumed'
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
  const timestamp = new Date().toISOString();
  const id = `evt_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

  const event: MCPEvent = {
    id,
    type,
    timestamp,
    ...context,
    data,
  };

  // Push to in-memory bus so SSE clients get instant delivery
  eventBus.push(event);

  return event;
}
