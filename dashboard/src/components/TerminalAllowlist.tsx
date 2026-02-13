import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Shield, RefreshCw } from 'lucide-react';

const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AllowlistResponse {
  workspace_id: string;
  patterns: string[];
  message: string;
}

interface TerminalAllowlistProps {
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchAllowlist(workspaceId: string): Promise<AllowlistResponse> {
  const res = await fetch(`${API_BASE}/terminal/allowlist?workspace_id=${encodeURIComponent(workspaceId)}`);
  if (!res.ok) throw new Error('Failed to fetch terminal allowlist');
  return res.json();
}

async function updateAllowlist(
  workspaceId: string,
  patterns: string[],
  operation: 'add' | 'remove' | 'set',
): Promise<AllowlistResponse> {
  const res = await fetch(`${API_BASE}/terminal/allowlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, patterns, operation }),
  });
  if (!res.ok) throw new Error('Failed to update terminal allowlist');
  return res.json();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TerminalAllowlist({ workspaceId }: TerminalAllowlistProps) {
  const queryClient = useQueryClient();
  const [newPattern, setNewPattern] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch current allowlist
  const { data, isLoading, isError } = useQuery({
    queryKey: ['terminalAllowlist', workspaceId],
    queryFn: () => fetchAllowlist(workspaceId),
    enabled: !!workspaceId,
  });

  // Add pattern mutation
  const addMutation = useMutation({
    mutationFn: (pattern: string) => updateAllowlist(workspaceId, [pattern], 'add'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminalAllowlist', workspaceId] });
      setNewPattern('');
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  // Remove pattern mutation
  const removeMutation = useMutation({
    mutationFn: (pattern: string) => updateAllowlist(workspaceId, [pattern], 'remove'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminalAllowlist', workspaceId] });
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleAdd = useCallback(() => {
    const trimmed = newPattern.trim();
    if (!trimmed) return;
    if (data?.patterns.includes(trimmed)) {
      setError('Pattern already exists in the allowlist.');
      return;
    }
    addMutation.mutate(trimmed);
  }, [newPattern, data, addMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  if (isLoading) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 text-slate-400">
          <RefreshCw size={16} className="animate-spin" />
          Loading allowlist...
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-slate-800 border border-red-700 rounded-lg p-6">
        <p className="text-red-400">Failed to load terminal allowlist.</p>
      </div>
    );
  }

  const patterns = data?.patterns ?? [];

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="text-emerald-400" size={20} />
        <h3 className="text-lg font-semibold text-slate-100">Terminal Allowlist</h3>
        <span className="text-xs text-slate-500 ml-auto">{patterns.length} patterns</span>
      </div>

      <p className="text-sm text-slate-400">
        Commands matching these patterns are auto-approved. Other commands require manual approval.
      </p>

      {/* Error display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded px-3 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Add new pattern */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. npm run dev, python manage.py"
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newPattern.trim() || addMutation.isPending}
          className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white transition-colors"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Pattern list */}
      <div className="divide-y divide-slate-700 max-h-80 overflow-y-auto">
        {patterns.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">No patterns configured.</p>
        ) : (
          patterns.map((pattern) => (
            <div
              key={pattern}
              className="flex items-center justify-between py-2 px-1 group hover:bg-slate-700/30 rounded"
            >
              <code className="text-sm text-slate-300 font-mono">{pattern}</code>
              <button
                onClick={() => removeMutation.mutate(pattern)}
                disabled={removeMutation.isPending}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity p-1"
                title={`Remove "${pattern}"`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
