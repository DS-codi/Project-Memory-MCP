import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Target, Archive, Trash2, Link as LinkIcon, Unlink } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { ProgressBar } from '@/components/common/ProgressBar';
import { GoalList } from '@/components/sprint/GoalList';
import {
  useSprint,
  useUpdateSprint,
  useDeleteSprint,
  useAddGoal,
  useCompleteGoal,
  useRemoveGoal,
  type SprintStatus,
} from '@/hooks/useSprints';
import { formatDate, formatRelative } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const sprintStatusColors: Record<SprintStatus, string> = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  completed: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  archived: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
};

export function SprintDetailPage() {
  const { workspaceId, sprintId } = useParams<{ workspaceId: string; sprintId: string }>();
  const navigate = useNavigate();

  const { data: sprint, isLoading, error } = useSprint(sprintId);
  const updateMutation = useUpdateSprint(workspaceId, sprintId);
  const deleteMutation = useDeleteSprint(workspaceId);
  const addGoalMutation = useAddGoal(workspaceId, sprintId);
  const completeGoalMutation = useCompleteGoal(workspaceId, sprintId);
  const removeGoalMutation = useRemoveGoal(workspaceId, sprintId);

  const handleArchive = () => {
    updateMutation.mutate({ status: 'archived' });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this sprint? This cannot be undone.')) {
      deleteMutation.mutate(
        { sprintId: sprintId!, confirm: true },
        {
          onSuccess: () => {
            navigate(`/workspace/${workspaceId}`);
          },
        }
      );
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-48" />
        <div className="h-48 bg-slate-800 rounded-lg" />
        <div className="h-96 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  if (error || !sprint) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Sprint not found</p>
        <Link to={`/workspace/${workspaceId}`} className="text-violet-400 hover:underline mt-2 inline-block">
          Return to workspace
        </Link>
      </div>
    );
  }

  const completedGoals = sprint.goals.filter((g) => g.completed).length;
  const totalGoals = sprint.goals.length;
  const completionPercentage = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to={`/workspace/${workspaceId}`}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Workspace
        </Link>
      </div>

      {/* Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={sprintStatusColors[sprint.status]}>{sprint.status}</Badge>
              {sprint.attached_plan_id && (
                <Link
                  to={`/workspace/${workspaceId}/plan/${sprint.attached_plan_id}`}
                  className="inline-flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300"
                >
                  <LinkIcon size={14} />
                  Attached to Plan
                </Link>
              )}
            </div>
            <h1 className="text-2xl font-bold mb-2">{sprint.title}</h1>
          </div>
          <div className="text-right text-sm text-slate-400">
            <div className="flex items-center gap-2 justify-end mb-4">
              {sprint.status === 'active' && (
                <button
                  onClick={handleArchive}
                  disabled={updateMutation.isPending}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600',
                    'border border-slate-600 text-slate-300 rounded-lg text-sm transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  title="Archive this sprint"
                >
                  <Archive size={14} />
                  Archive
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20',
                  'border border-red-500/40 text-red-400 rounded-lg text-sm transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                title="Delete this sprint"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
            <div className="flex items-center gap-1 justify-end mb-1">
              <Calendar size={14} />
              Created {formatDate(sprint.created_at)}
            </div>
            <div>Updated {formatRelative(sprint.updated_at)}</div>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Target size={16} />
            <span>Goal Progress</span>
          </div>
          <div className="flex-1 max-w-md">
            <ProgressBar value={completedGoals} max={totalGoals} showLabel />
          </div>
          {totalGoals > 0 && (
            <span className="text-sm text-slate-400">{completionPercentage}%</span>
          )}
        </div>
      </div>

      {/* Goals Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Target size={20} className="text-violet-400" />
          <h2 className="text-lg font-semibold">Sprint Goals</h2>
          <Badge variant="slate">{totalGoals}</Badge>
        </div>
        
        <GoalList
          goals={sprint.goals}
          onAddGoal={(description) => addGoalMutation.mutate(description)}
          onCompleteGoal={(goalId) => completeGoalMutation.mutate(goalId)}
          onRemoveGoal={(goalId) => removeGoalMutation.mutate(goalId)}
          isAdding={addGoalMutation.isPending}
          isCompleting={completeGoalMutation.isPending}
          isRemoving={removeGoalMutation.isPending}
        />
      </div>

      {/* Actions Section - Attach/Detach Plan placeholder */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Sprint Actions</h2>
        <div className="flex flex-wrap gap-3">
          {sprint.attached_plan_id ? (
            <button
              onClick={() => {
                // TODO: Implement detach plan via updateSprint
                console.log('Detach plan not yet implemented');
              }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600',
                'border border-slate-600 text-slate-300 rounded-lg text-sm transition-colors'
              )}
            >
              <Unlink size={16} />
              Detach from Plan
            </button>
          ) : (
            <button
              onClick={() => {
                // TODO: Implement attach plan dialog
                console.log('Attach plan not yet implemented');
              }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500',
                'text-white rounded-lg text-sm transition-colors'
              )}
            >
              <LinkIcon size={16} />
              Attach to Plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
