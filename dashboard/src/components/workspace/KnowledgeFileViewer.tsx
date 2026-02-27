/**
 * KnowledgeFileViewer — Expandable viewer for knowledge file content with markdown rendering
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { formatRelative } from '@/utils/formatters';
import type { KnowledgeFileMeta, KnowledgeFile } from './KnowledgeFileForm';

// =============================================================================
// Category badge colors
// =============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  schema: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  config: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  limitation: 'bg-red-500/20 text-red-300 border-red-500/50',
  'plan-summary': 'bg-violet-500/20 text-violet-300 border-violet-500/50',
  reference: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',
  convention: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
};

// =============================================================================
// Fetch helper
// =============================================================================

async function fetchKnowledgeFile(workspaceId: string, slug: string): Promise<KnowledgeFile> {
  const res = await fetch(`/api/workspaces/${workspaceId}/knowledge/${slug}`);
  if (!res.ok) throw new Error('Failed to fetch knowledge file');
  const data = await res.json();
  return data.file;
}

// =============================================================================
// Component
// =============================================================================

interface KnowledgeFileViewerProps {
  workspaceId: string;
  file: KnowledgeFileMeta;
  onEdit: (file: KnowledgeFile) => void;
  onDelete: (slug: string) => void;
}

export function KnowledgeFileViewer({ workspaceId, file, onEdit, onDelete }: KnowledgeFileViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Lazy-load content only when expanded
  const { data: fullFile, isLoading } = useQuery({
    queryKey: ['knowledge-file', workspaceId, file.slug],
    queryFn: () => fetchKnowledgeFile(workspaceId, file.slug),
    enabled: expanded,
    staleTime: 30_000,
  });

  const categoryColor = CATEGORY_COLORS[file.category] || CATEGORY_COLORS.reference;
  const fileTags = Array.isArray(fullFile?.tags) ? fullFile.tags : [];

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-900/60 hover:bg-slate-900/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown size={14} className="text-slate-400 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-white truncate">{file.title}</span>
          <Badge variant={categoryColor}>{file.category}</Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">{formatRelative(file.updated_at)}</span>
          <span
            onClick={e => {
              e.stopPropagation();
              if (fullFile) onEdit(fullFile);
              else setExpanded(true); // expand to load content first
            }}
            className="text-slate-400 hover:text-violet-400 cursor-pointer p-1"
          >
            <Pencil size={13} />
          </span>
          <span
            onClick={e => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="text-slate-400 hover:text-red-400 cursor-pointer p-1"
          >
            <Trash2 size={13} />
          </span>
        </div>
      </button>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="px-3 py-2 bg-red-900/20 border-t border-red-500/30 flex items-center justify-between">
          <span className="text-xs text-red-300">Delete "{file.title}"?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onDelete(file.slug);
                setConfirmDelete(false);
              }}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-3 bg-slate-900/40 border-t border-slate-700">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
              <Loader2 size={14} className="animate-spin" />
              Loading content...
            </div>
          ) : fullFile ? (
            <div className="space-y-2">
              {/* Tags */}
              {fileTags.length > 0 && (
                <div className="flex gap-1 flex-wrap mb-2">
                  {fileTags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-slate-700/50 text-slate-400 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {/* Markdown content — rendered as preformatted for now */}
              <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono bg-slate-950/50 p-3 rounded-lg border border-slate-700/50 max-h-96 overflow-y-auto">
                {fullFile.content}
              </pre>
              {/* Metadata footer */}
              <div className="flex gap-4 text-[10px] text-slate-500 pt-1">
                <span>Created: {new Date(fullFile.created_at).toLocaleDateString()}</span>
                {fullFile.created_by_agent && <span>By: {fullFile.created_by_agent}</span>}
                {fullFile.created_by_plan && <span>Plan: {fullFile.created_by_plan}</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-400">Failed to load content</p>
          )}
        </div>
      )}
    </div>
  );
}
