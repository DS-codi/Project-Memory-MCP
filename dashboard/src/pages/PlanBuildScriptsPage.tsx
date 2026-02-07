import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Terminal } from 'lucide-react';
import { BuildScriptsTab } from '@/components/plan/BuildScriptsTab';
import { useAddBuildScript, useBuildScripts, useDeleteBuildScript, useRunBuildScript } from '@/hooks/useBuildScripts';

export function PlanBuildScriptsPage() {
  const { workspaceId, planId } = useParams<{ workspaceId: string; planId: string }>();
  const location = useLocation();

  const { data: buildScripts = [] } = useBuildScripts({
    workspaceId: workspaceId!,
    planId: planId!,
  });
  const addScriptMutation = useAddBuildScript();
  const deleteScriptMutation = useDeleteBuildScript();
  const runScriptMutation = useRunBuildScript();

  const showRunHint = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('run') === '1';
  }, [location.search]);

  if (!workspaceId || !planId) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Missing workspace or plan</p>
        <Link to="/" className="text-violet-400 hover:underline mt-2 inline-block">
          Return to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/workspace/${workspaceId}/plan/${planId}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Plan
      </Link>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Terminal className="text-emerald-400" size={22} />
          <h1 className="text-2xl font-bold">Build Scripts</h1>
        </div>
        <p className="text-slate-400">Manage and run build scripts for this plan.</p>
      </div>

      {showRunHint && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4 text-amber-200 text-sm">
          Select a build script to run it now.
        </div>
      )}

      <BuildScriptsTab
        workspaceId={workspaceId}
        planId={planId}
        scripts={buildScripts}
        onAdd={(script) => addScriptMutation.mutate({
          workspaceId,
          planId,
          script,
        })}
        onRun={(scriptId) => runScriptMutation.mutate({
          workspaceId,
          planId,
          scriptId,
        })}
        onDelete={(scriptId) => deleteScriptMutation.mutate({
          workspaceId,
          planId,
          scriptId,
        })}
        isAdding={addScriptMutation.isPending}
        runningScriptId={runScriptMutation.isPending ? runScriptMutation.variables?.scriptId : null}
        deletingScriptId={deleteScriptMutation.isPending ? deleteScriptMutation.variables?.scriptId : null}
        runOutput={runScriptMutation.data ? {
          scriptId: runScriptMutation.variables!.scriptId,
          output: runScriptMutation.data.output,
          error: runScriptMutation.data.error,
        } : null}
      />
    </div>
  );
}
