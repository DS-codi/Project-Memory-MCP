import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitCompare, ArrowLeft, ArrowRight, Copy, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

interface AgentDiffViewerProps {
  agentId: string;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}

interface DiffData {
  template: {
    content: string;
    hash: string;
    lastModified: string;
  };
  deployed: {
    content: string;
    hash: string;
    lastModified: string;
  };
  differences: DiffLine[];
}

interface DiffLine {
  lineNumber: { left: number | null; right: number | null };
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  left: string;
  right: string;
}

async function fetchAgentDiff(agentId: string, workspaceId: string): Promise<DiffData> {
  const res = await fetch(`/api/agents/${agentId}/diff/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch diff');
  return res.json();
}

export function AgentDiffViewer({ agentId, workspaceId, workspaceName, onClose }: AgentDiffViewerProps) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [copied, setCopied] = useState<'left' | 'right' | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-diff', agentId, workspaceId],
    queryFn: () => fetchAgentDiff(agentId, workspaceId),
    staleTime: 1000 * 30,
  });

  const handleCopy = async (side: 'left' | 'right') => {
    const content = side === 'left' ? data?.template.content : data?.deployed.content;
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(side);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-8">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
          <p className="mt-4 text-slate-400">Loading diff...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-slate-800 rounded-xl p-6" onClick={e => e.stopPropagation()}>
          <p className="text-red-400">Failed to load diff</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const stats = data?.differences.reduce(
    (acc, line) => {
      if (line.type === 'added') acc.added++;
      if (line.type === 'removed') acc.removed++;
      if (line.type === 'modified') acc.modified++;
      return acc;
    },
    { added: 0, removed: 0, modified: 0 }
  ) || { added: 0, removed: 0, modified: 0 };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-6xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <GitCompare className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="font-bold text-lg">
                Compare: {agentId}.agent.md
              </h2>
              <p className="text-sm text-slate-400">
                Template vs {workspaceName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-400">+{stats.added} added</span>
              <span className="text-red-400">-{stats.removed} removed</span>
              <span className="text-amber-400">~{stats.modified} modified</span>
            </div>

            {/* View Mode Toggle */}
            <div className="flex bg-slate-900 rounded-lg p-1">
              <button
                onClick={() => setViewMode('split')}
                className={cn(
                  'px-3 py-1.5 rounded text-sm transition-colors',
                  viewMode === 'split'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={cn(
                  'px-3 py-1.5 rounded text-sm transition-colors',
                  viewMode === 'unified'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                Unified
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Column Headers */}
        <div className="flex border-b border-slate-700">
          <div className="flex-1 px-4 py-2 bg-slate-900/50 border-r border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Template</span>
              <span className="text-xs text-slate-500 font-mono">#{data?.template.hash}</span>
            </div>
            <button
              onClick={() => handleCopy('left')}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Copy template content"
            >
              {copied === 'left' ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>
          <div className="flex-1 px-4 py-2 bg-slate-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Deployed ({workspaceName})</span>
              <span className="text-xs text-slate-500 font-mono">#{data?.deployed.hash}</span>
            </div>
            <button
              onClick={() => handleCopy('right')}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Copy deployed content"
            >
              {copied === 'right' ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto">
          {viewMode === 'split' ? (
            <SplitDiffView differences={data?.differences || []} />
          ) : (
            <UnifiedDiffView differences={data?.differences || []} />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-900/50">
          <p className="text-sm text-slate-400">
            {data?.template.hash === data?.deployed.hash 
              ? 'Files are identical'
              : 'Files have differences'
            }
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitDiffView({ differences }: { differences: DiffLine[] }) {
  return (
    <div className="font-mono text-sm">
      {differences.map((line, idx) => (
        <div key={idx} className="flex">
          {/* Left side (Template) */}
          <div
            className={cn(
              'flex-1 flex border-r border-slate-700',
              line.type === 'removed' && 'bg-red-500/10',
              line.type === 'modified' && 'bg-amber-500/10'
            )}
          >
            <span className="w-12 px-2 py-0.5 text-right text-slate-500 select-none border-r border-slate-700/50">
              {line.lineNumber.left || ''}
            </span>
            <pre className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
              {line.type === 'added' ? '' : line.left}
            </pre>
          </div>
          
          {/* Right side (Deployed) */}
          <div
            className={cn(
              'flex-1 flex',
              line.type === 'added' && 'bg-green-500/10',
              line.type === 'modified' && 'bg-amber-500/10'
            )}
          >
            <span className="w-12 px-2 py-0.5 text-right text-slate-500 select-none border-r border-slate-700/50">
              {line.lineNumber.right || ''}
            </span>
            <pre className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
              {line.type === 'removed' ? '' : line.right}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}

function UnifiedDiffView({ differences }: { differences: DiffLine[] }) {
  return (
    <div className="font-mono text-sm">
      {differences.map((line, idx) => (
        <div
          key={idx}
          className={cn(
            'flex',
            line.type === 'added' && 'bg-green-500/10',
            line.type === 'removed' && 'bg-red-500/10',
            line.type === 'modified' && 'bg-amber-500/10'
          )}
        >
          <span className="w-8 px-2 py-0.5 text-center text-slate-500 select-none border-r border-slate-700/50">
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : line.type === 'modified' ? '~' : ' '}
          </span>
          <span className="w-12 px-2 py-0.5 text-right text-slate-500 select-none border-r border-slate-700/50">
            {line.lineNumber.left || line.lineNumber.right || ''}
          </span>
          <pre className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
            {line.type === 'removed' ? line.left : line.right}
          </pre>
        </div>
      ))}
    </div>
  );
}

export default AgentDiffViewer;
