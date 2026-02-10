import { useState } from 'react';
import { Filter, ArrowUpDown, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { PlanStep, StepStatus, StepType } from '@/types';

export type StepSortField = 'index' | 'status' | 'phase' | 'assignee' | 'type';
export type SortDirection = 'asc' | 'desc';

export interface StepFilters {
  status: StepStatus[];
  type: StepType[];
  assignee: string[];
  search: string;
}

export interface StepSort {
  field: StepSortField;
  direction: SortDirection;
}

const STATUS_OPTIONS: StepStatus[] = ['pending', 'active', 'done', 'blocked'];
const STATUS_LABELS: Record<StepStatus, string> = { pending: 'Pending', active: 'Active', done: 'Done', blocked: 'Blocked' };
const STATUS_COLORS: Record<StepStatus, string> = {
  pending: 'bg-slate-600/40 text-slate-300 border-slate-500/50',
  active: 'bg-blue-600/40 text-blue-300 border-blue-500/50',
  done: 'bg-emerald-600/40 text-emerald-300 border-emerald-500/50',
  blocked: 'bg-red-600/40 text-red-300 border-red-500/50',
};

interface StepFilterBarProps {
  steps: PlanStep[];
  filters: StepFilters;
  sort: StepSort;
  onFiltersChange: (filters: StepFilters) => void;
  onSortChange: (sort: StepSort) => void;
}

export function StepFilterBar({ steps, filters, sort, onFiltersChange, onSortChange }: StepFilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  // Derive unique values from steps
  const uniqueTypes = Array.from(new Set(steps.map((s) => s.type).filter(Boolean))) as StepType[];
  const uniqueAssignees = Array.from(new Set(steps.map((s) => s.assignee).filter(Boolean))) as string[];

  const activeFilterCount =
    filters.status.length + filters.type.length + filters.assignee.length + (filters.search ? 1 : 0);

  const clearAll = () => {
    onFiltersChange({ status: [], type: [], assignee: [], search: '' });
  };

  const toggleStatus = (s: StepStatus) => {
    const next = filters.status.includes(s)
      ? filters.status.filter((v) => v !== s)
      : [...filters.status, s];
    onFiltersChange({ ...filters, status: next });
  };

  const toggleType = (t: StepType) => {
    const next = filters.type.includes(t)
      ? filters.type.filter((v) => v !== t)
      : [...filters.type, t];
    onFiltersChange({ ...filters, type: next });
  };

  const toggleAssignee = (a: string) => {
    const next = filters.assignee.includes(a)
      ? filters.assignee.filter((v) => v !== a)
      : [...filters.assignee, a];
    onFiltersChange({ ...filters, assignee: next });
  };

  const cycleSortField = (field: StepSortField) => {
    if (sort.field === field) {
      onSortChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ field, direction: 'asc' });
    }
  };

  return (
    <div className="space-y-3">
      {/* Top bar: search + toggle + sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Search steps..."
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />

        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors border',
            expanded || activeFilterCount > 0
              ? 'bg-violet-500/20 text-violet-300 border-violet-500/50'
              : 'bg-slate-700 text-slate-400 border-slate-600 hover:text-slate-200'
          )}
        >
          <Filter size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-violet-500 text-white text-xs rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort dropdown */}
        <div className="flex items-center gap-1">
          <ArrowUpDown size={14} className="text-slate-500" />
          <select
            value={sort.field}
            onChange={(e) => cycleSortField(e.target.value as StepSortField)}
            className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="index">Step #</option>
            <option value="status">Status</option>
            <option value="phase">Phase</option>
            <option value="assignee">Assignee</option>
            <option value="type">Type</option>
          </select>
          <button
            onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors text-xs"
            title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sort.direction === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            className="px-2 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-1"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-4">
          {/* Status */}
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Status</span>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                    filters.status.includes(s)
                      ? STATUS_COLORS[s]
                      : 'bg-slate-800 text-slate-500 border-slate-600 hover:text-slate-300'
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          {uniqueTypes.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Type</span>
              <div className="flex flex-wrap gap-2">
                {uniqueTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                      filters.type.includes(t)
                        ? 'bg-violet-600/30 text-violet-300 border-violet-500/50'
                        : 'bg-slate-800 text-slate-500 border-slate-600 hover:text-slate-300'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Assignee */}
          {uniqueAssignees.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Assignee</span>
              <div className="flex flex-wrap gap-2">
                {uniqueAssignees.map((a) => (
                  <button
                    key={a}
                    onClick={() => toggleAssignee(a)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                      filters.assignee.includes(a)
                        ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                        : 'bg-slate-800 text-slate-500 border-slate-600 hover:text-slate-300'
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper: apply filters and sort to steps
const STATUS_ORDER: Record<StepStatus, number> = { active: 0, blocked: 1, pending: 2, done: 3 };

export function applyFiltersAndSort(steps: PlanStep[], filters: StepFilters, sort: StepSort): PlanStep[] {
  let result = [...steps];

  // Filter by status
  if (filters.status.length > 0) {
    result = result.filter((s) => filters.status.includes(s.status));
  }

  // Filter by type
  if (filters.type.length > 0) {
    result = result.filter((s) => s.type && filters.type.includes(s.type));
  }

  // Filter by assignee
  if (filters.assignee.length > 0) {
    result = result.filter((s) => s.assignee && filters.assignee.includes(s.assignee));
  }

  // Filter by search
  if (filters.search.trim()) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (s) =>
        s.task.toLowerCase().includes(q) ||
        s.phase.toLowerCase().includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q)) ||
        (s.assignee && s.assignee.toLowerCase().includes(q))
    );
  }

  // Sort
  if (sort.field !== 'index') {
    result.sort((a, b) => {
      let cmp = 0;
      switch (sort.field) {
        case 'status':
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
        case 'phase':
          cmp = a.phase.localeCompare(b.phase);
          break;
        case 'assignee':
          cmp = (a.assignee || '').localeCompare(b.assignee || '');
          break;
        case 'type':
          cmp = (a.type || 'standard').localeCompare(b.type || 'standard');
          break;
      }
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  } else if (sort.direction === 'desc') {
    result.reverse();
  }

  return result;
}
