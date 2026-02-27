/**
 * KnowledgeFilesPanel — Main panel for managing workspace knowledge files
 * Lists, creates, edits, and deletes persisted knowledge files through the dashboard REST API.
 */
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { KnowledgeFileForm } from './KnowledgeFileForm';
import { KnowledgeFileViewer } from './KnowledgeFileViewer';
import type { KnowledgeFileMeta, KnowledgeFile, KnowledgeFileCategory } from './KnowledgeFileForm';

// =============================================================================
// API helpers
// =============================================================================

async function fetchKnowledgeFiles(workspaceId: string): Promise<KnowledgeFileMeta[]> {
  const res = await fetch(`/api/workspaces/${workspaceId}/knowledge`);
  if (!res.ok) throw new Error('Failed to fetch knowledge files');
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

async function saveKnowledgeFile(
  workspaceId: string,
  payload: { slug: string; title: string; category: KnowledgeFileCategory; content: string; tags: string[] },
): Promise<KnowledgeFile> {
  const res = await fetch(`/api/workspaces/${workspaceId}/knowledge/${payload.slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || 'Failed to save knowledge file');
  }
  const data = await res.json();
  return data.file;
}

async function deleteKnowledgeFile(workspaceId: string, slug: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${workspaceId}/knowledge/${slug}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete knowledge file');
}

// =============================================================================
// Component
// =============================================================================

interface KnowledgeFilesPanelProps {
  workspaceId: string;
}

export function KnowledgeFilesPanel({ workspaceId }: KnowledgeFilesPanelProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingFile, setEditingFile] = useState<KnowledgeFile | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Query: list files ─────────────────────────────────────────────────────
  const { data: filesData, isLoading, error, refetch } = useQuery({
    queryKey: ['knowledge-files', workspaceId],
    queryFn: () => fetchKnowledgeFiles(workspaceId),
    staleTime: 30_000,
  });
  const files = Array.isArray(filesData) ? filesData : [];

  // ── Mutation: save (create/update) ────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveKnowledgeFile>[1]) =>
      saveKnowledgeFile(workspaceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-files', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-file', workspaceId] });
      setShowForm(false);
      setEditingFile(null);
      setErrorMsg(null);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  // ── Mutation: delete ──────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (slug: string) => deleteKnowledgeFile(workspaceId, slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-files', workspaceId] });
      setErrorMsg(null);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    (data: { slug: string; title: string; category: KnowledgeFileCategory; content: string; tags: string[] }) => {
      saveMutation.mutate(data);
    },
    [saveMutation],
  );

  const handleEdit = useCallback((file: KnowledgeFile) => {
    setEditingFile(file);
    setShowForm(true);
    setErrorMsg(null);
  }, []);

  const handleDelete = useCallback(
    (slug: string) => {
      deleteMutation.mutate(slug);
    },
    [deleteMutation],
  );

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingFile(null);
    setErrorMsg(null);
  }, []);

  // ── Actions for CollapsibleSection header ─────────────────────────────────
  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          refetch();
        }}
        className="p-1 text-slate-400 hover:text-white transition-colors"
        title="Refresh"
      >
        <RefreshCw size={14} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditingFile(null);
          setShowForm(true);
          setErrorMsg(null);
        }}
        className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors"
      >
        <Plus size={12} />
        New
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <CollapsibleSection
      title="Knowledge Files"
      subtitle="Persistent knowledge base"
      badge={files.length > 0 ? String(files.length) : undefined}
      actions={headerActions}
    >
      <div className="space-y-3">
        {/* Error banner */}
        {errorMsg && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-500/30 rounded-lg">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <span className="text-xs text-red-300 flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* Create / Edit form */}
        {showForm && (
          <KnowledgeFileForm
            existingFile={editingFile}
            onSave={handleSave}
            onCancel={handleCancel}
            isSaving={saveMutation.isPending}
          />
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
            <Loader2 size={14} className="animate-spin" />
            Loading knowledge files...
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="text-center py-6">
            <AlertTriangle size={20} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-400">Failed to load knowledge files</p>
            <button onClick={() => refetch()} className="text-xs text-violet-400 hover:underline mt-1">
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && files.length === 0 && !showForm && (
          <div className="text-center py-8">
            <BookOpen size={24} className="mx-auto text-slate-500 mb-2" />
            <p className="text-sm text-slate-400">No knowledge files yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Knowledge files store persistent context that agents can reference across sessions.
            </p>
          </div>
        )}

        {/* File list */}
        {!isLoading && files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((file) => (
              <KnowledgeFileViewer
                key={file.slug}
                workspaceId={workspaceId}
                file={file}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
