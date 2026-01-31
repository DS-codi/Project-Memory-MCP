import { useState } from 'react';
import { Filter } from 'lucide-react';
import { PlanCard } from './PlanCard';
import { Badge } from '../common/Badge';
import { cn } from '@/utils/cn';
import { planStatusColors, categoryColors, priorityColors } from '@/utils/colors';
import type { PlanSummary, PlanStatus, RequestCategory, PlanPriority } from '@/types';

interface PlanListProps {
  plans: PlanSummary[];
  workspaceId: string;
  isLoading?: boolean;
}

const statuses: PlanStatus[] = ['active', 'paused', 'completed', 'archived', 'failed'];
const categories: RequestCategory[] = ['feature', 'bug', 'change', 'refactor', 'analysis', 'debug', 'documentation'];
const priorities: PlanPriority[] = ['critical', 'high', 'medium', 'low'];

export function PlanList({ plans, workspaceId, isLoading }: PlanListProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PlanStatus[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<RequestCategory[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<PlanPriority[]>([]);

  // Filter plans
  const filteredPlans = plans.filter((plan) => {
    if (statusFilter.length > 0 && !statusFilter.includes(plan.status)) return false;
    if (categoryFilter.length > 0 && !categoryFilter.includes(plan.category)) return false;
    if (priorityFilter.length > 0 && !priorityFilter.includes(plan.priority)) return false;
    return true;
  });

  const toggleFilter = <T extends string>(
    value: T,
    current: T[],
    setter: (v: T[]) => void
  ) => {
    if (current.includes(value)) {
      setter(current.filter((v) => v !== value));
    } else {
      setter([...current, value]);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-slate-800 border border-slate-700 rounded-lg p-4 animate-pulse"
          >
            <div className="flex gap-2 mb-3">
              <div className="h-5 w-16 bg-slate-700 rounded" />
              <div className="h-5 w-16 bg-slate-700 rounded" />
            </div>
            <div className="h-6 bg-slate-700 rounded w-3/4 mb-3" />
            <div className="h-2 bg-slate-700 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Filter Bar */}
      <div className="mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
            showFilters 
              ? 'bg-violet-500/20 text-violet-300'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          )}
        >
          <Filter size={16} />
          <span>Filters</span>
          {(statusFilter.length + categoryFilter.length + priorityFilter.length) > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-violet-500 text-white text-xs rounded-full">
              {statusFilter.length + categoryFilter.length + priorityFilter.length}
            </span>
          )}
        </button>

        {showFilters && (
          <div className="mt-3 p-4 bg-slate-800 border border-slate-700 rounded-lg space-y-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Status</label>
              <div className="flex flex-wrap gap-2">
                {statuses.map((status) => (
                  <button
                    key={status}
                    onClick={() => toggleFilter(status, statusFilter, setStatusFilter)}
                    className={cn(
                      'transition-opacity',
                      statusFilter.includes(status) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                    )}
                  >
                    <Badge variant={planStatusColors[status]}>{status}</Badge>
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Category</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleFilter(category, categoryFilter, setCategoryFilter)}
                    className={cn(
                      'transition-opacity',
                      categoryFilter.includes(category) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                    )}
                  >
                    <Badge variant={categoryColors[category]}>{category}</Badge>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Priority</label>
              <div className="flex flex-wrap gap-2">
                {priorities.map((priority) => (
                  <button
                    key={priority}
                    onClick={() => toggleFilter(priority, priorityFilter, setPriorityFilter)}
                    className={cn(
                      'transition-opacity',
                      priorityFilter.includes(priority) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                    )}
                  >
                    <Badge variant={priorityColors[priority]}>{priority}</Badge>
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            {(statusFilter.length + categoryFilter.length + priorityFilter.length) > 0 && (
              <button
                onClick={() => {
                  setStatusFilter([]);
                  setCategoryFilter([]);
                  setPriorityFilter([]);
                }}
                className="text-sm text-violet-400 hover:text-violet-300"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="mb-4 text-sm text-slate-500">
        Showing {filteredPlans.length} of {plans.length} plans
      </div>

      {/* Plan List */}
      {filteredPlans.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-lg">No plans found</p>
          <p className="text-sm mt-2">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} workspaceId={workspaceId} />
          ))}
        </div>
      )}
    </div>
  );
}
