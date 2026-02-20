import { Link, useNavigate } from 'react-router-dom';
import { Clock, FolderTree, Shield, Gauge, BookOpen, PauseCircle } from 'lucide-react';
import { Badge } from '../common/Badge';
import { CopyButton } from '../common/CopyButton';
import { ProgressBar } from '../common/ProgressBar';
import { formatRelative } from '@/utils/formatters';
import { 
  categoryColors, 
  priorityColors, 
  priorityIcons, 
  planStatusColors,
  agentBgColors,
  agentIcons 
} from '@/utils/colors';
import type { PlanSummary, AgentType } from '@/types';

interface PlanCardProps {
  plan: PlanSummary;
  workspaceId: string;
  programName?: string;
}

export function PlanCard({ plan, workspaceId, programName }: PlanCardProps) {
  const navigate = useNavigate();
  const parentProgramId = plan.relationships?.parent_program_id ?? plan.program_id;
  const childPlanCount = plan.relationships?.child_plan_ids?.length ?? plan.child_plan_ids?.length ?? 0;
  const linkedPlanCount = plan.relationships?.linked_plan_ids?.length ?? plan.linked_plan_ids?.length ?? plan.depends_on_plans?.length ?? 0;
  const dependentPlanCount = plan.relationships?.dependent_plan_ids?.length ?? 0;
  const unresolvedLinkedCount = plan.relationships?.unresolved_linked_plan_ids?.length ?? 0;
  const hasAnyRelationships = Boolean(plan.is_program) || Boolean(parentProgramId) || childPlanCount > 0 || linkedPlanCount > 0 || dependentPlanCount > 0 || unresolvedLinkedCount > 0;

  // v2 plan fields (may be present on enriched summary responses)
  const v2 = plan as PlanSummary & {
    difficulty_profile?: { level: string };
    risk_register?: unknown[];
    matched_skills?: unknown[];
  };

  return (
    <Link
      to={`/workspace/${workspaceId}/plan/${plan.id}`}
      className="block bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-violet-500/50 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={categoryColors[plan.category]}>
              {plan.category}
            </Badge>
            <Badge variant={priorityColors[plan.priority]}>
              {priorityIcons[plan.priority]} {plan.priority}
            </Badge>
            <Badge variant={planStatusColors[plan.status]}>
              {plan.status}
            </Badge>
          </div>
          {/* v2 indicators */}
          {(v2.difficulty_profile || (v2.risk_register && v2.risk_register.length > 0) || (v2.matched_skills && v2.matched_skills.length > 0)) && (
            <div className="flex items-center gap-1.5 mt-1">
              {v2.difficulty_profile && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <Gauge size={10} /> {v2.difficulty_profile.level}
                </span>
              )}
              {v2.risk_register && v2.risk_register.length > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-300 border border-red-500/30">
                  <Shield size={10} /> {v2.risk_register.length}
                </span>
              )}
              {v2.matched_skills && v2.matched_skills.length > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  <BookOpen size={10} /> {v2.matched_skills.length}
                </span>
              )}
            </div>
          )}
          <h3 className="font-semibold text-lg truncate group-hover:text-violet-300 transition-colors">
            {plan.title}
          </h3>
        </div>
      </div>

      {/* Current Agent */}
      {plan.current_agent && (
        <div className="flex items-center gap-2 mb-3">
          <Badge variant={agentBgColors[plan.current_agent as AgentType]}>
            {agentIcons[plan.current_agent as AgentType]} {plan.current_agent}
          </Badge>
          <span className="text-sm text-slate-500">currently active</span>
        </div>
      )}

      {/* Paused Plan Indicator */}
      {plan.status === 'paused' && plan.paused_at_snapshot && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
          <PauseCircle size={14} className="text-yellow-400" />
          <span className="text-xs text-yellow-300">
            Paused at step #{plan.paused_at_snapshot.step_index + 1}: {plan.paused_at_snapshot.reason}
          </span>
        </div>
      )}

      {/* Program Membership */}
      {parentProgramId && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/workspace/${workspaceId}/program/${parentProgramId}`);
          }}
          className="inline-flex items-center gap-1.5 mb-3 px-2 py-0.5 rounded bg-violet-500/20 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/30 transition-colors"
        >
          <FolderTree size={12} />
          <span>{programName || parentProgramId.slice(-8)}</span>
        </button>
      )}

      <div className="mb-3">
        <div className="text-xs text-slate-500 mb-1">Relationships</div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {plan.is_program && (
            <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">Program</span>
          )}
          {parentProgramId && (
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">Child of program</span>
          )}
          {childPlanCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">Children: {childPlanCount}</span>
          )}
          {linkedPlanCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">Linked: {linkedPlanCount}</span>
          )}
          {dependentPlanCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">Linked by: {dependentPlanCount}</span>
          )}
          {unresolvedLinkedCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">Unresolved links: {unresolvedLinkedCount}</span>
          )}
          {!hasAnyRelationships && (
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-400">No relationships</span>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-slate-400">Progress</span>
          <span className="text-slate-300">
            {plan.progress.done}/{plan.progress.total} steps
          </span>
        </div>
        <ProgressBar value={plan.progress.done} max={plan.progress.total} />
      </div>

      {/* Timestamps */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span>Updated {formatRelative(plan.updated_at)}</span>
        </div>
        <span className="flex items-center gap-1">
          <span className="font-mono">{plan.id.slice(-8)}</span>
          <CopyButton text={plan.id} label="plan ID" size={12} />
        </span>
      </div>
    </Link>
  );
}
