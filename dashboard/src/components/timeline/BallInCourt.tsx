import { cn } from '@/utils/cn';
import { formatDuration } from '@/utils/formatters';
import { agentColors, agentIcons, agentBgColors } from '@/utils/colors';
import type { AgentType, AgentSession } from '@/types';

interface BallInCourtProps {
  currentAgent: AgentType | null;
  currentSession?: AgentSession;
}

export function BallInCourt({ currentAgent, currentSession }: BallInCourtProps) {
  if (!currentAgent) {
    return (
      <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg text-center">
        <div className="text-4xl mb-2">✅</div>
        <p className="text-slate-400">No active agent</p>
        <p className="text-sm text-slate-500">Plan is complete or paused</p>
      </div>
    );
  }

  return (
    <div 
      className="p-6 rounded-lg border-2"
      style={{
        borderColor: agentColors[currentAgent],
        backgroundColor: `${agentColors[currentAgent]}10`,
      }}
    >
      <div className="flex items-center gap-4">
        {/* Agent Avatar */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
          style={{ backgroundColor: `${agentColors[currentAgent]}30` }}
        >
          {agentIcons[currentAgent]}
        </div>

        {/* Agent Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-2 py-1 rounded font-semibold', agentBgColors[currentAgent])}>
              {currentAgent}
            </span>
            <span className="flex items-center gap-1 text-blue-400">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Active
            </span>
          </div>

          {currentSession && (
            <>
              <p className="text-sm text-slate-400">
                Session started {formatDuration(currentSession.started_at)} ago
              </p>
              
              {/* Context preview */}
              {currentSession.context && Object.keys(currentSession.context).length > 0 && (
                <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs">
                  <span className="text-slate-500">Context: </span>
                  {Object.entries(currentSession.context).slice(0, 3).map(([key, value]) => (
                    <span key={key} className="text-slate-400 mr-2">
                      {key}: {typeof value === 'string' ? value.slice(0, 30) : '...'}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
