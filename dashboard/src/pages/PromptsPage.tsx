import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2, Upload, Search, Variable } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/formatters';

interface PromptFile {
  id: string;
  name: string;
  filename: string;
  description?: string;
  mode?: 'agent' | 'ask' | 'edit';
  content: string;
  variables: string[];
  createdAt?: string;
  updatedAt?: string;
}

async function fetchPrompts(): Promise<{ prompts: PromptFile[]; total: number }> {
  const res = await fetch('/api/prompts');
  if (!res.ok) throw new Error('Failed to fetch prompts');
  return res.json();
}

async function deletePrompt(id: string): Promise<void> {
  const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete prompt');
}

async function createPrompt(data: { id: string; description?: string; mode?: string; content: string }): Promise<PromptFile> {
  const res = await fetch('/api/prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create prompt');
  const result = await res.json();
  return result.prompt;
}

const modeColors = {
  agent: 'bg-violet-500/20 text-violet-400',
  ask: 'bg-cyan-500/20 text-cyan-400',
  edit: 'bg-amber-500/20 text-amber-400',
};

export function PromptsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptFile | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['prompts'],
    queryFn: fetchPrompts,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePrompt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: createPrompt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setShowCreateModal(false);
    },
  });

  const filteredPrompts = data?.prompts.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 p-4">
        Failed to load prompts: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Prompt Templates</h1>
          <p className="text-slate-400 mt-1">
            Reusable workflow prompts for VS Code Copilot
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Prompt
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search prompts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-violet-500"
        />
      </div>

      {/* Prompts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPrompts.map((prompt) => (
          <div
            key={prompt.id}
            className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors cursor-pointer"
            onClick={() => setSelectedPrompt(prompt)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white">{prompt.name}</h3>
                  <p className="text-sm text-slate-400 line-clamp-1">
                    {prompt.description || 'No description'}
                  </p>
                </div>
              </div>
              <Badge className={cn(modeColors[prompt.mode || 'agent'])}>
                {prompt.mode || 'agent'}
              </Badge>
            </div>

            {/* Variables */}
            {prompt.variables.length > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Variable className="w-3 h-3 text-slate-500" />
                {prompt.variables.map((v) => (
                  <span
                    key={v}
                    className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded"
                  >
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>{prompt.updatedAt && formatRelative(prompt.updatedAt)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete prompt "${prompt.name}"?`)) {
                    deleteMutation.mutate(prompt.id);
                  }
                }}
                className="p-1 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredPrompts.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No prompts found</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-2 text-violet-400 hover:text-violet-300"
          >
            Create your first prompt
          </button>
        </div>
      )}

      {/* Selected Prompt Preview */}
      {selectedPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedPrompt(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{selectedPrompt.name}</h2>
              <button onClick={() => setSelectedPrompt(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            <pre className="bg-slate-900 p-4 rounded-lg text-sm text-slate-300 overflow-auto">
              {selectedPrompt.content}
            </pre>
            <div className="mt-4 flex gap-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg">
                <Upload className="w-4 h-4" />
                Deploy to Workspaces
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Create New Prompt</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                createMutation.mutate({
                  id: formData.get('id') as string,
                  description: formData.get('description') as string,
                  mode: formData.get('mode') as string,
                  content: formData.get('content') as string,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm text-slate-400 mb-1">ID (filename)</label>
                <input
                  name="id"
                  required
                  placeholder="my-workflow"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <input
                  name="description"
                  placeholder="What this prompt does"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Mode</label>
                <select
                  name="mode"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                >
                  <option value="agent">agent</option>
                  <option value="ask">ask</option>
                  <option value="edit">edit</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Content</label>
                <textarea
                  name="content"
                  required
                  rows={6}
                  placeholder="# Prompt content..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
