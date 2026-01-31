import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Eye, Edit3, FileText, Loader2, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface PhilosophyEditorProps {
  workspaceId: string;
  workspacePath: string;
  onClose?: () => void;
}

interface PhilosophyData {
  exists: boolean;
  content: string;
  path: string;
  lastModified?: string;
}

async function fetchPhilosophy(workspaceId: string): Promise<PhilosophyData> {
  const res = await fetch(`/api/workspaces/${workspaceId}/philosophy`);
  if (!res.ok) throw new Error('Failed to fetch philosophy');
  return res.json();
}

async function savePhilosophy(workspaceId: string, content: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${workspaceId}/philosophy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to save philosophy');
  }
}

const DEFAULT_PHILOSOPHY = `# Project Philosophy

## Overview

Describe the core purpose and goals of this project.

## Architecture Principles

- Principle 1: Description
- Principle 2: Description
- Principle 3: Description

## Coding Standards

### Naming Conventions

- Variables: camelCase
- Functions: camelCase
- Classes: PascalCase
- Constants: UPPER_SNAKE_CASE

### File Organization

Describe the preferred file and folder structure.

## Technology Preferences

- Framework: 
- Language features to prefer/avoid:
- Libraries to use:

## Agent Instructions

Special instructions for AI agents working on this project:

1. Always check existing patterns before adding new ones
2. Prefer composition over inheritance
3. Write tests for critical functionality

## Notes

Any additional context agents should know about this project.
`;

export function PhilosophyEditor({ workspaceId, workspacePath, onClose }: PhilosophyEditorProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [content, setContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['philosophy', workspaceId],
    queryFn: () => fetchPhilosophy(workspaceId),
    staleTime: 1000 * 60,
  });

  // Initialize content when data loads
  useEffect(() => {
    if (data && !initialized) {
      setContent(data.exists ? data.content : DEFAULT_PHILOSOPHY);
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: () => savePhilosophy(workspaceId, content),
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['philosophy', workspaceId] });
    },
  });

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <p className="text-red-400">Failed to load philosophy file</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="font-semibold">Project Philosophy</h3>
            <p className="text-xs text-slate-500">
              {workspacePath}/.github/project-philosophy.md
            </p>
          </div>
          {!data?.exists && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
              New File
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Toggle */}
          <div className="flex bg-slate-900 rounded-lg p-1">
            <button
              onClick={() => setMode('edit')}
              className={cn(
                'px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors',
                mode === 'edit'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <Edit3 className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => setMode('preview')}
              className={cn(
                'px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors',
                mode === 'preview'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          </div>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            className={cn(
              'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors',
              hasChanges
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            )}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {data?.exists ? 'Save' : 'Create'}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {saveMutation.isError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-sm text-red-400">
          Error: {(saveMutation.error as Error).message}
        </div>
      )}
      {saveMutation.isSuccess && !hasChanges && (
        <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/30 text-sm text-green-400">
          ✓ Philosophy saved successfully
        </div>
      )}
      {hasChanges && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-sm text-amber-400">
          ⚠ Unsaved changes
        </div>
      )}

      {/* Editor / Preview */}
      <div className="h-96">
        {mode === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-full bg-slate-900 text-slate-100 p-4 resize-none font-mono text-sm focus:outline-none"
            spellCheck={false}
            placeholder="Write your project philosophy in Markdown..."
          />
        ) : (
          <div className="h-full overflow-auto p-4">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
}

// Simple Markdown Preview
function MarkdownPreview({ content }: { content: string }) {
  const html = content
    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-8 mb-3 text-amber-400">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-8 mb-4 text-white">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-900 px-1.5 py-0.5 rounded font-mono text-sm text-amber-300">$1</code>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/\n/g, '<br/>');

  return (
    <div
      className="prose prose-invert max-w-none text-slate-300 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-4">${html}</p>` }}
    />
  );
}

export default PhilosophyEditor;
