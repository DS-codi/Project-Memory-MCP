import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { config } from '@/config';

interface WSEvent {
  type: 'plan_updated' | 'workspace_updated' | 'handoff' | 'step_update';
  timestamp: string;
  workspace_id: string;
  plan_id?: string;
  file: string;
}

export function useLiveUpdates() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(config.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data);
          console.log('Live update:', data);

          // Invalidate relevant queries
          switch (data.type) {
            case 'workspace_updated':
              queryClient.invalidateQueries({ queryKey: ['workspaces'] });
              queryClient.invalidateQueries({ queryKey: ['workspace', data.workspace_id] });
              break;
            case 'plan_updated':
            case 'step_update':
              queryClient.invalidateQueries({ queryKey: ['plans', data.workspace_id] });
              if (data.plan_id) {
                queryClient.invalidateQueries({ queryKey: ['plan', data.workspace_id, data.plan_id] });
              }
              break;
            case 'handoff':
              if (data.plan_id) {
                queryClient.invalidateQueries({ queryKey: ['plan', data.workspace_id, data.plan_id] });
              }
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return wsRef.current;
}
