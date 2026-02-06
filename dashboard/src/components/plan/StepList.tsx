import { useState } from 'react';
import { Edit2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { statusColors, statusIcons, stepTypeColors } from '@/utils/colors';
import { StepEditor } from './StepEditor';
import { useStepMutations } from '@/hooks/useStepMutations';
import type { PlanStep } from '@/types';

interface StepListProps {
  steps: PlanStep[];
  workspaceId?: string;
  planId?: string;
  editable?: boolean;
}

export function StepList({ steps, workspaceId, planId, editable = false }: StepListProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { updateSteps } = useStepMutations();

  // Group steps by phase
  const groupedSteps = steps.reduce((acc, step) => {
    if (!acc[step.phase]) {
      acc[step.phase] = [];
    }
    acc[step.phase].push(step);
    return acc;
  }, {} as Record<string, PlanStep[]>);

  const handleSave = async (editedSteps: PlanStep[]) => {
    if (!workspaceId || !planId) return;
    
    try {
      await updateSteps.mutateAsync({
        workspaceId,
        planId,
        steps: editedSteps,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update steps:', error);
    }
  };

  if (isEditing && workspaceId && planId) {
    return (
      <StepEditor
        steps={steps}
        onSave={handleSave}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {editable && workspaceId && planId && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Edit2 size={16} />
            Edit Steps
          </button>
        </div>
      )}

      {Object.entries(groupedSteps).map(([phase, phaseSteps]) => (
        <div key={phase}>
          <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {phase}
          </h4>
          <div className="space-y-2">
            {phaseSteps.map((step) => (
              <div
                key={step.index}
                className={cn(
                  'flex items-start gap-3 p-3 bg-slate-800/50 border rounded-lg',
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
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
