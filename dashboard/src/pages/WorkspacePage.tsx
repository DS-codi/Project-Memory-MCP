import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderOpen, Calendar, Code, FileText, Plus, Activity, Database } from 'lucide-react';
import { PlanList } from '@/components/plan/PlanList';
import { CreatePlanForm } from '@/components/plan/CreatePlanForm';
import { PlanTemplatesPanel } from '@/components/plan/PlanTemplatesPanel';
import { HealthIndicator } from '@/components/workspace/HealthIndicator';
import { CopilotStatusPanel } from '@/components/workspace/CopilotStatusPanel';
import { DeployModal } from '@/components/workspace/DeployModal';
import { DeployDefaultsCard } from '@/components/workspace/DeployDefaultsCard';
import { WorkspaceContextPanel } from '@/components/workspace/WorkspaceContextPanel';
import { KnowledgeFilesPanel } from '@/components/workspace/KnowledgeFilesPanel';
import { useCopilotStatus } from '@/hooks/useCopilotStatus';
import { formatDate, formatRelative } from '@/utils/formatters';
import { getDeployDefaults, type DeployDefaults } from '@/utils/deployDefaults';
import type { WorkspaceMeta, PlanSummary, WorkspaceHealth } from '@/types';

async function fetchWorkspace(id: string): Promise<WorkspaceMeta> {
  const res = await fetch(`/api/workspaces/${id}`);
  if (!res.ok) throw new Error('Failed to fetch workspace');
  return res.json();
}

async function fetchPlans(workspaceId: string): Promise<{ plans: PlanSummary[] }> {
  const res = await fetch(`/api/plans/workspace/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch plans');
  return res.json();
}

export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [templateToCreate, setTemplateToCreate] = useState<string | null>(null);
  const [deployDefaults, setDeployDefaults] = useState<DeployDefaults | null>(() => getDeployDefaults());

  const { data: workspace, isLoading: wsLoading } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => fetchWorkspace(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['plans', workspaceId],
    queryFn: () => fetchPlans(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: copilotData, isLoading: copilotLoading, refetch: refetchCopilot } = useCopilotStatus(workspaceId);

  const plans = plansData?.plans || [];

  // Derive health from plans
  const health: WorkspaceHealth = 
    plans.some((p) => p.status === 'active') ? 'active' : 
    plans.length > 0 ? 'idle' : 'idle';

  if (wsLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-48" />
        <div className="h-32 bg-slate-800 rounded-lg" />
        <div className="h-64 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Workspace not found</p>
        <Link to="/" className="text-violet-400 hover:underline mt-2 inline-block">
          Return to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>

      {/* Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-violet-500/20 rounded-lg">
            <FolderOpen className="text-violet-400" size={32} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{workspace.name}</h1>
              <HealthIndicator health={health} showLabel />
            </div>
            <p className="text-slate-400 mb-4 font-mono text-sm">{workspace.path}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              <Link
                to={`/workspace/${workspaceId}/status`}
                className="inline-flex items-center gap-2 px-3 py-2 bg-slate-700/60 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors text-sm"
              >
                <Activity size={16} />
                Workspace Status
              </Link>
              <Link
                to={`/workspace/${workspaceId}/data-root`}
                className="inline-flex items-center gap-2 px-3 py-2 bg-slate-700/60 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors text-sm"
              >
                <Database size={16} />
                Data Root
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-500" />
                <span className="text-slate-300">{workspace.active_plans.length} active</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-500" />
                <span className="text-slate-400">{workspace.archived_plans.length} archived</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-500" />
                <span className="text-slate-400">Registered {formatDate(workspace.registered_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-500" />
                <span className="text-slate-400">Updated {formatRelative(workspace.last_accessed)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile */}
        {workspace.profile && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-400 mb-3">Codebase Profile</h3>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Code size={16} className="text-slate-500" />
                <span className="text-slate-300">
                  {workspace.profile.total_files?.toLocaleString() || 0} files
                </span>
              </div>
              {workspace.profile.languages?.slice(0, 5).map((lang) => (
                <span
                  key={lang.name}
                  className="px-2 py-1 bg-slate-700/50 rounded text-sm text-slate-300"
                >
                  {lang.name} {lang.percentage}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Copilot Status */}
      <CopilotStatusPanel
        status={copilotData?.status || null}
        isLoading={copilotLoading}
        onRefresh={() => refetchCopilot()}
        onDeploy={() => setShowDeployModal(true)}
      />

      {/* Configuration & Context */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Configuration & Context</h2>
          <p className="text-sm text-slate-400">Manage shared workspace defaults and documentation.</p>
        </div>
        <DeployDefaultsCard
          defaults={deployDefaults}
          onConfigure={() => setShowDefaultsModal(true)}
        />
        <WorkspaceContextPanel
          workspaceId={workspaceId!}
          workspaceName={workspace.name}
        />
        <KnowledgeFilesPanel workspaceId={workspaceId!} />
      </div>

      {/* Plan Templates */}
      <PlanTemplatesPanel
        onSelectTemplate={(templateId) => {
          setTemplateToCreate(templateId);
          setShowCreateForm(true);
        }}
      />

      {/* Plans */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Plans</h2>
          <button
            onClick={() => {
              setTemplateToCreate(null);
              setShowCreateForm(true);
            }}
            className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            New Plan
          </button>
        </div>
        <PlanList plans={plans} workspaceId={workspaceId!} isLoading={plansLoading} />
      </div>

      {/* Create Plan Modal */}
      {showCreateForm && (
        <CreatePlanForm
          workspaceId={workspaceId!}
          initialTemplate={templateToCreate}
          onSuccess={(planId) => {
            setShowCreateForm(false);
            setTemplateToCreate(null);
            queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
            navigate(`/workspace/${workspaceId}/plan/${planId}`);
          }}
          onCancel={() => {
            setShowCreateForm(false);
            setTemplateToCreate(null);
          }}
        />
      )}

      {/* Deploy Modal */}
      <DeployModal
        isOpen={showDeployModal}
        onClose={() => {
          setShowDeployModal(false);
          refetchCopilot();
        }}
        workspaceId={workspaceId!}
        workspacePath={workspace?.path || ''}
      />

      {/* Deploy Defaults Modal */}
      <DeployModal
        isOpen={showDefaultsModal}
        onClose={() => setShowDefaultsModal(false)}
        workspaceId={workspaceId!}
        workspacePath={workspace?.path || ''}
        mode="defaults"
        onDefaultsSaved={(defaults) => setDeployDefaults(defaults)}
      />
    </div>
  );
}
