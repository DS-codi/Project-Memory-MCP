import { useMemo } from 'react';
import { cn } from '@/utils/cn';
import { stepTypeColors } from '@/utils/colors';
import type { PlanStep } from '@/types';

interface PlanDiffViewProps {
  previousSteps: PlanStep[];
  currentSteps: PlanStep[];
  className?: string;
}

type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

interface StepDiff {
  type: DiffType;
  step: PlanStep;
  previousStep?: PlanStep;
  changes?: string[];
}

function getStepChanges(prev: PlanStep, current: PlanStep): string[] {
  const changes: string[] = [];
  
  if (prev.status !== current.status) {
    changes.push(`Status: ${prev.status} → ${current.status}`);
  }
  if (prev.phase !== current.phase) {
    changes.push(`Phase: ${prev.phase} → ${current.phase}`);
  }
  if (prev.task !== current.task) {
    changes.push('Task description changed');
  }
  if (prev.type !== current.type) {
    changes.push(`Type: ${prev.type || 'standard'} → ${current.type || 'standard'}`);
  }
  if (prev.notes !== current.notes) {
    changes.push('Notes updated');
  }
  if (prev.assignee !== current.assignee) {
    changes.push(`Assignee: ${prev.assignee || 'none'} → ${current.assignee || 'none'}`);
  }
  
  return changes;
}

export function PlanDiffView({
  previousSteps,
  currentSteps,
  className,
}: PlanDiffViewProps) {
  const diffs = useMemo<StepDiff[]>(() => {
    const result: StepDiff[] = [];
    const prevMap = new Map(previousSteps.map((s) => [s.index, s]));
    const currentMap = new Map(currentSteps.map((s) => [s.index, s]));
    
    // Find all unique indices
    const allIndices = new Set([
      ...previousSteps.map((s) => s.index),
      ...currentSteps.map((s) => s.index),
    ]);
    
    const sortedIndices = Array.from(allIndices).sort((a, b) => a - b);
    
    sortedIndices.forEach((idx) => {
      const prev = prevMap.get(idx);
      const current = currentMap.get(idx);
      
      if (!prev && current) {
        // Added
        result.push({ type: 'added', step: current });
      } else if (prev && !current) {
        // Removed
        result.push({ type: 'removed', step: prev });
      } else if (prev && current) {
        // Check for modifications
        const changes = getStepChanges(prev, current);
        if (changes.length > 0) {
          result.push({ type: 'modified', step: current, previousStep: prev, changes });
        } else {
          result.push({ type: 'unchanged', step: current });
        }
      }
    });
    
    return result;
  }, [previousSteps, currentSteps]);

  const stats = useMemo(() => {
    const counts = { added: 0, removed: 0, modified: 0, unchanged: 0 };
    diffs.forEach((d) => counts[d.type]++);
    return counts;
  }, [diffs]);

  if (diffs.length === 0) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        No steps to compare
      </div>
    );
  }

  const hasChanges = stats.added > 0 || stats.removed > 0 || stats.modified > 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-slate-400">Changes:</span>
        {stats.added > 0 && (
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            +{stats.added} added
          </span>
        )}
        {stats.removed > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            -{stats.removed} removed
          </span>
        )}
        {stats.modified > 0 && (
          <span className="flex items-center gap-1 text-yellow-400">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            ~{stats.modified} modified
          </span>
        )}
        {!hasChanges && (
          <span className="text-slate-500">No changes</span>
        )}
      </div>

      {/* Diff list */}
      <div className="space-y-2">
        {diffs.map((diff, idx) => (
          <div
            key={idx}
            className={cn(
              'p-3 rounded-lg border',
              diff.type === 'added' && 'bg-green-500/10 border-green-500/30',
              diff.type === 'removed' && 'bg-red-500/10 border-red-500/30',
              diff.type === 'modified' && 'bg-yellow-500/10 border-yellow-500/30',
              diff.type === 'unchanged' && 'bg-slate-800/50 border-slate-700'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Status indicator */}
              <div
                className={cn(
                  'w-6 h-6 flex-shrink-0 rounded flex items-center justify-center text-xs font-medium',
                  diff.type === 'added' && 'bg-green-500/20 text-green-400',
                  diff.type === 'removed' && 'bg-red-500/20 text-red-400',
                  diff.type === 'modified' && 'bg-yellow-500/20 text-yellow-400',
                  diff.type === 'unchanged' && 'bg-slate-700 text-slate-500'
                )}
              >
                {diff.type === 'added' && '+'}
                {diff.type === 'removed' && '-'}
                {diff.type === 'modified' && '~'}
                {diff.type === 'unchanged' && '='}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-slate-400 text-xs">#{diff.step.index}</span>
                  <span className="px-1.5 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
                    {diff.step.phase}
                  </span>
                  {diff.step.type && (
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-xs border',
                        stepTypeColors[diff.step.type]
                      )}
                    >
                      {diff.step.type}
                    </span>
                  )}
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded text-xs',
                      diff.step.status === 'done' && 'bg-green-500/20 text-green-400',
                      diff.step.status === 'active' && 'bg-blue-500/20 text-blue-400',
                      diff.step.status === 'pending' && 'bg-slate-600 text-slate-400',
                      diff.step.status === 'blocked' && 'bg-red-500/20 text-red-400'
                    )}
                  >
                    {diff.step.status}
                  </span>
                </div>

                <p
                  className={cn(
                    'text-sm',
                    diff.type === 'removed' ? 'line-through text-slate-500' : 'text-slate-300'
                  )}
                >
                  {diff.step.task}
                </p>

                {/* Changes list for modified items */}
                {diff.type === 'modified' && diff.changes && diff.changes.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {diff.changes.map((change, i) => (
                      <div
                        key={i}
                        className="text-xs text-yellow-400 flex items-center gap-1"
                      >
                        <span>•</span>
                        <span>{change}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
