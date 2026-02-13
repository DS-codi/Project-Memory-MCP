import { Link } from 'react-router-dom';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { planStatusColors } from '@/utils/colors';
import type { ProgramPlanRef } from '@/types';

interface DependencyGraphProps {
  plans: ProgramPlanRef[];
  workspaceId: string;
}

interface Wave {
  index: number;
  plans: ProgramPlanRef[];
}

/**
 * Group plans into waves based on dependency ordering.
 * Wave 0 = plans with no dependencies, Wave 1 = depends only on Wave 0, etc.
 */
function computeWaves(plans: ProgramPlanRef[]): Wave[] {
  const planIds = new Set(plans.map((p) => p.plan_id));
  const resolved = new Set<string>();
  const remaining = new Map(plans.map((p) => [p.plan_id, p]));
  const waves: Wave[] = [];
  let safety = 0;

  while (remaining.size > 0 && safety < 20) {
    safety++;
    const wavePlans: ProgramPlanRef[] = [];

    for (const [, plan] of remaining) {
      const deps = (plan.depends_on_plans || []).filter((d) => planIds.has(d));
      const allResolved = deps.every((d) => resolved.has(d));
      if (allResolved) {
        wavePlans.push(plan);
      }
    }

    // If nothing resolved this round, dump all remaining into a final wave
    if (wavePlans.length === 0) {
      waves.push({
        index: waves.length,
        plans: Array.from(remaining.values()),
      });
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

function WavePlanCard({
  plan,
  workspaceId,
}: {
  plan: ProgramPlanRef;
  workspaceId: string;
}) {
  const pct =
    plan.progress.total > 0
      ? Math.round((plan.progress.done / plan.progress.total) * 100)
      : 0;

  return (
    <Link
      to={`/workspace/${workspaceId}/plan/${plan.plan_id}`}
      className="block bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-violet-500/50 transition-all min-w-[200px] max-w-[280px]"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-slate-200 truncate">
          {plan.title}
        </span>
        <Badge variant={planStatusColors[plan.status]}>{plan.status}</Badge>
      </div>
      <ProgressBar value={plan.progress.done} max={plan.progress.total} className="mb-1" />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {plan.progress.done}/{plan.progress.total} steps
        </span>
        <span>{pct}%</span>
      </div>
      {plan.depends_on_plans && plan.depends_on_plans.length > 0 && (
        <div className="mt-1.5 text-xs text-slate-500">
          ← {plan.depends_on_plans.length} dep
          {plan.depends_on_plans.length !== 1 ? 's' : ''}
        </div>
      )}
    </Link>
  );
}

export function DependencyGraph({ plans, workspaceId }: DependencyGraphProps) {
  if (plans.length === 0) return null;

  const hasDeps = plans.some(
    (p) => p.depends_on_plans && p.depends_on_plans.length > 0
  );

  // If no dependencies exist, just show a flat grid
  if (!hasDeps) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Plan Dependencies</h3>
        <p className="text-xs text-slate-500 mb-3">
          No inter-plan dependencies defined. All plans can execute in parallel.
        </p>
        <div className="flex flex-wrap gap-3">
          {plans.map((plan) => (
            <WavePlanCard
              key={plan.plan_id}
              plan={plan}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      </div>
    );
  }

  const waves = computeWaves(plans);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Plan Dependencies & Execution Waves</h3>

      <div className="space-y-6">
        {waves.map((wave, waveIdx) => (
          <div key={wave.index}>
            {/* Wave header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold">
                  {wave.index + 1}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  Wave {wave.index + 1}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {wave.plans.length} plan{wave.plans.length !== 1 ? 's' : ''} —{' '}
                {wave.index === 0 ? 'no dependencies' : 'depends on prior waves'}
              </span>
            </div>

            {/* Wave plans */}
            <div className="flex flex-wrap gap-3 pl-4 border-l-2 border-violet-500/30">
              {wave.plans.map((plan) => (
                <WavePlanCard
                  key={plan.plan_id}
                  plan={plan}
                  workspaceId={workspaceId}
                />
              ))}
            </div>

            {/* Connector arrow between waves */}
            {waveIdx < waves.length - 1 && (
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
    </div>
  );
}
