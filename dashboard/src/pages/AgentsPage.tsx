import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle, 
  AlertCircle, 
  XCircle, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight, 
  Upload, 
  Edit3, 
  Plus,
  Database,
  FileCode
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { CreateAgentForm } from '@/components/agent/CreateAgentForm';
import { agentBgColors, agentIcons } from '@/utils/colors';
import { formatRelative } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import type { AgentType } from '@/types';

interface AgentTemplate {
  agent_id: string;
  template_path: string;
  template_hash: string;
  template_updated_at: string;
}

interface AgentDeployment {
  workspace_id: string;
  workspace_name: string;
  sync_status: 'synced' | 'outdated' | 'customized' | 'missing';
  version_hash: string;
  last_updated: string;
}

interface AgentWithDeployments extends AgentTemplate {
  deployments: AgentDeployment[];
}

interface DbAgent {
  name: string;
  content: string;
  is_permanent: boolean;
  updated_at: string;
}

async function fetchAgents(): Promise<{ agents: AgentTemplate[] }> {
  const res = await fetch('/api/agents');
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

async function fetchDbAgents(): Promise<{ agents: DbAgent[] }> {
  const res = await fetch('/api/agents/db');
  if (!res.ok) throw new Error('Failed to fetch DB agents');
  return res.json();
}

async function fetchDeployments(agentId: string): Promise<{ deployments: AgentDeployment[] }> {
  const res = await fetch(`/api/agents/${agentId}/deployments`);
  if (!res.ok) throw new Error('Failed to fetch deployments');
  return res.json();
}

async function fetchAllAgentsWithDeployments(): Promise<AgentWithDeployments[]> {
  const { agents } = await fetchAgents();
  
  const agentsWithDeployments = await Promise.all(
    agents.map(async (agent) => {
      const { deployments } = await fetchDeployments(agent.agent_id);
      return { ...agent, deployments };
    })
  );
  
  return agentsWithDeployments;
}

const statusConfig = {
  synced: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20', label: 'Synced' },
  outdated: { icon: AlertCircle, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Outdated' },
  customized: { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Customized' },
  missing: { icon: XCircle, color: 'text-slate-400', bg: 'bg-slate-500/20', label: 'Missing' },
};

export function AgentsPage() {
  const [viewMode, setViewViewMode] = useState<'templates' | 'database'>('templates');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const navigate = useNavigate();

  const { 
    data: agents, 
    isLoading: isLoadingTemplates, 
    error: templateError, 
    refetch: refetchTemplates 
  } = useQuery({
    queryKey: ['agents-with-deployments'],
    queryFn: fetchAllAgentsWithDeployments,
    enabled: viewMode === 'templates',
  });

  const {
    data: dbAgentsData,
    isLoading: isLoadingDb,
    error: dbError,
    refetch: refetchDb
  } = useQuery({
    queryKey: ['agents-db'],
    queryFn: fetchDbAgents,
    enabled: viewMode === 'database',
  });

  const handleAgentCreated = (agentId: string) => {
    navigate(`/agents/${agentId}`);
  };

  const error = viewMode === 'templates' ? templateError : dbError;
  const isLoading = viewMode === 'templates' ? isLoadingTemplates : isLoadingDb;

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Failed to load agents</p>
        <p className="text-slate-500 mt-2">Make sure the API server is running</p>
      </div>
    );
  }

  // Get unique workspaces from all deployments
  const workspaces = agents
    ? [...new Set(agents.flatMap((a) => a.deployments.map((d) => d.workspace_name)))]
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Agent Management</h1>
          <p className="text-slate-400">Manage agent instruction files across workspaces and the database</p>
        </div>
        <div className="flex items-center gap-3">
          {viewMode === 'templates' && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus size={16} />
              Create Template
            </button>
          )}
          <button
            onClick={() => viewMode === 'templates' ? refetchTemplates() : refetchDb()}
            className="px-4 py-2 bg-violet-500/20 text-violet-300 rounded-lg hover:bg-violet-500/30 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex p-1 bg-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setViewViewMode('templates')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md transition-all",
            viewMode === 'templates' 
              ? "bg-slate-700 text-white shadow-sm" 
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <FileCode size={18} />
          <span>Templates (Disk)</span>
        </button>
        <button
          onClick={() => setViewViewMode('database')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md transition-all",
            viewMode === 'database' 
              ? "bg-slate-700 text-white shadow-sm" 
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Database size={18} />
          <span>Definitions (DB)</span>
        </button>
      </div>

      {/* Create Agent Modal */}
      {showCreateForm && (
        <CreateAgentForm 
          onClose={() => setShowCreateForm(false)} 
          onSuccess={handleAgentCreated}
        />
      )}

      {/* Agent Grid / List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-4 animate-pulse">
              <div className="h-12 bg-slate-700 rounded mb-3" />
              <div className="h-4 bg-slate-700 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : viewMode === 'templates' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents?.map((agent) => (
            <AgentCard
              key={agent.agent_id}
              agent={agent}
              isSelected={selectedAgent === agent.agent_id}
              onSelect={() => setSelectedAgent(selectedAgent === agent.agent_id ? null : agent.agent_id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dbAgentsData?.agents.map((agent) => (
            <DbAgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      )}

      {/* Deployment Matrix (only for templates) */}
      {viewMode === 'templates' && agents && agents.length > 0 && workspaces.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 overflow-x-auto">
          <h2 className="text-lg font-semibold mb-4">Deployment Matrix</h2>
          <DeploymentMatrix agents={agents} workspaces={workspaces} />
        </div>
      )}

      {/* Selected Agent Details (only for templates) */}
      {viewMode === 'templates' && selectedAgent && agents && (
        <AgentDetails
          agent={agents.find((a) => a.agent_id === selectedAgent)!}
          onClose={() => setSelectedAgent(null)}
          onRefresh={() => refetchTemplates()}
        />
      )}
    </div>
  );
}

