import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Save, X, Plus, Trash2, Target, CheckSquare } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/common/Badge';
import type { PlanState } from '@/types';

interface GoalsTabProps {
  plan: PlanState;
  workspaceId: string;
  planId: string;
}

export function GoalsTab({ plan, workspaceId, planId }: GoalsTabProps) {
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [isEditingCriteria, setIsEditingCriteria] = useState(false);
  const [goals, setGoals] = useState<string[]>(plan.goals || []);
  const [criteria, setCriteria] = useState<string[]>(plan.success_criteria || []);
  const [newGoal, setNewGoal] = useState('');
  const [newCriterion, setNewCriterion] = useState('');

  const queryClient = useQueryClient();

  const updateGoalsMutation = useMutation({
    mutationFn: async ({ goals, success_criteria }: { goals?: string[]; success_criteria?: string[] }) => {
      const res = await fetch(`/api/plans/${workspaceId}/${planId}/goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals, success_criteria }),
      });
      if (!res.ok) throw new Error('Failed to update goals');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', workspaceId, planId] });
    },
  });

  const handleSaveGoals = () => {
    updateGoalsMutation.mutate({ goals });
    setIsEditingGoals(false);
  };

  const handleSaveCriteria = () => {
    updateGoalsMutation.mutate({ success_criteria: criteria });
    setIsEditingCriteria(false);
  };

  const handleCancelGoals = () => {
    setGoals(plan.goals || []);
    setIsEditingGoals(false);
  };

  const handleCancelCriteria = () => {
    setCriteria(plan.success_criteria || []);
    setIsEditingCriteria(false);
  };

  const handleAddGoal = () => {
    if (newGoal.trim()) {
      setGoals([...goals, newGoal.trim()]);
      setNewGoal('');
    }
  };

  const handleAddCriterion = () => {
    if (newCriterion.trim()) {
      setCriteria([...criteria, newCriterion.trim()]);
      setNewCriterion('');
    }
  };

  const handleRemoveGoal = (index: number) => {
    setGoals(goals.filter((_, i) => i !== index));
  };

  const handleRemoveCriterion = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Goals Section */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target size={20} className="text-violet-400" />
            <h3 className="text-lg font-semibold">Goals</h3>
            <Badge variant="slate">{goals.length}</Badge>
          </div>
          {!isEditingGoals && (
            <button
              onClick={() => setIsEditingGoals(true)}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Edit2 size={14} />
              Edit
            </button>
          )}
        </div>

        {isEditingGoals ? (
          <div className="space-y-3">
            {goals.map((goal, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex-1 p-3 bg-slate-900 border border-slate-700 rounded">
                  <p className="text-slate-200">{goal}</p>
                </div>
                <button
                  onClick={() => handleRemoveGoal(index)}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            
            {/* Add new goal */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
                placeholder="Add a new goal..."
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:border-violet-500 focus:outline-none text-slate-200"
              />
              <button
                onClick={handleAddGoal}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                Add
              </button>
            </div>

            {/* Save/Cancel buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveGoals}
                disabled={updateGoalsMutation.isPending}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={16} />
                Save Changes
              </button>
              <button
                onClick={handleCancelGoals}
                disabled={updateGoalsMutation.isPending}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <X size={16} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {goals.length > 0 ? (
              goals.map((goal, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-slate-900/50 border border-slate-700 rounded"
                >
                  <span className="text-violet-400 mt-0.5">•</span>
                  <p className="flex-1 text-slate-200">{goal}</p>
                </div>
              ))
            ) : (
              <p className="text-slate-400 italic">No goals defined yet. Click Edit to add goals.</p>
            )}
          </div>
        )}
      </div>

      {/* Success Criteria Section */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckSquare size={20} className="text-green-400" />
            <h3 className="text-lg font-semibold">Success Criteria</h3>
            <Badge variant="slate">{criteria.length}</Badge>
          </div>
          {!isEditingCriteria && (
            <button
              onClick={() => setIsEditingCriteria(true)}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Edit2 size={14} />
              Edit
            </button>
          )}
        </div>

        {isEditingCriteria ? (
          <div className="space-y-3">
            {criteria.map((criterion, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex-1 p-3 bg-slate-900 border border-slate-700 rounded">
                  <p className="text-slate-200">{criterion}</p>
                </div>
                <button
                  onClick={() => handleRemoveCriterion(index)}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            
            {/* Add new criterion */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCriterion()}
                placeholder="Add a new success criterion..."
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:border-violet-500 focus:outline-none text-slate-200"
              />
              <button
                onClick={handleAddCriterion}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                Add
              </button>
            </div>

            {/* Save/Cancel buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveCriteria}
                disabled={updateGoalsMutation.isPending}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={16} />
                Save Changes
              </button>
              <button
                onClick={handleCancelCriteria}
                disabled={updateGoalsMutation.isPending}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <X size={16} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {criteria.length > 0 ? (
              criteria.map((criterion, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-slate-900/50 border border-slate-700 rounded"
                >
                  <span className="text-green-400 mt-0.5">✓</span>
                  <p className="flex-1 text-slate-200">{criterion}</p>
                </div>
              ))
            ) : (
              <p className="text-slate-400 italic">No success criteria defined yet. Click Edit to add criteria.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
