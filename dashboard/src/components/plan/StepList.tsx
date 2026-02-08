import { useState } from 'react';
import { Edit2, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { statusColors, statusIcons, stepTypeColors } from '@/utils/colors';
import { StepEditor } from './StepEditor';
import { useStepMutations } from '@/hooks/useStepMutations';
import type { PlanStep, StepStatus, StepType } from '@/types';

const STEP_TYPES: StepType[] = [
  'standard', 'analysis', 'validation', 'user_validation', 'complex', 'critical',
  'build', 'fix', 'refactor', 'confirmation', 'research', 'planning', 'code', 'test', 'documentation'
];

interface InlineStepEditorProps {
  step: PlanStep;
  onSave: (updated: PlanStep) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function InlineStepEditor({ step, onSave, onCancel, isSaving }: InlineStepEditorProps) {
  const [draft, setDraft] = useState<PlanStep>({ ...step });

  return (
    <div className="space-y-3 p-3 bg-slate-900/60 border border-violet-500/40 rounded-lg">
      {/* Status + Type row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-mono text-slate-500">#{step.index + 1}</span>
        <select
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as StepStatus })}
          className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="done">Done</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          value={draft.type || 'standard'}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as StepType })}
          className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          {STEP_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Task */}
      <textarea
        value={draft.task}
        onChange={(e) => setDraft({ ...draft, task: e.target.value })}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
        rows={2}
        placeholder="Task description"
      />

      {/* Phase + Assignee row */}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={draft.phase}
          onChange={(e) => setDraft({ ...draft, phase: e.target.value })}
          placeholder="Phase"
          className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <input
          type="text"
          value={draft.assignee || ''}
          onChange={(e) => setDraft({ ...draft, assignee: e.target.value || undefined })}
          placeholder="Assignee (optional)"
          className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Notes */}
      <textarea
        value={draft.notes || ''}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value || undefined })}
        placeholder="Notes (optional)"
        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
        rows={2}
      />

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <X size={14} />
          Cancel
        </button>
        <button
          onClick={() => onSave(draft)}
          disabled={isSaving || !draft.task.trim()}
          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Check size={14} />
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

interface StepListProps {
  steps: PlanStep[];
  workspaceId?: string;
  planId?: string;
  editable?: boolean;
}

export function StepList({ steps, workspaceId, planId, editable = false }: StepListProps) {
  const [bulkEditing, setBulkEditing] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const { updateSteps } = useStepMutations();
  const [isSavingStep, setIsSavingStep] = useState(false);

  // Group steps by phase
  const groupedSteps = steps.reduce((acc, step) => {
    if (!acc[step.phase]) {
      acc[step.phase] = [];
    }
    acc[step.phase].push(step);
    return acc;
  }, {} as Record<string, PlanStep[]>);

  const togglePhase = (phase: string) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  const handleBulkSave = async (editedSteps: PlanStep[]) => {
    if (!workspaceId || !planId) return;
    
    try {
      await updateSteps.mutateAsync({
        workspaceId,
        planId,
        steps: editedSteps,
      });
      setBulkEditing(false);
    } catch (error) {
      console.error('Failed to update steps:', error);
    }
  };

  const handleInlineSave = async (updated: PlanStep) => {
    if (!workspaceId || !planId) return;

    setIsSavingStep(true);
    try {
      const newSteps = steps.map((s) =>
        s.index === updated.index ? updated : s
      );
      await updateSteps.mutateAsync({
        workspaceId,
        planId,
        steps: newSteps,
      });
      setEditingStepIndex(null);
    } catch (error) {
      console.error('Failed to update step:', error);
    } finally {
      setIsSavingStep(false);
    }
  };

  if (bulkEditing && workspaceId && planId) {
    return (
      <StepEditor
        steps={steps}
        onSave={handleBulkSave}
        onCancel={() => setBulkEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {editable && workspaceId && planId && (
        <div className="flex justify-end">
          <button
            onClick={() => setBulkEditing(true)}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Edit2 size={16} />
            Edit All Steps
          </button>
        </div>
      )}

      {Object.entries(groupedSteps).map(([phase, phaseSteps]) => {
        const isCollapsed = collapsedPhases.has(phase);
        const doneCount = phaseSteps.filter((s) => s.status === 'done').length;

        return (
          <div key={phase}>
            <button
              onClick={() => togglePhase(phase)}
              className="flex items-center gap-2 mb-3 group w-full text-left"
            >
              {isCollapsed ? (
                <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
              ) : (
                <ChevronDown size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
              )}
              <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-300 transition-colors">
                {phase}
              </h4>
              <span className="text-xs text-slate-500">
                {doneCount}/{phaseSteps.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="space-y-2">
                {phaseSteps.map((step) => (
                  <div key={step.index}>
                    {editingStepIndex === step.index ? (
                      <InlineStepEditor
                        step={step}
                        onSave={handleInlineSave}
                        onCancel={() => setEditingStepIndex(null)}
                        isSaving={isSavingStep}
                      />
                    ) : (
                      <div
                        className={cn(
                          'flex items-start gap-3 p-3 bg-slate-800/50 border rounded-lg group/step',
                          step.status === 'active' ? 'border-blue-500/50' : 'border-slate-700'
                        )}
                      >
                        <span className="text-lg" title={step.status}>
                          {statusIcons[step.status]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-mono text-slate-500">#{step.index + 1}</span>
                            <Badge variant={statusColors[step.status]}>{step.status}</Badge>
                            {step.type && (
                              <Badge variant={stepTypeColors[step.type]}>{step.type}</Badge>
                            )}
                          </div>
                          <p className="text-slate-200">{step.task}</p>
                          {step.notes && (
                            <p className="mt-1 text-sm text-slate-400">{step.notes}</p>
                          )}
                          {(step.assignee || step.requires_validation) && (
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              {step.assignee && (
                                <span className="px-2 py-0.5 rounded border border-slate-600 text-slate-300">
                                  Assignee: {step.assignee}
                                </span>
                              )}
                              {step.requires_validation && (
                                <span className="px-2 py-0.5 rounded border border-amber-500/50 text-amber-300">
                                  Requires validation
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {editable && workspaceId && planId && (
                          <button
                            onClick={() => setEditingStepIndex(step.index)}
                            className="p-1.5 rounded hover:bg-slate-700 transition-colors opacity-0 group-hover/step:opacity-100 focus:opacity-100"
                            title="Edit step"
                          >
                            <Edit2 size={14} className="text-slate-400" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
