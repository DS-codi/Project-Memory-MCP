import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { PlanCategory, PlanPriority, PlanStep } from '@/types';

interface CreatePlanFormProps {
  workspaceId: string;
  onSuccess: (planId: string) => void;
  onCancel: () => void;
}

export function CreatePlanForm({ workspaceId, onSuccess, onCancel }: CreatePlanFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PlanCategory>('feature');
  const [priority, setPriority] = useState<PlanPriority>('medium');
  const [steps, setSteps] = useState<{ phase: string; task: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStep = () => {
    setSteps([...steps, { phase: 'implementation', task: '' }]);
  };

  const updateStep = (index: number, field: 'phase' | 'task', value: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Create the plan
      const res = await fetch(`/api/plans/${workspaceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, priority }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create plan');
      }

      const { plan_id } = await res.json();

      // Add steps if any
      if (steps.length > 0) {
        const formattedSteps: PlanStep[] = steps.map((s, i) => ({
          index: i,
          phase: s.phase,
          task: s.task,
          status: 'pending',
        }));

        await fetch(`/api/plans/${workspaceId}/${plan_id}/steps`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steps: formattedSteps }),
        });
      }

      onSuccess(plan_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories: { value: PlanCategory; label: string }[] = [
    { value: 'feature', label: 'Feature' },
    { value: 'bug', label: 'Bug Fix' },
    { value: 'change', label: 'Change' },
    { value: 'analysis', label: 'Analysis' },
    { value: 'debug', label: 'Debug' },
    { value: 'refactor', label: 'Refactor' },
    { value: 'documentation', label: 'Documentation' },
  ];

  const priorities: { value: PlanPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-slate-500' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-500' },
    { value: 'high', label: 'High', color: 'bg-orange-500' },
    { value: 'critical', label: 'Critical', color: 'bg-red-500' },
  ];

  const phases = ['audit', 'research', 'design', 'implementation', 'testing', 'review', 'documentation'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold">Create New Plan</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Enter plan title..."
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              placeholder="Describe what needs to be done..."
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PlanCategory)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Priority
              </label>
              <div className="flex gap-2">
                {priorities.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      priority === p.value
                        ? `${p.color} text-white`
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-400">
                Initial Steps (optional)
              </label>
              <button
                type="button"
                onClick={addStep}
                className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                <Plus size={14} />
                Add Step
              </button>
            </div>

            {steps.length === 0 ? (
              <p className="text-sm text-slate-500 italic">
                No steps defined yet. The Architect agent will create steps based on your description.
              </p>
            ) : (
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div key={index} className="flex gap-2">
                    <select
                      value={step.phase}
                      onChange={(e) => updateStep(index, 'phase', e.target.value)}
                      className="w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                    >
                      {phases.map((phase) => (
                        <option key={phase} value={phase}>
                          {phase}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={step.task}
                      onChange={(e) => updateStep(index, 'task', e.target.value)}
                      placeholder="Step description..."
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title || !description}
              className={cn(
                'px-4 py-2 rounded-lg transition-colors flex items-center gap-2',
                isSubmitting || !title || !description
                  ? 'bg-violet-500/50 text-violet-300/50 cursor-not-allowed'
                  : 'bg-violet-500 text-white hover:bg-violet-600'
              )}
            >
              {isSubmitting ? 'Creating...' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
