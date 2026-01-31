import { useState, useEffect } from 'react';
import { ScrollText, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { formatDateTime, formatRelative } from '@/utils/formatters';
import { agentBgColors, agentIcons } from '@/utils/colors';
import type { AgentType } from '@/types';

interface AuditEntry {
  timestamp: string;
  agent_type: AgentType;
  action: string;
  details: Record<string, unknown>;
  tool?: string;
  duration_ms?: number;
}

interface AuditLogViewerProps {
  workspaceId: string;
  planId: string;
  className?: string;
}

export function AuditLogViewer({ workspaceId, planId, className }: AuditLogViewerProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [agentFilter, setAgentFilter] = useState<AgentType | 'all'>('all');

  useEffect(() => {
    async function fetchAudit() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/plans/${workspaceId}/${planId}/audit`);
        if (!res.ok) throw new Error('Failed to fetch audit log');
        const data = await res.json();
        // Handle both array and object formats
        const auditEntries = Array.isArray(data) ? data : (data.entries || []);
        setEntries(auditEntries);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load audit log');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAudit();
  }, [workspaceId, planId]);

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedIds(newExpanded);
  };

  const filteredEntries = agentFilter === 'all' 
    ? entries 
    : entries.filter((e) => e.agent_type === agentFilter);

  const uniqueAgents = [...new Set(entries.map((e) => e.agent_type))];

  if (isLoading) {
    return (
      <div className={cn('animate-pulse space-y-4', className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-slate-700 rounded" />
        ))}
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

  if (entries.length === 0) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        <ScrollText className="mx-auto mb-2 opacity-50" size={32} />
        <p>No audit entries yet</p>
        <p className="text-sm">Agent activity will be logged here</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Filter size={16} />
          <span>Filter by agent:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAgentFilter('all')}
            className={cn(
              'px-3 py-1 rounded text-sm transition-colors',
              agentFilter === 'all'
                ? 'bg-violet-500/20 text-violet-300'
                : 'bg-slate-700 text-slate-400 hover:text-slate-200'
            )}
          >
            All ({entries.length})
          </button>
          {uniqueAgents.map((agent) => (
            <button
              key={agent}
              onClick={() => setAgentFilter(agent)}
              className={cn(
                'px-3 py-1 rounded text-sm transition-colors',
                agentFilter === agent
                  ? agentBgColors[agent]
                  : 'bg-slate-700 text-slate-400 hover:text-slate-200'
              )}
            >
              {agentIcons[agent]} {agent} ({entries.filter((e) => e.agent_type === agent).length})
            </button>
          ))}
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-2">
        {filteredEntries.map((entry, index) => (
          <div
            key={index}
            className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => toggleExpand(index)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-700/30 transition-colors"
            >
              <span className="text-lg">
                {expandedIds.has(index) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
              <Badge variant={agentBgColors[entry.agent_type]}>
                {agentIcons[entry.agent_type]} {entry.agent_type}
              </Badge>
              <span className="flex-1 text-sm text-slate-300">{entry.action}</span>
              {entry.tool && (
                <span className="text-xs font-mono bg-slate-700 px-2 py-0.5 rounded">
                  {entry.tool}
                </span>
              )}
              {entry.duration_ms && (
                <span className="text-xs text-slate-500">
                  {entry.duration_ms}ms
                </span>
              )}
              <span className="text-xs text-slate-500">
                {formatRelative(entry.timestamp)}
              </span>
            </button>

            {/* Details */}
            {expandedIds.has(index) && (
              <div className="px-3 pb-3 pt-0">
                <div className="p-3 bg-slate-900 rounded border border-slate-700">
                  <div className="text-xs text-slate-500 mb-2">
                    {formatDateTime(entry.timestamp)}
                  </div>
                  <pre className="text-xs text-slate-400 overflow-x-auto">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="text-sm text-slate-500 pt-4 border-t border-slate-700">
        Showing {filteredEntries.length} of {entries.length} entries
      </div>
    </div>
  );
}
