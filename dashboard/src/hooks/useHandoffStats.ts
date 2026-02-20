import { useMemo } from 'react';
import type { AgentSession, LineageEntry } from '@/types';
import type {
  HandoffStats,
  TransitionCount,
  SessionStats,
  AgentPerformanceEntry,
} from '@/types/stats';

// =============================================================================
// Return type
// =============================================================================

export interface UseHandoffStatsResult {
  handoffStats: HandoffStats;
  sessionStats: SessionStats[];
  agentPerformance: AgentPerformanceEntry[];
  avgSessionDuration: number;
  completedRatio: number;
}

// =============================================================================
// Helpers
// =============================================================================

function computeHandoffStats(lineage: LineageEntry[]): HandoffStats {
  const byTransition: Record<string, number> = {};

  for (const entry of lineage) {
    const key = `${entry.from_agent}→${entry.to_agent}`;
    byTransition[key] = (byTransition[key] ?? 0) + 1;
  }

  const sorted: TransitionCount[] = Object.entries(byTransition)
    .map(([key, count]) => {
      const [from, to] = key.split('→');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    total_handoffs: lineage.length,
    by_transition: byTransition,
    incident_count: 0, // incidents come from external data; default to 0
    most_common_transitions: sorted.slice(0, 5),
  };
}

function computeSessionStats(sessions: AgentSession[]): SessionStats[] {
  return sessions.map((s) => {
    const start = new Date(s.started_at).getTime();
    const end = s.completed_at ? new Date(s.completed_at).getTime() : Date.now();
    return {
      session_id: s.session_id,
      agent_type: s.agent_type,
      duration_ms: Math.max(0, end - start),
      steps_completed: 0, // step count not tracked per-session in AgentSession
      artifacts_count: s.artifacts?.length ?? 0,
      started_at: s.started_at,
      completed_at: s.completed_at,
    };
  });
}

// =============================================================================
// Hook
// =============================================================================

export function useHandoffStats(
  lineage: LineageEntry[] | undefined,
  sessions: AgentSession[] | undefined,
): UseHandoffStatsResult {
  return useMemo(() => {
    const safeLineage = lineage ?? [];
    const safeSessions = sessions ?? [];

    const handoffStats = computeHandoffStats(safeLineage);
    const sessionStats = computeSessionStats(safeSessions);

    // Average duration across completed sessions
    const completed = sessionStats.filter((s) => s.completed_at);
    const avgSessionDuration =
      completed.length > 0
        ? completed.reduce((sum, s) => sum + s.duration_ms, 0) / completed.length
        : 0;

    const completedRatio =
      safeSessions.length > 0
        ? safeSessions.filter((s) => s.completed_at).length / safeSessions.length
        : 0;

    // Per-agent aggregation
    const agentMap = new Map<string, { total: number; durationSum: number; artifacts: number }>();
    for (const s of sessionStats) {
      const key = s.agent_type ?? 'Unknown';
      const entry = agentMap.get(key) ?? { total: 0, durationSum: 0, artifacts: 0 };
      entry.total += 1;
      entry.durationSum += s.duration_ms;
      entry.artifacts += s.artifacts_count;
      agentMap.set(key, entry);
    }

    const agentPerformance: AgentPerformanceEntry[] = Array.from(agentMap.entries())
      .map(([agent_type, v]) => ({
        agent_type,
        total_sessions: v.total,
        avg_duration_ms: v.total > 0 ? Math.round(v.durationSum / v.total) : 0,
        total_steps_completed: 0,
      }))
      .sort((a, b) => b.total_sessions - a.total_sessions);

    return { handoffStats, sessionStats, agentPerformance, avgSessionDuration, completedRatio };
  }, [lineage, sessions]);
}
