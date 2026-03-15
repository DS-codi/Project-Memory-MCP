import { useState } from 'react';
import { Bot, Edit2, Check, X, ChevronDown, ChevronRight, CheckCircle2, Circle, ShieldCheck, AlertTriangle, CheckCheck } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { statusColors, statusIcons, stepTypeColors } from '@/utils/colors';
import { displayStepNumber } from '@/utils/formatters';
import { StepEditor } from './StepEditor';
import { StepFilterBar, applyFiltersAndSort } from './StepFilterBar';
import type { StepFilters, StepSort } from './StepFilterBar';
import { useStepMutations } from '@/hooks/useStepMutations';
import { LaunchAgentSessionDialog } from './LaunchAgentSessionDialog';
import type { PlanStep, StepStatus, StepType } from '@/types';
import type { PlanPhase } from '@/types/schema-v2';

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
        <span className="text-sm font-mono text-slate-500">{displayStepNumber(step.index)}</span>
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
  phases?: PlanPhase[];
}

export function StepList({ steps, workspaceId, planId, editable = false, phases }: StepListProps) {
  const [bulkEditing, setBulkEditing] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<StepFilters>({ status: [], type: [], assignee: [], search: '' });
  const [sort, setSort] = useState<StepSort>({ field: 'index', direction: 'asc' });
  const { updateSteps, updateStep, confirmStep } = useStepMutations();
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [confirmingStepIndex, setConfirmingStepIndex] = useState<number | null>(null);
  const [quickStatusStepIndex, setQuickStatusStepIndex] = useState<number | null>(null);
  const [launchDialogStep, setLaunchDialogStep] = useState<PlanStep | null>(null);

  // Apply filters and sort
  const filteredSteps = applyFiltersAndSort(steps, filters, sort);
  const isFiltered = filters.status.length > 0 || filters.type.length > 0 || filters.assignee.length > 0 || filters.search.length > 0;

  // Group steps by phase
  const groupedSteps = filteredSteps.reduce((acc, step) => {
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
      await updateStep.mutateAsync({
        workspaceId,
        planId,
        stepIndex: updated.index,
        status: updated.status,
        notes: updated.notes,
        task: updated.task,
        phase: updated.phase,
        type: updated.type,
        assignee: updated.assignee,
      });
      setEditingStepIndex(null);
    } catch (error) {
      console.error('Failed to update step:', error);
    } finally {
      setIsSavingStep(false);
    }
  };

  const handleQuickStatus = async (step: PlanStep, newStatus: StepStatus) => {
    if (!workspaceId || !planId) return;
    setQuickStatusStepIndex(step.index);
    try {
      await updateStep.mutateAsync({
        workspaceId,
        planId,
        stepIndex: step.index,
        status: newStatus,
      });
    } catch (error) {
      console.error('Failed to update step status:', error);
    } finally {
      setQuickStatusStepIndex(null);
    }
  };

  const handleConfirmStep = async (step: PlanStep) => {
    if (!workspaceId || !planId) return;
    setConfirmingStepIndex(step.index);
    try {
      await confirmStep.mutateAsync({
        workspaceId,
        planId,
        confirmation_scope: 'step',
        confirm_step_index: step.index,
        confirmed_by: 'user',
      });
    } catch (error) {
      console.error('Failed to confirm step:', error);
    } finally {
      setConfirmingStepIndex(null);
    }
  };

  const handleConfirmPhase = async (phase: string) => {
    if (!workspaceId || !planId) return;
    try {
      await confirmStep.mutateAsync({
        workspaceId,
        planId,
        confirmation_scope: 'phase',
        confirm_phase: phase,
        confirmed_by: 'user',
      });
    } catch (error) {
      console.error('Failed to confirm phase:', error);
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

  const needsConfirmation = (step: PlanStep) =>
    (step.requires_validation || step.requires_confirmation ||
     step.type === 'user_validation' || step.type === 'confirmation') &&
    step.status !== 'done';

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      {steps.length > 3 && (
        <StepFilterBar
          steps={steps}
          filters={filters}
          sort={sort}
          onFiltersChange={setFilters}
          onSortChange={setSort}
        />
      )}

      {/* Filter summary */}
      {isFiltered && (
        <div className="text-sm text-slate-400">
          Showing {filteredSteps.length} of {steps.length} steps
        </div>
      )}

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
        const allDone = doneCount === phaseSteps.length && phaseSteps.length > 0;
        const matchedPhase = phases?.find((p) => p.name === phase);
        const hasCriteria = matchedPhase?.criteria && matchedPhase.criteria.length > 0;
        const phaseNeedsConfirm = editable && workspaceId && planId &&
          phaseSteps.some((s) => needsConfirmation(s) && s.status !== 'done') &&
          phaseSteps.every((s) => s.status === 'done' || needsConfirmation(s));

        return (
          <div key={phase}>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => togglePhase(phase)}
                className="flex items-center gap-2 group flex-1 text-left"
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
                {hasCriteria && (
                  allDone
                    ? <span title={`Phase criteria met (${matchedPhase!.criteria!.length})`}><CheckCircle2 size={14} className="text-green-400" /></span>
                    : <span title={`Phase criteria: ${matchedPhase!.criteria!.join(', ')}`}><Circle size={14} className="text-slate-500" /></span>
                )}
              </button>
              {phaseNeedsConfirm && (
                <button
                  onClick={() => handleConfirmPhase(phase)}
                  disabled={confirmStep.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 text-green-300 rounded text-xs transition-colors disabled:opacity-50"
                  title="Confirm / validate all steps in this phase"
                >
                  <ShieldCheck size={13} />
                  Confirm Phase
                </button>
              )}
            </div>

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
                          'group/step border rounded-lg',
                          step.status === 'active' ? 'border-blue-500/50 bg-blue-900/10' :
                          step.status === 'blocked' ? 'border-red-500/40 bg-red-900/10' :
                          step.status === 'done' ? 'border-slate-700 bg-slate-800/30' :
                          needsConfirmation(step) ? 'border-amber-500/50 bg-amber-900/10' :
                          'border-slate-700 bg-slate-800/50'
                        )}
                      >
                        <div className="flex items-start gap-3 p-3">
                          <span className="text-lg mt-0.5 flex-shrink-0" title={step.status}>
                            {statusIcons[step.status]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-mono text-slate-500">{displayStepNumber(step.index)}</span>
                              <Badge variant={statusColors[step.status]}>{step.status}</Badge>
                              {step.type && (
                                <Badge variant={stepTypeColors[step.type]}>{step.type}</Badge>
                              )}
                            </div>
                            <p className="text-slate-200">{step.task}</p>
                            {step.notes && (
                              <p className="mt-1 text-sm text-slate-400">{step.notes}</p>
                            )}
                            {(step.assignee || step.requires_validation || step.requires_confirmation) && (
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                {step.assignee && (
                                  <span className="px-2 py-0.5 rounded border border-slate-600 text-slate-300">
                                    Assignee: {step.assignee}
                                  </span>
                                )}
                                {step.requires_validation && (
                                  <span className="px-2 py-0.5 rounded border border-amber-500/50 text-amber-300 flex items-center gap-1">
                                    <AlertTriangle size={11} />
                                    Requires validation
                                  </span>
                                )}
                                {step.requires_confirmation && (
                                  <span className="px-2 py-0.5 rounded border border-amber-500/50 text-amber-300 flex items-center gap-1">
                                    <ShieldCheck size={11} />
                                    Requires confirmation
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Confirm / Validate button for steps needing it */}
                            {editable && workspaceId && planId && needsConfirmation(step) && (
                              <button
                                onClick={() => handleConfirmStep(step)}
                                disabled={confirmingStepIndex === step.index || confirmStep.isPending}
                                className="flex items-center gap-1 px-2 py-1 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 text-green-300 rounded text-xs transition-colors disabled:opacity-50"
                                title="Confirm / validate this step"
                              >
                                <ShieldCheck size={13} />
                                {confirmingStepIndex === step.index ? '...' : 'Confirm'}
                              </button>
                            )}

                            {/* Quick status buttons (shown on hover or when editable) */}
                            {editable && workspaceId && planId && step.status !== 'done' && (
                              <button
                                onClick={() => handleQuickStatus(step, 'done')}
                                disabled={quickStatusStepIndex === step.index || updateStep.isPending}
                                className="p-1.5 rounded hover:bg-green-700/40 transition-colors opacity-0 group-hover/step:opacity-100 focus:opacity-100 disabled:opacity-50"
                                title="Mark as done"
                              >
                                <CheckCheck size={14} className="text-green-400" />
                              </button>
                            )}
                            {editable && workspaceId && planId && (
                              <button
                                onClick={() => setEditingStepIndex(step.index)}
                                className="p-1.5 rounded hover:bg-slate-700 transition-colors opacity-0 group-hover/step:opacity-100 focus:opacity-100"
                                title="Edit step"
                              >
                                <Edit2 size={14} className="text-slate-400" />
                              </button>
                            )}
                            {/* Launch agent session for this step */}
                            {workspaceId && planId && (
                              <button
                                onClick={() => setLaunchDialogStep(step)}
                                className="p-1.5 rounded hover:bg-emerald-700/30 transition-colors opacity-0 group-hover/step:opacity-100 focus:opacity-100"
                                title="Launch agent session for this step"
                              >
                                <Bot size={14} className="text-slate-500 group-hover/step:text-emerald-400" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Quick status bar — always visible in editable mode for non-done steps */}
                        {editable && workspaceId && planId && step.status !== 'done' && (
                          <div className="flex gap-1 px-3 pb-2 opacity-0 group-hover/step:opacity-100 focus-within:opacity-100 transition-opacity">
                            {(['pending', 'active', 'blocked'] as StepStatus[])
                              .filter((s) => s !== step.status)
                              .map((s) => (
                                <button
                                  key={s}
                                  onClick={() => handleQuickStatus(step, s)}
                                  disabled={quickStatusStepIndex === step.index || updateStep.isPending}
                                  className={cn(
                                    'px-2 py-0.5 rounded text-xs transition-colors disabled:opacity-50',
                                    s === 'active' ? 'bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300' :
                                    s === 'blocked' ? 'bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300' :
                                    'bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300'
                                  )}
                                >
                                  → {s}
                                </button>
                              ))
                            }
                          </div>
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

      {/* Launch agent session dialog — rendered at StepList level */}
      {workspaceId && planId && launchDialogStep && (
        <LaunchAgentSessionDialog
          open={true}
          onClose={() => setLaunchDialogStep(null)}
          workspaceId={workspaceId}
          planId={planId}
          phase={launchDialogStep.phase}
          stepIndex={launchDialogStep.index}
          stepTask={launchDialogStep.task}
        />
      )}
    </div>
  );
}
