/**
 * Event Emitter for Project Memory MCP Server
 * 
 * Broadcasts events to the Memory Observer Dashboard via:
 * 1. File-based event queue (for polling)
 * 2. Named pipe / IPC (future)
 * 
 * Events are written to a JSON file that the dashboard backend watches.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Event types
export type EventType = 
  | 'tool_call'
  | 'plan_created'
  | 'plan_updated'
  | 'plan_archived'
  | 'step_updated'
  | 'handoff'
  | 'agent_session_started'
  | 'agent_session_completed'
  | 'workspace_registered'
  | 'context_stored';

export interface MCPEvent {
  id: string;
  type: EventType;
  timestamp: string;
  workspace_id?: string;
  plan_id?: string;
  agent_type?: string;
  tool_name?: string;
  data: Record<string, unknown>;
}

// Get events directory - defaults to data/events
function getEventsDir(): string {
  return process.env.MBS_EVENTS_DIR || path.join(process.env.MBS_DATA_ROOT || './data', 'events');
}

// Initialize events directory
async function ensureEventsDir(): Promise<void> {
  const dir = getEventsDir();
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    // Ignore if exists
  }
}

// Generate event ID
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `evt_${timestamp}_${random}`;
}

// Write event to file
export async function emitEvent(event: Omit<MCPEvent, 'id' | 'timestamp'>): Promise<void> {
  await ensureEventsDir();
  
  const fullEvent: MCPEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  
  // Write to individual event file (for reliability)
  const eventFile = path.join(getEventsDir(), `${fullEvent.id}.json`);
  await fs.writeFile(eventFile, JSON.stringify(fullEvent, null, 2));
  
  // Also append to events log for easy reading
  const logFile = path.join(getEventsDir(), 'events.log');
  await fs.appendFile(logFile, JSON.stringify(fullEvent) + '\n');
  
  // Trim old event files (keep last 1000)
  await pruneOldEvents();
}

// Prune old event files to prevent unbounded growth
async function pruneOldEvents(): Promise<void> {
  const dir = getEventsDir();
  const maxEvents = 1000;
  
  try {
    const files = await fs.readdir(dir);
    const eventFiles = files
      .filter(f => f.startsWith('evt_') && f.endsWith('.json'))
      .sort();
    
    if (eventFiles.length > maxEvents) {
      const toDelete = eventFiles.slice(0, eventFiles.length - maxEvents);
      await Promise.all(
        toDelete.map(f => fs.unlink(path.join(dir, f)).catch(() => {}))
      );
    }
  } catch (e) {
    // Ignore errors
  }
}

// Read recent events (for dashboard polling)
export async function getRecentEvents(limit: number = 50, since?: string): Promise<MCPEvent[]> {
  await ensureEventsDir();
  const dir = getEventsDir();
  
  try {
    const files = await fs.readdir(dir);
    const eventFiles = files
      .filter(f => f.startsWith('evt_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);
    
    const events: MCPEvent[] = [];
    
    for (const file of eventFiles) {
      try {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        const event = JSON.parse(content) as MCPEvent;
        
        // Filter by since if provided
        if (since && event.timestamp <= since) break;
        
        events.push(event);
      } catch (e) {
        // Skip invalid files
      }
    }
    
    return events;
  } catch (e) {
    return [];
  }
}

// Convenience emitters for common events
export const events = {
  toolCall: async (toolName: string, params: Record<string, unknown>, result: 'success' | 'error', workspaceId?: string, planId?: string) => {
    await emitEvent({
      type: 'tool_call',
      workspace_id: workspaceId,
      plan_id: planId,
      tool_name: toolName,
      data: { params, result },
    });
  },
  
  planCreated: async (workspaceId: string, planId: string, title: string, category: string) => {
    await emitEvent({
      type: 'plan_created',
      workspace_id: workspaceId,
      plan_id: planId,
      data: { title, category },
    });
  },
  
  planUpdated: async (workspaceId: string, planId: string, changes: Record<string, unknown>) => {
    await emitEvent({
      type: 'plan_updated',
      workspace_id: workspaceId,
      plan_id: planId,
      data: { changes },
    });
  },
  
  stepUpdated: async (workspaceId: string, planId: string, stepIndex: number, newStatus: string) => {
    await emitEvent({
      type: 'step_updated',
      workspace_id: workspaceId,
      plan_id: planId,
      data: { stepIndex, newStatus },
    });
  },
  
  handoff: async (workspaceId: string, planId: string, fromAgent: string, toAgent: string, reason: string) => {
    await emitEvent({
      type: 'handoff',
      workspace_id: workspaceId,
      plan_id: planId,
      agent_type: toAgent,
      data: { fromAgent, toAgent, reason },
    });
  },
  
  agentSessionStarted: async (workspaceId: string, planId: string, agentType: string, sessionId: string) => {
    await emitEvent({
      type: 'agent_session_started',
      workspace_id: workspaceId,
      plan_id: planId,
      agent_type: agentType,
      data: { sessionId },
    });
  },
  
  agentSessionCompleted: async (workspaceId: string, planId: string, agentType: string, summary: string, artifacts: string[]) => {
    await emitEvent({
      type: 'agent_session_completed',
      workspace_id: workspaceId,
      plan_id: planId,
      agent_type: agentType,
      data: { summary, artifacts },
    });
  },
};