function DbAgentCard({ agent }: { agent: DbAgent }) {
  const navigate = useNavigate();
  const agentType = agent.name;
  const icon = agentIcons[agentType as AgentType] || '🤖';
  const bgClass = agentBgColors[agentType as AgentType] || 'bg-slate-500/20 text-slate-300';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-violet-500/50 transition-colors">
      <div className="flex items-center gap-3 mb-4">
        <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center text-2xl', bgClass.split(' ')[0])}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{agentType}</h3>
            {agent.is_permanent && (
              <Badge variant="bg-violet-500/20 text-violet-400">permanent</Badge>
            )}
          </div>
          <span className="text-xs text-slate-500">Updated {formatRelative(agent.updated_at)}</span>
        </div>
      </div>
      
      <div className="flex justify-end">
        <button 
          onClick={() => navigate(`/agents/db/${agent.name}`)}
          className="px-3 py-1.5 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2 text-sm text-white"
        >
          <Edit3 size={14} />
          Edit Definition
        </button>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentWithDeployments;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const agentType = agent.agent_id.charAt(0).toUpperCase() + agent.agent_id.slice(1);
  const icon = agentIcons[agentType as AgentType] || '🤖';
  const bgClass = agentBgColors[agentType as AgentType] || 'bg-slate-500/20 text-slate-300';

  // Calculate deployment stats
  const stats = {
    synced: agent.deployments.filter((d) => d.sync_status === 'synced').length,
    outdated: agent.deployments.filter((d) => d.sync_status === 'outdated').length,
    customized: agent.deployments.filter((d) => d.sync_status === 'customized').length,
    missing: agent.deployments.filter((d) => d.sync_status === 'missing').length,
  };

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full bg-slate-800 border rounded-lg p-4 text-left transition-all',
        isSelected
          ? 'border-violet-500 ring-2 ring-violet-500/20'
          : 'border-slate-700 hover:border-violet-500/50'
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center text-2xl', bgClass.split(' ')[0])}>
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">{agentType}</h3>
          <span className="text-xs text-slate-500 font-mono">{agent.template_hash}</span>
        </div>
        {isSelected ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>

      {/* Status Summary */}
      <div className="flex gap-2 text-xs">
        {stats.synced > 0 && (
          <span className="flex items-center gap-1 text-green-400">
            <CheckCircle size={12} />
            {stats.synced}
          </span>
        )}
        {stats.outdated > 0 && (
          <span className="flex items-center gap-1 text-yellow-400">
            <AlertCircle size={12} />
            {stats.outdated}
          </span>
        )}
        {stats.customized > 0 && (
          <span className="flex items-center gap-1 text-blue-400">
            <RefreshCw size={12} />
            {stats.customized}
          </span>
        )}
        {stats.missing > 0 && (
          <span className="flex items-center gap-1 text-slate-400">
            <XCircle size={12} />
            {stats.missing}
          </span>
        )}
      </div>
    </button>
  );
}

