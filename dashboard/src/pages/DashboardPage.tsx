import { useQuery } from '@tanstack/react-query';
import { Activity, FolderOpen, FileText, TrendingUp } from 'lucide-react';
import { WorkspaceList } from '@/components/workspace/WorkspaceList';
import { LiveActivityFeed } from '@/components/common/ActivityFeed';
import { ProgramStatsWidget } from '@/components/program/ProgramStatsWidget';
import type { WorkspaceSummary } from '@/types';

async function fetchWorkspaces(): Promise<{ workspaces: WorkspaceSummary[]; total: number }> {
  const res = await fetch('/api/workspaces');
  if (!res.ok) throw new Error('Failed to fetch workspaces');
  return res.json();
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
  });

  const workspaces = data?.workspaces || [];

  // Calculate stats
  const totalPlans = workspaces.reduce((acc, ws) => acc + ws.active_plan_count + ws.archived_plan_count, 0);
  const activePlans = workspaces.reduce((acc, ws) => acc + ws.active_plan_count, 0);
  const activeWorkspaces = workspaces.filter((ws) => ws.health === 'active').length;
  const blockedWorkspaces = workspaces.filter((ws) => ws.health === 'blocked').length;

  const stats = [
    {
      label: 'Workspaces',
      value: workspaces.length,
      icon: FolderOpen,
      color: 'text-violet-400',
      bgColor: 'bg-violet-500/20',
    },
    {
      label: 'Active Plans',
      value: activePlans,
      icon: FileText,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
    },
    {
      label: 'Total Plans',
      value: totalPlans,
      icon: TrendingUp,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
    },
    {
      label: 'Active Now',
      value: activeWorkspaces,
      icon: Activity,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/20',
      subtitle: blockedWorkspaces > 0 ? `${blockedWorkspaces} blocked` : undefined,
    },
  ];

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Failed to load dashboard</p>
        <p className="text-slate-500 mt-2">Make sure the API server is running</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-slate-400">Overview of all workspaces and agent activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-800 border border-slate-700 rounded-lg p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={stat.color} size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-slate-400">{stat.label}</p>
                {stat.subtitle && (
                  <p className="text-xs text-red-400">{stat.subtitle}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Workspaces Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Workspaces</h2>
          <WorkspaceList workspaces={workspaces} isLoading={isLoading} />
        </div>
        
        {/* Sidebar: Programs + Activity */}
        <div className="space-y-6">
          {/* Program Stats */}
          {workspaces.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Programs</h2>
              <ProgramStatsWidget workspaces={workspaces} />
            </div>
          )}

          {/* Live Activity Feed */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-h-[500px] overflow-y-auto">
              <LiveActivityFeed />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
