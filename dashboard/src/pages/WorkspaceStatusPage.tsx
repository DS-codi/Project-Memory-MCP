import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Activity } from 'lucide-react';
import { HealthIndicator } from '@/components/workspace/HealthIndicator';

interface WorkspaceSummary {
  workspace_id: string;
  name: string;
  path: string;
  health: 'active' | 'stale' | 'blocked' | 'idle';
  active_plan_count: number;
  archived_plan_count: number;
  last_activity: string;
}

async function fetchWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await fetch('/api/workspaces');
  if (!res.ok) throw new Error('Failed to fetch workspaces');
  const data = await res.json();
  return data.workspaces || [];
}

export function WorkspaceStatusPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
  });

  const current = workspaces.find(ws => ws.workspace_id === workspaceId);

  return (
    <div className="space-y-6">
      <Link
        to={workspaceId ? `/workspace/${workspaceId}` : '/'}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Workspace
      </Link>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Activity className="text-amber-400" size={22} />
          <h1 className="text-2xl font-bold">Workspace Status</h1>
        </div>
        <p className="text-slate-400">Monitor workspace health and stale activity indicators.</p>
      </div>

      {current && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{current.name}</h2>
              <p className="text-sm text-slate-400 font-mono break-all">{current.path}</p>
            </div>
            <HealthIndicator health={current.health} showLabel />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 text-sm text-slate-300">
            <div>Active plans: {current.active_plan_count}</div>
            <div>Archived plans: {current.archived_plan_count}</div>
            <div>Last activity: {new Date(current.last_activity).toLocaleString()}</div>
          </div>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">All Workspaces</h2>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading workspaces...</p>
        ) : workspaces.length === 0 ? (
          <p className="text-sm text-slate-400">No workspaces found.</p>
        ) : (
          <div className="space-y-3">
            {workspaces.map((workspace) => (
              <div key={workspace.workspace_id} className="flex items-center justify-between border border-slate-700 rounded-lg p-4">
                <div>
                  <div className="font-semibold">{workspace.name}</div>
                  <div className="text-xs text-slate-500 font-mono break-all">{workspace.path}</div>
                </div>
                <div className="flex items-center gap-6 text-sm text-slate-300">
                  <HealthIndicator health={workspace.health} showLabel />
                  <span>{workspace.active_plan_count} active</span>
                  <span>{workspace.archived_plan_count} archived</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
