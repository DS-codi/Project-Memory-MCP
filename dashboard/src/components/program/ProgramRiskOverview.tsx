import { AlertTriangle, ShieldAlert, ShieldX, Info, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { riskSeverityColors } from '@/utils/colors';
import type { RiskEntry, RiskSeverity } from '@/types/schema-v2';

// =============================================================================
// Constants
// =============================================================================

const severityOrder: RiskSeverity[] = ['critical', 'high', 'medium', 'low'];

const severityIcons: Record<RiskSeverity, React.ReactNode> = {
  low: <Info size={13} />,
  medium: <AlertTriangle size={13} />,
  high: <ShieldAlert size={13} />,
  critical: <ShieldX size={13} />,
};

const severityHeatmapColors: Record<RiskSeverity, string> = {
  low: 'bg-green-500/30 text-green-300 border-green-500/40',
  medium: 'bg-yellow-500/30 text-yellow-300 border-yellow-500/40',
  high: 'bg-orange-500/30 text-orange-300 border-orange-500/40',
  critical: 'bg-red-500/30 text-red-300 border-red-500/40',
};

// =============================================================================
// Helpers
// =============================================================================

/** Compute the overall program risk level from the highest-severity open risk. */
function computeOverallRisk(risks: RiskEntry[]): RiskSeverity {
  const openRisks = risks.filter((r) => !r.status || r.status === 'open');
  if (openRisks.length === 0) return 'low';
  for (const sev of severityOrder) {
    if (openRisks.some((r) => r.severity === sev)) return sev;
  }
  return 'low';
}

/** Count risks by severity. */
function countBySeverity(risks: RiskEntry[]): Record<RiskSeverity, number> {
  const counts: Record<RiskSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of risks) {
    counts[r.severity] = (counts[r.severity] || 0) + 1;
  }
  return counts;
}

// =============================================================================
// Props
// =============================================================================

interface ProgramRiskOverviewProps {
  risks: RiskEntry[];
  workspaceId?: string;
  className?: string;
}

// =============================================================================
// Sub-Components
// =============================================================================

function RiskHeatmap({ counts }: { counts: Record<RiskSeverity, number> }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {severityOrder.map((sev) => (
        <div
          key={sev}
          className={cn(
            'rounded-lg border p-3 text-center',
            counts[sev] > 0 ? severityHeatmapColors[sev] : 'bg-slate-700/30 text-slate-500 border-slate-600/40',
          )}
        >
          <div className="text-lg font-bold">{counts[sev]}</div>
          <div className="text-xs capitalize">{sev}</div>
        </div>
      ))}
    </div>
  );
}

function TopRiskRow({ risk, workspaceId }: { risk: RiskEntry; workspaceId?: string }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-700/50 last:border-0">
      <span className="mt-0.5 shrink-0">{severityIcons[risk.severity]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 leading-snug">{risk.description}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant={riskSeverityColors[risk.severity]}>{risk.severity}</Badge>
          <span className="text-xs text-slate-500 capitalize">{risk.type.replace(/_/g, ' ')}</span>
          {risk.source_plan && workspaceId && (
            <Link
              to={`/workspace/${workspaceId}/plan/${risk.source_plan}`}
              className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
            >
              <ExternalLink size={10} />
              {risk.source_plan.slice(-8)}
            </Link>
          )}
        </div>
        {risk.mitigation && (
          <p className="text-xs text-slate-500 mt-1 italic">⛑ {risk.mitigation}</p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ProgramRiskOverview({ risks, workspaceId, className }: ProgramRiskOverviewProps) {
  if (risks.length === 0) return null;

  const counts = countBySeverity(risks);
  const overallRisk = computeOverallRisk(risks);

  // Sort risks by severity (critical first), take top 5
  const sortedRisks = [...risks].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  );
  const topRisks = sortedRisks.slice(0, 5);

  return (
    <div className={cn('bg-slate-800 border border-slate-700 rounded-lg p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400" />
          Program Risk Overview
        </h3>
        <Badge variant={riskSeverityColors[overallRisk]}>
          {overallRisk} risk
        </Badge>
      </div>

      {/* Heatmap */}
      <RiskHeatmap counts={counts} />

      {/* Top Risks */}
      <div className="mt-4">
        <h4 className="text-xs font-medium text-slate-400 mb-2">
          Top Risks ({topRisks.length} of {risks.length})
        </h4>
        <div className="divide-y divide-slate-700/50">
          {topRisks.map((risk) => (
            <TopRiskRow key={risk.id} risk={risk} workspaceId={workspaceId} />
          ))}
        </div>
      </div>
    </div>
  );
}
