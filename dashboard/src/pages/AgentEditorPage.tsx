import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Save, 
  Eye, 
  Edit3, 
  Trash2, 
  Upload, 
  RefreshCw,
  Check,
  AlertTriangle,
  Loader2,
  Settings,
  Code,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { FrontmatterEditor } from '@/components/common/FrontmatterEditor';

interface AgentWithContent {
  agent_id: string;
  template_path: string;
  template_hash: string;
  template_updated_at: string;
  content: string;
}

interface AgentDeployment {
  workspace_id: string;
  workspace_name: string;
  deployed_path: string;
  version_hash: string;
  is_customized: boolean;
  last_updated: string;
  sync_status: 'synced' | 'outdated' | 'customized' | 'missing';
}

async function fetchAgent(agentId: string): Promise<{ agent: AgentWithContent }> {
  const res = await fetch(`/api/agents/${agentId}`);
  if (!res.ok) throw new Error('Failed to fetch agent');
  return res.json();
}

async function fetchDeployments(agentId: string): Promise<{ deployments: AgentDeployment[] }> {
  const res = await fetch(`/api/agents/${agentId}/deployments`);
  if (!res.ok) throw new Error('Failed to fetch deployments');
  return res.json();
}

async function updateAgent(agentId: string, content: string): Promise<void> {
  const res = await fetch(`/api/agents/${agentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to update agent');
  }
}

async function deleteAgent(agentId: string): Promise<void> {
  const res = await fetch(`/api/agents/${agentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete agent');
  }
}

async function syncAgent(agentId: string): Promise<{ synced: string[]; skipped: string[]; failed: { workspace_id: string; error: string }[] }> {
  const res = await fetch(`/api/agents/${agentId}/sync`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to sync agent');
  }
  return res.json();
}

async function deployAgent(agentId: string, workspaceIds: string[]): Promise<{ success: string[]; failed: { workspace_id: string; error: string }[] }> {
  const res = await fetch(`/api/agents/${agentId}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_ids: workspaceIds }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to deploy agent');
  }
  return res.json();
}

export function AgentEditorPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [editorTab, setEditorTab] = useState<'code' | 'config'>('code');
  const [content, setContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);
  const [contentInitialized, setContentInitialized] = useState(false);
  
  const { data: agentData, isLoading, error } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => fetchAgent(agentId!),
    enabled: !!agentId,
    staleTime: 1000 * 60,
  });
  
  // Initialize content when data loads
  if (agentData?.agent?.content && !contentInitialized) {
    setContent(agentData.agent.content);
    setContentInitialized(true);
  }
  
  const { data: deploymentsData, refetch: refetchDeployments } = useQuery({
    queryKey: ['agent-deployments', agentId],
    queryFn: () => fetchDeployments(agentId!),
    enabled: !!agentId,
    staleTime: 1000 * 30,
  });
  
  const saveMutation = useMutation({
    mutationFn: () => updateAgent(agentId!, content),
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(agentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      navigate('/agents');
    },
  });
  
  const syncMutation = useMutation({
    mutationFn: () => syncAgent(agentId!),
    onSuccess: () => {
      refetchDeployments();
    },
  });
  
  const deployMutation = useMutation({
    mutationFn: (workspaceIds: string[]) => deployAgent(agentId!, workspaceIds),
    onSuccess: () => {
      setShowDeployModal(false);
      setSelectedWorkspaces([]);
      refetchDeployments();
    },
  });
  
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(newContent !== agentData?.agent?.content);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }
  
  if (error || !agentData) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400">Failed to load agent: {agentId}</p>
          <Link to="/agents" className="text-blue-400 hover:underline mt-2 inline-block">
            ← Back to Agents
          </Link>
        </div>
      </div>
    );
  }
  
  const agent = agentData.agent;
  const deployments = deploymentsData?.deployments || [];
  const syncedCount = deployments.filter(d => d.sync_status === 'synced').length;
  const outdatedCount = deployments.filter(d => d.sync_status === 'outdated').length;
  const customizedCount = deployments.filter(d => d.sync_status === 'customized').length;
  const missingCount = deployments.filter(d => d.sync_status === 'missing').length;
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-700 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              to="/agents" 
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                {agent.agent_id}
                <span className="text-xs font-mono text-slate-500">
                  #{agent.template_hash}
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Last updated: {new Date(agent.template_updated_at).toLocaleString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Editor Tab Toggle */}
            <div className="flex bg-slate-800 rounded-lg p-1 mr-2">
              <button
                onClick={() => setEditorTab('code')}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors',
                  editorTab === 'code' 
                    ? 'bg-slate-700 text-white' 
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Code className="w-4 h-4" />
                Code
              </button>
              <button
                onClick={() => setEditorTab('config')}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors',
                  editorTab === 'config' 
                    ? 'bg-slate-700 text-white' 
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Settings className="w-4 h-4" />
                Config
              </button>
            </div>

            {/* Mode Toggle */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setMode('edit')}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors',
                  mode === 'edit' 
                    ? 'bg-slate-700 text-white' 
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => setMode('preview')}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors',
                  mode === 'preview' 
                    ? 'bg-slate-700 text-white' 
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>
            
            {/* Action Buttons */}
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
              className={cn(
                'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors',
                hasChanges 
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              )}
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>
            
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-2"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sync All
            </button>
            
            <button
              onClick={() => setShowDeployModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Deploy
            </button>
            
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Status Bar */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <span className="flex items-center gap-1.5 text-green-400">
            <Check className="w-4 h-4" />
            {syncedCount} synced
          </span>
          {outdatedCount > 0 && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              {outdatedCount} outdated
            </span>
          )}
          {customizedCount > 0 && (
            <span className="text-blue-400">
              🔧 {customizedCount} customized
            </span>
          )}
          {missingCount > 0 && (
            <span className="text-slate-500">
              ❌ {missingCount} not deployed
            </span>
          )}
          
          {hasChanges && (
            <span className="ml-auto text-amber-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Unsaved changes
            </span>
          )}
        </div>
        
        {/* Mutation Status Messages */}
        {saveMutation.isError && (
          <div className="mt-2 text-sm text-red-400">
            Save failed: {(saveMutation.error as Error).message}
          </div>
        )}
        {saveMutation.isSuccess && !hasChanges && (
          <div className="mt-2 text-sm text-green-400">
            ✓ Changes saved successfully
          </div>
        )}
        {syncMutation.isSuccess && (
          <div className="mt-2 text-sm text-green-400">
            ✓ Sync complete: {syncMutation.data?.synced?.length || 0} updated, {syncMutation.data?.skipped?.length || 0} skipped
          </div>
        )}
      </div>
      
      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden">
        {editorTab === 'config' ? (
          <div className="h-full overflow-auto p-6">
            <FrontmatterEditor
              content={content}
              onChange={handleContentChange}
              agentName={agent.agent_id}
              className="mb-6"
            />
            <div className="text-sm text-slate-400 p-4 bg-slate-800 rounded-lg">
              <h4 className="font-semibold text-slate-300 mb-2">Handoff Configuration Tips</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Handoffs appear as buttons in VS Code Copilot chat</li>
                <li>Use emoji icons in labels for better visibility (e.g., "🔬 Research")</li>
                <li>The prompt field pre-fills the message to the target agent</li>
                <li>Enable "Auto-send" to execute immediately without user confirmation</li>
              </ul>
            </div>
          </div>
        ) : mode === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-full bg-slate-900 text-slate-100 p-6 resize-none font-mono text-sm focus:outline-none"
            spellCheck={false}
            placeholder="Write your agent instructions in Markdown..."
          />
        ) : (
          <div className="h-full overflow-auto p-6">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <Modal onClose={() => setShowDeleteConfirm(false)}>
          <div className="p-6">
            <h2 className="text-xl font-bold text-red-400 mb-4">Delete Agent</h2>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete <strong>{agent.agent_id}</strong>? 
              This agent will be moved to the archive folder.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg flex items-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
      
      {/* Deploy Modal */}
      {showDeployModal && (
        <Modal onClose={() => setShowDeployModal(false)}>
          <div className="p-6 max-w-lg">
            <h2 className="text-xl font-bold mb-4">Deploy to Workspaces</h2>
            <p className="text-slate-400 mb-4 text-sm">
              Select workspaces to deploy <strong>{agent.agent_id}</strong> to:
            </p>
            
            <div className="space-y-2 max-h-64 overflow-auto mb-4">
              {deployments.map((deployment) => (
                <label
                  key={deployment.workspace_id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                    selectedWorkspaces.includes(deployment.workspace_id)
                      ? 'bg-blue-500/20 border border-blue-500/50'
                      : 'bg-slate-800 hover:bg-slate-700'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedWorkspaces.includes(deployment.workspace_id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedWorkspaces([...selectedWorkspaces, deployment.workspace_id]);
                      } else {
                        setSelectedWorkspaces(selectedWorkspaces.filter(id => id !== deployment.workspace_id));
                      }
                    }}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{deployment.workspace_name}</div>
                    <div className="text-xs text-slate-500">
                      {deployment.sync_status === 'missing' 
                        ? 'Not deployed' 
                        : `Status: ${deployment.sync_status}`
                      }
                    </div>
                  </div>
                  <SyncBadge status={deployment.sync_status} />
                </label>
              ))}
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeployModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => deployMutation.mutate(selectedWorkspaces)}
                disabled={selectedWorkspaces.length === 0 || deployMutation.isPending}
                className={cn(
                  'px-4 py-2 rounded-lg flex items-center gap-2',
                  selectedWorkspaces.length > 0 
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                )}
              >
                {deployMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Deploy to {selectedWorkspaces.length} workspace{selectedWorkspaces.length !== 1 ? 's' : ''}
              </button>
            </div>
            
            {deployMutation.isError && (
              <div className="mt-3 text-sm text-red-400">
                Deploy failed: {(deployMutation.error as Error).message}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Simple Modal component
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
        {children}
      </div>
    </div>
  );
}

// Sync status badge
function SyncBadge({ status }: { status: string }) {
  const config = {
    synced: { label: '✅', className: 'text-green-400' },
    outdated: { label: '⚠️', className: 'text-amber-400' },
    customized: { label: '🔧', className: 'text-blue-400' },
    missing: { label: '❌', className: 'text-slate-500' },
  };
  
  const { label, className } = config[status as keyof typeof config] || config.missing;
  
  return <span className={className}>{label}</span>;
}

// Simple Markdown Preview (could be enhanced with a proper markdown library)
function MarkdownPreview({ content }: { content: string }) {
  // Basic markdown rendering - in production, use react-markdown or similar
  const html = content
    // Headers
    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-8 mb-3 text-blue-400">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-8 mb-4 text-white">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-slate-900 p-4 rounded-lg my-4 overflow-x-auto font-mono text-sm"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-slate-900 px-1.5 py-0.5 rounded font-mono text-sm text-blue-300">$1</code>')
    // Lists
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Blockquotes
    .replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-slate-600 pl-4 italic text-slate-400 my-2">$1</blockquote>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/\n/g, '<br/>');
  
  return (
    <div 
      className="prose prose-invert max-w-none text-slate-300 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-4">${html}</p>` }}
    />
  );
}

export default AgentEditorPage;

