import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { statusColors, statusIcons } from '@/utils/colors';
import type { PlanStep } from '@/types';

interface StepListProps {
  steps: PlanStep[];
}

export function StepList({ steps }: StepListProps) {
  // Group steps by phase
  const groupedSteps = steps.reduce((acc, step) => {
    if (!acc[step.phase]) {
      acc[step.phase] = [];
    }
    acc[step.phase].push(step);
    return acc;
  }, {} as Record<string, PlanStep[]>);

  return (
    <div className="space-y-6">
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
                  </div>
                  <p className="text-slate-200">{step.task}</p>
                  {step.notes && (
                    <p className="mt-1 text-sm text-slate-400">{step.notes}</p>
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
