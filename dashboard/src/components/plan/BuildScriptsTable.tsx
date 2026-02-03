import { Play, Trash2, Clock, Folder } from 'lucide-react';
import { formatDate } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import type { BuildScript } from '@/types';

interface BuildScriptsTableProps {
  scripts: BuildScript[];
  onRun: (scriptId: string) => void;
  onDelete: (scriptId: string) => void;
  isRunning?: string | null;
  isDeleting?: string | null;
}

export function BuildScriptsTable({
  scripts,
  onRun,
  onDelete,
  isRunning,
  isDeleting,
}: BuildScriptsTableProps) {
  if (scripts.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-900/30 rounded-lg border-2 border-dashed border-slate-700">
        <p className="text-slate-400">No build scripts defined yet</p>
        <p className="text-sm text-slate-500 mt-1">Add your first script using the form above</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Name</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Description</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Command</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Directory</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Created</th>
            <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Actions</th>
          </tr>
        </thead>
        <tbody>
          {scripts.map((script) => {
            const isThisRunning = isRunning === script.id;
            const isThisDeleting = isDeleting === script.id;

            return (
              <tr
                key={script.id}
                className={cn(
                  'border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors',
                  isThisRunning && 'bg-blue-500/10',
                  isThisDeleting && 'opacity-50'
                )}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">{script.name}</span>
                    {script.plan_id && (
                      <span className="text-xs px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded">
                        Plan
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <p className="text-slate-400 text-sm max-w-md truncate" title={script.description}>
                    {script.description}
                  </p>
                </td>
                <td className="py-3 px-4">
                  <code className="text-xs bg-slate-900 px-2 py-1 rounded text-slate-300 font-mono">
                    {script.command}
                  </code>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1 text-sm text-slate-400">
                    <Folder size={14} />
                    <span className="font-mono text-xs">{script.directory}</span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1 text-sm text-slate-400">
                    <Clock size={14} />
                    <span>{formatDate(script.created_at)}</span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onRun(script.id)}
                      disabled={isThisRunning || isThisDeleting}
                      className={cn(
                        'px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm',
                        isThisRunning
                          ? 'bg-blue-500/20 text-blue-300 cursor-wait'
                          : 'bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                      title="Run script"
                    >
                      <Play size={14} />
                      {isThisRunning ? 'Running...' : 'Run'}
                    </button>
                    <button
                      onClick={() => onDelete(script.id)}
                      disabled={isThisRunning || isThisDeleting}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete script"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
