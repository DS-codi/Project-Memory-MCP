import { useEffect, useRef, useState } from 'react';
import { useToast } from '../components/common/Toast';
import { useSettings } from '../store/settings';
import { useQueryClient } from '@tanstack/react-query';
import type {
  PendingActionFallbackState,
  RecoveryDomain,
  RecoveryDomainMap,
  RetryBackoffPolicy,
  RetryBackoffState,
  SessionReconnectState,
} from '../types';

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
  | 'workspace_updated'
  | 'connectivity_degraded'
  | 'connectivity_disconnected'
  | 'reconnect_attempt'
  | 'connectivity_reconnected';

interface NormalizedMCPEvent extends MCPEvent {
  type: NormalizedEventType | string;
}

const HANDOFF_EVENT_ALIASES = new Set(['handoff', 'handoff_started', 'handoff_completed']);
const RECONNECTING_EVENT_TYPES = new Set(['connectivity_disconnected', 'reconnect_attempt']);
const DEGRADED_EVENT_TYPES = new Set(['connectivity_degraded']);
const RECOVERED_EVENT_TYPES = new Set(['connectivity_reconnected']);
const DEGRADED_TIMEOUT_MS = 5000;
const MAX_PROCESSED_EVENT_IDS = 500;
const RECOVERY_DOMAINS: RecoveryDomain[] = ['workspace', 'plans', 'plan', 'lineage'];
const RETRY_BACKOFF_POLICY: RetryBackoffPolicy = {
  initial_backoff_ms: 1000,
  max_backoff_ms: 30000,
  multiplier: 2,
  jitter_ratio: 0.2,
  max_attempts: 8,
};

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getBackoffForAttempt(attempt: number, policy: RetryBackoffPolicy): number {
  const boundedAttempt = clamp(attempt, 1, policy.max_attempts);
  const exponentialBase = policy.initial_backoff_ms * Math.pow(policy.multiplier, boundedAttempt - 1);
  const boundedBase = Math.min(exponentialBase, policy.max_backoff_ms);
  const jitterCap = boundedBase * policy.jitter_ratio;
  const deterministicJitter = Math.round(jitterCap / 2);
  return Math.min(boundedBase + deterministicJitter, policy.max_backoff_ms);
}

function getDomainArray(value: unknown): RecoveryDomain[] {
  if (!Array.isArray(value)) return [];
  const domains = value.filter((entry): entry is RecoveryDomain => RECOVERY_DOMAINS.includes(entry as RecoveryDomain));
  return [...new Set(domains)];
}

function createDomainMap(status: 'healthy' | 'degraded' = 'healthy'): RecoveryDomainMap {
  return {
    workspace: status,
    plans: status,
    plan: status,
    lineage: status,
  };
}

