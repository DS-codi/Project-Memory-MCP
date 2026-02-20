import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FolderTree, Target, ListChecks, CheckCircle, AlertTriangle, Activity, Megaphone } from 'lucide-react';
import { useProgram } from '@/hooks/usePrograms';
import { Badge } from '@/components/common/Badge';
import { ProgressBar } from '@/components/common/ProgressBar';
import { EmptyState } from '@/components/common/EmptyState';
import { Skeleton } from '@/components/common/Skeleton';
import { planStatusColors } from '@/utils/colors';
import { formatDate } from '@/utils/formatters';
import type { ProgramPlanRef, AggregateProgress } from '@/types';
import { EnhancedDependencyGraph } from '@/components/program/EnhancedDependencyGraph';
import { ProgramRiskOverview } from '@/components/program/ProgramRiskOverview';

function PlanRow({ plan, workspaceId }: { plan: ProgramPlanRef; workspaceId: string }) {
  const percentage = plan.progress.total > 0
    ? Math.round((plan.progress.done / plan.progress.total) * 100)
    : 0;

  return (
    <Link
      to={`/workspace/${workspaceId}/plan/${plan.plan_id}`}
      className="block bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-violet-500/50 transition-all group"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-slate-200 group-hover:text-violet-300 transition-colors truncate">
          {plan.title}
        </h4>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={planStatusColors[plan.status]}>{plan.status}</Badge>
          {plan.current_phase && (
            <span className="text-xs text-slate-500">{plan.current_phase}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={plan.progress.done} max={plan.progress.total} className="flex-1" />
        <span className="text-xs text-slate-400 shrink-0">
          {plan.progress.done}/{plan.progress.total} ({percentage}%)
        </span>
      </div>
      {plan.depends_on_plans && plan.depends_on_plans.length > 0 && (
        <div className="mt-2 text-xs text-slate-500">
          Depends on: {plan.depends_on_plans.map(id => id.slice(-8)).join(', ')}
        </div>
      )}
    </Link>
  );
}

function AggregateStatsGrid({ agg }: { agg: AggregateProgress }) {
  const statCards = [
    { label: 'Total Plans', value: agg.total_plans, icon: FolderTree, color: 'text-violet-400', bg: 'bg-violet-500/20' },
    { label: 'Active Plans', value: agg.active_plans, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { label: 'Completed', value: agg.completed_plans, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
    { label: 'Failed', value: agg.failed_plans, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {statCards.map((s) => (
        <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className={`p-1.5 rounded ${s.bg}`}>
              <s.icon className={s.color} size={16} />
            </div>
            <span className="text-xs text-slate-400">{s.label}</span>
          </div>
          <p className="text-xl font-bold">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function StepBreakdownBar({ agg }: { agg: AggregateProgress }) {
  if (agg.total_steps === 0) return null;
  const pct = (n: number) => (n / agg.total_steps) * 100;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <ListChecks size={16} className="text-blue-400" />
        Step Breakdown
      </h3>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-700 mb-3">
        {agg.done_steps > 0 && <div className="bg-green-500" style={{ width: `${pct(agg.done_steps)}%` }} />}
        {agg.active_steps > 0 && <div className="bg-blue-500" style={{ width: `${pct(agg.active_steps)}%` }} />}
        {agg.blocked_steps > 0 && <div className="bg-red-500" style={{ width: `${pct(agg.blocked_steps)}%` }} />}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-slate-400">Done</span>
          <span className="font-medium">{agg.done_steps}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-slate-400">Active</span>
          <span className="font-medium">{agg.active_steps}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
          <span className="text-slate-400">Pending</span>
          <span className="font-medium">{agg.pending_steps}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-slate-400">Blocked</span>
          <span className="font-medium">{agg.blocked_steps}</span>
        </div>
      </div>
    </div>
  );
}

export function ProgramDetailPage() {
  const { workspaceId, programId } = useParams<{
    workspaceId: string;
    programId: string;
  }>();

  const { data: program, isLoading, error } = useProgram(workspaceId, programId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !program) {
    return (
      <EmptyState
        icon={<FolderTree className="h-8 w-8 text-red-400" />}
        title="Program not found"
        description={error?.message || 'The requested program could not be loaded.'}
      />
    );
  }

  const agg = program.aggregate_progress;

  return (
    <div className="space-y-6 p-6">
      {/* Back link */}
      <Link
        to={`/workspace/${workspaceId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={16} /> Back to workspace
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <FolderTree className="h-6 w-6 text-violet-400" />
          <h1 className="text-2xl font-bold">{program.name}</h1>
          <Badge variant="bg-slate-600/40 text-slate-300 border-slate-500/50">
            {agg.total_plans} plan{agg.total_plans !== 1 ? 's' : ''}
          </Badge>
        </div>
        {program.description && (
          <p className="text-slate-400">{program.description}</p>
        )}
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
          <span>Created {formatDate(program.created_at)}</span>
          <span>Updated {formatDate(program.updated_at)}</span>
        </div>
      </div>

      {/* Aggregate Stats Grid */}
      <AggregateStatsGrid agg={agg} />

      {/* Overall progress */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-blue-400" />
          <h2 className="font-semibold">Overall Progress</h2>
          <span className="ml-auto text-lg font-bold text-violet-300">{agg.completion_percentage}%</span>
        </div>
        <div className="flex items-center gap-4">
          <ProgressBar value={agg.done_steps} max={agg.total_steps} className="flex-1" />
          <span className="text-sm text-slate-300 shrink-0">
            {agg.done_steps}/{agg.total_steps} steps
          </span>
        </div>
      </div>

      {/* Step Breakdown */}
      <StepBreakdownBar agg={agg} />

      {/* Goals */}
      {program.goals && program.goals.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks size={16} className="text-green-400" />
            <h2 className="font-semibold">Goals</h2>
          </div>
          <ul className="space-y-1.5">
            {program.goals.map((goal, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-green-400 mt-0.5">•</span>
                {goal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Success Criteria */}
      {program.success_criteria && program.success_criteria.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-emerald-400" />
            <h2 className="font-semibold">Success Criteria</h2>
          </div>
          <ul className="space-y-1.5">
            {program.success_criteria.map((criterion, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-emerald-400 mt-0.5">✓</span>
                {criterion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Program Risk Overview (v2 only) */}
      {program.risk_register && program.risk_register.length > 0 && (
        <ProgramRiskOverview risks={program.risk_register} workspaceId={workspaceId} />
      )}

      {/* Phase Announcements (v2 only) */}
      {program.phase_announcements && program.phase_announcements.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Megaphone size={16} className="text-violet-400" />
            Phase Announcements
          </h3>
          <div className="space-y-2">
            {program.phase_announcements.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-violet-400 font-medium shrink-0">{a.phase}:</span>
                <span className="text-slate-300">{a.message}</span>
                {a.announced_by && (
                  <span className="text-xs text-slate-500 shrink-0">— {a.announced_by}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dependency Graph */}
      {program.plans.length > 1 && (
        <EnhancedDependencyGraph
          plans={program.plans}
          workspaceId={workspaceId!}
          phaseAnnouncements={program.phase_announcements}
        />
      )}

      {/* Child plans */}
      <div>
        <h2 className="font-semibold mb-3">Plans</h2>
        {program.plans.length === 0 ? (
          <EmptyState
            icon={<FolderTree className="h-6 w-6 text-slate-500" />}
            title="No plans yet"
            description="This program has no child plans."
          />
        ) : (
          <div className="space-y-3">
            {program.plans.map((plan) => (
              <PlanRow key={plan.plan_id} plan={plan} workspaceId={workspaceId!} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
