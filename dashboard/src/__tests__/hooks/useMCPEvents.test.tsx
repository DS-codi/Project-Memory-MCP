import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useMCPEvents } from '../../hooks/useMCPEvents';
import { useSettings } from '../../store/settings';

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  handoff: vi.fn(),
  dismiss: vi.fn(),
};

vi.mock('../../components/common/Toast', () => ({
  useToast: () => toastMock,
}));

type Listener = (event: { data: string }) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  listeners = new Map<string, Listener[]>();
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  url: string;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  emit(type: string, payload: unknown) {
    const handlers = this.listeners.get(type) ?? [];
    const event = { data: JSON.stringify(payload) };
    handlers.forEach((handler) => handler(event));
  }

  static latest(): MockEventSource {
    const instance = MockEventSource.instances.at(-1);
    if (!instance) throw new Error('No EventSource instance created');
    return instance;
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useMCPEvents', () => {
  beforeAll(() => {
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
  });

  beforeEach(() => {
    act(() => {
      useSettings.getState().resetSettings();
    });
    MockEventSource.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      useSettings.getState().resetSettings();
    });
  });

  it('keeps SSE event processing active when notifications are disabled', async () => {
    act(() => {
      useSettings.getState().setSetting('showNotifications', false);
    });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    renderHook(() => useMCPEvents(), { wrapper: createWrapper(queryClient) });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_1',
        type: 'step_updated',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_1',
        plan_id: 'plan_1',
        data: {
          step_index: 2,
          new_status: 'done',
          step_task: 'Test task',
        },
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_1', 'plan_1'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'ws_1'] });
    });

    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it.each(['handoff', 'handoff_started', 'handoff_completed'])(
    'normalizes %s to handoff and invalidates plan + lineage',
    async (eventType) => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

      renderHook(() => useMCPEvents(), { wrapper: createWrapper(queryClient) });

      act(() => {
        MockEventSource.latest().emit('mcp_event', {
          id: `evt_${eventType}`,
          type: eventType,
          timestamp: '2026-03-01T00:00:00.000Z',
          workspace_id: 'ws_2',
          plan_id: 'plan_2',
          data: {
            from_agent: 'Executor',
            to_agent: 'Reviewer',
            plan_title: 'Demo plan',
          },
        });
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_2', 'plan_2'] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['lineage', 'ws_2', 'plan_2'] });
      });

      expect(toastMock.handoff).toHaveBeenCalledWith('Executor', 'Reviewer', 'Demo plan');
    },
  );

  it('supports step payload compatibility keys stepIndex/newStatus', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    renderHook(() => useMCPEvents(), { wrapper: createWrapper(queryClient) });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_step_compat',
        type: 'step_updated',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_3',
        plan_id: 'plan_3',
        data: {
          stepIndex: 4,
          newStatus: 'done',
          step_task: 'Compat step',
        },
      });
    });

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Step Completed', '"Compat step" marked as done');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_3', 'plan_3'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'ws_3'] });
    });
  });

  it('covers invalidation keys for plan detail/list, lineage, workspace/workspaces', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    renderHook(() => useMCPEvents(), { wrapper: createWrapper(queryClient) });

    act(() => {
      const eventSource = MockEventSource.latest();

      eventSource.emit('mcp_event', {
        id: 'evt_plan_update',
        type: 'plan_updated',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_4',
        plan_id: 'plan_4',
        data: {},
      });

      eventSource.emit('mcp_event', {
        id: 'evt_handoff',
        type: 'handoff',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_4',
        plan_id: 'plan_4',
        data: { from_agent: 'A', to_agent: 'B', plan_title: 'P' },
      });

      eventSource.emit('mcp_event', {
        id: 'evt_workspace',
        type: 'workspace_updated',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_4',
        data: {},
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_4', 'plan_4'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'ws_4'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['lineage', 'ws_4', 'plan_4'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspaces'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace', 'ws_4'] });
    });
  });
});