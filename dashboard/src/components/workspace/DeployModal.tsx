import { useState, useEffect } from 'react';
import { X, Upload, Users, FileText, BookOpen, Check } from 'lucide-react';
import { cn } from '@/utils/cn';

interface DeployableItem {
  id: string;
  name: string;
  filename: string;
}

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspacePath: string;
}

export function DeployModal({ isOpen, onClose, workspaceId, workspacePath }: DeployModalProps) {
  const [agents, setAgents] = useState<DeployableItem[]>([]);
  const [prompts, setPrompts] = useState<DeployableItem[]>([]);
  const [instructions, setInstructions] = useState<DeployableItem[]>([]);
  
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set());
  const [selectedInstructions, setSelectedInstructions] = useState<Set<string>>(new Set());
  
  const [isLoading, setIsLoading] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch available items
  useEffect(() => {
    if (!isOpen) return;
    
    setIsLoading(true);
    Promise.all([
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/prompts').then(r => r.json()),
      fetch('/api/instructions').then(r => r.json()),
    ]).then(([agentsData, promptsData, instructionsData]) => {
      setAgents(agentsData.agents || []);
      setPrompts(promptsData.prompts || []);
      setInstructions(instructionsData.instructions || []);
      
      // Pre-select all by default
      setSelectedAgents(new Set((agentsData.agents || []).map((a: DeployableItem) => a.id)));
      setSelectedPrompts(new Set((promptsData.prompts || []).map((p: DeployableItem) => p.id)));
      setSelectedInstructions(new Set((instructionsData.instructions || []).map((i: DeployableItem) => i.id)));
      
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, [isOpen]);

  const toggleItem = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const newSet = new Set(set);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setFn(newSet);
  };

  const selectAll = (items: DeployableItem[], setFn: (s: Set<string>) => void) => {
    setFn(new Set(items.map(i => i.id)));
  };

  const selectNone = (setFn: (s: Set<string>) => void) => {
    setFn(new Set());
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setDeployResult(null);
    
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          workspace_path: workspacePath,
          agents: Array.from(selectedAgents),
          prompts: Array.from(selectedPrompts),
          instructions: Array.from(selectedInstructions),
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setDeployResult({
          success: true,
          message: `Deployed ${data.agents || 0} agents, ${data.prompts || 0} prompts, ${data.instructions || 0} instructions`,
        });
      } else {
        setDeployResult({
          success: false,
          message: data.error || 'Deployment failed',
        });
      }
    } catch (error) {
      setDeployResult({
        success: false,
        message: 'Network error during deployment',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  if (!isOpen) return null;

  const totalSelected = selectedAgents.size + selectedPrompts.size + selectedInstructions.size;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-white">Deploy to Workspace</h2>
            <p className="text-sm text-slate-400">Select items to deploy to {workspacePath.split(/[/\\]/).pop()}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
            </div>
          ) : (
            <>
              {/* Agents Section */}
              <Section
                title="Agents"
                icon={<Users className="w-4 h-4" />}
                items={agents}
                selected={selectedAgents}
                onToggle={(id) => toggleItem(selectedAgents, setSelectedAgents, id)}
                onSelectAll={() => selectAll(agents, setSelectedAgents)}
                onSelectNone={() => selectNone(setSelectedAgents)}
                color="violet"
              />

              {/* Prompts Section */}
              <Section
                title="Prompts"
                icon={<FileText className="w-4 h-4" />}
                items={prompts}
                selected={selectedPrompts}
                onToggle={(id) => toggleItem(selectedPrompts, setSelectedPrompts, id)}
                onSelectAll={() => selectAll(prompts, setSelectedPrompts)}
                onSelectNone={() => selectNone(setSelectedPrompts)}
                color="blue"
              />

              {/* Instructions Section */}
              <Section
                title="Instructions"
                icon={<BookOpen className="w-4 h-4" />}
                items={instructions}
                selected={selectedInstructions}
                onToggle={(id) => toggleItem(selectedInstructions, setSelectedInstructions, id)}
                onSelectAll={() => selectAll(instructions, setSelectedInstructions)}
                onSelectNone={() => selectNone(setSelectedInstructions)}
                color="amber"
              />
            </>
          )}

          {/* Deploy Result */}
          {deployResult && (
            <div className={cn(
              'p-3 rounded-lg',
              deployResult.success ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
            )}>
              {deployResult.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-800/50">
          <span className="text-sm text-slate-400">
            {totalSelected} items selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeploy}
              disabled={isDeploying || totalSelected === 0}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              {isDeploying ? 'Deploying...' : 'Deploy Selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  items: DeployableItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  color: 'violet' | 'blue' | 'amber';
}

function Section({ title, icon, items, selected, onToggle, onSelectAll, onSelectNone, color }: SectionProps) {
  const colorClasses = {
    violet: {
      bg: 'bg-violet-500/20',
      border: 'border-violet-500',
      text: 'text-violet-300',
      check: 'bg-violet-500',
    },
    blue: {
      bg: 'bg-blue-500/20',
      border: 'border-blue-500',
      text: 'text-blue-300',
      check: 'bg-blue-500',
    },
    amber: {
      bg: 'bg-amber-500/20',
      border: 'border-amber-500',
      text: 'text-amber-300',
      check: 'bg-amber-500',
    },
  }[color];

  if (items.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="font-medium text-slate-300">{title}</h3>
          <span className="text-xs text-slate-500">(none available)</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-medium text-slate-300">{title}</h3>
          <span className="text-xs text-slate-500">({selected.size}/{items.length})</span>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={onSelectAll} className={cn('hover:underline', colorClasses.text)}>
            All
          </button>
          <span className="text-slate-600">|</span>
          <button onClick={onSelectNone} className="text-slate-400 hover:text-slate-300">
            None
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors text-sm',
              selected.has(item.id)
                ? `${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
            )}
          >
            <span className={cn(
              'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
              selected.has(item.id)
                ? `${colorClasses.check} border-transparent text-white`
                : 'border-slate-600'
            )}>
              {selected.has(item.id) && <Check className="w-3 h-3" />}
            </span>
            <span className="truncate">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default DeployModal;