function DeploymentMatrix({
  agents,
  workspaces,
}: {
  agents: AgentWithDeployments[];
  workspaces: string[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left p-2 border-b border-slate-700 text-slate-400">Agent</th>
          {workspaces.map((ws) => (
            <th key={ws} className="p-2 border-b border-slate-700 text-slate-400 text-center">
              <span className="truncate block max-w-[100px]">{ws}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {agents.map((agent) => {
          const agentType = agent.agent_id.charAt(0).toUpperCase() + agent.agent_id.slice(1);
          const icon = agentIcons[agentType as AgentType] || '🤖';

          return (
            <tr key={agent.agent_id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
              <td className="p-2 font-medium">
                <span className="flex items-center gap-2">
                  <span>{icon}</span>
                  {agentType}
                </span>
              </td>
              {workspaces.map((ws) => {
                const deployment = agent.deployments.find((d) => d.workspace_name === ws);
                const status = deployment?.sync_status || 'missing';
                const config = statusConfig[status];
                const Icon = config.icon;

                return (
                  <td key={ws} className="p-2 text-center">
                    <div className={cn('inline-flex items-center justify-center w-8 h-8 rounded-lg', config.bg)}>
                      <Icon size={16} className={config.color} />
                    </div>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AgentDetails({ agent, onClose: _onClose, onRefresh }: { agent: AgentWithDeployments; onClose: () => void; onRefresh: () => void }) {
  const [isDeploying, setIsDeploying] = useState(false);
  const agentType = agent.agent_id.charAt(0).toUpperCase() + agent.agent_id.slice(1);
  const icon = agentIcons[agentType as AgentType] || '🤖';
  const bgClass = agentBgColors[agentType as AgentType] || 'bg-slate-500/20 text-slate-300';
  const navigate = useNavigate();

  const handleDeployAll = async () => {
    setIsDeploying(true);
    try {
      const res = await fetch(`/api/agents/${agent.agent_id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Deployment failed');
      }
      const result = await res.json();
      
      // Show feedback
      if (result.synced?.length > 0 || result.failed?.length > 0) {
        const messages: string[] = [];
        if (result.synced?.length > 0) {
          messages.push(`✓ Synced to ${result.synced.length} workspace(s)`);
        }
        if (result.skipped?.length > 0) {
          messages.push(`⊘ Skipped ${result.skipped.length} customized workspace(s)`);
        }
        if (result.failed?.length > 0) {
          messages.push(`✗ Failed: ${result.failed.map((f: {workspace_id: string; error: string}) => f.error).join(', ')}`);
        }
        alert(messages.join('\n'));
      } else {
        alert('All workspaces are already up to date');
      }
      
      onRefresh();
    } catch (error) {
      console.error('Deploy failed:', error);
      alert(`Deploy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-xl', bgClass.split(' ')[0])}>
            {icon}
          </div>
          <div>
            <h3 className="font-semibold">{agentType} Agent</h3>
            <span className="text-sm text-slate-400">
              Updated {formatRelative(agent.template_updated_at)}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => navigate(`/agents/${agent.agent_id}`)}
            className="px-3 py-1.5 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2 text-sm"
          >
            <Edit3 size={14} />
            Edit Template
          </button>
          <button 
            onClick={handleDeployAll}
            disabled={isDeploying}
            className="px-3 py-1.5 bg-violet-500/20 text-violet-300 rounded-lg hover:bg-violet-500/30 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={14} className={isDeploying ? 'animate-pulse' : ''} />
            {isDeploying ? 'Deploying...' : 'Deploy All'}
          </button>
        </div>
      </div>

      {/* Deployments */}
      <div className="p-4">
        <h4 className="text-sm font-medium text-slate-400 mb-3">Workspace Deployments</h4>
        <div className="space-y-2">
          {agent.deployments.map((deployment) => {
            const status = statusConfig[deployment.sync_status];
            const Icon = status.icon;

            return (
              <div
                key={deployment.workspace_id}
                className="flex items-center justify-between p-3 bg-slate-900 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={status.bg}>
                    <Icon size={12} className={status.color} />
                    <span className={status.color}>{status.label}</span>
                  </Badge>
                  <span className="font-medium">{deployment.workspace_name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {deployment.version_hash && (
                    <span className="text-slate-500 font-mono">{deployment.version_hash}</span>
                  )}
                  {deployment.last_updated && (
                    <span className="text-slate-500">{formatRelative(deployment.last_updated)}</span>
                  )}
                  {deployment.sync_status !== 'synced' && (
                    <button className="px-2 py-1 bg-violet-500/20 text-violet-300 rounded text-xs hover:bg-violet-500/30 transition-colors">
                      {deployment.sync_status === 'missing' ? 'Deploy' : 'Sync'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
