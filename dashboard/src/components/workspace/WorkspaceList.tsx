import { WorkspaceCard } from './WorkspaceCard';
import type { WorkspaceSummary } from '@/types';

interface WorkspaceListProps {
  workspaces: WorkspaceSummary[];
  isLoading?: boolean;
}

export function WorkspaceList({ workspaces, isLoading }: WorkspaceListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-slate-800 border border-slate-700 rounded-lg p-4 animate-pulse"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-slate-700 rounded-lg" />
              <div className="flex-1">
                <div className="h-5 bg-slate-700 rounded w-1/2 mb-2" />
                <div className="h-4 bg-slate-700 rounded w-3/4" />
              </div>
            </div>
            <div className="h-4 bg-slate-700 rounded w-full mb-2" />
            <div className="h-4 bg-slate-700 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-lg">No workspaces registered</p>
        <p className="text-sm mt-2">Register a workspace using the MCP server to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {workspaces.map((workspace) => (
        <WorkspaceCard key={workspace.workspace_id} workspace={workspace} />
      ))}
    </div>
  );
}
