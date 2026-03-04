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

  removeEventListener(type: string, listener: Listener) {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      existing.filter((entry) => entry !== listener),
    );
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
    vi.useFakeTimers();
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
    vi.clearAllTimers();
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

  it('transitions reconnect state reconnecting -> degraded -> recovered -> connected and clears stale marker', async () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useMCPEvents(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockEventSource.latest().onerror?.call({} as EventSource, {} as Event);
    });

    expect(result.current.reconnectState).toBe('reconnecting');
    expect(result.current.hasStaleData).toBe(true);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.reconnectState).toBe('degraded');

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_recovered',
        type: 'connectivity_reconnected',
        timestamp: '2026-03-01T00:00:01.000Z',
        workspace_id: 'ws_5',
        plan_id: 'plan_5',
        data: {},
      });
    });

    expect(result.current.reconnectState).toBe('recovered');
    expect(result.current.hasStaleData).toBe(true);

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_post_recovery_update',
        type: 'workspace_updated',
        timestamp: '2026-03-01T00:00:02.000Z',
        workspace_id: 'ws_5',
        data: {},
      });
    });

    expect(result.current.reconnectState).toBe('connected');
    expect(result.current.hasStaleData).toBe(false);
  });

  it('invalidates recovery boundaries when reconnect is recovered', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    renderHook(() => useMCPEvents(), { wrapper: createWrapper(queryClient) });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_reconnect_recovered',
        type: 'connectivity_reconnected',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_6',
        plan_id: 'plan_6',
        data: {},
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspaces'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace', 'ws_6'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'ws_6'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_6', 'plan_6'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['lineage', 'ws_6', 'plan_6'] });
    });
  });

  it('rebuilds the event stream after a mid-session refresh and restores connected state on recovery', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    const firstRender = renderHook(() => useMCPEvents(), {
      wrapper: createWrapper(queryClient),
    });

    const firstSource = MockEventSource.latest();

    act(() => {
      firstSource.onerror?.call({} as EventSource, {} as Event);
    });

    expect(firstRender.result.current.reconnectState).toBe('reconnecting');

    firstRender.unmount();
    expect(firstSource.close).toHaveBeenCalledTimes(1);

    const secondRender = renderHook(() => useMCPEvents(), {
      wrapper: createWrapper(queryClient),
    });

    const secondSource = MockEventSource.latest();
    expect(secondSource).not.toBe(firstSource);

    act(() => {
      secondSource.onerror?.call({} as EventSource, {} as Event);
    });

    expect(secondRender.result.current.reconnectState).toBe('reconnecting');
    expect(secondRender.result.current.hasStaleData).toBe(true);

    act(() => {
      secondSource.emit('mcp_event', {
        id: 'evt_refresh_recovered',
        type: 'connectivity_reconnected',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_refresh',
        plan_id: 'plan_refresh',
        data: {},
      });
    });

    expect(secondRender.result.current.reconnectState).toBe('recovered');

    act(() => {
      secondSource.emit('mcp_event', {
        id: 'evt_refresh_workspace_update',
        type: 'workspace_updated',
        timestamp: '2026-03-01T00:00:01.000Z',
        workspace_id: 'ws_refresh',
        data: {},
      });
    });

    expect(secondRender.result.current.reconnectState).toBe('connected');
    expect(secondRender.result.current.hasStaleData).toBe(false);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspaces'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace', 'ws_refresh'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'ws_refresh'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_refresh', 'plan_refresh'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['lineage', 'ws_refresh', 'plan_refresh'] });
    });
  });

  it('restores route/session scope from compatibility payload keys after reconnect', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    const { result } = renderHook(() => useMCPEvents(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_route_scope_recovered',
        type: 'connectivity_reconnected',
        timestamp: '2026-03-01T00:00:00.000Z',
        data: {
          workspaceId: 'ws_route',
          planId: 'plan_route',
        },
      });
    });

    expect(result.current.reconnectState).toBe('recovered');

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace', 'ws_route'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'ws_route'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_route', 'plan_route'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['lineage', 'ws_route', 'plan_route'] });
    });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_route_scope_post_recovery_step',
        type: 'step_updated',
        timestamp: '2026-03-01T00:00:01.000Z',
        data: {
          workspaceId: 'ws_route',
          planId: 'plan_route',
          step_index: 1,
          new_status: 'done',
          step_task: 'Route-scoped step',
        },
      });
    });

    expect(result.current.reconnectState).toBe('connected');
    expect(result.current.hasStaleData).toBe(false);
  });

  it('degrades only failed data domains and keeps unaffected domains healthy', () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useMCPEvents(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_degraded_domains',
        type: 'connectivity_degraded',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_7',
        plan_id: 'plan_7',
        data: {
          degraded_domains: ['plan', 'lineage'],
        },
      });
    });

    expect(result.current.reconnectState).toBe('degraded');
    expect(result.current.hasStaleData).toBe(true);
    expect(result.current.degradedDomains).toEqual({
      workspace: 'healthy',
      plans: 'healthy',
      plan: 'degraded',
      lineage: 'degraded',
    });
  });

  it('suppresses duplicate event ids to keep subscription processing idempotent', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    renderHook(() => useMCPEvents(), { wrapper: createWrapper(queryClient) });

    const duplicatePayload = {
      id: 'evt_duplicate',
      type: 'step_updated',
      timestamp: '2026-03-01T00:00:00.000Z',
      workspace_id: 'ws_8',
      plan_id: 'plan_8',
      data: {
        step_index: 1,
        new_status: 'done',
        step_task: 'Duplicate-safe step',
      },
    };

    act(() => {
      MockEventSource.latest().emit('mcp_event', duplicatePayload);
      MockEventSource.latest().emit('mcp_event', duplicatePayload);
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_8', 'plan_8'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'ws_8'] });
    });

    const planInvalidations = invalidateSpy.mock.calls.filter(
      ([arg]) => JSON.stringify(arg) === JSON.stringify({ queryKey: ['plan', 'ws_8', 'plan_8'] }),
    );
    expect(planInvalidations).toHaveLength(1);
  });

  it('prevents replay duplicates from reprocessing across repeated reconnect cycles', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    renderHook(() => useMCPEvents(), { wrapper: createWrapper(queryClient) });

    const replayedPayload = {
      id: 'evt_reconnect_replay',
      type: 'step_updated',
      timestamp: '2026-03-01T00:00:00.000Z',
      workspace_id: 'ws_replay',
      plan_id: 'plan_replay',
      data: {
        step_index: 3,
        new_status: 'done',
        step_task: 'Replay-safe step',
      },
    };

    act(() => {
      for (let cycle = 1; cycle <= 3; cycle += 1) {
        MockEventSource.latest().emit('mcp_event', {
          id: `evt_reconnect_attempt_${cycle}`,
          type: 'reconnect_attempt',
          timestamp: `2026-03-01T00:00:0${cycle}.000Z`,
          workspace_id: 'ws_replay',
          plan_id: 'plan_replay',
          data: {
            attempt: cycle,
            next_backoff_ms: 1000 * cycle,
            reason_code: 'transport_error',
          },
        });

        MockEventSource.latest().emit('mcp_event', {
          id: `evt_reconnect_recovered_${cycle}`,
          type: 'connectivity_reconnected',
          timestamp: `2026-03-01T00:00:1${cycle}.000Z`,
          workspace_id: 'ws_replay',
          plan_id: 'plan_replay',
          data: {},
        });

        MockEventSource.latest().emit('mcp_event', replayedPayload);
      }
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plan', 'ws_replay', 'plan_replay'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'ws_replay'] });
    });

    const planInvalidations = invalidateSpy.mock.calls.filter(
      ([arg]) => JSON.stringify(arg) === JSON.stringify({ queryKey: ['plan', 'ws_replay', 'plan_replay'] }),
    );
    expect(planInvalidations).toHaveLength(1);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it('applies bounded retry/backoff policy for reconnect attempts and resets on recovery', () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useMCPEvents(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_retry_policy',
        type: 'reconnect_attempt',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_9',
        plan_id: 'plan_9',
        data: {
          attempt: 99,
          next_backoff_ms: 999999,
          reason_code: 'upstream_unreachable',
        },
      });
    });

    expect(result.current.retryBackoffState).toEqual({
      attempt: 8,
      next_backoff_ms: 30000,
      reason_code: 'upstream_unreachable',
    });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_retry_recovered',
        type: 'connectivity_reconnected',
        timestamp: '2026-03-01T00:00:01.000Z',
        workspace_id: 'ws_9',
        plan_id: 'plan_9',
        data: {},
      });
    });

    expect(result.current.retryBackoffState).toEqual({
      attempt: 0,
      next_backoff_ms: 1000,
    });
  });

  it('applies UX-safe pending action fallback modes during transient outage and recovery', () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useMCPEvents(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_pending_degraded',
        type: 'connectivity_degraded',
        timestamp: '2026-03-01T00:00:00.000Z',
        workspace_id: 'ws_10',
        plan_id: 'plan_10',
        data: {
          pending_action_count: 3,
          reason_code: 'transport_lost',
        },
      });
    });

    expect(result.current.pendingActionFallback).toEqual({
      mode: 'buffering',
      pending_action_count: 3,
      reason_code: 'transport_lost',
    });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_pending_recovered',
        type: 'connectivity_reconnected',
        timestamp: '2026-03-01T00:00:01.000Z',
        workspace_id: 'ws_10',
        plan_id: 'plan_10',
        data: {
          pending_action_count: 2,
          reason_code: 'flush_pending_actions',
        },
      });
    });

    expect(result.current.pendingActionFallback).toEqual({
      mode: 'draining',
      pending_action_count: 2,
      reason_code: 'flush_pending_actions',
    });

    act(() => {
      MockEventSource.latest().emit('mcp_event', {
        id: 'evt_pending_cleared',
        type: 'workspace_updated',
        timestamp: '2026-03-01T00:00:02.000Z',
        workspace_id: 'ws_10',
        data: {},
      });
    });

    expect(result.current.pendingActionFallback).toEqual({
      mode: 'idle',
      pending_action_count: 0,
    });
  });
});