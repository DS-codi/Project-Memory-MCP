import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, FolderTree } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { EmptyState } from '../common/EmptyState';
import { planStatusColors } from '@/utils/colors';
import type { ProgramSummary, ProgramPlanRef } from '@/types';

interface ProgramTreeViewProps {
  programs: ProgramSummary[];
  workspaceId: string;
  className?: string;
}

interface ProgramNodeProps {
  program: ProgramSummary;
  workspaceId: string;
}

function PlanRefRow({ plan, workspaceId }: { plan: ProgramPlanRef; workspaceId: string }) {
  const pct = plan.progress.total > 0
    ? Math.round((plan.progress.done / plan.progress.total) * 100)
    : 0;

  return (
    <Link
      to={`/workspace/${workspaceId}/plan/${plan.plan_id}`}
      className="flex items-center justify-between px-4 py-2 hover:bg-slate-700/50 transition-colors rounded"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
        <span className="text-sm text-slate-300 truncate">{plan.title}</span>
        {plan.current_phase && (
          <span className="text-xs text-slate-500">({plan.current_phase})</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={planStatusColors[plan.status]}>{plan.status}</Badge>
        <ProgressBar value={plan.progress.done} max={plan.progress.total} className="w-16" />
        <span className="text-xs text-slate-500 min-w-[4rem] text-right">
          {plan.progress.done}/{plan.progress.total} ({pct}%)
        </span>
      </div>
    </Link>
  );
}

function ProgramNode({ program, workspaceId }: ProgramNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const agg = program.aggregate_progress;

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/60 hover:bg-slate-900/80 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown size={16} className="text-slate-400 shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-slate-400 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              to={`/workspace/${workspaceId}/program/${program.program_id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-white hover:text-violet-300 transition-colors truncate"
            >
              {program.name}
            </Link>
            <Badge variant="bg-slate-600/40 text-slate-300 border-slate-500/50">
              {agg.total_plans} plan{agg.total_plans !== 1 ? 's' : ''}
            </Badge>
            {agg.active_plans > 0 && (
              <Badge variant="bg-blue-500/20 text-blue-300 border-blue-500/30">
                {agg.active_plans} active
              </Badge>
            )}
            {agg.completed_plans > 0 && (
              <Badge variant="bg-green-500/20 text-green-300 border-green-500/30">
                {agg.completed_plans} done
              </Badge>
            )}
            {agg.failed_plans > 0 && (
              <Badge variant="bg-red-500/20 text-red-300 border-red-500/30">
                {agg.failed_plans} failed
              </Badge>
            )}
          </div>
          {program.description && (
            <p className="text-xs text-slate-500 truncate">{program.description}</p>
          )}
        </div>

        {/* Aggregate progress */}
        <div className="flex items-center gap-3 shrink-0">
          <ProgressBar value={agg.done_steps} max={agg.total_steps} className="w-24" />
          <span className="text-xs text-slate-400 min-w-[4rem] text-right">
            {agg.completion_percentage}%
          </span>
        </div>
      </button>

      {/* Step breakdown bar */}
      {expanded && agg.total_steps > 0 && (
        <div className="px-4 py-2 bg-slate-900/40 border-t border-slate-700/60">
          <div className="flex h-2 rounded-full overflow-hidden bg-slate-700">
            {agg.done_steps > 0 && (
              <div
                className="bg-green-500"
                style={{ width: `${(agg.done_steps / agg.total_steps) * 100}%` }}
              />
            )}
            {agg.active_steps > 0 && (
              <div
                className="bg-blue-500"
                style={{ width: `${(agg.active_steps / agg.total_steps) * 100}%` }}
              />
            )}
            {agg.blocked_steps > 0 && (
              <div
                className="bg-red-500"
                style={{ width: `${(agg.blocked_steps / agg.total_steps) * 100}%` }}
              />
            )}
          </div>
          <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
            <span>{agg.done_steps} done</span>
            <span>{agg.active_steps} active</span>
            <span>{agg.pending_steps} pending</span>
            {agg.blocked_steps > 0 && <span className="text-red-400">{agg.blocked_steps} blocked</span>}
          </div>
        </div>
      )}

      {/* Expanded child plans */}
      {expanded && (
        <div className="border-t border-slate-700/60 divide-y divide-slate-700/40">
          {program.plans.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No plans in this program</p>
          ) : (
            program.plans.map((plan) => (
              <PlanRefRow
                key={plan.plan_id}
                plan={plan}
                workspaceId={workspaceId}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ProgramTreeView({ programs, workspaceId, className }: ProgramTreeViewProps) {
  if (programs.length === 0) {
    return (
      <EmptyState
        icon={<FolderTree className="h-8 w-8 text-slate-500" />}
        title="No programs"
        description="Programs group related plans into a hierarchy. Create a program to organise your plans."
        className={className}
      />
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {programs.map((program) => (
        <ProgramNode
          key={program.program_id}
          program={program}
          workspaceId={workspaceId}
        />
      ))}
    </div>
  );
}
