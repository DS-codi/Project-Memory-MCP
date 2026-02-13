import { useQueries } from '@tanstack/react-query';
import { FolderTree, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProgressBar } from '../common/ProgressBar';
import { fetchPrograms } from '@/hooks/usePrograms';
import type { WorkspaceSummary, ProgramSummary } from '@/types';

interface ProgramStatsWidgetProps {
  workspaces: WorkspaceSummary[];
}

export function ProgramStatsWidget({ workspaces }: ProgramStatsWidgetProps) {
  const programQueries = useQueries({
    queries: workspaces
      .filter((ws) => ws.active_plan_count > 0)
      .map((ws) => ({
        queryKey: ['programs', ws.workspace_id],
        queryFn: () => fetchPrograms(ws.workspace_id),
        staleTime: 30_000,
      })),
  });

  const allPrograms: (ProgramSummary & { ws_name: string })[] = [];
  for (let i = 0; i < programQueries.length; i++) {
    const q = programQueries[i];
    const ws = workspaces.filter((w) => w.active_plan_count > 0)[i];
    if (q.data?.programs) {
      for (const p of q.data.programs) {
        allPrograms.push({ ...p, ws_name: ws.name });
      }
    }
  }

  if (allPrograms.length === 0) return null;

  const totalChildPlans = allPrograms.reduce(
    (sum, p) => sum + p.aggregate_progress.total_plans,
    0
  );
  const avgCompletion =
    allPrograms.length > 0
      ? Math.round(
          allPrograms.reduce((sum, p) => sum + p.aggregate_progress.completion_percentage, 0) /
            allPrograms.length
        )
      : 0;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-violet-500/20">
          <FolderTree className="text-violet-400" size={20} />
        </div>
        <div>
          <h3 className="font-semibold">Programs</h3>
          <p className="text-xs text-slate-500">
            {allPrograms.length} program{allPrograms.length !== 1 ? 's' : ''} · {totalChildPlans} plans
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <TrendingUp size={14} className="text-green-400" />
          <span className="text-sm font-bold text-green-400">{avgCompletion}%</span>
        </div>
      </div>

      <div className="space-y-3">
        {allPrograms.slice(0, 5).map((prog) => {
          const agg = prog.aggregate_progress;
          return (
            <Link
              key={prog.program_id}
              to={`/workspace/${prog.workspace_id}/program/${prog.program_id}`}
              className="block hover:bg-slate-700/50 rounded-lg p-2 -mx-2 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-300 truncate">{prog.name}</span>
                <span className="text-xs text-slate-500">{agg.completion_percentage}%</span>
              </div>
              <ProgressBar value={agg.done_steps} max={agg.total_steps} className="h-1.5" />
              <div className="flex gap-3 mt-1 text-xs text-slate-500">
                <span>{agg.total_plans} plans</span>
                {agg.active_plans > 0 && <span className="text-blue-400">{agg.active_plans} active</span>}
                {agg.failed_plans > 0 && <span className="text-red-400">{agg.failed_plans} failed</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
