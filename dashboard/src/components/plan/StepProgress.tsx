import { cn } from '@/utils/cn';
import { stepTypeColors } from '@/utils/colors';
import { displayStepNumber } from '@/utils/formatters';
import type { PlanStep } from '@/types';

interface StepProgressProps {
  steps: PlanStep[];
  className?: string;
  view?: 'bar' | 'kanban';
}

export function StepProgress({ steps, className, view = 'bar' }: StepProgressProps) {
  if (view === 'kanban') {
    return <KanbanView steps={steps} className={className} />;
  }
  
  return <BarView steps={steps} className={className} />;
}

function BarView({ steps, className }: { steps: PlanStep[]; className?: string }) {
  const statusCounts = {
    done: steps.filter((s) => s.status === 'done').length,
    active: steps.filter((s) => s.status === 'active').length,
    pending: steps.filter((s) => s.status === 'pending').length,
    blocked: steps.filter((s) => s.status === 'blocked').length,
  };

  const total = steps.length;
  if (total === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Stacked Bar */}
      <div className="h-4 rounded-full overflow-hidden flex bg-slate-700">
        {statusCounts.done > 0 && (
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${(statusCounts.done / total) * 100}%` }}
            title={`${statusCounts.done} done`}
          />
        )}
        {statusCounts.active > 0 && (
          <div
            className="bg-blue-500 transition-all duration-500"
            style={{ width: `${(statusCounts.active / total) * 100}%` }}
            title={`${statusCounts.active} active`}
          />
        )}
        {statusCounts.blocked > 0 && (
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${(statusCounts.blocked / total) * 100}%` }}
            title={`${statusCounts.blocked} blocked`}
          />
        )}
        {/* Pending fills the rest */}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded" />
          <span className="text-slate-400">Done ({statusCounts.done})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-500 rounded" />
          <span className="text-slate-400">Active ({statusCounts.active})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-slate-600 rounded" />
          <span className="text-slate-400">Pending ({statusCounts.pending})</span>
        </div>
        {statusCounts.blocked > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded" />
            <span className="text-slate-400">Blocked ({statusCounts.blocked})</span>
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanView({ steps, className }: { steps: PlanStep[]; className?: string }) {
  const columns: { status: PlanStep['status']; label: string; color: string }[] = [
    { status: 'pending', label: 'Pending', color: 'border-slate-500' },
    { status: 'active', label: 'In Progress', color: 'border-blue-500' },
    { status: 'done', label: 'Done', color: 'border-green-500' },
    { status: 'blocked', label: 'Blocked', color: 'border-red-500' },
  ];

  return (
    <div className={cn('grid grid-cols-4 gap-4', className)}>
      {columns.map((col) => {
        const columnSteps = steps.filter((s) => s.status === col.status);
        
        return (
          <div key={col.status} className="space-y-2">
            {/* Column Header */}
            <div className={cn('p-2 rounded-t-lg border-t-2', col.color, 'bg-slate-800/50')}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-300">{col.label}</span>
                <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">
                  {columnSteps.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="space-y-2 min-h-[100px]">
              {columnSteps.map((step) => (
                <div
                  key={step.index}
                  className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                >
                  <div className="text-xs text-slate-500 mb-1">
                    {displayStepNumber(step.index)} · {step.phase}
                  </div>
                  {step.type && (
                    <span
                      className={cn(
                        'inline-flex mb-1 px-1.5 py-0.5 rounded text-[11px] border',
                        stepTypeColors[step.type]
                      )}
                    >
                      {step.type}
                    </span>
                  )}
                  <p className="text-slate-200 line-clamp-2">{step.task}</p>
                </div>
              ))}
              {columnSteps.length === 0 && (
                <div className="p-3 border border-dashed border-slate-700 rounded-lg text-center text-slate-500 text-sm">
                  No items
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
