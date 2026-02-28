import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderOpen, Calendar, Code, FileText, Plus, Activity, Database, FolderTree } from 'lucide-react';
import { PlanList } from '@/components/plan/PlanList';
import { CreatePlanForm } from '@/components/plan/CreatePlanForm';
import { PlanTemplatesPanel } from '@/components/plan/PlanTemplatesPanel';
import { ProgramTreeView } from '@/components/program/ProgramTreeView';
import { ProgramCreateForm } from '@/components/program/ProgramCreateForm';
import { HealthIndicator } from '@/components/workspace/HealthIndicator';
import { CopilotStatusPanel } from '@/components/workspace/CopilotStatusPanel';
import { DeployModal } from '@/components/workspace/DeployModal';
import { DeployDefaultsCard } from '@/components/workspace/DeployDefaultsCard';
import { WorkspaceContextPanel } from '@/components/workspace/WorkspaceContextPanel';
import { KnowledgeFilesPanel } from '@/components/workspace/KnowledgeFilesPanel';
import { useCopilotStatus } from '@/hooks/useCopilotStatus';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { formatDate, formatRelative } from '@/utils/formatters';
import { getDeployDefaults, type DeployDefaults } from '@/utils/deployDefaults';
import type { WorkspaceMeta, WorkspaceHealth } from '@/types';

async function fetchWorkspace(id: string): Promise<WorkspaceMeta> {
  const res = await fetch(`/api/workspaces/${id}`);
  if (!res.ok) throw new Error('Failed to fetch workspace');
  return res.json();
}

async function updateWorkspaceDisplayName(id: string, displayName: string): Promise<WorkspaceMeta> {
  const res = await fetch(`/api/workspaces/${id}/display-name`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ display_name: displayName }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.error === 'string' ? error.error : 'Failed to update workspace display name');
  }

  const data = await res.json() as { workspace: WorkspaceMeta };
  return data.workspace;
}

export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [templateToCreate, setTemplateToCreate] = useState<string | null>(null);
  const [deployDefaults, setDeployDefaults] = useState<DeployDefaults | null>(() => getDeployDefaults());
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);

  const { data: workspace, isLoading: wsLoading } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => fetchWorkspace(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: plansData, isLoading: plansLoading } = usePlans(workspaceId);

  const { data: copilotData, isLoading: copilotLoading, refetch: refetchCopilot } = useCopilotStatus(workspaceId);

  const { data: programsData } = usePrograms(workspaceId);

  const allPlans = plansData?.plans || [];
  // Filter out program containers from the regular plan list
  const plans = allPlans.filter(p => !p.is_program);
  const programs = programsData?.programs || [];

  // Derive health from plans
  const health: WorkspaceHealth = 
    allPlans.some((p) => p.status === 'active') ? 'active' : 
    allPlans.length > 0 ? 'idle' : 'idle';

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

  const workspaceCounts = workspace as WorkspaceMeta & {
    active_plan_count?: number;
    archived_plan_count?: number;
  };
  const activePlanCount = Array.isArray(workspace.active_plans)
    ? workspace.active_plans.length
    : (typeof workspaceCounts.active_plan_count === 'number' ? workspaceCounts.active_plan_count : 0);
  const archivedPlanCount = Array.isArray(workspace.archived_plans)
    ? workspace.archived_plans.length
    : (typeof workspaceCounts.archived_plan_count === 'number' ? workspaceCounts.archived_plan_count : 0);

  const currentDisplayName = workspace.name;
  const trimmedDraftDisplayName = draftDisplayName.trim();
  const hasDisplayNameChanged = trimmedDraftDisplayName.length > 0 && trimmedDraftDisplayName !== currentDisplayName;

  const startEditDisplayName = () => {
    setDraftDisplayName(currentDisplayName);
    setDisplayNameError(null);
    setIsEditingDisplayName(true);
  };

  const cancelEditDisplayName = () => {
    setDraftDisplayName(currentDisplayName);
    setDisplayNameError(null);
    setIsEditingDisplayName(false);
  };

  const saveDisplayName = async () => {
    const nextDisplayName = draftDisplayName.trim();
    if (!nextDisplayName) {
      setDisplayNameError('Display name is required');
      return;
    }

    if (nextDisplayName === currentDisplayName) {
      setIsEditingDisplayName(false);
      setDisplayNameError(null);
      return;
    }

    setIsSavingDisplayName(true);
    setDisplayNameError(null);

    try {
      await updateWorkspaceDisplayName(workspaceId!, nextDisplayName);
      setIsEditingDisplayName(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update workspace display name';
      setDisplayNameError(message);
    } finally {
      setIsSavingDisplayName(false);
    }
  };

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
              {isEditingDisplayName ? (
                <div className="flex flex-wrap items-center gap-2 w-full">
                  <input
                    value={draftDisplayName}
                    onChange={(event) => {
                      setDraftDisplayName(event.target.value);
                      if (displayNameError) {
                        setDisplayNameError(null);
                      }
                    }}
                    className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-lg font-semibold w-full max-w-xl"
                    disabled={isSavingDisplayName}
                    aria-label="Workspace display name"
                  />
                  <button
                    onClick={() => void saveDisplayName()}
                    disabled={isSavingDisplayName || !hasDisplayNameChanged}
                    className="px-3 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isSavingDisplayName ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEditDisplayName}
                    disabled={isSavingDisplayName}
                    className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold">{currentDisplayName}</h1>
                  <button
                    onClick={startEditDisplayName}
                    className="px-2 py-1 bg-slate-700/70 text-slate-200 rounded-md hover:bg-slate-600 transition-colors text-xs"
                  >
                    Edit name
                  </button>
                </>
              )}
              <HealthIndicator health={health} showLabel />
            </div>
            {displayNameError && (
              <p className="text-sm text-red-400 mb-2">{displayNameError}</p>
            )}
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
                <span className="text-slate-300">{activePlanCount} active</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-500" />
                <span className="text-slate-400">{archivedPlanCount} archived</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-500" />
                <span className="text-slate-400">Registered {formatDate(workspace.registered_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-500" />
                <span className="text-slate-400">Updated {formatRelative(workspace.last_activity)}</span>
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

      {/* Integrated Programs */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FolderTree size={20} className="text-violet-400" />
          <h2 className="text-lg font-semibold">Integrated Programs</h2>
          {programs.length > 0 && (
            <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
              {programs.length}
            </span>
          )}
          <button
            onClick={() => setShowCreateProgram(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Create Program
          </button>
        </div>
        {programs.length > 0 ? (
          <ProgramTreeView programs={programs} workspaceId={workspaceId!} />
        ) : (
          <p className="text-sm text-slate-500">No programs yet. Create one to group related plans.</p>
        )}
      </div>

      {showCreateProgram && (
        <ProgramCreateForm
          workspaceId={workspaceId!}
          plans={plans}
          onClose={() => setShowCreateProgram(false)}
          onCreated={(programId) => navigate(`/workspace/${workspaceId}/program/${programId}`)}
        />
      )}

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
        <PlanList plans={plans} workspaceId={workspaceId!} isLoading={plansLoading} programs={programs} />
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
