import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { PhaseCard } from './PhaseCard';
import { groupStepsByPhase, computePhaseStatus } from '@/utils/phase-helpers';
import type { PlanStep } from '@/types';
import type { PlanPhase, PhaseStatus } from '@/types/schema-v2';

// =============================================================================
// Props
// =============================================================================

interface PhaseListViewProps {
  steps: PlanStep[];
  phases?: PlanPhase[];
  /** Expand all phase cards by default */
  defaultOpen?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function PhaseListView({ steps, phases, defaultOpen = false }: PhaseListViewProps) {
  const groups = groupStepsByPhase(steps, phases);

  const totalDone = steps.filter((s) => s.status === 'done').length;
  const totalSteps = steps.length;

  const statusCounts = groups.reduce(
    (acc, g) => {
      const status = g.meta?.phase_status ?? computePhaseStatus(g.steps);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<PhaseStatus, number>,
  );

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-white">Phases</h3>
          <Badge>{groups.length} phases</Badge>
          <PhaseSummaryBadges counts={statusCounts} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">
            {totalDone}/{totalSteps} steps
          </span>
          <ProgressBar value={totalDone} max={totalSteps} className="w-28" />
        </div>
      </div>

      {/* Phase cards */}
      <div className="space-y-2">
        {groups.map((group) => (
          <PhaseCard
            key={group.phase}
            phaseName={group.phase}
            steps={steps.filter((s) => (s.phase || 'Unphased') === group.phase)}
            phaseMeta={group.meta}
            defaultOpen={defaultOpen}
          />
        ))}
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <p className="text-sm text-slate-500 italic text-center py-6">
          No phases found in this plan.
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Summary badges
// =============================================================================

const summaryColors: Record<PhaseStatus, string> = {
  complete: 'bg-green-500/20 text-green-300 border-green-500/50',
  active: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  blocked: 'bg-red-500/20 text-red-300 border-red-500/50',
  pending: 'bg-gray-500/20 text-gray-300 border-gray-500/50',
};

function PhaseSummaryBadges({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {entries.map(([status, n]) => (
        <Badge
          key={status}
          variant={summaryColors[status as PhaseStatus] ?? summaryColors.pending}
          className="text-[10px]"
        >
          {n} {status}
        </Badge>
      ))}
    </div>
  );
}
