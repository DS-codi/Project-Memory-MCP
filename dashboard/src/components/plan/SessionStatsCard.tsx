import React from 'react';
import { Clock, CheckCircle, XCircle, Users } from 'lucide-react';
import type { AgentSession } from '@/types';
import { agentBgColors, agentIcons } from '@/utils/colors';
import { useHandoffStats } from '@/hooks/useHandoffStats';

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function maxDuration(entries: { avg_duration_ms: number }[]): number {
  return Math.max(1, ...entries.map((e) => e.avg_duration_ms));
}

// =============================================================================
// Props
// =============================================================================

interface SessionStatsCardProps {
  sessions: AgentSession[];
}

// =============================================================================
// Component
// =============================================================================

export const SessionStatsCard: React.FC<SessionStatsCardProps> = ({ sessions }) => {
  const { sessionStats, agentPerformance, avgSessionDuration, completedRatio } =
    useHandoffStats(undefined, sessions);

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
        <h3 className="text-sm font-medium text-gray-400">Session Analytics</h3>
        <p className="mt-2 text-xs text-gray-500">No session data available.</p>
      </div>
    );
  }

  const completedCount = sessionStats.filter((s) => s.completed_at).length;
  const incompleteCount = sessionStats.length - completedCount;
  const barMax = maxDuration(agentPerformance);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200 flex items-center gap-1.5">
          <Users size={14} className="text-violet-400" />
          Session Analytics
        </h3>
        <span className="text-xs text-gray-500">{sessions.length} sessions</span>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryBox
          icon={<Users size={12} />}
          label="Total"
          value={String(sessions.length)}
        />
        <SummaryBox
          icon={<Clock size={12} />}
          label="Avg Duration"
          value={formatDuration(avgSessionDuration)}
        />
        <SummaryBox
          icon={completedRatio >= 0.8
            ? <CheckCircle size={12} className="text-green-400" />
            : <XCircle size={12} className="text-amber-400" />}
          label="Completed"
          value={`${completedCount}/${completedCount + incompleteCount}`}
        />
      </div>

      {/* Per-agent breakdown */}
      {agentPerformance.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Per-Agent Breakdown
          </h4>
          <div className="space-y-1.5">
            {agentPerformance.map((entry) => {
              const agentKey = entry.agent_type as keyof typeof agentBgColors;
              const bgClass = agentBgColors[agentKey] ?? 'bg-gray-500/20 text-gray-300';
              const icon = agentIcons[agentKey] ?? '🤖';
              const barWidth = Math.max(4, (entry.avg_duration_ms / barMax) * 100);

              return (
                <div key={entry.agent_type} className="flex items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border ${bgClass} min-w-[90px]`}
                  >
                    <span>{icon}</span>
                    {entry.agent_type}
                  </span>

                  {/* Duration bar */}
                  <div className="relative flex-1 h-3 rounded-full bg-gray-700/60 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-violet-500/50"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  <span className="text-gray-400 min-w-[48px] text-right">
                    {formatDuration(entry.avg_duration_ms)}
                  </span>
                  <span className="text-gray-500 min-w-[18px] text-right">
                    ×{entry.total_sessions}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Internal sub-component
// =============================================================================

const SummaryBox: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="rounded-md bg-gray-700/40 px-3 py-2 text-center">
    <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">{icon}</div>
    <div className="text-sm font-semibold text-gray-200">{value}</div>
    <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
  </div>
);

export default SessionStatsCard;
