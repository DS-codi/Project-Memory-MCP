import { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '../common/Badge';
import { categoryColors, agentBgColors, agentIcons } from '@/utils/colors';
import type { RequestCategorization, AgentType } from '@/types';

// =============================================================================
// Props
// =============================================================================

interface CategorizationBadgeProps {
  categorization: RequestCategorization;
}

// =============================================================================
// Component
// =============================================================================

export function CategorizationBadge({ categorization }: CategorizationBadgeProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  const confidenceColor =
    categorization.confidence >= 0.8
      ? 'text-green-400'
      : categorization.confidence >= 0.5
        ? 'text-yellow-400'
        : 'text-red-400';

  const confidencePct = Math.round(categorization.confidence * 100);

  return (
    <div className="space-y-2">
      {/* Top row: category + confidence */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={categoryColors[categorization.category]}>
          {categorization.category}
        </Badge>
        <span className={`text-xs font-medium ${confidenceColor}`}>
          {confidencePct}% confidence
        </span>

        {/* Reasoning toggle */}
        {categorization.reasoning && (
          <button
            type="button"
            onClick={() => setShowReasoning((prev) => !prev)}
            className="inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            title="Toggle reasoning"
          >
            <Info size={12} />
            {showReasoning ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* Reasoning detail */}
      {showReasoning && categorization.reasoning && (
        <p className="text-xs text-slate-400 bg-slate-800/60 rounded px-3 py-2 border border-slate-700">
          {categorization.reasoning}
        </p>
      )}

      {/* Suggested workflow */}
      {categorization.suggested_workflow && categorization.suggested_workflow.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">
            Suggested Workflow
          </p>
          <div className="flex flex-wrap gap-1">
            {categorization.suggested_workflow.map((agent, i) => (
              <Badge
                key={`${agent}-${i}`}
                variant={agentBgColors[agent as AgentType]}
                className="text-[10px]"
              >
                {agentIcons[agent as AgentType]} {agent}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
