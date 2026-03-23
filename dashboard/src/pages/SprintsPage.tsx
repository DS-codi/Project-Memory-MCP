import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Target, Filter } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { SprintList } from '@/components/sprint/SprintList';
import { useSprints, useCreateSprint } from '@/hooks/useSprints';
import { cn } from '@/utils/cn';

export function SprintsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSprintTitle, setNewSprintTitle] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  const { data, isLoading } = useSprints(workspaceId, includeArchived);
  const createMutation = useCreateSprint(workspaceId);

  const sprints = data?.sprints ?? [];
  const activeSprints = sprints.filter((s) => s.status !== 'archived');
  const archivedSprints = sprints.filter((s) => s.status === 'archived');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSprintTitle.trim()) return;
    createMutation.mutate(
      { title: newSprintTitle.trim() },
      {
        onSuccess: () => {
          setNewSprintTitle('');
          setShowCreateForm(false);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to={`/workspace/${workspaceId}`}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Workspace
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target size={28} className="text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold">Sprints</h1>
            <p className="text-slate-400 text-sm">Organize your work into focused time periods</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg',
            'hover:bg-violet-500 transition-colors'
          )}
        >
          <Plus size={16} />
          New Sprint
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              type="text"
              value={newSprintTitle}
              onChange={(e) => setNewSprintTitle(e.target.value)}
              placeholder="Sprint title..."
              autoFocus
              className={cn(
                'flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg',
                'text-slate-200 placeholder-slate-500',
                'focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500'
              )}
              disabled={createMutation.isPending}
            />
            <button
              type="submit"
              disabled={!newSprintTitle.trim() || createMutation.isPending}
              className={cn(
                'px-4 py-2 bg-violet-600 text-white rounded-lg',
                'hover:bg-violet-500 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Sprint'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewSprintTitle('');
              }}
              className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Filter Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIncludeArchived((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
            includeArchived
              ? 'bg-violet-500/20 text-violet-300'
              : 'bg-slate-700 text-slate-400 hover:text-slate-200'
          )}
        >
          <Filter size={14} />
          {includeArchived ? 'Showing Archived' : 'Show Archived'}
        </button>
        <Badge variant="slate">{activeSprints.length} active</Badge>
        {includeArchived && <Badge variant="slate">{archivedSprints.length} archived</Badge>}
      </div>

      {/* Active Sprints */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Active Sprints</h2>
        <SprintList sprints={activeSprints} workspaceId={workspaceId!} isLoading={isLoading} />
      </div>

      {/* Archived Sprints */}
      {includeArchived && archivedSprints.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-slate-400">Archived Sprints</h2>
          <SprintList sprints={archivedSprints} workspaceId={workspaceId!} isLoading={false} />
        </div>
      )}
    </div>
  );
}
