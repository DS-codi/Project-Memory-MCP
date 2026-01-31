import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Badge } from '../common/Badge';
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
}

export function PlanCard({ plan, workspaceId }: PlanCardProps) {
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
        <span className="font-mono">{plan.id.slice(-8)}</span>
      </div>
    </Link>
  );
}
