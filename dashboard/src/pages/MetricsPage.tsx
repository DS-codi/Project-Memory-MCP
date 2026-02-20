import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  Users, 
  Clock, 
  CheckCircle2, 
  FolderKanban,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  GitBranch,
  AlertTriangle,
  TrendingUp
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { ProgressBar } from '@/components/common/ProgressBar';
import { cn } from '@/utils/cn';
import type { AgentType } from '@/types';

interface DashboardMetrics {
  generated_at: string;
  workspaces: {
    total: number;
    with_active_plans: number;
  };
  plans: {
    total_plans: number;
    active: number;
    completed: number;
    archived: number;
    failed: number;
    by_category: Record<string, number>;
    by_priority: Record<string, number>;
    average_steps_per_plan: number;
    average_sessions_per_plan: number;
  };
  steps: {
    total_steps: number;
    done: number;
    active: number;
    pending: number;
    blocked: number;
    completion_rate: number;
  };
  agents: Array<{
    agent_type: string;
    total_sessions: number;
    completed_sessions: number;
    total_duration_ms: number;
    average_duration_ms: number;
    plans_worked: number;
  }>;
  handoffs: {
    total_handoffs: number;
    by_transition: Record<string, number>;
    most_common_transitions: Array<{ from: string; to: string; count: number }>;
  };
  time: {
    average_plan_duration_ms: number;
    average_plan_duration_human: string;
    fastest_completion_ms: number;
    slowest_completion_ms: number;
    plans_by_day: Record<string, number>;
    plans_by_week: Record<string, number>;
  };
}

async function fetchMetrics(): Promise<DashboardMetrics> {
  const res = await fetch('/api/metrics');
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

const agentIcons: Record<AgentType, string> = {
  Coordinator: '🎯',
  Analyst: '🧭',
  Brainstorm: '💡',
  Runner: '🏃',
  Researcher: '🔬',
  Architect: '📐',
  Executor: '⚙️',
  Reviewer: '🔍',
  Tester: '🧪',
  Revisionist: '🔄',
  Archivist: '📦',
  Builder: '🏗️',
  SkillWriter: '✍️',
  Worker: '👷',
};

const agentColors: Record<AgentType, string> = {
  Coordinator: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  Analyst: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  Brainstorm: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Runner: 'bg-green-500/20 text-green-300 border-green-500/30',
  Researcher: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Architect: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Executor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Reviewer: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  Tester: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  Revisionist: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Archivist: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  Builder: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  SkillWriter: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Worker: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

const categoryColors: Record<string, string> = {
  feature: 'bg-emerald-500/20 text-emerald-300',
  bug: 'bg-red-500/20 text-red-300',
  change: 'bg-blue-500/20 text-blue-300',
  analysis: 'bg-purple-500/20 text-purple-300',
  investigation: 'bg-teal-500/20 text-teal-300',
  debug: 'bg-orange-500/20 text-orange-300',
  refactor: 'bg-cyan-500/20 text-cyan-300',
  documentation: 'bg-amber-500/20 text-amber-300',
};

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  trend,
  trendLabel,
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="p-2 bg-slate-700/50 rounded-lg">
          {icon}
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs px-2 py-1 rounded',
            trend === 'up' ? 'text-emerald-400 bg-emerald-500/10' : 
            trend === 'down' ? 'text-red-400 bg-red-500/10' : 
            'text-slate-400 bg-slate-700/50'
          )}>
            {trend === 'up' ? <ArrowUpRight size={12} /> : 
             trend === 'down' ? <ArrowDownRight size={12} /> : null}
            {trendLabel}
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-slate-400">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}

