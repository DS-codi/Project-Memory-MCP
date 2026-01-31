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

export function useMCPEvents() {
  const toast = useToast();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!settings.showNotifications) return;

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
        handleEvent(event);
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
  }, [settings.showNotifications]);

  const handleEvent = (event: MCPEvent) => {
    // Map event types to toast notifications
    switch (event.type) {
      case 'step_updated':
        if (settings.notifyOnStepComplete && event.data.new_status === 'done') {
          toast.success('Step Completed', `"${event.data.step_task}" marked as done`);
        }
        // Invalidate plan queries to refresh UI
        if (event.workspace_id && event.plan_id) {
          queryClient.invalidateQueries({ 
            queryKey: ['plan', event.workspace_id, event.plan_id] 
          });
        }
        break;

      case 'handoff_started':
      case 'handoff_completed':
        if (settings.notifyOnHandoff) {
          toast.handoff(
            event.data.from_agent as string,
            event.data.to_agent as string,
            event.data.plan_title as string || ''
          );
        }
        // Invalidate plan queries
        if (event.workspace_id && event.plan_id) {
          queryClient.invalidateQueries({ 
            queryKey: ['plan', event.workspace_id, event.plan_id] 
          });
          queryClient.invalidateQueries({ 
            queryKey: ['lineage', event.workspace_id, event.plan_id] 
          });
        }
        break;

      case 'agent_session_started':
        if (settings.notifyOnHandoff) {
          toast.info('Agent Started', `${event.agent_type} is now active`);
        }
        break;

      case 'agent_session_completed':
        if (settings.notifyOnHandoff) {
          toast.success('Agent Completed', `${event.agent_type} finished work`);
        }
        break;

      case 'plan_created':
      case 'plan_imported':
        toast.success(
          event.type === 'plan_created' ? 'Plan Created' : 'Plan Imported',
          event.data.plan_title as string
        );
        if (event.workspace_id) {
          queryClient.invalidateQueries({ queryKey: ['plans', event.workspace_id] });
        }
        break;

      case 'plan_archived':
        toast.warning('Plan Archived', event.data.plan_title as string);
        if (event.workspace_id) {
          queryClient.invalidateQueries({ queryKey: ['plans', event.workspace_id] });
        }
        break;

      case 'plan_deleted':
        toast.info('Plan Deleted', event.data.plan_title as string);
        if (event.workspace_id) {
          queryClient.invalidateQueries({ queryKey: ['plans', event.workspace_id] });
        }
        break;

      case 'plan_duplicated':
        toast.success(
          'Plan Duplicated',
          `Created "${event.data.new_title}" from "${event.data.source_title}"`
        );
        if (event.workspace_id) {
          queryClient.invalidateQueries({ queryKey: ['plans', event.workspace_id] });
        }
        break;

      case 'workspace_registered':
      case 'workspace_indexed':
        toast.info(
          event.type === 'workspace_registered' ? 'Workspace Registered' : 'Workspace Indexed',
          event.data.workspace_path as string
        );
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        break;

      default:
        // For unknown events, just log them
        console.log('Unhandled MCP event:', event.type, event);
    }
  };

  return { isConnected: connectedRef.current };
}