function normalizeDegradedDomains(event: NormalizedMCPEvent, workspaceId?: string, planId?: string): RecoveryDomain[] {
  const explicitDomains = getDomainArray(event.data.degraded_domains ?? event.data.failed_domains);
  if (explicitDomains.length > 0) return explicitDomains;

  const inferredDomains: RecoveryDomain[] = [];
  if (workspaceId) {
    inferredDomains.push('workspace', 'plans');
  }
  if (workspaceId && planId) {
    inferredDomains.push('plan', 'lineage');
  }

  return inferredDomains.length > 0 ? inferredDomains : RECOVERY_DOMAINS;
}

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
  const reconnectDegradeTimeoutRef = useRef<number | null>(null);
  const reconnectStateRef = useRef<SessionReconnectState>('reconnecting');
  const staleDataRef = useRef(false);
  const pendingActionCountRef = useRef(0);
  const pendingActionFallbackRef = useRef<PendingActionFallbackState>({
    mode: 'idle',
    pending_action_count: 0,
  });
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const processedEventOrderRef = useRef<string[]>([]);
  const recoveryDomainsRef = useRef<RecoveryDomainMap>(createDomainMap());
  const retryBackoffPolicyRef = useRef<RetryBackoffPolicy>(RETRY_BACKOFF_POLICY);
  const retryBackoffStateRef = useRef<RetryBackoffState>({
    attempt: 0,
    next_backoff_ms: RETRY_BACKOFF_POLICY.initial_backoff_ms,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectState, setReconnectState] = useState<SessionReconnectState>('reconnecting');
  const [hasStaleData, setHasStaleData] = useState(false);
  const [degradedDomains, setDegradedDomains] = useState<RecoveryDomainMap>(createDomainMap());
  const [retryBackoffState, setRetryBackoffState] = useState<RetryBackoffState>(retryBackoffStateRef.current);
  const [pendingActionFallback, setPendingActionFallback] = useState<PendingActionFallbackState>(
    pendingActionFallbackRef.current,
  );

  const setReconnectStateSafe = (nextState: SessionReconnectState) => {
    reconnectStateRef.current = nextState;
    setReconnectState(nextState);
  };

  const setStaleDataSafe = (stale: boolean) => {
    staleDataRef.current = stale;
    setHasStaleData(stale);
  };

  const setRecoveryDomainsSafe = (nextDomains: RecoveryDomainMap) => {
    recoveryDomainsRef.current = nextDomains;
    setDegradedDomains(nextDomains);
    const hasAnyDegradedDomain = Object.values(nextDomains).some((domainState) => domainState === 'degraded');
    setStaleDataSafe(hasAnyDegradedDomain);
  };

  const setDomainsByStatus = (status: 'healthy' | 'degraded') => {
    setRecoveryDomainsSafe(createDomainMap(status));
  };

  const degradeDomains = (domains: RecoveryDomain[]) => {
    const nextDomains = createDomainMap('healthy');
    domains.forEach((domain) => {
      nextDomains[domain] = 'degraded';
    });
    setRecoveryDomainsSafe(nextDomains);
  };

  const setRetryBackoffStateSafe = (nextState: RetryBackoffState) => {
    retryBackoffStateRef.current = nextState;
    setRetryBackoffState(nextState);
  };

  const setPendingActionFallbackSafe = (nextState: PendingActionFallbackState) => {
    pendingActionFallbackRef.current = nextState;
    setPendingActionFallback(nextState);
  };

  const updatePendingActionFallback = (
    reconnectPhase: SessionReconnectState,
    pendingCount: number,
    reasonCode?: string,
  ) => {
    if (reconnectPhase === 'connected') {
      setPendingActionFallbackSafe({ mode: 'idle', pending_action_count: 0 });
      return;
    }

    if (reconnectPhase === 'recovered') {
      if (pendingCount > 0) {
        setPendingActionFallbackSafe({
          mode: 'draining',
          pending_action_count: pendingCount,
          reason_code: reasonCode,
        });
      } else {
        setPendingActionFallbackSafe({ mode: 'idle', pending_action_count: 0 });
      }
      return;
    }

    if (pendingCount > 0) {
      setPendingActionFallbackSafe({
        mode: 'buffering',
        pending_action_count: pendingCount,
        reason_code: reasonCode,
      });
      return;
    }

    setPendingActionFallbackSafe({
      mode: 'read_only',
      pending_action_count: 0,
      reason_code: reasonCode,
    });
  };

  const resetRetryBackoff = () => {
    setRetryBackoffStateSafe({
      attempt: 0,
      next_backoff_ms: retryBackoffPolicyRef.current.initial_backoff_ms,
    });
  };

  const bumpRetryBackoff = (reasonCode?: string) => {
    const policy = retryBackoffPolicyRef.current;
    const nextAttempt = clamp(retryBackoffStateRef.current.attempt + 1, 1, policy.max_attempts);
    setRetryBackoffStateSafe({
      attempt: nextAttempt,
      next_backoff_ms: getBackoffForAttempt(nextAttempt, policy),
      reason_code: reasonCode,
    });
  };

  const applyRetryStateFromEvent = (event: NormalizedMCPEvent) => {
    const policy = retryBackoffPolicyRef.current;
    const attemptedFromEvent = getNumber(event.data.attempt ?? event.data.retry_attempt);
    const nextAttempt = clamp(
      attemptedFromEvent ?? retryBackoffStateRef.current.attempt + 1,
      1,
      policy.max_attempts,
    );
    const backoffFromEvent = getNumber(event.data.backoff_ms ?? event.data.next_backoff_ms);
    const nextBackoff = clamp(
      backoffFromEvent ?? getBackoffForAttempt(nextAttempt, policy),
      policy.initial_backoff_ms,
      policy.max_backoff_ms,
    );

    setRetryBackoffStateSafe({
      attempt: nextAttempt,
      next_backoff_ms: nextBackoff,
      reason_code: getString(event.data.reason_code),
    });
  };

  const shouldProcessEvent = (eventId: string): boolean => {
    if (processedEventIdsRef.current.has(eventId)) {
      return false;
    }

    processedEventIdsRef.current.add(eventId);
    processedEventOrderRef.current.push(eventId);

    if (processedEventOrderRef.current.length > MAX_PROCESSED_EVENT_IDS) {
      const expiredEventId = processedEventOrderRef.current.shift();
      if (expiredEventId) {
        processedEventIdsRef.current.delete(expiredEventId);
      }
    }

    return true;
  };

  const scheduleDegradedTransition = () => {
    if (reconnectDegradeTimeoutRef.current !== null) {
      window.clearTimeout(reconnectDegradeTimeoutRef.current);
    }

    reconnectDegradeTimeoutRef.current = window.setTimeout(() => {
      if (!connectedRef.current) {
        setReconnectStateSafe('degraded');
        setDomainsByStatus('degraded');
      }
      reconnectDegradeTimeoutRef.current = null;
    }, DEGRADED_TIMEOUT_MS);
  };

  const clearDegradedTransition = () => {
    if (reconnectDegradeTimeoutRef.current !== null) {
      window.clearTimeout(reconnectDegradeTimeoutRef.current);
      reconnectDegradeTimeoutRef.current = null;
    }
  };

  const invalidateRecoveryBoundaries = (workspaceId?: string, planId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });

    if (workspaceId) {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
    }

    if (workspaceId && planId) {
      queryClient.invalidateQueries({ queryKey: ['plan', workspaceId, planId] });
      queryClient.invalidateQueries({ queryKey: ['lineage', workspaceId, planId] });
    }
  };

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
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource('/api/events/stream');
    eventSourceRef.current = eventSource;

    const handleConnected = () => {
      connectedRef.current = true;
      setIsConnected(true);

      if (reconnectStateRef.current !== 'connected') {
        setReconnectStateSafe('recovered');
      }

      clearDegradedTransition();
    };

    const handleEventMessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as MCPEvent;
        if (!shouldProcessEvent(event.id)) {
          return;
        }
        handleEvent(normalizeEvent(event));
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    const handleError = () => {
      connectedRef.current = false;
       setIsConnected(false);
      setReconnectStateSafe('reconnecting');
      setDomainsByStatus('degraded');
      bumpRetryBackoff('transport_error');
      updatePendingActionFallback('reconnecting', pendingActionCountRef.current, 'transport_error');
      scheduleDegradedTransition();
      // Will auto-reconnect
    };

    eventSource.addEventListener('connected', handleConnected);
    eventSource.addEventListener('mcp_event', handleEventMessage as EventListener);
    eventSource.onerror = handleError;

    return () => {
      clearDegradedTransition();
      if (typeof eventSource.removeEventListener === 'function') {
        eventSource.removeEventListener('connected', handleConnected);
        eventSource.removeEventListener('mcp_event', handleEventMessage as EventListener);
      }
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
      eventSource.close();
      eventSource.onerror = null;
    };
  }, []);

  const handleEvent = (event: NormalizedMCPEvent) => {
    const currentSettings = settingsRef.current;
    const shouldShowToast = currentSettings.showNotifications && currentSettings.showToastNotifications;
    const { workspaceId, planId } = getEventScope(event);

    if (RECONNECTING_EVENT_TYPES.has(event.type)) {
      connectedRef.current = false;
      setIsConnected(false);
      setReconnectStateSafe('reconnecting');
      setDomainsByStatus('degraded');
      const reconnectPendingCount = getNumber(event.data.pending_action_count) ?? pendingActionCountRef.current;
      pendingActionCountRef.current = reconnectPendingCount;
      updatePendingActionFallback('reconnecting', reconnectPendingCount, getString(event.data.reason_code));
      if (event.type === 'reconnect_attempt') {
        applyRetryStateFromEvent(event);
      } else {
        bumpRetryBackoff(getString(event.data.reason_code));
      }
      scheduleDegradedTransition();
    }

    if (DEGRADED_EVENT_TYPES.has(event.type)) {
      setReconnectStateSafe('degraded');
      degradeDomains(normalizeDegradedDomains(event, workspaceId, planId));
      pendingActionCountRef.current = getNumber(event.data.pending_action_count) ?? pendingActionCountRef.current;
      updatePendingActionFallback(
        'degraded',
        pendingActionCountRef.current,
        getString(event.data.reason_code),
      );
      clearDegradedTransition();
    }

    if (RECOVERED_EVENT_TYPES.has(event.type)) {
      connectedRef.current = true;
      setIsConnected(true);
      setReconnectStateSafe('recovered');
      const hasDegradedDomain = Object.values(recoveryDomainsRef.current).some(
        (domainState) => domainState === 'degraded',
      );
      if (!hasDegradedDomain) {
        setDomainsByStatus('degraded');
      } else {
        setStaleDataSafe(true);
      }
      pendingActionCountRef.current = getNumber(event.data.pending_action_count) ?? pendingActionCountRef.current;
      updatePendingActionFallback(
        'recovered',
        pendingActionCountRef.current,
        getString(event.data.reason_code),
      );
      resetRetryBackoff();
      clearDegradedTransition();
      invalidateRecoveryBoundaries(workspaceId, planId);
    }

    // Map event types to toast notifications
    switch (event.type) {
      case 'step_updated':
        if (shouldShowToast && currentSettings.notifyOnStepComplete && event.data.new_status === 'done') {
          toast.success('Step Completed', `"${event.data.step_task}" marked as done`);
        }
        if (reconnectStateRef.current === 'recovered') {
          setReconnectStateSafe('connected');
          setDomainsByStatus('healthy');
          pendingActionCountRef.current = 0;
          updatePendingActionFallback('connected', 0);
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
        if (reconnectStateRef.current === 'recovered') {
          setReconnectStateSafe('connected');
          setDomainsByStatus('healthy');
          pendingActionCountRef.current = 0;
          updatePendingActionFallback('connected', 0);
        }
        break;

      case 'connectivity_degraded':
      case 'connectivity_disconnected':
      case 'reconnect_attempt':
      case 'connectivity_reconnected':
        break;

      default:
        // For unknown events, just log them
        console.log('Unhandled MCP event:', event.type, event);
    }
  };

  return {
    isConnected,
    reconnectState,
    hasStaleData,
    degradedDomains,
    retryBackoffPolicy: retryBackoffPolicyRef.current,
    retryBackoffState,
    pendingActionCount: pendingActionCountRef.current,
    pendingActionFallback,
  };
}
