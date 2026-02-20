import { Link } from 'react-router-dom';
import { BookOpen, Megaphone } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { planStatusColors, riskSeverityColors } from '@/utils/colors';
import type { ProgramPlanRef } from '@/types';
import type { RiskEntry, RiskSeverity, PhaseAnnouncement, SkillMatch } from '@/types/schema-v2';

// =============================================================================
// Types
// =============================================================================

/** Extended plan ref that may carry v2 program data. */
interface EnhancedPlanRef extends ProgramPlanRef {
  risk_register?: RiskEntry[];
  matched_skills?: SkillMatch[];
}

interface EnhancedDependencyGraphProps {
  plans: EnhancedPlanRef[];
  workspaceId: string;
  phaseAnnouncements?: PhaseAnnouncement[];
  className?: string;
}

interface Wave {
  index: number;
  plans: EnhancedPlanRef[];
}

// =============================================================================
// Constants
// =============================================================================

const severityOrder: RiskSeverity[] = ['critical', 'high', 'medium', 'low'];

const riskBorderColors: Record<RiskSeverity, string> = {
  critical: 'border-red-500/70',
  high: 'border-orange-500/70',
  medium: 'border-yellow-500/60',
  low: 'border-green-500/50',
};

// =============================================================================
// Helpers
// =============================================================================

/** Compute waves (same algorithm as DependencyGraph). */
function computeWaves(plans: EnhancedPlanRef[]): Wave[] {
  const planIds = new Set(plans.map((p) => p.plan_id));
  const resolved = new Set<string>();
  const remaining = new Map(plans.map((p) => [p.plan_id, p]));
  const waves: Wave[] = [];
  let safety = 0;

  while (remaining.size > 0 && safety < 20) {
    safety++;
    const wavePlans: EnhancedPlanRef[] = [];
    for (const [, plan] of remaining) {
      const deps = (plan.depends_on_plans || []).filter((d) => planIds.has(d));
      if (deps.every((d) => resolved.has(d))) wavePlans.push(plan);
    }
    if (wavePlans.length === 0) {
      waves.push({ index: waves.length, plans: Array.from(remaining.values()) });
      break;
    }
    for (const p of wavePlans) {
      resolved.add(p.plan_id);
      remaining.delete(p.plan_id);
    }
    waves.push({ index: waves.length, plans: wavePlans });
  }
  return waves;
}

/** Get the highest-severity risk for a plan. */
function highestRisk(risks?: RiskEntry[]): RiskSeverity | null {
  if (!risks || risks.length === 0) return null;
  for (const sev of severityOrder) {
    if (risks.some((r) => r.severity === sev)) return sev;
  }
  return null;
}

// =============================================================================
// Sub-Components
// =============================================================================

function EnhancedPlanCard({
  plan,
  workspaceId,
}: {
  plan: EnhancedPlanRef;
  workspaceId: string;
}) {
  const pct =
    plan.progress.total > 0
      ? Math.round((plan.progress.done / plan.progress.total) * 100)
      : 0;

  const topRisk = highestRisk(plan.risk_register);
  const skillCount = plan.matched_skills?.length ?? 0;
  const riskCount = plan.risk_register?.length ?? 0;

  // Risk-colored border when v2 risk data exists
  const borderClass = topRisk
    ? riskBorderColors[topRisk]
    : 'border-slate-700';

  return (
    <Link
      to={`/workspace/${workspaceId}/plan/${plan.plan_id}`}
      className={cn(
        'block bg-slate-800 border-2 rounded-lg p-3 hover:brightness-110 transition-all min-w-[200px] max-w-[280px]',
        borderClass,
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-slate-200 truncate">{plan.title}</span>
        <Badge variant={planStatusColors[plan.status]}>{plan.status}</Badge>
      </div>

      <ProgressBar value={plan.progress.done} max={plan.progress.total} className="mb-1" />

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {plan.progress.done}/{plan.progress.total} steps
        </span>
        <span>{pct}%</span>
      </div>

      {/* v2 indicators */}
      {(riskCount > 0 || skillCount > 0) && (
        <div className="flex items-center gap-2 mt-2">
          {riskCount > 0 && topRisk && (
            <Badge variant={riskSeverityColors[topRisk]}>
              {riskCount} risk{riskCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {skillCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-purple-400">
              <BookOpen size={11} />
              {skillCount}
            </span>
          )}
        </div>
      )}

      {plan.depends_on_plans && plan.depends_on_plans.length > 0 && (
        <div className="mt-1.5 text-xs text-slate-500">
          ← {plan.depends_on_plans.length} dep
          {plan.depends_on_plans.length !== 1 ? 's' : ''}
        </div>
      )}
    </Link>
  );
}

function PhaseAnnouncementBanner({ announcement }: { announcement: PhaseAnnouncement }) {
  return (
    <div className="flex items-start gap-2 bg-violet-500/10 border border-violet-500/30 rounded-lg px-3 py-2">
      <Megaphone size={14} className="text-violet-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-xs font-medium text-violet-300">{announcement.phase}</span>
        <p className="text-sm text-slate-300">{announcement.message}</p>
        {announcement.announced_by && (
          <span className="text-xs text-slate-500">— {announcement.announced_by}</span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function EnhancedDependencyGraph({
  plans,
  workspaceId,
  phaseAnnouncements,
  className,
}: EnhancedDependencyGraphProps) {
  if (plans.length === 0) return null;

  const hasDeps = plans.some((p) => p.depends_on_plans && p.depends_on_plans.length > 0);
  const announcements = phaseAnnouncements ?? [];

  const renderCards = (planList: EnhancedPlanRef[]) => (
    <div className="flex flex-wrap gap-3">
      {planList.map((plan) => (
        <EnhancedPlanCard key={plan.plan_id} plan={plan} workspaceId={workspaceId} />
      ))}
    </div>
  );

  return (
    <div className={cn('bg-slate-800 border border-slate-700 rounded-lg p-4', className)}>
      <h3 className="text-sm font-semibold mb-4">
        Plan Dependencies & Execution Waves
      </h3>

      {/* Phase Announcements */}
      {announcements.length > 0 && (
        <div className="space-y-2 mb-4">
          {announcements.map((a, i) => (
            <PhaseAnnouncementBanner key={i} announcement={a} />
          ))}
        </div>
      )}

      {/* Flat grid when no dependencies */}
      {!hasDeps ? (
        <>
          <p className="text-xs text-slate-500 mb-3">
            No inter-plan dependencies defined. All plans can execute in parallel.
          </p>
          {renderCards(plans)}
        </>
      ) : (
        <div className="space-y-6">
          {computeWaves(plans).map((wave, waveIdx, arr) => (
            <div key={wave.index}>
              {/* Wave header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold">
                  {wave.index + 1}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  Wave {wave.index + 1}
                </span>
                <span className="text-xs text-slate-500">
                  {wave.plans.length} plan{wave.plans.length !== 1 ? 's' : ''} —{' '}
                  {wave.index === 0 ? 'no dependencies' : 'depends on prior waves'}
                </span>
              </div>

              {/* Wave plans */}
              <div className="pl-4 border-l-2 border-violet-500/30">
                {renderCards(wave.plans)}
              </div>

              {/* Connector arrow */}
              {waveIdx < arr.length - 1 && (
                <div className="flex justify-center py-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="text-slate-600">
                    <path
                      d="M12 4 L12 16 M7 12 L12 17 L17 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
