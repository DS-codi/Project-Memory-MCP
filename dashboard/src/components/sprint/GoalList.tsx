import { useState } from 'react';
import { Plus, Trash2, CheckCircle, Circle } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Goal } from '@/hooks/useSprints';

interface GoalListProps {
  goals: Goal[];
  onAddGoal: (description: string) => void;
  onCompleteGoal: (goalId: string) => void;
  onRemoveGoal: (goalId: string) => void;
  isAdding?: boolean;
  isCompleting?: boolean;
  isRemoving?: boolean;
}

export function GoalList({
  goals,
  onAddGoal,
  onCompleteGoal,
  onRemoveGoal,
  isAdding = false,
  isCompleting = false,
  isRemoving = false,
}: GoalListProps) {
  const [newGoal, setNewGoal] = useState('');
  const [removingGoalId, setRemovingGoalId] = useState<string | null>(null);
  const [completingGoalId, setCompletingGoalId] = useState<string | null>(null);

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.trim()) return;
    onAddGoal(newGoal.trim());
    setNewGoal('');
  };

  const handleCompleteGoal = (goalId: string) => {
    setCompletingGoalId(goalId);
    onCompleteGoal(goalId);
  };

  const handleRemoveGoal = (goalId: string) => {
    setRemovingGoalId(goalId);
    onRemoveGoal(goalId);
  };

  // Sort goals: incomplete first, then completed
  const sortedGoals = [...goals].sort((a, b) => {
    if (a.completed === b.completed) {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return a.completed ? 1 : -1;
  });

  return (
    <div className="space-y-4">
      {/* Add Goal Form */}
      <form onSubmit={handleAddGoal} className="flex gap-2">
        <input
          type="text"
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          placeholder="Add a new goal..."
          className={cn(
            'flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg',
            'text-slate-200 placeholder-slate-500',
            'focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500',
            'disabled:opacity-50'
          )}
          disabled={isAdding}
        />
        <button
          type="submit"
          disabled={!newGoal.trim() || isAdding}
          className={cn(
            'px-4 py-2 bg-violet-600 text-white rounded-lg',
            'hover:bg-violet-500 transition-colors',
            'flex items-center gap-2',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Plus size={16} />
          {isAdding ? 'Adding...' : 'Add'}
        </button>
      </form>

      {/* Goals List */}
      {goals.length === 0 ? (
        <div className="text-center py-8 bg-slate-800/50 border border-dashed border-slate-700 rounded-lg">
          <p className="text-slate-500 text-sm">
            No goals yet. Add your first goal above!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedGoals.map((goal) => {
            const isBeingCompleted = isCompleting && completingGoalId === goal.goal_id;
            const isBeingRemoved = isRemoving && removingGoalId === goal.goal_id;
            const isPending = isBeingCompleted || isBeingRemoved;

            return (
              <div
                key={goal.goal_id}
                className={cn(
                  'flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-lg',
                  'group transition-colors',
                  goal.completed && 'bg-slate-800/50',
                  isPending && 'opacity-50'
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={() => !goal.completed && handleCompleteGoal(goal.goal_id)}
                  disabled={goal.completed || isBeingCompleted}
                  className={cn(
                    'flex-shrink-0 transition-colors',
                    goal.completed
                      ? 'text-emerald-400 cursor-default'
                      : 'text-slate-500 hover:text-emerald-400 cursor-pointer'
                  )}
                  title={goal.completed ? 'Completed' : 'Mark as complete'}
                >
                  {goal.completed ? (
                    <CheckCircle size={20} />
                  ) : (
                    <Circle size={20} />
                  )}
                </button>

                {/* Description */}
                <span
                  className={cn(
                    'flex-1 text-sm',
                    goal.completed ? 'text-slate-500 line-through' : 'text-slate-200'
                  )}
                >
                  {goal.description}
                </span>

                {/* Completed Date */}
                {goal.completed && goal.completed_at && (
                  <span className="text-xs text-slate-600">
                    Completed {new Date(goal.completed_at).toLocaleDateString()}
                  </span>
                )}

                {/* Remove Button */}
                <button
                  onClick={() => handleRemoveGoal(goal.goal_id)}
                  disabled={isBeingRemoved}
                  className={cn(
                    'flex-shrink-0 p-1 rounded transition-colors',
                    'text-slate-600 hover:text-red-400 hover:bg-red-500/10',
                    'opacity-0 group-hover:opacity-100 focus:opacity-100',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  title="Remove goal"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {goals.length > 0 && (
        <div className="text-sm text-slate-500 text-center pt-2">
          {goals.filter((g) => g.completed).length} of {goals.length} goals completed
        </div>
      )}
    </div>
  );
}
