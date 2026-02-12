import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FolderTree, Target, ListChecks } from 'lucide-react';
import { useProgram } from '@/hooks/usePrograms';
import { Badge } from '@/components/common/Badge';
import { ProgressBar } from '@/components/common/ProgressBar';
import { EmptyState } from '@/components/common/EmptyState';
import { Skeleton } from '@/components/common/Skeleton';
import { planStatusColors } from '@/utils/colors';
import { formatDate } from '@/utils/formatters';
import type { ProgramPlanRef } from '@/types';

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
        <Badge variant={planStatusColors[plan.status]}>{plan.status}</Badge>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={plan.progress.done} max={plan.progress.total} className="flex-1" />
        <span className="text-xs text-slate-400 shrink-0">
          {plan.progress.done}/{plan.progress.total} ({percentage}%)
        </span>
      </div>
    </Link>
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

  const { done, total } = program.aggregate_progress;
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

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
            {program.plans.length} plan{program.plans.length !== 1 ? 's' : ''}
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

      {/* Aggregate progress */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-blue-400" />
          <h2 className="font-semibold">Overall Progress</h2>
        </div>
        <div className="flex items-center gap-4">
          <ProgressBar value={done} max={total} className="flex-1" />
          <span className="text-sm text-slate-300 shrink-0">
            {done}/{total} steps ({percentage}%)
          </span>
        </div>
      </div>

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
