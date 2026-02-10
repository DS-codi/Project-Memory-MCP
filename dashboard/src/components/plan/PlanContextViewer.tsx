import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Search, Hash, ExternalLink } from 'lucide-react';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/formatters';

interface ContextFileData {
  type?: string;
  plan_id?: string;
  workspace_id?: string;
  stored_at?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PlanContextViewerProps {
  workspaceId: string;
  planId: string;
  className?: string;
}

async function fetchContextList(workspaceId: string, planId: string): Promise<string[]> {
  const res = await fetch(`/api/plans/${workspaceId}/${planId}/context`);
  if (!res.ok) throw new Error('Failed to fetch context files');
  const data = await res.json();
  return data.context || [];
}

async function fetchContextFile(workspaceId: string, planId: string, type: string): Promise<ContextFileData> {
  const res = await fetch(`/api/plans/${workspaceId}/${planId}/context/${type}`);
  if (!res.ok) throw new Error('Failed to fetch context file');
  return res.json();
}

/** Friendly label for a context file type */
function friendlyLabel(filename: string): string {
  return filename
    .replace(/\.json$/, '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Category colour for known context types */
function typeColor(filename: string): string {
  const name = filename.toLowerCase();
  if (name.includes('initial') || name.includes('request')) return 'border-blue-500/40 bg-blue-500/5';
  if (name.includes('research') || name.includes('analysis')) return 'border-emerald-500/40 bg-emerald-500/5';
  if (name.includes('design') || name.includes('architect')) return 'border-amber-500/40 bg-amber-500/5';
  if (name.includes('note') || name.includes('context_note')) return 'border-violet-500/40 bg-violet-500/5';
  return 'border-slate-600 bg-slate-800/50';
}

/** Render a value as formatted content */
function RenderValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-500 italic">—</span>;
  }

  if (typeof value === 'string') {
    // Multi-line strings get a pre block
    if (value.includes('\n')) {
      return <pre className="whitespace-pre-wrap text-slate-300 text-sm font-sans">{value}</pre>;
    }
    return <span className="text-slate-200">{value}</span>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-emerald-300 font-mono text-sm">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-500 italic">empty</span>;
    // Short arrays of primitives → inline
    if (value.every((v) => typeof v === 'string' || typeof v === 'number') && value.length <= 5) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item, i) => (
            <span key={i} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-200">
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className={cn('space-y-2', depth > 0 && 'ml-4')}>
        {value.map((item, i) => (
          <div key={i} className="border-l-2 border-slate-700 pl-3">
            <RenderValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-slate-500 italic">empty</span>;
    return (
      <div className={cn('space-y-2', depth > 0 && 'ml-4')}>
        {entries.map(([k, v]) => (
          <div key={k}>
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">{k.replace(/_/g, ' ')}</span>
            <div className="mt-0.5">
              <RenderValue value={v} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-slate-300">{String(value)}</span>;
}

/** Context entry card */
function ContextCard({ workspaceId, planId, filename }: { workspaceId: string; planId: string; filename: string }) {
  const type = filename.replace(/\.json$/, '');
  const { data, isLoading, error } = useQuery({
    queryKey: ['context-file', workspaceId, planId, type],
    queryFn: () => fetchContextFile(workspaceId, planId, type),
  });

  const displayData = useMemo(() => {
    if (!data) return null;
    // Strip metadata fields, show the content
    const { type: _t, plan_id: _p, workspace_id: _w, stored_at, data: innerData, ...rest } = data;
    return { storedAt: stored_at, content: innerData || rest };
  }, [data]);

  return (
    <CollapsibleSection
      title={friendlyLabel(filename)}
      subtitle={displayData?.storedAt ? formatRelative(displayData.storedAt) : undefined}
      defaultOpen={false}
      badge={
        isLoading ? (
          <span className="text-xs text-slate-500">loading...</span>
        ) : error ? (
          <span className="text-xs text-red-400">error</span>
        ) : null
      }
      className={cn('border rounded-lg p-0', typeColor(filename))}
    >
      <div className="p-4">
        {isLoading && (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-slate-700 rounded w-2/3" />
            <div className="h-4 bg-slate-700 rounded w-1/2" />
          </div>
        )}
        {error && <p className="text-red-400 text-sm">Failed to load context</p>}
        {displayData && <RenderValue value={displayData.content} />}
      </div>
    </CollapsibleSection>
  );
}

export function PlanContextViewer({ workspaceId, planId, className }: PlanContextViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: contextFiles = [], isLoading, error } = useQuery({
    queryKey: ['context-files', workspaceId, planId],
    queryFn: () => fetchContextList(workspaceId, planId),
    enabled: !!workspaceId && !!planId,
  });

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return contextFiles;
    const q = searchQuery.toLowerCase();
    return contextFiles.filter((f) => f.toLowerCase().includes(q));
  }, [contextFiles, searchQuery]);

  if (isLoading) {
    return (
      <div className={cn('animate-pulse space-y-4', className)}>
        <div className="h-8 bg-slate-700 rounded w-1/3" />
        <div className="h-32 bg-slate-700 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        <p>Failed to load context files</p>
      </div>
    );
  }

  if (contextFiles.length === 0) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        <Database className="mx-auto mb-2 opacity-50" size={32} />
        <p>No context data stored yet</p>
        <p className="text-sm">Context from agent sessions (initial request, analysis, design decisions) will appear here</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header row */}
      <div className="flex items-center gap-3">
        <h4 className="text-sm font-medium text-slate-400">Plan Context</h4>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-900/50 text-blue-300">
          <Hash size={10} />
          {contextFiles.length}
        </span>
        <div className="flex-1" />
        <a
          href={`/workspace/${workspaceId}/plan/${planId}/context`}
          className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          <ExternalLink size={12} />
          Full Page
        </a>
      </div>

      {/* Search */}
      {contextFiles.length > 3 && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter context files..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-violet-500 placeholder:text-slate-600"
          />
        </div>
      )}

      {/* Context cards */}
      <div className="space-y-3">
        {filteredFiles.map((filename) => (
          <ContextCard key={filename} workspaceId={workspaceId} planId={planId} filename={filename} />
        ))}
        {filteredFiles.length === 0 && searchQuery && (
          <p className="text-xs text-slate-500 text-center py-4">No matching context files</p>
        )}
      </div>
    </div>
  );
}
