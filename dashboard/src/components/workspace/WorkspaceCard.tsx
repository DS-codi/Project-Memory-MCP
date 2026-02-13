import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, FileCode, Calendar, ChevronDown, ChevronRight, GitBranch, Layers } from 'lucide-react';
import { HealthIndicator } from './HealthIndicator';
import { formatRelative } from '@/utils/formatters';
import type { WorkspaceSummary } from '@/types';

interface WorkspaceCardProps {
  workspace: WorkspaceSummary;
  /** Whether this card represents a child workspace nested under a parent */
  isChild?: boolean;
}

export function WorkspaceCard({ workspace, isChild }: WorkspaceCardProps) {
  const [childrenExpanded, setChildrenExpanded] = useState(true);
  const topLanguages = workspace.languages.slice(0, 3);
  const hasChildren = workspace.child_workspaces && workspace.child_workspaces.length > 0;
  const childCount = workspace.child_workspaces?.length ?? 0;

  return (
    <div className="flex flex-col gap-0">
      <div className="relative">
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-lg group-hover:text-violet-300 transition-colors truncate">
                    {workspace.name}
                  </h3>
                  {/* Child workspace badge */}
                  {isChild && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded text-xs font-medium whitespace-nowrap">
                      <GitBranch size={12} />
                      sub-workspace
                    </span>
                  )}
                  {/* Parent with children badge */}
                  {hasChildren && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-500/15 text-violet-400 rounded text-xs font-medium whitespace-nowrap">
                      <Layers size={12} />
                      {childCount} sub-workspace{childCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
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

        {/* Expand/collapse toggle button for parent workspaces */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setChildrenExpanded((prev) => !prev);
            }}
            className="absolute top-3 right-3 z-10 p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 transition-colors"
            title={childrenExpanded ? 'Collapse sub-workspaces' : 'Expand sub-workspaces'}
          >
            {childrenExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}
      </div>

      {/* Nested child workspaces */}
      {hasChildren && childrenExpanded && (
        <div className="ml-4 pl-4 border-l-2 border-blue-400/50 mt-1 flex flex-col gap-2">
          {workspace.child_workspaces!.map((child) => (
            <WorkspaceCard key={child.workspace_id} workspace={child} isChild />
          ))}
        </div>
      )}
    </div>
  );
}
