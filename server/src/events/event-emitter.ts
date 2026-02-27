/**
 * Event Emitter for Project Memory MCP Server
 * 
 * Broadcasts events via:
 * 1. SQLite event_log table (primary — queryable, no file I/O)
 * 2. In-process consumers (future: SSE push)
 *
 * All file-based event queue logic has been removed. The event_log table
 * replaces per-event JSON files and events.log.
 */

import {
  addEventLog,
  getRecentEvents as dbGetRecent,
  getEventsSince as dbGetSince,
} from '../db/event-log-db.js';
import type { EventLogRow } from '../db/types.js';

// Event types
export type EventType =
  | 'tool_call'
  | 'plan_created'
  | 'plan_updated'
  | 'plan_archived'
  | 'step_updated'
  | 'note_added'
  | 'handoff'
  | 'agent_session_started'
  | 'agent_session_completed'
  | 'workspace_registered'
  | 'context_stored'
  | 'session_interrupted'
  | 'session_injected'
  | 'session_stop_escalated'
  | 'hub_routing_decision'
  | 'hub_policy_blocked'
  | 'prompt_analyst_enrichment'
  | 'session_scope_conflict'
  | 'program_created'
  | 'program_updated'
  | 'program_archived';

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

// Generate event ID
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `evt_${timestamp}_${random}`;
}

// Map a DB row back to an MCPEvent
function rowToEvent(row: EventLogRow): MCPEvent {
  let parsed: Partial<MCPEvent> = {};
  try {
    parsed = row.data ? (JSON.parse(row.data) as Partial<MCPEvent>) : {};
  } catch {
    // malformed data — tolerate
  }
  return {
    id:           String(parsed.id ?? row.id),
    type:         row.event_type as EventType,
    timestamp:    row.timestamp,
    workspace_id: parsed.workspace_id,
    plan_id:      parsed.plan_id,
    agent_type:   parsed.agent_type,
    tool_name:    parsed.tool_name,
    data:         (parsed.data as Record<string, unknown>) ?? {},
  };
}

// Write event to DB (fire-and-forget; never throws)
export async function emitEvent(event: Omit<MCPEvent, 'id' | 'timestamp'>): Promise<void> {
  const fullEvent: MCPEvent = {
    id:        generateEventId(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  try {
    addEventLog(fullEvent.type, {
      id:           fullEvent.id,
      workspace_id: fullEvent.workspace_id,
      plan_id:      fullEvent.plan_id,
      agent_type:   fullEvent.agent_type,
      tool_name:    fullEvent.tool_name,
      data:         fullEvent.data,
    });
  } catch {
    // Non-fatal — event logging must never break tool handlers
  }
}

// Read recent events (for dashboard polling)
export async function getRecentEvents(limit = 50, since?: string): Promise<MCPEvent[]> {
  try {
    const rows: EventLogRow[] = since
      ? dbGetSince(since).slice(0, limit).reverse()
      : dbGetRecent(limit);
    return rows.map(rowToEvent);
  } catch {
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

  agentSessionStarted: async (workspaceId: string, planId: string, agentType: string, sessionId: string, extraData?: Record<string, unknown>) => {
    await emitEvent({
      type: 'agent_session_started',
      workspace_id: workspaceId,
      plan_id: planId,
      agent_type: agentType,
      data: { sessionId, ...extraData },
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

  noteAdded: async (workspaceId: string, planId: string, note: string, type: string) => {
    await emitEvent({
      type: 'note_added',
      workspace_id: workspaceId,
      plan_id: planId,
      data: { note, type },
    });
  },

  sessionInterrupted: async (workspaceId: string, planId: string, sessionId: string, escalationLevel: number, reason?: string) => {
    await emitEvent({
      type: 'session_interrupted',
      workspace_id: workspaceId,
      plan_id: planId,
      data: { session_id: sessionId, escalation_level: escalationLevel, reason },
    });
  },

  sessionInjected: async (workspaceId: string, planId: string, sessionId: string, textPreview: string) => {
    await emitEvent({
      type: 'session_injected',
      workspace_id: workspaceId,
      plan_id: planId,
      data: { session_id: sessionId, text_preview: textPreview.slice(0, 100) },
    });
  },

  sessionStopEscalated: async (workspaceId: string, planId: string, sessionId: string, fromLevel: number, toLevel: number) => {
    await emitEvent({
      type: 'session_stop_escalated',
      workspace_id: workspaceId,
      plan_id: planId,
      data: { session_id: sessionId, from_level: fromLevel, to_level: toLevel },
    });
  },

  hubRoutingDecision: async (
    workspaceId: string,
    planId: string,
    data: Record<string, unknown>,
  ) => {
    await emitEvent({
      type: 'hub_routing_decision',
      workspace_id: workspaceId,
      plan_id: planId,
      data,
    });
  },

  hubPolicyBlocked: async (
    workspaceId: string,
    planId: string,
    data: Record<string, unknown>,
  ) => {
    await emitEvent({
      type: 'hub_policy_blocked',
      workspace_id: workspaceId,
      plan_id: planId,
      data,
    });
  },

  promptAnalystEnrichment: async (
    workspaceId: string,
    planId: string,
    data: Record<string, unknown>,
  ) => {
    await emitEvent({
      type: 'prompt_analyst_enrichment',
      workspace_id: workspaceId,
      plan_id: planId,
      data,
    });
  },

  sessionScopeConflict: async (
    workspaceId: string,
    planId: string,
    data: Record<string, unknown>,
  ) => {
    await emitEvent({
      type: 'session_scope_conflict',
      workspace_id: workspaceId,
      plan_id: planId,
      data,
    });
  },

  programCreated: async (workspaceId: string, programId: string, title: string, category: string) => {
    await emitEvent({
      type: 'program_created',
      workspace_id: workspaceId,
      data: { program_id: programId, title, category },
    });
  },

  programUpdated: async (workspaceId: string, programId: string, changes: Record<string, unknown>) => {
    await emitEvent({
      type: 'program_updated',
      workspace_id: workspaceId,
      data: { program_id: programId, changes },
    });
  },

  programArchived: async (workspaceId: string, programId: string) => {
    await emitEvent({
      type: 'program_archived',
      workspace_id: workspaceId,
      data: { program_id: programId },
    });
  },
};
