import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Database } from 'lucide-react';

interface HealthResponse {
  dataRoot: string;
  agentsRoot: string;
  promptsRoot: string;
  instructionsRoot: string;
  status: string;
  timestamp: string;
}

interface WorkspaceMeta {
  name: string;
  path: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Failed to fetch health');
  return res.json();
}

async function fetchWorkspace(workspaceId: string): Promise<WorkspaceMeta> {
  const res = await fetch(`/api/workspaces/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch workspace');
  return res.json();
}

export function DataRootPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  const { data: workspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => fetchWorkspace(workspaceId!),
    enabled: !!workspaceId,
  });

  if (!workspaceId) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Missing workspace</p>
        <Link to="/" className="text-violet-400 hover:underline mt-2 inline-block">
          Return to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/workspace/${workspaceId}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Workspace
      </Link>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Database className="text-blue-400" size={22} />
          <h1 className="text-2xl font-bold">Data Root</h1>
        </div>
        <p className="text-slate-400">View the configured data paths for this workspace.</p>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
        <div>
          <p className="text-sm text-slate-400">Workspace</p>
          <p className="text-slate-200 font-mono break-all">{workspace?.path || 'Unknown'}</p>
        </div>
        <div>
          <p className="text-sm text-slate-400">Data Root Path</p>
          <p className="text-slate-200 font-mono break-all">
            {healthLoading ? 'Loading...' : health?.dataRoot || 'Unknown'}
          </p>
        </div>
        {health && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-400">Agents Root</p>
              <p className="text-slate-200 font-mono break-all">{health.agentsRoot}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Prompts Root</p>
              <p className="text-slate-200 font-mono break-all">{health.promptsRoot}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Instructions Root</p>
              <p className="text-slate-200 font-mono break-all">{health.instructionsRoot}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Status</p>
              <p className="text-slate-200">{health.status}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
