import { useEffect, useRef } from 'react';
import { useToast } from '../components/common/Toast';
import { useSettings } from '../store/settings';
import { useQueryClient } from '@tanstack/react-query';

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

type NormalizedEventType =
  | 'step_updated'
  | 'handoff'
  | 'agent_session_started'
  | 'agent_session_completed'
  | 'plan_created'
  | 'plan_imported'
  | 'plan_archived'
  | 'plan_deleted'
  | 'plan_duplicated'
  | 'plan_updated'
  | 'plan_goals_updated'
  | 'plan_resumed'
  | 'workspace_registered'
  | 'workspace_indexed'
  | 'workspace_updated';

interface NormalizedMCPEvent extends MCPEvent {
  type: NormalizedEventType | string;
}

const HANDOFF_EVENT_ALIASES = new Set(['handoff', 'handoff_started', 'handoff_completed']);

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getEventScope(event: MCPEvent): { workspaceId?: string; planId?: string } {
  const data = event.data ?? {};
  return {
    workspaceId: event.workspace_id ?? getString(data.workspace_id) ?? getString(data.workspaceId),
    planId: event.plan_id ?? getString(data.plan_id) ?? getString(data.planId),
  };
}

function normalizeEvent(event: MCPEvent): NormalizedMCPEvent {
  const normalizedType = HANDOFF_EVENT_ALIASES.has(event.type) ? 'handoff' : event.type;
  const data = event.data ?? {};

  if (normalizedType === 'step_updated') {
    return {
      ...event,
      type: normalizedType,
      data: {
        ...data,
        step_index: data.step_index ?? data.stepIndex,
        new_status: data.new_status ?? data.newStatus,
      },
    };
  }

  return {
    ...event,
    type: normalizedType,
  };
}

export function useMCPEvents() {
  const toast = useToast();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const settingsRef = useRef(settings);
  const connectedRef = useRef(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const invalidatePlan = (workspaceId?: string, planId?: string) => {
    if (!workspaceId || !planId) return;
    queryClient.invalidateQueries({ queryKey: ['plan', workspaceId, planId] });
  };

  const invalidatePlans = (workspaceId?: string) => {
    if (!workspaceId) return;
    queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
  };

  const invalidateLineage = (workspaceId?: string, planId?: string) => {
    if (!workspaceId || !planId) return;
    queryClient.invalidateQueries({ queryKey: ['lineage', workspaceId, planId] });
  };

  useEffect(() => {
    // Avoid duplicate connections
    if (eventSourceRef.current) return;

    const eventSource = new EventSource('/api/events/stream');
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', () => {
      connectedRef.current = true;
    });

    eventSource.addEventListener('mcp_event', (e) => {
      try {
        const event = JSON.parse(e.data) as MCPEvent;
        handleEvent(normalizeEvent(event));
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    });

    eventSource.onerror = () => {
      connectedRef.current = false;
      // Will auto-reconnect
    };

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  const handleEvent = (event: NormalizedMCPEvent) => {
    const currentSettings = settingsRef.current;
    const shouldShowToast = currentSettings.showNotifications && currentSettings.showToastNotifications;
    const { workspaceId, planId } = getEventScope(event);

    // Map event types to toast notifications
    switch (event.type) {
      case 'step_updated':
        if (shouldShowToast && currentSettings.notifyOnStepComplete && event.data.new_status === 'done') {
          toast.success('Step Completed', `"${event.data.step_task}" marked as done`);
        }
        invalidatePlan(workspaceId, planId);
        invalidatePlans(workspaceId);
        break;

      case 'handoff':
        if (shouldShowToast && currentSettings.notifyOnHandoff) {
          toast.handoff(
            event.data.from_agent as string,
            event.data.to_agent as string,
            event.data.plan_title as string || ''
          );
        }
        invalidatePlan(workspaceId, planId);
        invalidateLineage(workspaceId, planId);
        break;

      case 'agent_session_started':
        if (shouldShowToast && currentSettings.notifyOnHandoff) {
          toast.info('Agent Started', `${event.agent_type} is now active`);
        }
        invalidatePlan(workspaceId, planId);
        invalidateLineage(workspaceId, planId);
        break;

      case 'agent_session_completed':
        if (shouldShowToast && currentSettings.notifyOnHandoff) {
          toast.success('Agent Completed', `${event.agent_type} finished work`);
        }
        invalidatePlan(workspaceId, planId);
        invalidateLineage(workspaceId, planId);
        break;

      case 'plan_created':
      case 'plan_imported':
        if (shouldShowToast) {
          toast.success(
            event.type === 'plan_created' ? 'Plan Created' : 'Plan Imported',
            event.data.plan_title as string
          );
        }
        invalidatePlans(workspaceId);
        invalidatePlan(workspaceId, planId);
        break;

      case 'plan_resumed':
        invalidatePlans(workspaceId);
        invalidatePlan(workspaceId, planId);
        break;

      case 'plan_archived':
        if (shouldShowToast) {
          toast.warning('Plan Archived', event.data.plan_title as string);
        }
        invalidatePlans(workspaceId);
        invalidatePlan(workspaceId, planId);
        break;

      case 'plan_deleted':
        if (shouldShowToast) {
          toast.info('Plan Deleted', event.data.plan_title as string);
        }
        invalidatePlans(workspaceId);
        invalidatePlan(workspaceId, planId);
        break;

      case 'plan_duplicated':
        if (shouldShowToast) {
          toast.success(
            'Plan Duplicated',
            `Created "${event.data.new_title}" from "${event.data.source_title}"`
          );
        }
        invalidatePlans(workspaceId);
        invalidatePlan(workspaceId, planId);
        break;

      case 'workspace_registered':
      case 'workspace_indexed':
        if (shouldShowToast) {
          toast.info(
            event.type === 'workspace_registered' ? 'Workspace Registered' : 'Workspace Indexed',
            event.data.workspace_path as string
          );
        }
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        if (workspaceId) {
          queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
        }
        break;

      case 'plan_updated':
      case 'plan_goals_updated':
        // Generic plan update — refresh the plan list and the specific plan
        invalidatePlans(workspaceId);
        invalidatePlan(workspaceId, planId);
        break;

      case 'workspace_updated':
        // Workspace metadata changed
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        if (workspaceId) {
          queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
        }
        break;

      default:
        // For unknown events, just log them
        console.log('Unhandled MCP event:', event.type, event);
    }
  };

  return { isConnected: connectedRef.current };
}
