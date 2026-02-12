import { useMemo } from 'react';
import { cn } from '@/utils/cn';
import { formatTime, formatDuration } from '@/utils/formatters';
import { agentColors, agentBgColors } from '@/utils/colors';
import type { AgentSession, AgentType, LineageEntry, WorkerSession } from '@/types';

/** Type guard for WorkerSession */
function isWorkerSession(s: AgentSession): s is WorkerSession {
  return s.agent_type === ('Worker' as AgentType);
}

interface AgentActivityTimelineProps {
  sessions: AgentSession[];
  lineage: LineageEntry[];
  planCreatedAt: string;
  className?: string;
}

interface TimelineRow {
  agentType: AgentType;
  sessions: Array<{
    session: AgentSession;
    startPercent: number;
    widthPercent: number;
  }>;
}

export function AgentActivityTimeline({
  sessions,
  lineage,
  planCreatedAt,
  className,
}: AgentActivityTimelineProps) {
  const { rows, endTime } = useMemo(() => {
    if (sessions.length === 0) {
      return { rows: [], totalDuration: 0, endTime: new Date() };
    }

    const startTime = new Date(planCreatedAt);
    const now = new Date();
    
    // Find the latest time
    let latestTime = now;
    sessions.forEach((s) => {
      const end = s.completed_at ? new Date(s.completed_at) : now;
      if (end > latestTime) latestTime = end;
    });

    const totalMs = latestTime.getTime() - startTime.getTime();
    
    // Group sessions by agent type
    const agentTypes: AgentType[] = [
      'Coordinator',
      'Researcher',
      'Architect',
      'Executor',
      'Builder',
      'Revisionist',
      'Reviewer',
      'Tester',
      'Archivist',
      'Worker',
    ];

    const sessionsByAgent = new Map<AgentType, AgentSession[]>();
    agentTypes.forEach((type) => sessionsByAgent.set(type, []));

    sessions.forEach((session) => {
      const list = sessionsByAgent.get(session.agent_type);
      if (list) {
        list.push(session);
      }
    });

    // Build rows for agents that have at least one session
    const rows: TimelineRow[] = [];
    agentTypes.forEach((agentType) => {
      const agentSessions = sessionsByAgent.get(agentType) || [];
      if (agentSessions.length === 0) return;

      const mapped = agentSessions.map((session) => {
        const sessionStart = new Date(session.started_at).getTime();
        const sessionEnd = session.completed_at
          ? new Date(session.completed_at).getTime()
          : now.getTime();

        const startPercent = ((sessionStart - startTime.getTime()) / totalMs) * 100;
        const widthPercent = ((sessionEnd - sessionStart) / totalMs) * 100;

        return {
          session,
          startPercent: Math.max(0, startPercent),
          widthPercent: Math.max(1, widthPercent), // Minimum 1% width for visibility
        };
      });

      rows.push({
        agentType,
        sessions: mapped,
      });
    });

    return { rows, totalDuration: totalMs, endTime: latestTime };
  }, [sessions, planCreatedAt]);

  if (rows.length === 0) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        No agent activity recorded yet
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Plan Start</span>
        <span>Total: {formatDuration(planCreatedAt, endTime.toISOString())}</span>
        <span>Now</span>
      </div>

      {/* Timeline grid */}
      <div className="space-y-2">
        {rows.map((row) => {
          const isWorkerRow = row.agentType === ('Worker' as AgentType);
          return (
            <div key={row.agentType} className="flex items-center gap-3">
              {/* Agent label */}
              <div
                className={cn(
                  'w-24 flex-shrink-0 px-2 py-1 rounded text-xs font-medium text-center',
                  agentBgColors[row.agentType],
                  isWorkerRow && 'italic'
                )}
              >
                {row.agentType}
              </div>

              {/* Timeline bar */}
              <div
                className={cn(
                  'flex-1 bg-slate-800 rounded relative overflow-hidden',
                  isWorkerRow ? 'h-5' : 'h-8'
                )}
              >
                {row.sessions.map((s, idx) => {
                  const worker = isWorkerSession(s.session);
                  const parentLabel = worker
                    ? (s.session as WorkerSession).parent_hub_agent
                    : undefined;
                  const scopeLabel = worker
                    ? (s.session as WorkerSession).task_scope
                    : undefined;

                  return (
                    <div
                      key={`${s.session.session_id}-${idx}`}
                      className={cn(
                        'absolute top-0 h-full rounded flex items-center justify-center text-xs text-white/80 overflow-hidden',
                        s.session.completed_at ? 'opacity-80' : 'opacity-100 animate-pulse',
                        worker && 'border border-dashed border-white/30'
                      )}
                      style={{
                        left: `${s.startPercent}%`,
                        width: `${s.widthPercent}%`,
                        backgroundColor: agentColors[row.agentType],
                      }}
                      title={[
                        `${formatTime(s.session.started_at)}${
                          s.session.completed_at
                            ? ` - ${formatTime(s.session.completed_at)}`
                            : ' (in progress)'
                        }`,
                        parentLabel ? `Hub: ${parentLabel}` : '',
                        scopeLabel ? `Scope: ${scopeLabel}` : '',
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      {s.widthPercent > 10 && (
                        <span className="truncate px-1">
                          {worker && parentLabel
                            ? `↳ ${parentLabel}`
                            : s.session.completed_at
                              ? formatDuration(s.session.started_at, s.session.completed_at)
                              : 'Active'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Handoff markers (optional enhancement) */}
      {lineage.length > 0 && (
        <div className="pt-4 border-t border-slate-700">
          <h4 className="text-xs font-medium text-slate-400 mb-2">
            Handoff Events ({lineage.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {lineage.slice(-5).map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1 px-2 py-1 bg-slate-800 rounded text-xs"
              >
                <span className={agentBgColors[entry.from_agent as AgentType] || 'text-slate-400'}>
                  {entry.from_agent}
                </span>
                <span className="text-slate-500">→</span>
                <span className={agentBgColors[entry.to_agent]}>
                  {entry.to_agent}
                </span>
                <span className="text-slate-500 ml-1">{formatTime(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
