import { useState } from 'react';
import { Terminal, AlertCircle } from 'lucide-react';
import { BuildScriptsTable } from './BuildScriptsTable';
import { AddBuildScriptForm } from './AddBuildScriptForm';
import { Badge } from '@/components/common/Badge';
import type { BuildScript } from '@/types';

interface BuildScriptsTabProps {
  workspaceId: string;
  planId: string;
  scripts: BuildScript[];
  onAdd: (script: {
    name: string;
    description: string;
    command: string;
    directory: string;
    mcp_handle?: string;
  }) => void;
  onRun: (scriptId: string) => void;
  onDelete: (scriptId: string) => void;
  isAdding?: boolean;
  runningScriptId?: string | null;
  deletingScriptId?: string | null;
  runOutput?: { scriptId: string; output: string; error?: string } | null;
}

export function BuildScriptsTab({
  workspaceId,
  planId,
  scripts,
  onAdd,
  onRun,
  onDelete,
  isAdding,
  runningScriptId,
  deletingScriptId,
  runOutput,
}: BuildScriptsTabProps) {
  const [showOutput, setShowOutput] = useState(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Terminal size={20} className="text-violet-400" />
        <h2 className="text-xl font-semibold">Build Scripts</h2>
        <Badge variant="slate">{scripts.length}</Badge>
      </div>

      {/* Add Form */}
      <AddBuildScriptForm onAdd={onAdd} isPending={isAdding} />

      {/* Run Output */}
      {runOutput && showOutput && (
        <div className="bg-slate-900/50 border-l-4 border-blue-500 rounded-lg p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {runOutput.error ? (
                <AlertCircle size={18} className="text-red-400" />
              ) : (
                <Terminal size={18} className="text-blue-400" />
              )}
              <h3 className="font-semibold">
                {runOutput.error ? 'Script Error' : 'Script Output'}
              </h3>
            </div>
            <button
              onClick={() => setShowOutput(false)}
              className="text-slate-400 hover:text-slate-200 text-sm"
            >
              Dismiss
            </button>
          </div>
          <pre className="bg-slate-950 rounded p-3 overflow-x-auto text-xs text-slate-300 font-mono max-h-64 overflow-y-auto">
            {runOutput.error || runOutput.output}
          </pre>
        </div>
      )}

      {/* Scripts Table */}
      <BuildScriptsTable
        scripts={scripts}
        onRun={onRun}
        onDelete={onDelete}
        isRunning={runningScriptId}
        isDeleting={deletingScriptId}
      />
    </div>
  );
}
