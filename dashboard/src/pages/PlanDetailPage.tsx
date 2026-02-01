import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, GitBranch, ListChecks, FileText, Activity, BarChart, Info, AlertTriangle, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { ProgressBar } from '@/components/common/ProgressBar';
import { StepList } from '@/components/plan/StepList';
import { StepProgress } from '@/components/plan/StepProgress';
import { ResearchNotesViewer } from '@/components/plan/ResearchNotesViewer';
import { AuditLogViewer } from '@/components/plan/AuditLogViewer';
import { ExportReport } from '@/components/plan/ExportReport';
import { PlanActions } from '@/components/plan/PlanActions';
import { AddNoteForm } from '@/components/plan/AddNoteForm';
import { HandoffTimeline } from '@/components/timeline/HandoffTimeline';
import { BallInCourt } from '@/components/timeline/BallInCourt';
import { formatDate, formatRelative } from '@/utils/formatters';
import { categoryColors, priorityColors, priorityIcons, planStatusColors } from '@/utils/colors';
import { cn } from '@/utils/cn';
import type { PlanState, AgentType } from '@/types';

async function fetchPlan(workspaceId: string, planId: string): Promise<PlanState> {
  const res = await fetch(`/api/plans/${workspaceId}/${planId}`);
  if (!res.ok) throw new Error('Failed to fetch plan');
  return res.json();
}

type Tab = 'timeline' | 'steps' | 'research' | 'activity';

export function PlanDetailPage() {
  const { workspaceId, planId } = useParams<{ workspaceId: string; planId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [stepView, setStepView] = useState<'bar' | 'kanban'>('bar');

  const { data: plan, isLoading, error } = useQuery({
    queryKey: ['plan', workspaceId, planId],
    queryFn: () => fetchPlan(workspaceId!, planId!),
    enabled: !!workspaceId && !!planId,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-48" />
        <div className="h-48 bg-slate-800 rounded-lg" />
        <div className="h-96 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Plan not found</p>
        <Link to={`/workspace/${workspaceId}`} className="text-violet-400 hover:underline mt-2 inline-block">
          Return to workspace
        </Link>
      </div>
    );
  }

  const doneSteps = plan.steps?.filter((s) => s.status === 'done').length || 0;
  const totalSteps = plan.steps?.length || 0;

  // Get current session if agent is active
  const currentSession = plan.current_agent
    ? plan.agent_sessions?.find(
        (s) => s.agent_type === plan.current_agent && !s.completed_at
      )
    : undefined;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline', label: 'Timeline', icon: <GitBranch size={16} /> },
    { id: 'steps', label: 'Steps', icon: <ListChecks size={16} /> },
    { id: 'research', label: 'Research', icon: <FileText size={16} /> },
    { id: 'activity', label: 'Activity', icon: <Activity size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        to={`/workspace/${workspaceId}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Workspace
      </Link>

      {/* Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={categoryColors[plan.category]}>{plan.category}</Badge>
              <Badge variant={priorityColors[plan.priority]}>
                {priorityIcons[plan.priority]} {plan.priority}
              </Badge>
              <Badge variant={planStatusColors[plan.status]}>{plan.status}</Badge>
            </div>
            <h1 className="text-2xl font-bold mb-2">{plan.title}</h1>
            <p className="text-slate-400">{plan.description}</p>
          </div>
          <div className="text-right text-sm text-slate-400">
            <div className="flex items-center gap-2 justify-end mb-2">
              <ExportReport 
                workspaceId={workspaceId!} 
                planId={planId!} 
                planTitle={plan.title} 
              />
              <PlanActions
                workspaceId={workspaceId!}
                planId={planId!}
                planTitle={plan.title}
              />
            </div>
            <div className="font-mono mb-1">{plan.id}</div>
            <div className="flex items-center gap-1 justify-end">
              <Clock size={14} />
              Created {formatDate(plan.created_at)}
            </div>
            <div>Updated {formatRelative(plan.updated_at)}</div>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">Progress</span>
          <div className="flex-1 max-w-md">
            <ProgressBar value={doneSteps} max={totalSteps} showLabel />
          </div>
        </div>
      </div>

      {/* Pending Notes */}
      {plan.pending_notes && plan.pending_notes.length > 0 && (
        <div className="bg-slate-800 border-l-4 border-violet-500 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={18} className="text-violet-400" />
            <h3 className="font-semibold">Pending Notes for Next Agent</h3>
            <Badge variant="violet">{plan.pending_notes.length}</Badge>
          </div>
          <div className="space-y-2">
            {plan.pending_notes.map((note, idx) => (
              <div key={idx} className="bg-slate-900/50 rounded p-3 border border-slate-700">
                <div className="flex items-center gap-2 mb-1">
                  {note.type === 'info' && <Info size={14} className="text-blue-400" />}
                  {note.type === 'warning' && <AlertTriangle size={14} className="text-amber-400" />}
                  {note.type === 'instruction' && <MessageSquare size={14} className="text-violet-400" />}
                  <Badge variant={note.type === 'info' ? 'blue' : note.type === 'warning' ? 'amber' : 'violet'}>
                    {note.type}
                  </Badge>
                  <span className="text-xs text-slate-500">{formatRelative(note.added_at)}</span>
                </div>
                <p className="text-slate-200 text-sm">{note.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ball in Court */}
      <BallInCourt currentAgent={plan.current_agent as AgentType} currentSession={currentSession} />

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-violet-500 text-violet-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        {activeTab === 'timeline' && (
          <HandoffTimeline lineage={plan.lineage || []} sessions={plan.agent_sessions || []} />
        )}
        {activeTab === 'steps' && (
          <div className="space-y-6">
            {/* Add Note Form */}
            <AddNoteForm workspaceId={workspaceId!} planId={planId!} />

            {/* View Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Step Progress</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setStepView('bar')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors',
                    stepView === 'bar'
                      ? 'bg-violet-500/20 text-violet-300'
                      : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  )}
                >
                  <BarChart size={14} />
                  Bar
                </button>
                <button
                  onClick={() => setStepView('kanban')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors',
                    stepView === 'kanban'
                      ? 'bg-violet-500/20 text-violet-300'
                      : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  )}
                >
                  <ListChecks size={14} />
                  Kanban
                </button>
              </div>
            </div>
            
            {/* Progress Visualization */}
            <StepProgress steps={plan.steps || []} view={stepView} />
            
            {/* Detailed Step List */}
            <div className="border-t border-slate-700 pt-6">
              <h3 className="font-semibold text-lg mb-4">All Steps</h3>
              <StepList 
                steps={plan.steps || []} 
                workspaceId={workspaceId}
                planId={planId}
                editable={true}
              />
            </div>
          </div>
        )}
        {activeTab === 'research' && (
          <ResearchNotesViewer workspaceId={workspaceId!} planId={planId!} />
        )}
        {activeTab === 'activity' && (
          <AuditLogViewer workspaceId={workspaceId!} planId={planId!} />
        )}
      </div>
    </div>
  );
}
