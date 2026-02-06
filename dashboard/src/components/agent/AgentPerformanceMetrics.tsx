import { useMemo } from 'react';
import { cn } from '@/utils/cn';
import { agentColors, agentBgColors } from '@/utils/colors';
import { Clock, Zap, Target, TrendingUp } from 'lucide-react';
import type { AgentSession, AgentType, PlanStep } from '@/types';

interface AgentPerformanceMetricsProps {
  sessions: AgentSession[];
  steps: PlanStep[];
  className?: string;
}

interface AgentMetrics {
  agentType: AgentType;
  totalSessions: number;
  totalDurationMs: number;
  avgDurationMs: number;
  stepsCompleted: number;
  successRate: number; // Percentage of sessions that completed
}

function calculateDuration(start: string, end?: string): number {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, endTime - startTime);
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function AgentPerformanceMetrics({
  sessions,
  steps,
  className,
}: AgentPerformanceMetricsProps) {
  const metrics = useMemo<AgentMetrics[]>(() => {
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
    ];

    return agentTypes
      .map((agentType) => {
        const agentSessions = sessions.filter((s) => s.agent_type === agentType);
        
        if (agentSessions.length === 0) {
          return null;
        }

        const totalSessions = agentSessions.length;
        const completedSessions = agentSessions.filter((s) => s.completed_at);
        
        const totalDurationMs = agentSessions.reduce((sum, s) => {
          return sum + calculateDuration(s.started_at, s.completed_at);
        }, 0);

        const avgDurationMs = totalSessions > 0 ? totalDurationMs / totalSessions : 0;
        
        const successRate = totalSessions > 0
          ? (completedSessions.length / totalSessions) * 100
          : 0;

        // Count steps completed during agent sessions (approximation)
        // This is a simplified version - could be enhanced with actual tracking
        const stepsCompleted = steps.filter((s) => {
          if (s.status !== 'done' || !s.completed_at) return false;
          // Check if step was completed during any session of this agent
          return agentSessions.some((session) => {
            const sessionStart = new Date(session.started_at).getTime();
            const sessionEnd = session.completed_at
              ? new Date(session.completed_at).getTime()
              : Date.now();
            const stepCompleted = new Date(s.completed_at!).getTime();
            return stepCompleted >= sessionStart && stepCompleted <= sessionEnd;
          });
        }).length;

        return {
          agentType,
          totalSessions,
          totalDurationMs,
          avgDurationMs,
          stepsCompleted,
          successRate,
        };
      })
      .filter((m): m is AgentMetrics => m !== null);
  }, [sessions, steps]);

  const overallStats = useMemo(() => {
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.completed_at).length;
    const totalDurationMs = sessions.reduce(
      (sum, s) => sum + calculateDuration(s.started_at, s.completed_at),
      0
    );
    const avgSessionDuration = totalSessions > 0 ? totalDurationMs / totalSessions : 0;
    const completedSteps = steps.filter((s) => s.status === 'done').length;

    return {
      totalSessions,
      completedSessions,
      totalDurationMs,
      avgSessionDuration,
      completedSteps,
      totalSteps: steps.length,
    };
  }, [sessions, steps]);

  if (sessions.length === 0) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        No agent sessions recorded yet
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Overall Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-800 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Zap size={16} />
            <span className="text-xs uppercase">Sessions</span>
          </div>
          <p className="text-2xl font-bold">{overallStats.totalSessions}</p>
          <p className="text-xs text-slate-500">
            {overallStats.completedSessions} completed
          </p>
        </div>

        <div className="p-4 bg-slate-800 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Clock size={16} />
            <span className="text-xs uppercase">Total Time</span>
          </div>
          <p className="text-2xl font-bold">
            {formatDurationMs(overallStats.totalDurationMs)}
          </p>
          <p className="text-xs text-slate-500">
            Avg: {formatDurationMs(overallStats.avgSessionDuration)}
          </p>
        </div>

        <div className="p-4 bg-slate-800 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Target size={16} />
            <span className="text-xs uppercase">Steps Done</span>
          </div>
          <p className="text-2xl font-bold">
            {overallStats.completedSteps}/{overallStats.totalSteps}
          </p>
          <p className="text-xs text-slate-500">
            {overallStats.totalSteps > 0
              ? `${Math.round((overallStats.completedSteps / overallStats.totalSteps) * 100)}%`
              : '0%'}
          </p>
        </div>

        <div className="p-4 bg-slate-800 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <TrendingUp size={16} />
            <span className="text-xs uppercase">Unique Agents</span>
          </div>
          <p className="text-2xl font-bold">{metrics.length}</p>
          <p className="text-xs text-slate-500">types active</p>
        </div>
      </div>

      {/* Per-Agent Breakdown */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-slate-400 uppercase">
          Agent Performance
        </h4>
        
        <div className="space-y-2">
          {metrics.map((metric) => (
            <div
              key={metric.agentType}
              className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-sm font-medium',
                    agentBgColors[metric.agentType]
                  )}
                >
                  {metric.agentType}
                </span>
                <span className="text-xs text-slate-500">
                  {metric.totalSessions} session{metric.totalSessions !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 text-xs">Total Time</span>
                  <p className="font-medium">{formatDurationMs(metric.totalDurationMs)}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Avg Session</span>
                  <p className="font-medium">{formatDurationMs(metric.avgDurationMs)}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Completion</span>
                  <p
                    className={cn(
                      'font-medium',
                      metric.successRate >= 80 ? 'text-green-400' :
                      metric.successRate >= 50 ? 'text-yellow-400' :
                      'text-red-400'
                    )}
                  >
                    {Math.round(metric.successRate)}%
                  </p>
                </div>
              </div>

              {/* Progress bar for time distribution */}
              <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      (metric.totalDurationMs / overallStats.totalDurationMs) * 100
                    )}%`,
                    backgroundColor: agentColors[metric.agentType],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
