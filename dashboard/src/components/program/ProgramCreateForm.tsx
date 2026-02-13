import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, FolderTree } from 'lucide-react';
import { Badge } from '../common/Badge';
import type { PlanSummary } from '@/types';

interface ProgramCreateFormProps {
  workspaceId: string;
  plans: PlanSummary[];
  onClose: () => void;
  onCreated?: (programId: string) => void;
}

interface CreateProgramPayload {
  title: string;
  description: string;
  priority: string;
  goals: string[];
  child_plan_ids: string[];
}

async function createProgram(
  workspaceId: string,
  payload: CreateProgramPayload
): Promise<{ program_id: string }> {
  const res = await fetch(`/api/programs/${workspaceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create program' }));
    throw new Error(err.error || 'Failed to create program');
  }
  return res.json();
}

export function ProgramCreateForm({
  workspaceId,
  plans,
  onClose,
  onCreated,
}: ProgramCreateFormProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [goalInput, setGoalInput] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());

  const mutation = useMutation({
    mutationFn: (payload: CreateProgramPayload) =>
      createProgram(workspaceId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['programs', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
      onCreated?.(data.program_id);
      onClose();
    },
  });

  const availablePlans = plans.filter(
    (p) => !p.is_program && p.status === 'active'
  );

  function handleAddGoal() {
    const trimmed = goalInput.trim();
    if (trimmed && !goals.includes(trimmed)) {
      setGoals([...goals, trimmed]);
      setGoalInput('');
    }
  }

  function togglePlan(planId: string) {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    mutation.mutate({
      title: title.trim(),
      description: description.trim(),
      priority,
      goals,
      child_plan_ids: Array.from(selectedPlanIds),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FolderTree className="text-violet-400" size={20} />
            <h2 className="text-lg font-semibold">Create Program</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700 transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Platform Evolution Program"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe the program's goals and scope"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Goals */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Goals
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddGoal();
                  }
                }}
                placeholder="Add a goal and press Enter"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
              <button
                type="button"
                onClick={handleAddGoal}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
            {goals.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {goals.map((goal, i) => (
                  <Badge
                    key={i}
                    variant="bg-green-500/20 text-green-300 border-green-500/30"
                  >
                    {goal}
                    <button
                      type="button"
                      onClick={() => setGoals(goals.filter((_, j) => j !== i))}
                      className="ml-1 hover:text-red-300"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Child Plan Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Child Plans ({selectedPlanIds.size} selected)
            </label>
            {availablePlans.length === 0 ? (
              <p className="text-xs text-slate-500">No active plans available to add.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-slate-600 rounded-lg divide-y divide-slate-700">
                {availablePlans.map((plan) => (
                  <label
                    key={plan.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlanIds.has(plan.id)}
                      onChange={() => togglePlan(plan.id)}
                      className="rounded border-slate-500 text-violet-500 focus:ring-violet-500 bg-slate-800"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300 truncate">
                        {plan.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {plan.progress.done}/{plan.progress.total} steps
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {mutation.isError && (
            <p className="text-sm text-red-400">
              {(mutation.error as Error).message}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || mutation.isPending}
              className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {mutation.isPending ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Creating…
                </>
              ) : (
                <>
                  <FolderTree size={14} />
                  Create Program
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
