import { useState, useEffect } from 'react';
import { X, Save, FolderOpen, Server, Palette } from 'lucide-react';
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
}

const defaultSettings: Settings = {
  apiUrl: 'http://localhost:3001',
  wsUrl: 'ws://localhost:3002',
  dataRoot: '',
  agentsRoot: '',
  theme: 'dark',
  autoRefresh: true,
  refreshInterval: 5000,
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<'connection' | 'appearance' | 'advanced'>('connection');
  const [isSaving, setIsSaving] = useState(false);

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

  if (!isOpen) return null;

  const tabs = [
    { id: 'connection' as const, label: 'Connection', icon: Server },
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
