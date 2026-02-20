import React from 'react';
import { ArrowRight, GitBranch, AlertTriangle, TrendingUp } from 'lucide-react';
import type { AgentSession, LineageEntry, AgentType } from '@/types';
import type { IncidentReport } from '@/types/stats';
import { agentBgColors, agentIcons, incidentStatusColors } from '@/utils/colors';
import { useHandoffStats } from '@/hooks/useHandoffStats';

// =============================================================================
// Props
// =============================================================================

interface HandoffStatsPanelProps {
  lineage: LineageEntry[];
  sessions: AgentSession[];
  incidents?: IncidentReport[];
}

// =============================================================================
// Severity badge class
// =============================================================================

const severityClasses: Record<string, string> = {
  low: 'bg-green-500/20 text-green-300 border-green-500/50',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  critical: 'bg-red-500/20 text-red-300 border-red-500/50',
};

// =============================================================================
// Component
// =============================================================================

export const HandoffStatsPanel: React.FC<HandoffStatsPanelProps> = ({
  lineage,
  sessions,
  incidents = [],
}) => {
  const { handoffStats } = useHandoffStats(lineage, sessions);
  const { total_handoffs, most_common_transitions } = handoffStats;

  if (lineage.length === 0 && sessions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
        <h3 className="text-sm font-medium text-gray-400">Handoff Analytics</h3>
        <p className="mt-2 text-xs text-gray-500">No handoff data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200 flex items-center gap-1.5">
          <GitBranch size={14} className="text-cyan-400" />
          Handoff Analytics
        </h3>
        <span className="text-xs text-gray-500">{total_handoffs} handoffs</span>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <StatBadge label="Handoffs" value={total_handoffs} icon={<GitBranch size={11} />} />
        <StatBadge
          label="Transitions"
          value={most_common_transitions.length}
          icon={<TrendingUp size={11} />}
        />
        {incidents.length > 0 && (
          <StatBadge
            label="Incidents"
            value={incidents.length}
            icon={<AlertTriangle size={11} />}
            accent
          />
        )}
      </div>

      {/* Most common transitions */}
      {most_common_transitions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Top Transitions
          </h4>
          <div className="space-y-1.5">
            {most_common_transitions.map((t, i) => (
              <TransitionRow key={i} from={t.from} to={t.to} count={t.count} />
            ))}
          </div>
        </div>
      )}

      {/* Handoff flow mini-visualization */}
      {lineage.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Handoff Flow
          </h4>
          <div className="flex flex-wrap items-center gap-1">
            {lineage.map((entry, i) => (
              <React.Fragment key={i}>
                {i === 0 && <AgentChip agent={entry.from_agent} />}
                <ArrowRight size={10} className="text-gray-600 flex-shrink-0" />
                <AgentChip agent={entry.to_agent} />
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Incident reports */}
      {incidents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle size={11} className="text-amber-400" />
            Incidents
          </h4>
          <div className="space-y-1.5">
            {incidents.map((inc) => (
              <div
                key={inc.id}
                className="flex items-start gap-2 rounded-md bg-gray-700/40 px-3 py-2 text-xs"
              >
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                    severityClasses[inc.severity] ?? severityClasses.low
                  }`}
                >
                  {inc.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-300">{inc.description}</span>
                  <div className="flex items-center gap-2 mt-0.5 text-gray-500">
                    <span>{inc.agent}</span>
                    <span>·</span>
                    <span>{inc.type.replace(/_/g, ' ')}</span>
                    {inc.resolved && (
                      <>
                        <span>·</span>
                        <span
                          className={`rounded px-1 py-px text-[10px] border ${
                            incidentStatusColors.resolved
                          }`}
                        >
                          resolved
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Internal sub-components
// =============================================================================

const StatBadge: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}> = ({ label, value, icon, accent }) => (
  <div
    className={`rounded-md px-2.5 py-1.5 text-xs flex items-center gap-1.5 ${
      accent
        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
        : 'bg-gray-700/40 text-gray-300'
    }`}
  >
    {icon}
    <span className="font-semibold">{value}</span>
    <span className="text-gray-400">{label}</span>
  </div>
);

const AgentChip: React.FC<{ agent: string }> = ({ agent }) => {
  const agentKey = agent as AgentType;
  const bgClass = agentBgColors[agentKey] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/50';
  const icon = agentIcons[agentKey] ?? '🤖';

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium border ${bgClass}`}
    >
      <span>{icon}</span>
      {agent}
    </span>
  );
};

const TransitionRow: React.FC<{ from: string; to: string; count: number }> = ({
  from,
  to,
  count,
}) => (
  <div className="flex items-center gap-2 text-xs">
    <AgentChip agent={from} />
    <ArrowRight size={10} className="text-gray-500 flex-shrink-0" />
    <AgentChip agent={to} />
    <span className="ml-auto text-gray-400 font-medium">×{count}</span>
  </div>
);

export default HandoffStatsPanel;
