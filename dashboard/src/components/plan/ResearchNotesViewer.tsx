import { useState, useEffect } from 'react';
import { FileText, Clock, ChevronRight, Folder } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/formatters';

interface ResearchNote {
  filename: string;
  content: string;
  modified_at: string;
}

interface ResearchNotesViewerProps {
  workspaceId: string;
  planId: string;
  className?: string;
}

export function ResearchNotesViewer({ workspaceId, planId, className }: ResearchNotesViewerProps) {
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<ResearchNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNotes() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/plans/${workspaceId}/${planId}/research`);
        if (!res.ok) throw new Error('Failed to fetch research notes');
        const data = await res.json();
        setNotes(data.notes || []);
        if (data.notes?.length > 0) {
          setSelectedNote(data.notes[0]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load notes');
      } finally {
        setIsLoading(false);
      }
    }

    fetchNotes();
  }, [workspaceId, planId]);

  if (isLoading) {
    return (
      <div className={cn('animate-pulse space-y-4', className)}>
        <div className="h-8 bg-slate-700 rounded w-1/3" />
        <div className="h-64 bg-slate-700 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        <p>{error}</p>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        <Folder className="mx-auto mb-2 opacity-50" size={32} />
        <p>No research notes yet</p>
        <p className="text-sm">Notes created by the Researcher agent will appear here</p>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-4', className)}>
      {/* File List */}
      <div className="w-64 shrink-0 space-y-1">
        <h4 className="text-sm font-medium text-slate-400 mb-2 px-2">
          Research Notes ({notes.length})
        </h4>
        {notes.map((note) => (
          <button
            key={note.filename}
            onClick={() => setSelectedNote(note)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
              selectedNote?.filename === note.filename
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            )}
          >
            <FileText size={16} />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm">{note.filename}</div>
              <div className="text-xs opacity-60">
                {formatRelative(note.modified_at)}
              </div>
            </div>
            <ChevronRight size={16} className="opacity-50" />
          </button>
        ))}
      </div>

      {/* Content Viewer */}
      <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 p-4 overflow-auto">
        {selectedNote ? (
          <div>
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700">
              <h3 className="font-semibold text-lg">{selectedNote.filename}</h3>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Clock size={14} />
                <span>{formatRelative(selectedNote.modified_at)}</span>
              </div>
            </div>
            <div className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-slate-300 font-sans">
                {selectedNote.content}
              </pre>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            Select a note to view
          </div>
        )}
      </div>
    </div>
  );
}
