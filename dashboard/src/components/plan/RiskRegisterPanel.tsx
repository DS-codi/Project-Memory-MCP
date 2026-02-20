import { AlertTriangle, ShieldCheck, ShieldAlert, ShieldX, Info } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { riskSeverityColors } from '@/utils/colors';
import type { RiskEntry, RiskSeverity, RiskStatus } from '@/types/schema-v2';

// =============================================================================
// Constants
// =============================================================================

const severityIcons: Record<RiskSeverity, React.ReactNode> = {
  low: <Info size={13} />,
  medium: <AlertTriangle size={13} />,
  high: <ShieldAlert size={13} />,
  critical: <ShieldX size={13} />,
};

const riskStatusColors: Record<RiskStatus, string> = {
  open: 'bg-red-500/20 text-red-300 border-red-500/50',
  mitigated: 'bg-green-500/20 text-green-300 border-green-500/50',
  accepted: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  closed: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
};

const riskStatusIcons: Record<RiskStatus, string> = {
  open: '🔴',
  mitigated: '✅',
  accepted: '🟡',
  closed: '⚫',
};

// =============================================================================
// Props
// =============================================================================

interface RiskRegisterPanelProps {
  risks?: RiskEntry[];
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function RiskRegisterPanel({ risks, className }: RiskRegisterPanelProps) {
  // Empty state for v1 plans or no risks
  if (!risks || risks.length === 0) {
    return (
      <div className={cn('border border-slate-700 rounded-lg p-4', className)}>
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <AlertTriangle size={15} className="text-slate-400" />
          Risk Register
        </h3>
        <p className="text-xs text-slate-500 italic">
          No risks identified. Legacy v1 plans do not include risk data.
        </p>
      </div>
    );
  }

  const openCount = risks.filter((r) => r.status === 'open').length;
  const criticalCount = risks.filter((r) => r.severity === 'critical').length;

  return (
    <div className={cn('border border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <AlertTriangle size={15} className="text-slate-400" />
          Risk Register
        </h3>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <Badge variant={riskSeverityColors.critical} className="text-[10px]">
              {criticalCount} critical
            </Badge>
          )}
          <span className="text-xs text-slate-400">
            {openCount} open / {risks.length} total
          </span>
        </div>
      </div>

      {/* Risk entries */}
      <div className="divide-y divide-slate-700/50">
        {risks.map((risk) => (
          <RiskRow key={risk.id} risk={risk} />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function RiskRow({ risk }: { risk: RiskEntry }) {
  const status: RiskStatus = risk.status ?? 'open';

  return (
    <div className="px-4 py-3 bg-slate-900/40 hover:bg-slate-800/50 transition-colors space-y-1.5">
      {/* Top row: severity + description + status */}
      <div className="flex items-start gap-2">
        <Badge variant={riskSeverityColors[risk.severity]} className="text-[10px] shrink-0">
          {severityIcons[risk.severity]} {risk.severity}
        </Badge>
        <span className="text-xs text-slate-200 flex-1">{risk.description}</span>
        <Badge variant={riskStatusColors[status]} className="text-[10px] shrink-0">
          {riskStatusIcons[status]} {status}
        </Badge>
      </div>

      {/* Mitigation */}
      {risk.mitigation && (
        <div className="flex items-start gap-1.5 ml-1">
          <ShieldCheck size={12} className="text-green-400/70 shrink-0 mt-0.5" />
          <span className="text-[11px] text-slate-400">{risk.mitigation}</span>
        </div>
      )}

      {/* Affected phases */}
      {risk.affected_phases && risk.affected_phases.length > 0 && (
        <div className="flex items-center gap-1.5 ml-1 flex-wrap">
          <span className="text-[10px] text-slate-500">Phases:</span>
          {risk.affected_phases.map((phase) => (
            <span
              key={phase}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400"
            >
              {phase}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
