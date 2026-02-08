import { useState, useEffect } from 'react';
import { X, Save, FolderOpen, Server, Palette, Package } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Settings {
  apiUrl: string;
  wsUrl: string;
  dataRoot: string;
  agentsRoot: string;
  theme: 'dark' | 'light' | 'system';
  autoRefresh: boolean;
  refreshInterval: number;
  defaultAgents: string[];
  defaultInstructions: string[];
  autoDeployOnWorkspaceOpen: boolean;
}

interface InstructionFile {
  id: string;
  name: string;
  filename: string;
  applyTo?: string;
  isPathSpecific: boolean;
}

const ALL_AGENTS = [
  'coordinator',
  'analyst',
  'researcher', 
  'architect',
  'executor',
  'reviewer',
  'tester',
  'archivist',
  'revisionist',
  'brainstorm',
];

const defaultSettings: Settings = {
  apiUrl: 'http://localhost:3001',
  wsUrl: 'ws://localhost:3002',
  dataRoot: '',
  agentsRoot: '',
  theme: 'dark',
  autoRefresh: true,
  refreshInterval: 5000,
  defaultAgents: ['coordinator', 'analyst', 'researcher', 'architect', 'executor', 'reviewer', 'tester', 'archivist', 'revisionist', 'brainstorm'],
  defaultInstructions: [],
  autoDeployOnWorkspaceOpen: false,
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<'connection' | 'defaults' | 'appearance' | 'advanced'>('connection');
  const [isSaving, setIsSaving] = useState(false);
  const [availableInstructions, setAvailableInstructions] = useState<InstructionFile[]>([]);
  const [instructionsLoading, setInstructionsLoading] = useState(false);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('pmd-settings');
    if (saved) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(saved) });
      } catch {
        // Use defaults
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setInstructionsLoading(true);
    setInstructionsError(null);

    fetch('/api/instructions')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch instructions');
        }
        return res.json();
      })
      .then((data) => {
        setAvailableInstructions(data.instructions || []);
      })
      .catch((error) => {
        setInstructionsError((error as Error).message);
      })
      .finally(() => {
        setInstructionsLoading(false);
      });
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('pmd-settings', JSON.stringify(settings));
      // Reload to apply changes
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAgent = (agent: string) => {
    const newAgents = settings.defaultAgents.includes(agent)
      ? settings.defaultAgents.filter(a => a !== agent)
      : [...settings.defaultAgents, agent];
    setSettings({ ...settings, defaultAgents: newAgents });
  };

  const toggleInstruction = (instruction: string) => {
    const newInstructions = settings.defaultInstructions.includes(instruction)
      ? settings.defaultInstructions.filter(i => i !== instruction)
      : [...settings.defaultInstructions, instruction];
    setSettings({ ...settings, defaultInstructions: newInstructions });
  };

  const generalInstructions = availableInstructions.filter((instruction) => !instruction.isPathSpecific);

  if (!isOpen) return null;

  const tabs = [
    { id: 'connection' as const, label: 'Connection', icon: Server },
    { id: 'defaults' as const, label: 'Defaults', icon: Package },
    { id: 'appearance' as const, label: 'Appearance', icon: Palette },
    { id: 'advanced' as const, label: 'Advanced', icon: FolderOpen },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-violet-400 border-b-2 border-violet-400'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {activeTab === 'connection' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  API Server URL
                </label>
                <input
                  type="text"
                  value={settings.apiUrl}
                  onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-violet-500"
                  placeholder="http://localhost:3001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  WebSocket URL
                </label>
                <input
                  type="text"
                  value={settings.wsUrl}
                  onChange={(e) => setSettings({ ...settings, wsUrl: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-violet-500"
                  placeholder="ws://localhost:3002"
                />
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Theme
                </label>
                <select
                  value={settings.theme}
                  onChange={(e) => setSettings({ ...settings, theme: e.target.value as Settings['theme'] })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-violet-500"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'defaults' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300">
                      Auto Deploy on Workspace Open
                    </label>
                    <p className="text-xs text-slate-500">Automatically deploy defaults when opening a new workspace</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, autoDeployOnWorkspaceOpen: !settings.autoDeployOnWorkspaceOpen })}
                    className={cn(
                      'relative w-12 h-6 rounded-full transition-colors',
                      settings.autoDeployOnWorkspaceOpen ? 'bg-violet-500' : 'bg-slate-600'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform',
                        settings.autoDeployOnWorkspaceOpen && 'translate-x-6'
                      )}
                    />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Default Agents
                </label>
                <p className="text-xs text-slate-500 mb-3">Select which agents to deploy to new workspaces</p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_AGENTS.map((agent) => (
                    <button
                      key={agent}
                      onClick={() => toggleAgent(agent)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left',
                        settings.defaultAgents.includes(agent)
                          ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                      )}
                    >
                      <span className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center text-xs',
                        settings.defaultAgents.includes(agent)
                          ? 'bg-violet-500 border-violet-500 text-white'
                          : 'border-slate-600'
                      )}>
                        {settings.defaultAgents.includes(agent) && '✓'}
                      </span>
                      <span className="capitalize">{agent}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setSettings({ ...settings, defaultAgents: [...ALL_AGENTS] })}
                    className="text-xs text-violet-400 hover:text-violet-300"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={() => setSettings({ ...settings, defaultAgents: [] })}
                    className="text-xs text-slate-400 hover:text-slate-300"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Default Instructions
                </label>
                <p className="text-xs text-slate-500 mb-3">Select which instruction files to deploy to new workspaces</p>
                {instructionsLoading && (
                  <p className="text-xs text-slate-500">Loading instructions...</p>
                )}
                {instructionsError && (
                  <p className="text-xs text-red-400">{instructionsError}</p>
                )}
                {!instructionsLoading && generalInstructions.length === 0 && !instructionsError && (
                  <p className="text-xs text-slate-500">No general instruction files available.</p>
                )}
                {generalInstructions.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {generalInstructions.map((instruction) => (
                      <button
                        key={instruction.id}
                        onClick={() => toggleInstruction(instruction.id)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left',
                          settings.defaultInstructions.includes(instruction.id)
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                        )}
                      >
                        <span className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center text-xs',
                          settings.defaultInstructions.includes(instruction.id)
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-slate-600'
                        )}>
                          {settings.defaultInstructions.includes(instruction.id) && '✓'}
                        </span>
                        <span>{instruction.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setSettings({ ...settings, defaultInstructions: generalInstructions.map((i) => i.id) })}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={() => setSettings({ ...settings, defaultInstructions: [] })}
                    className="text-xs text-slate-400 hover:text-slate-300"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-slate-300">
                    Auto Refresh
                  </label>
                  <p className="text-xs text-slate-500">Automatically refresh data</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, autoRefresh: !settings.autoRefresh })}
                  className={cn(
                    'relative w-12 h-6 rounded-full transition-colors',
                    settings.autoRefresh ? 'bg-violet-500' : 'bg-slate-600'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform',
                      settings.autoRefresh && 'translate-x-6'
                    )}
                  />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Refresh Interval (ms)
                </label>
                <input
                  type="number"
                  value={settings.refreshInterval}
                  onChange={(e) => setSettings({ ...settings, refreshInterval: parseInt(e.target.value) || 5000 })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-violet-500"
                  min={1000}
                  step={1000}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Data Root Path
                </label>
                <input
                  type="text"
                  value={settings.dataRoot}
                  onChange={(e) => setSettings({ ...settings, dataRoot: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-violet-500"
                  placeholder="Auto-detected from server"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
