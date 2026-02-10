import { useState, useEffect, useMemo } from 'react';
import { FileText, Clock, ChevronRight, Folder, Search, Hash } from 'lucide-react';
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

/**
 * Render note content with basic syntax highlighting for fenced code blocks.
 */
function HighlightedContent({ content }: { content: string }) {
  const parts = useMemo(() => {
    const segments: Array<{ type: 'text' | 'code'; lang?: string; value: string }> = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'code', lang: match[1], value: match[2] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      segments.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return segments;
  }, [content]);

  return (
    <div className="space-y-2">
      {parts.map((part, i) =>
        part.type === 'code' ? (
          <div key={i} className="relative">
            {part.lang && (
              <span className="absolute top-1 right-2 text-[10px] text-slate-500 font-mono select-none">
                {part.lang}
              </span>
            )}
            <pre className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-emerald-300 font-mono overflow-x-auto">
              {part.value}
            </pre>
          </div>
        ) : (
          <pre key={i} className="whitespace-pre-wrap text-slate-300 font-sans text-sm">
            {part.value}
          </pre>
        )
      )}
    </div>
  );
}

export function ResearchNotesViewer({ workspaceId, planId, className }: ResearchNotesViewerProps) {
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<ResearchNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) =>
        n.filename.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

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
      <div className="w-64 shrink-0 space-y-2">
        <div className="flex items-center gap-2 px-2">
          <h4 className="text-sm font-medium text-slate-400">
            Research Notes
          </h4>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-violet-900/50 text-violet-300">
            <Hash size={10} />
            {notes.length}
          </span>
        </div>

        {/* Search input */}
        <div className="relative px-2">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter notes..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-violet-500 placeholder:text-slate-600"
          />
        </div>

        <div className="space-y-1">
          {filteredNotes.map((note) => (
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
          {filteredNotes.length === 0 && (
            <p className="text-xs text-slate-500 px-3 py-2">No matches</p>
          )}
        </div>
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
            <HighlightedContent content={selectedNote.content} />
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
