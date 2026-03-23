import { Link } from 'react-router-dom';
import { Calendar, Target, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { ProgressBar } from '@/components/common/ProgressBar';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/formatters';
import type { SprintSummary, SprintStatus } from '@/hooks/useSprints';

interface SprintListProps {
  sprints: SprintSummary[];
  workspaceId: string;
  isLoading?: boolean;
}

const sprintStatusColors: Record<SprintStatus, string> = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  completed: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  archived: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
};

export function SprintList({ sprints, workspaceId, isLoading }: SprintListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-slate-800 border border-slate-700 rounded-lg p-4 animate-pulse"
          >
            <div className="flex gap-2 mb-3">
              <div className="h-5 w-16 bg-slate-700 rounded" />
            </div>
            <div className="h-6 bg-slate-700 rounded w-3/4 mb-3" />
            <div className="h-2 bg-slate-700 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (sprints.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-800/50 border border-slate-700 rounded-lg">
        <Target size={48} className="mx-auto text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-400 mb-2">No Sprints Yet</h3>
        <p className="text-slate-500 text-sm">
          Create a sprint to organize your work into focused time periods.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sprints.map((sprint) => (
        <Link
          key={sprint.sprint_id}
          to={`/workspace/${workspaceId}/sprint/${sprint.sprint_id}`}
          className={cn(
            'block bg-slate-800 border border-slate-700 rounded-lg p-4',
            'hover:border-violet-500/50 hover:bg-slate-800/80 transition-colors'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge variant={sprintStatusColors[sprint.status]}>
                {sprint.status}
              </Badge>
              {sprint.attached_plan_id && (
                <Badge variant="bg-violet-500/20 text-violet-300 border-violet-500/50">
                  Attached to Plan
                </Badge>
              )}
            </div>
            <span className="text-xs text-slate-500" title={sprint.updated_at}>
              <Calendar size={12} className="inline mr-1" />
              {formatRelative(sprint.updated_at)}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-lg font-medium text-slate-100 mb-3">{sprint.title}</h3>

          {/* Goal Progress */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <CheckCircle2 size={14} />
              <span>
                {sprint.completed_goal_count}/{sprint.goal_count} goals
              </span>
            </div>
            <div className="flex-1 max-w-xs">
              <ProgressBar
                value={sprint.completed_goal_count}
                max={sprint.goal_count}
              />
            </div>
            {sprint.goal_count > 0 && (
              <span className="text-xs text-slate-500">
                {sprint.completion_percentage}%
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
