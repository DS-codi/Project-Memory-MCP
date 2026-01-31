import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ChevronLeft, 
  ChevronRight, 
  FolderOpen, 
  LayoutDashboard,
  Bot,
  BarChart3,
  FileText,
  BookOpen
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { HealthIndicator } from '../workspace/HealthIndicator';
import type { WorkspaceSummary } from '@/types';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

async function fetchWorkspaces(): Promise<{ workspaces: WorkspaceSummary[] }> {
  const res = await fetch('/api/workspaces');
  if (!res.ok) throw new Error('Failed to fetch workspaces');
  return res.json();
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  
  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
  });

  const workspaces = data?.workspaces || [];

  return (
    <aside 
      className={cn(
        'bg-slate-800 border-r border-slate-700 flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-slate-700">
        <Link to="/" className="flex items-center gap-2" aria-label="Memory Observer home">
          <span className="text-2xl" aria-hidden="true">🧠</span>
          {!collapsed && (
            <span className="font-semibold text-lg">Memory Observer</span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin" aria-label="Primary">
        {/* Dashboard Link */}
        <Link
          to="/"
          className={cn(
            'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
            location.pathname === '/' 
              ? 'bg-violet-500/20 text-violet-300' 
              : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
          )}
          aria-current={location.pathname === '/' ? 'page' : undefined}
        >
          <LayoutDashboard size={20} aria-hidden="true" />
          {!collapsed && <span>Dashboard</span>}
          {collapsed && <span className="sr-only">Dashboard</span>}
        </Link>

        {/* Workspaces Section */}
        <div className="mt-6" role="group" aria-label="Workspaces">
          {!collapsed && (
            <h3 className="px-4 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Workspaces
            </h3>
          )}
          
          {isLoading ? (
            <div className="px-4 py-2 text-slate-500" role="status" aria-label="Loading workspaces">Loading...</div>
          ) : (
            <div className="space-y-1">
              {workspaces.map((ws) => (
                <Link
                  key={ws.workspace_id}
                  to={`/workspace/${ws.workspace_id}`}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
                    location.pathname.includes(ws.workspace_id)
                      ? 'bg-slate-700 text-slate-100'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  )}
                >
                  <div className="relative">
                    <FolderOpen size={20} />
                    <HealthIndicator 
                      health={ws.health} 
                      className="absolute -top-1 -right-1 w-2.5 h-2.5" 
                    />
                  </div>
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{ws.name}</div>
                      <div className="text-xs text-slate-500">
                        {ws.active_plan_count} active
                      </div>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agents Section */}
        <div className="mt-6">
          {!collapsed && (
            <h3 className="px-4 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Copilot Config
            </h3>
          )}
          <Link
            to="/agents"
            className={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/agents'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            )}
          >
            <Bot size={20} />
            {!collapsed && <span>Agents</span>}
          </Link>
          <Link
            to="/prompts"
            className={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/prompts'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            )}
          >
            <FileText size={20} />
            {!collapsed && <span>Prompts</span>}
          </Link>
          <Link
            to="/instructions"
            className={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/instructions'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            )}
          >
            <BookOpen size={20} />
            {!collapsed && <span>Instructions</span>}
          </Link>
        </div>

        {/* Metrics Section */}
        <div className="mt-6">
          {!collapsed && (
            <h3 className="px-4 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Analytics
            </h3>
          )}
          <Link
            to="/metrics"
            className={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/metrics'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            )}
          >
            <BarChart3 size={20} />
            {!collapsed && <span>Performance Metrics</span>}
          </Link>
        </div>
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="h-12 flex items-center justify-center border-t border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
      >
        {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>
    </aside>
  );
}
