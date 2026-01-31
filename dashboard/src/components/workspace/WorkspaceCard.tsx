import { Link } from 'react-router-dom';
import { FolderOpen, FileCode, Calendar } from 'lucide-react';
import { HealthIndicator } from './HealthIndicator';
import { formatRelative } from '@/utils/formatters';
import type { WorkspaceSummary } from '@/types';

interface WorkspaceCardProps {
  workspace: WorkspaceSummary;
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const topLanguages = workspace.languages.slice(0, 3);

  return (
    <Link
      to={`/workspace/${workspace.workspace_id}`}
      className="block bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-violet-500/50 hover:bg-slate-800/80 transition-all group min-w-[280px]"
    >
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-slate-700 rounded-lg group-hover:bg-violet-500/20 transition-colors flex-shrink-0">
            <FolderOpen className="text-violet-400" size={24} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-lg group-hover:text-violet-300 transition-colors truncate">
              {workspace.name}
            </h3>
            <p className="text-sm text-slate-500 truncate">
              {workspace.path}
            </p>
          </div>
        </div>
        <HealthIndicator health={workspace.health} showLabel />
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm">
          <FileCode size={16} className="text-slate-500 flex-shrink-0" />
          <span className="text-slate-300 whitespace-nowrap">{workspace.active_plan_count} active</span>
          <span className="text-slate-500 whitespace-nowrap">/ {workspace.archived_plan_count} archived</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Calendar size={16} className="text-slate-500 flex-shrink-0" />
          <span className="whitespace-nowrap">{formatRelative(workspace.last_activity)}</span>
        </div>
      </div>

      {/* Languages */}
      {topLanguages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {topLanguages.map((lang) => (
            <span
              key={lang.name}
              className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400"
            >
              {lang.name} {lang.percentage}%
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
