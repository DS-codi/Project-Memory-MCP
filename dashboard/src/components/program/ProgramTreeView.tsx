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
  return (
    <Link
      to={`/workspace/${workspaceId}/plan/${plan.plan_id}`}
      className="flex items-center justify-between px-4 py-2 hover:bg-slate-700/50 transition-colors rounded"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
        <span className="text-sm text-slate-300 truncate">{plan.title}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={planStatusColors[plan.status]}>{plan.status}</Badge>
        <span className="text-xs text-slate-500">
          {plan.progress.done}/{plan.progress.total}
        </span>
      </div>
    </Link>
  );
}

function ProgramNode({ program, workspaceId }: ProgramNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const { done, total } = program.aggregate_progress;

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
              {program.plans.length} plan{program.plans.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          {program.description && (
            <p className="text-xs text-slate-500 truncate">{program.description}</p>
          )}
        </div>

        {/* Aggregate progress */}
        <div className="flex items-center gap-3 shrink-0">
          <ProgressBar value={done} max={total} className="w-24" />
          <span className="text-xs text-slate-400 min-w-[3rem] text-right">
            {done}/{total}
          </span>
        </div>
      </button>

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