export function MetricsPage() {
  // Time range filter - reserved for future use
  // const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('all');
  
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-slate-800 rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Failed to load metrics</p>
      </div>
    );
  }

  const totalPlans = metrics.plans.total_plans;
  const completionRate = totalPlans > 0 
    ? Math.round((metrics.plans.completed / totalPlans) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <BarChart3 className="text-violet-400" />
            Performance Metrics
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Agent workflows and plan completion statistics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Last updated: {new Date(metrics.generated_at).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Plans"
          value={metrics.plans.total_plans}
          subtitle={`${metrics.plans.active} active`}
          icon={<FolderKanban size={20} className="text-violet-400" />}
        />
        <StatCard
          title="Completion Rate"
          value={`${completionRate}%`}
          subtitle={`${metrics.plans.completed} completed`}
          icon={<CheckCircle2 size={20} className="text-emerald-400" />}
          trend={completionRate >= 50 ? 'up' : 'down'}
          trendLabel={completionRate >= 50 ? 'Good' : 'Low'}
        />
        <StatCard
          title="Total Handoffs"
          value={metrics.handoffs.total_handoffs}
          subtitle={`Across ${metrics.workspaces.total} workspaces`}
          icon={<GitBranch size={20} className="text-cyan-400" />}
        />
        <StatCard
          title="Avg Duration"
          value={metrics.time.average_plan_duration_human || '0m'}
          subtitle="Per completed plan"
          icon={<Clock size={20} className="text-amber-400" />}
        />
      </div>

      {/* Step Progress */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity size={18} className="text-violet-400" />
          Step Completion Overview
        </h2>
        
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-emerald-400">{metrics.steps.done}</div>
            <div className="text-sm text-slate-400">Done</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{metrics.steps.active}</div>
            <div className="text-sm text-slate-400">Active</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-400">{metrics.steps.pending}</div>
            <div className="text-sm text-slate-400">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-400">{metrics.steps.blocked}</div>
            <div className="text-sm text-slate-400">Blocked</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Overall Completion</span>
            <span className="font-medium">{metrics.steps.completion_rate}%</span>
          </div>
          <ProgressBar value={metrics.steps.done} max={metrics.steps.total_steps} showLabel />
        </div>
      </div>

      {/* Agent Performance */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users size={18} className="text-violet-400" />
          Agent Performance
        </h2>
        
        {metrics.agents.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No agent sessions recorded yet</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.agents.map((agent) => (
              <div
                key={agent.agent_type}
                className={cn(
                  'rounded-lg p-4 border',
                  agentColors[agent.agent_type as AgentType] || 'bg-slate-700/50 text-slate-300 border-slate-600'
                )}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{agentIcons[agent.agent_type as AgentType] || '🤖'}</span>
                  <span className="font-semibold">{agent.agent_type}</span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="opacity-75">Sessions</span>
                    <span className="font-medium">{agent.total_sessions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-75">Completed</span>
                    <span className="font-medium">{agent.completed_sessions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-75">Avg Duration</span>
                    <span className="font-medium">{formatDuration(agent.average_duration_ms)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-75">Plans</span>
                    <span className="font-medium">{agent.plans_worked}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plans by Category */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Plans by Category</h2>
          <div className="space-y-3">
            {Object.entries(metrics.plans.by_category)
              .sort((a, b) => b[1] - a[1])
              .map(([category, count]) => (
                <div key={category} className="flex items-center gap-3">
                  <Badge 
                    variant="default"
                    className={cn('min-w-[80px] justify-center', categoryColors[category])}
                  >
                    {category}
                  </Badge>
                  <div className="flex-1">
                    <div 
                      className="h-6 rounded bg-slate-700 relative overflow-hidden"
                    >
                      <div 
                        className={cn(
                          'h-full rounded transition-all',
                          categoryColors[category]?.replace('/20', '/40') || 'bg-slate-600'
                        )}
                        style={{ width: `${(count / totalPlans) * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                        {count} ({Math.round((count / totalPlans) * 100)}%)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Most Common Handoff Transitions */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Top Handoff Transitions</h2>
          {metrics.handoffs.most_common_transitions.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No handoffs recorded yet</p>
          ) : (
            <div className="space-y-2">
              {metrics.handoffs.most_common_transitions.slice(0, 8).map((transition) => (
                <div 
                  key={`${transition.from}-${transition.to}`}
                  className="flex items-center justify-between p-2 bg-slate-700/30 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{agentIcons[transition.from as AgentType] || '🤖'}</span>
                    <span className="text-slate-300">{transition.from}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-lg">{agentIcons[transition.to as AgentType] || '🤖'}</span>
                    <span className="text-slate-300">{transition.to}</span>
                  </div>
                  <Badge variant="default" className="bg-slate-600">
                    {transition.count}x
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Handoff Analytics */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-cyan-400" />
          Handoff Analytics
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-slate-700/30 rounded-lg">
            <div className="text-2xl font-bold text-cyan-400">{metrics.handoffs.total_handoffs}</div>
            <div className="text-sm text-slate-400">Total Handoffs</div>
          </div>
          <div className="text-center p-3 bg-slate-700/30 rounded-lg">
            <div className="text-2xl font-bold text-violet-400">
              {Object.keys(metrics.handoffs.by_transition).length}
            </div>
            <div className="text-sm text-slate-400">Unique Flows</div>
          </div>
          <div className="text-center p-3 bg-slate-700/30 rounded-lg">
            <div className="flex items-center justify-center gap-1">
              <AlertTriangle size={16} className="text-amber-400" />
              <span className="text-2xl font-bold text-amber-400">{metrics.steps.blocked}</span>
            </div>
            <div className="text-sm text-slate-400">Blocked Steps</div>
          </div>
        </div>
        {metrics.handoffs.most_common_transitions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Top Transition Flows</h3>
            <div className="space-y-1.5">
              {metrics.handoffs.most_common_transitions.slice(0, 5).map((t) => {
                const maxCount = metrics.handoffs.most_common_transitions[0]?.count || 1;
                return (
                  <div key={`${t.from}-${t.to}`} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 min-w-[180px] text-sm">
                      <span>{agentIcons[t.from as AgentType] || '🤖'}</span>
                      <span className="text-slate-300">{t.from}</span>
                      <GitBranch size={12} className="text-slate-500" />
                      <span>{agentIcons[t.to as AgentType] || '🤖'}</span>
                      <span className="text-slate-300">{t.to}</span>
                    </div>
                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500/60 rounded-full transition-all"
                        style={{ width: `${(t.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 min-w-[30px] text-right">{t.count}×</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Plans by Priority */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Plans by Priority</h2>
        <div className="grid grid-cols-4 gap-4">
          {['low', 'medium', 'high', 'critical'].map((priority) => {
            const count = metrics.plans.by_priority[priority] || 0;
            const colors = {
              low: 'bg-green-500/20 text-green-300 border-green-500/30',
              medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
              high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
              critical: 'bg-red-500/20 text-red-300 border-red-500/30',
            };
            const icons = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };
            
            return (
              <div
                key={priority}
                className={cn('rounded-lg p-4 border text-center', colors[priority as keyof typeof colors])}
              >
                <div className="text-2xl mb-1">{icons[priority as keyof typeof icons]}</div>
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm opacity-75 capitalize">{priority}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
