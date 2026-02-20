import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, Circle, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { statusColors, statusIcons, agentBgColors, agentIcons } from '@/utils/colors';
import { computePhaseStatus } from '@/utils/phase-helpers';
import { displayStepNumber } from '@/utils/formatters';
import type { PlanStep, AgentType } from '@/types';
import type { PlanPhase, PhaseStatus } from '@/types/schema-v2';

// =============================================================================
// Phase Status Colors
// =============================================================================

const phaseStatusColors: Record<PhaseStatus, string> = {
  pending: 'bg-gray-500/20 text-gray-300 border-gray-500/50',
  active: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  complete: 'bg-green-500/20 text-green-300 border-green-500/50',
  blocked: 'bg-red-500/20 text-red-300 border-red-500/50',
};

const phaseStatusIcons: Record<PhaseStatus, string> = {
  pending: '⏳',
  active: '🔄',
  complete: '✅',
  blocked: '🚫',
};

// =============================================================================
// Props
// =============================================================================

interface PhaseCardProps {
  phaseName: string;
  steps: PlanStep[];
  phaseMeta?: PlanPhase;
  defaultOpen?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function PhaseCard({ phaseName, steps, phaseMeta, defaultOpen = false }: PhaseCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const status = phaseMeta?.phase_status ?? computePhaseStatus(steps);
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const totalCount = steps.length;

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/60 hover:bg-slate-900/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isOpen ? (
            <ChevronDown size={16} className="text-slate-400 shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          )}
          <h4 className="text-sm font-semibold text-white truncate">{phaseName}</h4>
          <Badge variant={phaseStatusColors[status]}>
            {phaseStatusIcons[status]} {status}
          </Badge>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Approval gate indicator */}
          {phaseMeta?.approval_gate && (
            <ApprovalGateIndicator gate={phaseMeta.approval_gate} />
          )}
          {/* Progress */}
          <span className="text-xs text-slate-400">
            {doneCount}/{totalCount}
          </span>
          <ProgressBar value={doneCount} max={totalCount} className="w-24" />
        </div>
      </button>

      {/* Expanded body */}
      {isOpen && (
        <div className="px-4 py-3 bg-slate-900/40 space-y-3">
          {/* V2 enrichments: criteria + agents */}
          {phaseMeta && <PhaseMetaSection meta={phaseMeta} />}

          {/* Step list */}
          <StepRows steps={steps} />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ApprovalGateIndicator({ gate }: { gate: NonNullable<PlanPhase['approval_gate']> }) {
  const isConfirmed = Boolean(gate.confirmed_by);
  return (
    <span
      title={
        isConfirmed
          ? `Approved by ${gate.confirmed_by}`
          : `Requires: ${gate.type.replace(/_/g, ' ')}`
      }
      className={cn(
        'inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border',
        isConfirmed
          ? 'bg-green-500/15 text-green-300 border-green-500/40'
          : 'bg-amber-500/15 text-amber-300 border-amber-500/40',
      )}
    >
      {isConfirmed ? <ShieldCheck size={12} /> : <Lock size={12} />}
      {isConfirmed ? 'Approved' : 'Gate'}
    </span>
  );
}

function PhaseMetaSection({ meta }: { meta: PlanPhase }) {
  return (
    <div className="space-y-2">
      {/* Criteria checklist */}
      {meta.criteria && meta.criteria.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1">Criteria</p>
          <ul className="space-y-0.5">
            {meta.criteria.map((criterion, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300">
                {meta.phase_status === 'complete' ? (
                  <CheckCircle2 size={13} className="text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle size={13} className="text-slate-500 shrink-0 mt-0.5" />
                )}
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Required agents */}
      {meta.required_agents && meta.required_agents.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1">Required Agents</p>
          <div className="flex flex-wrap gap-1">
            {meta.required_agents.map((agent) => (
              <Badge key={agent} variant={agentBgColors[agent]} className="text-[10px]">
                {agentIcons[agent]} {agent}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepRows({ steps }: { steps: PlanStep[] }) {
  if (steps.length === 0) {
    return <p className="text-xs text-slate-500 italic">No steps in this phase</p>;
  }

  return (
    <div className="space-y-1">
      {steps.map((step) => (
        <div
          key={step.index}
          className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-800/50 transition-colors"
        >
          <span className="text-xs font-mono text-slate-500 shrink-0 mt-0.5 w-6 text-right">
            {displayStepNumber(step.index)}
          </span>
          <Badge variant={statusColors[step.status]} className="text-[10px] shrink-0">
            {statusIcons[step.status]}
          </Badge>
          <span className="text-xs text-slate-300 flex-1">{step.task}</span>
          {step.assignee && (
            <Badge
              variant={agentBgColors[step.assignee as AgentType]}
              className="text-[10px] shrink-0"
            >
              {agentIcons[step.assignee as AgentType]} {step.assignee}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}
