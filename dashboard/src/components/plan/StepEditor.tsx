import { useState } from 'react';
import { ArrowUp, ArrowDown, ChevronsUp, Trash2, Plus } from 'lucide-react';
import { Badge } from '../common/Badge';
import { statusColors, stepTypeColors } from '@/utils/colors';
import type { PlanStep, StepStatus, StepType } from '@/types';

interface StepEditorProps {
  steps: PlanStep[];
  onSave: (steps: PlanStep[]) => void;
  onCancel: () => void;
}

export function StepEditor({ steps, onSave, onCancel }: StepEditorProps) {
  const [editedSteps, setEditedSteps] = useState<PlanStep[]>([...steps]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Move step to a new 0-based position within editedSteps
  const moveStepToIndex = (fromIndex: number, toDisplayNumber: number) => {
    const toIndex = toDisplayNumber - 1; // convert 1-based input to 0-based
    if (toIndex < 0 || toIndex >= editedSteps.length || toIndex === fromIndex) return;
    const newSteps = [...editedSteps];
    const [movedStep] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, movedStep);
    setEditedSteps(reindexSteps(newSteps));
  };

  // Reindex all steps after reordering
  const reindexSteps = (stepsList: PlanStep[]): PlanStep[] => {
    return stepsList.map((step, idx) => ({ ...step, index: idx }));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...editedSteps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newSteps.length) return;
    
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    setEditedSteps(reindexSteps(newSteps));
  };

  const prioritizeStep = (index: number) => {
    const newSteps = [...editedSteps];
    const step = newSteps.splice(index, 1)[0];
    newSteps.unshift(step);
    setEditedSteps(reindexSteps(newSteps));
  };

  const movePhase = (phaseName: string, direction: 'up' | 'down') => {
    // Get unique phases in order
    const phases = [...new Set(editedSteps.map(s => s.phase))];
    const phaseIndex = phases.indexOf(phaseName);
    const targetIndex = direction === 'up' ? phaseIndex - 1 : phaseIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= phases.length) return;
    
    // Swap phases
    [phases[phaseIndex], phases[targetIndex]] = [phases[targetIndex], phases[phaseIndex]];
    
    // Reorder steps based on new phase order
    const newSteps: PlanStep[] = [];
    phases.forEach(phase => {
      const phaseSteps = editedSteps.filter(s => s.phase === phase);
      newSteps.push(...phaseSteps);
    });
    
    setEditedSteps(reindexSteps(newSteps));
  };

  const updateStep = (index: number, updates: Partial<PlanStep>) => {
    const newSteps = [...editedSteps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setEditedSteps(newSteps);
  };

  const deleteStep = (index: number) => {
    const newSteps = editedSteps.filter((_, idx) => idx !== index);
    setEditedSteps(reindexSteps(newSteps));
    setDeleteConfirm(null);
  };

  const addStep = (afterIndex: number, phase: string) => {
    const newSteps = [...editedSteps];
    const newStep: PlanStep = {
      index: afterIndex + 1,
      phase,
      task: 'New task',
      status: 'pending',
      type: 'standard'
    };
    newSteps.splice(afterIndex + 1, 0, newStep);
    setEditedSteps(reindexSteps(newSteps));
  };

  const stepTypes: StepType[] = [
    'standard',
    'analysis',
    'validation',
    'user_validation',
    'complex',
    'critical',
    'build',
    'fix',
    'refactor',
    'confirmation',
    'research',
    'planning',
    'code',
    'test',
    'documentation'
  ];

  // Group steps by phase
  const groupedSteps = editedSteps.reduce((acc, step) => {
    if (!acc[step.phase]) {
      acc[step.phase] = [];
    }
    acc[step.phase].push(step);
    return acc;
  }, {} as Record<string, PlanStep[]>);

  const phases = Object.keys(groupedSteps);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700">
        <h3 className="text-lg font-semibold">Edit Plan Steps</h3>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(editedSteps)}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>

      {phases.map((phase, phaseIndex) => (
        <div key={phase} className="border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              {phase}
              <span className="text-xs text-slate-500">
                ({groupedSteps[phase].length} {groupedSteps[phase].length === 1 ? 'step' : 'steps'})
              </span>
            </h4>
            <div className="flex gap-1">
              {phaseIndex > 0 && (
                <button
                  onClick={() => movePhase(phase, 'up')}
                  className="p-1 hover:bg-slate-700 rounded transition-colors"
                  title="Move phase up"
                >
                  <ArrowUp size={16} className="text-slate-400" />
                </button>
              )}
              {phaseIndex < phases.length - 1 && (
                <button
                  onClick={() => movePhase(phase, 'down')}
                  className="p-1 hover:bg-slate-700 rounded transition-colors"
                  title="Move phase down"
                >
                  <ArrowDown size={16} className="text-slate-400" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {groupedSteps[phase].map((step) => (
              <div key={step.index} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                {deleteConfirm === step.index ? (
                  <div className="flex items-center justify-between bg-red-900/20 -m-3 p-3 rounded-lg">
                    <span className="text-red-400">Delete this step?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteStep(step.index)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm transition-colors"
                      >
                        Confirm Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      {/* Step controls */}
                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          onClick={() => prioritizeStep(step.index)}
                          className="p-1 hover:bg-violet-700 rounded transition-colors"
                          title="Prioritize (move to top)"
                          disabled={step.index === 0}
                        >
                          <ChevronsUp size={14} className={step.index === 0 ? 'text-slate-600' : 'text-violet-400'} />
                        </button>
                        <button
                          onClick={() => moveStep(step.index, 'up')}
                          className="p-1 hover:bg-slate-700 rounded transition-colors"
                          title="Move up"
                          disabled={step.index === 0}
                        >
                          <ArrowUp size={14} className={step.index === 0 ? 'text-slate-600' : 'text-slate-400'} />
                        </button>
                        <button
                          onClick={() => moveStep(step.index, 'down')}
                          className="p-1 hover:bg-slate-700 rounded transition-colors"
                          title="Move down"
                          disabled={step.index === editedSteps.length - 1}
                        >
                          <ArrowDown size={14} className={step.index === editedSteps.length - 1 ? 'text-slate-600' : 'text-slate-400'} />
                        </button>
                      </div>

                      <div className="flex-1 space-y-2">
                        {/* Step info */}
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={editedSteps.length}
                            value={step.index + 1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) moveStepToIndex(step.index, val);
                            }}
                            title="Step position (drag or type to reorder)"
                            className="w-12 text-center text-sm font-mono text-slate-400 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                          />
                          <select
                            value={step.status}
                            onChange={(e) => updateStep(step.index, { status: e.target.value as StepStatus })}
                            className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm"
                          >
                            <option value="pending">Pending</option>
                            <option value="active">Active</option>
                            <option value="done">Done</option>
                            <option value="blocked">Blocked</option>
                          </select>
                          <select
                            value={step.type || 'standard'}
                            onChange={(e) => updateStep(step.index, { type: e.target.value as StepType })}
                            className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm"
                          >
                            {stepTypes.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                          <Badge variant={statusColors[step.status]}>{step.status}</Badge>
                          {step.type && (
                            <Badge variant={stepTypeColors[step.type]}>{step.type}</Badge>
                          )}
                        </div>

                        {/* Task input */}
                        <textarea
                          value={step.task}
                          onChange={(e) => updateStep(step.index, { task: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                          rows={2}
                        />

                        {/* Phase input */}
                        <input
                          type="text"
                          value={step.phase}
                          onChange={(e) => updateStep(step.index, { phase: e.target.value })}
                          placeholder="Phase name"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />

                        {/* Notes (collapsible) */}
                        <details className="text-sm">
                          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                            Notes {step.notes ? '(has notes)' : '(none)'}
                          </summary>
                          <textarea
                            value={step.notes || ''}
                            onChange={(e) => updateStep(step.index, { notes: e.target.value || undefined })}
                            placeholder="Optional notes for this step"
                            className="w-full mt-2 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                            rows={2}
                          />
                        </details>

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={step.assignee || ''}
                            onChange={(e) => updateStep(step.index, { assignee: e.target.value || undefined })}
                            placeholder="Assignee (optional)"
                            className="px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
                          />
                          <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={Boolean(step.requires_validation)}
                              onChange={(e) => updateStep(step.index, { requires_validation: e.target.checked })}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-violet-500 focus:ring-violet-500"
                            />
                            Requires validation
                          </label>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => setDeleteConfirm(step.index)}
                        className="p-2 hover:bg-red-900/30 rounded transition-colors"
                        title="Delete step"
                      >
                        <Trash2 size={16} className="text-red-400" />
                      </button>
                    </div>

                    {/* Add step button */}
                    <button
                      onClick={() => addStep(step.index, phase)}
                      className="mt-2 w-full py-1.5 border border-dashed border-slate-600 hover:border-violet-500 hover:bg-violet-900/10 rounded text-sm text-slate-400 hover:text-violet-300 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus size={14} />
                      Add step after this
                    </button>
                  </>
                )}
              </div>
            ))}

            {/* Add step at end of phase */}
            <button
              onClick={() => addStep(groupedSteps[phase][groupedSteps[phase].length - 1].index, phase)}
              className="w-full py-2 border-2 border-dashed border-slate-600 hover:border-violet-500 hover:bg-violet-900/10 rounded text-sm text-slate-400 hover:text-violet-300 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Add step to {phase}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
