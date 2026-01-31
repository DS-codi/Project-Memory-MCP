import { cn } from '@/utils/cn';
import { formatTime, formatDuration } from '@/utils/formatters';
import { agentColors, agentIcons, agentBgColors } from '@/utils/colors';
import type { LineageEntry, AgentSession, AgentType } from '@/types';

interface HandoffTimelineProps {
  lineage: LineageEntry[];
  sessions: AgentSession[];
}

export function HandoffTimeline({ lineage, sessions }: HandoffTimelineProps) {
  if (lineage.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        No handoffs recorded yet
      </div>
    );
  }

  // Build timeline nodes from lineage and sessions
  const nodes = lineage.map((entry, index) => {
    const session = sessions.find(
      (s) => s.agent_type === entry.to_agent && 
             new Date(s.started_at) >= new Date(entry.timestamp)
    );

    return {
      ...entry,
      session,
      isLast: index === lineage.length - 1,
    };
  });

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-700" />

      {/* Nodes */}
      <div className="space-y-6">
        {nodes.map((node, index) => (
          <div key={index} className="relative flex items-start gap-4">
            {/* Node circle */}
            <div
              className={cn(
                'relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-xl border-2',
                node.isLast && !node.session?.completed_at
                  ? 'border-blue-500 bg-blue-500/20 animate-pulse'
                  : 'border-slate-600 bg-slate-800'
              )}
              style={{ 
                borderColor: node.isLast ? agentColors[node.to_agent as AgentType] : undefined,
                backgroundColor: node.isLast ? `${agentColors[node.to_agent as AgentType]}20` : undefined,
              }}
            >
              {agentIcons[node.to_agent as AgentType]}
            </div>

            {/* Content */}
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-sm font-medium',
                    agentBgColors[node.to_agent as AgentType]
                  )}
                >
                  {node.to_agent}
                </span>
                <span className="text-xs text-slate-500">
                  {formatTime(node.timestamp)}
                </span>
                {node.session?.completed_at && (
                  <span className="text-xs text-slate-500">
                    • Duration: {formatDuration(node.session.started_at, node.session.completed_at)}
                  </span>
                )}
              </div>

              {/* Handoff reason */}
              <p className="text-sm text-slate-400 mb-2">
                <span className="text-slate-500">From {node.from_agent}:</span> {node.reason}
              </p>

              {/* Session summary */}
              {node.session?.summary && (
                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <p className="text-sm text-slate-300">{node.session.summary}</p>
                  {node.session.artifacts && node.session.artifacts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {node.session.artifacts.map((artifact, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400"
                        >
                          📄 {artifact}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Active indicator */}
              {node.isLast && !node.session?.completed_at && (
                <div className="mt-2 flex items-center gap-2 text-blue-400">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  <span className="text-sm">Currently active</span>
                  {node.session && (
                    <span className="text-xs text-slate-500">
                      for {formatDuration(node.session.started_at)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
