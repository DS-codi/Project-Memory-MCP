import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, StickyNote, BookOpen, RefreshCw } from 'lucide-react';

interface ContextFile {
  type: string;
  plan_id: string;
  workspace_id: string;
  stored_at: string;
  data: Record<string, unknown>;
}

interface ResearchNote {
  filename: string;
  content: string;
  modified_at: string;
}

async function fetchContextFiles(workspaceId: string, planId: string): Promise<string[]> {
  const res = await fetch(`/api/plans/${workspaceId}/${planId}/context`);
  if (!res.ok) throw new Error('Failed to fetch context files');
  const data = await res.json();
  return data.context || [];
}

async function fetchContextFile(workspaceId: string, planId: string, type: string): Promise<ContextFile> {
  const res = await fetch(`/api/plans/${workspaceId}/${planId}/context/${type}`);
  if (!res.ok) throw new Error('Failed to fetch context file');
  return res.json();
}

async function fetchResearchNotes(workspaceId: string, planId: string): Promise<ResearchNote[]> {
  const res = await fetch(`/api/plans/${workspaceId}/${planId}/research`);
  if (!res.ok) throw new Error('Failed to fetch research notes');
  const data = await res.json();
  return data.notes || [];
}

function toSafeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function ContextFilesPage() {
  const { workspaceId, planId } = useParams<{ workspaceId: string; planId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [contextNote, setContextNote] = useState('');
  const [researchTitle, setResearchTitle] = useState('');
  const [researchContent, setResearchContent] = useState('');
  const contextRef = useRef<HTMLDivElement>(null);
  const researchRef = useRef<HTMLDivElement>(null);
  const contextInputRef = useRef<HTMLTextAreaElement>(null);
  const researchInputRef = useRef<HTMLTextAreaElement>(null);

  const focusSection = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('focus');
  }, [location.search]);

  const { data: contextFiles = [], isLoading: contextLoading } = useQuery({
    queryKey: ['context-files', workspaceId, planId],
    queryFn: () => fetchContextFiles(workspaceId!, planId!),
    enabled: !!workspaceId && !!planId,
  });

  const selectedType = selectedFile ? selectedFile.replace(/\.json$/, '') : null;
  const { data: contextFile, isLoading: contextFileLoading } = useQuery({
    queryKey: ['context-file', workspaceId, planId, selectedType],
    queryFn: () => fetchContextFile(workspaceId!, planId!, selectedType!),
    enabled: !!workspaceId && !!planId && !!selectedType,
  });

  const { data: researchNotes = [], isLoading: researchLoading } = useQuery({
    queryKey: ['research-notes', workspaceId, planId],
    queryFn: () => fetchResearchNotes(workspaceId!, planId!),
    enabled: !!workspaceId && !!planId,
  });

  const addContextMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch(`/api/plans/${workspaceId}/${planId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: `context_note_${Date.now()}`,
          data: {
            note,
            created_by: 'user',
            created_at: new Date().toISOString(),
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to add context note');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['context-files', workspaceId, planId] });
      setContextNote('');
    },
  });

  const addResearchMutation = useMutation({
    mutationFn: async (payload: { filename: string; content: string }) => {
      const res = await fetch(`/api/plans/${workspaceId}/${planId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to add research note');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-notes', workspaceId, planId] });
      setResearchTitle('');
      setResearchContent('');
    },
  });

  useEffect(() => {
    if (!selectedFile && contextFiles.length > 0) {
      setSelectedFile(contextFiles[0]);
    }
  }, [contextFiles, selectedFile]);

  useEffect(() => {
    if (focusSection === 'context') {
      contextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      contextInputRef.current?.focus();
    }
    if (focusSection === 'research') {
      researchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      researchInputRef.current?.focus();
    }
  }, [focusSection]);

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
          <FileText className="text-violet-400" size={22} />
          <h1 className="text-2xl font-bold">Context Files</h1>
        </div>
        <p className="text-slate-400">Review context entries and add new notes or research files.</p>
      </div>

      <div ref={contextRef} className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <StickyNote className="text-violet-400" size={18} />
          <h2 className="text-lg font-semibold">Add Context Note</h2>
        </div>
        <textarea
          ref={contextInputRef}
          value={contextNote}
          onChange={(e) => setContextNote(e.target.value)}
          placeholder="Add a context note for this plan..."
          className="w-full min-h-[120px] bg-slate-900 border border-slate-600 rounded-lg p-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => addContextMutation.mutate(contextNote.trim())}
            disabled={!contextNote.trim() || addContextMutation.isPending}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors disabled:opacity-50"
          >
            {addContextMutation.isPending ? 'Saving...' : 'Save Note'}
          </button>
          {addContextMutation.isError && (
            <span className="text-sm text-red-400">Failed to save context note.</span>
          )}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="text-blue-400" size={18} />
          <h2 className="text-lg font-semibold">Context Files</h2>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['context-files', workspaceId, planId] })}
            className="ml-auto p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {contextLoading ? (
              <p className="text-sm text-slate-400">Loading context files...</p>
            ) : contextFiles.length === 0 ? (
              <p className="text-sm text-slate-400">No context files yet.</p>
            ) : (
              contextFiles.map((file) => (
                <button
                  key={file}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    selectedFile === file
                      ? 'border-violet-500 bg-violet-500/10 text-violet-200'
                      : 'border-slate-700 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  {file}
                </button>
              ))
            )}
          </div>
          <div className="lg:col-span-2 bg-slate-900 border border-slate-700 rounded-lg p-4 min-h-[220px]">
            {contextFileLoading ? (
              <p className="text-sm text-slate-400">Loading file...</p>
            ) : contextFile ? (
              <pre className="text-sm text-slate-200 whitespace-pre-wrap break-words">
                {JSON.stringify(contextFile, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-slate-400">Select a context file to view details.</p>
            )}
          </div>
        </div>
      </div>

      <div ref={researchRef} className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="text-emerald-400" size={18} />
          <h2 className="text-lg font-semibold">Research Notes</h2>
        </div>
        <input
          value={researchTitle}
          onChange={(e) => setResearchTitle(e.target.value)}
          placeholder="Optional title (used for filename)"
          className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-slate-200"
        />
        <textarea
          ref={researchInputRef}
          value={researchContent}
          onChange={(e) => setResearchContent(e.target.value)}
          placeholder="Write a research note..."
          className="w-full min-h-[160px] bg-slate-900 border border-slate-600 rounded-lg p-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const safeName = researchTitle.trim()
                ? `${toSafeFilename(researchTitle.trim())}.md`
                : `research_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
              addResearchMutation.mutate({ filename: safeName, content: researchContent.trim() });
            }}
            disabled={!researchContent.trim() || addResearchMutation.isPending}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors disabled:opacity-50"
          >
            {addResearchMutation.isPending ? 'Saving...' : 'Save Research Note'}
          </button>
          {addResearchMutation.isError && (
            <span className="text-sm text-red-400">Failed to save research note.</span>
          )}
        </div>
        <div className="border-t border-slate-700 pt-4 space-y-3">
          {researchLoading ? (
            <p className="text-sm text-slate-400">Loading research notes...</p>
          ) : researchNotes.length === 0 ? (
            <p className="text-sm text-slate-400">No research notes yet.</p>
          ) : (
            researchNotes.map((note) => (
              <div key={note.filename} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-200">{note.filename}</span>
                  <span className="text-xs text-slate-500">{new Date(note.modified_at).toLocaleString()}</span>
                </div>
                <pre className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                  {note.content}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
