/**
 * Handoff & Session Analytics Types
 *
 * Types for agent performance metrics, handoff transition analysis,
 * incident tracking, and session-level statistics.
 */

import type { AgentType } from './index';

// =============================================================================
// Handoff Analytics
// =============================================================================

/** A single transition count between two agents. */
export interface TransitionCount {
  from: AgentType | string;
  to: AgentType | string;
  count: number;
}

/** Aggregate handoff statistics for a plan or workspace. */
export interface HandoffStats {
  total_handoffs: number;
  by_transition: Record<string, number>;
  incident_count: number;
  most_common_transitions: TransitionCount[];
}

// =============================================================================
// Incident Reports
// =============================================================================

/** Severity of an operational incident. */
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Type of incident that occurred during agent execution. */
export type IncidentType =
  | 'build_failure'
  | 'test_failure'
  | 'scope_violation'
  | 'timeout'
  | 'crash'
  | 'validation_error'
  | 'other';

/** A single reported incident from an agent session. */
export interface IncidentReport {
  id: string;
  agent: AgentType | string;
  type: IncidentType;
  description: string;
  severity: IncidentSeverity;
  timestamp: string;
  resolved?: boolean;
  resolved_at?: string;
  resolved_by?: AgentType | string;
}

// =============================================================================
// Session Statistics
// =============================================================================

/** Per-session performance metrics. */
export interface SessionStats {
  session_id?: string;
  agent_type?: AgentType | string;
  duration_ms: number;
  steps_completed: number;
  artifacts_count: number;
  started_at?: string;
  completed_at?: string;
}

// =============================================================================
// Agent Performance
// =============================================================================

/** Aggregate performance metrics for a single agent type. */
export interface AgentPerformanceEntry {
  agent_type: AgentType | string;
  total_sessions: number;
  avg_duration_ms: number;
  total_steps_completed: number;
  success_rate?: number;
}
