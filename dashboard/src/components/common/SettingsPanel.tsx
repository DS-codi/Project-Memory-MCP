import { useState } from 'react';
import { 
  Settings, 
  X, 
  Monitor, 
  Bell, 
  RefreshCw, 
  Bot, 
  Gauge,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useSettings, type DashboardSettings } from '@/store/settings';

interface SettingsStore extends DashboardSettings {
  setSetting: <K extends keyof DashboardSettings>(key: K, value: DashboardSettings[K]) => void;
  resetSettings: () => void;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsSection = 'appearance' | 'refresh' | 'notifications' | 'agents' | 'performance';

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const settings = useSettings();

  if (!isOpen) return null;

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'appearance', label: 'Appearance', icon: <Monitor className="w-4 h-4" /> },
    { id: 'refresh', label: 'Auto Refresh', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'agents', label: 'Agents', icon: <Bot className="w-4 h-4" /> },
    { id: 'performance', label: 'Performance', icon: <Gauge className="w-4 h-4" /> },
  ];

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-2xl max-h-[80vh] overflow-hidden flex"
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-48 bg-slate-900 border-r border-slate-700 py-4">
          <div className="px-4 mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Settings
            </h2>
          </div>
          <nav className="space-y-1 px-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeSection === section.id
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                )}
              >
                {section.icon}
                {section.label}
              </button>
            ))}
          </nav>
          
          <div className="mt-auto px-2 pt-4 border-t border-slate-700 mt-4">
            <button
              onClick={settings.resetSettings}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h3 className="font-semibold">
              {sections.find(s => s.id === activeSection)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {activeSection === 'appearance' && (
              <AppearanceSettings settings={settings} />
            )}
            {activeSection === 'refresh' && (
              <RefreshSettings settings={settings} />
            )}
            {activeSection === 'notifications' && (
              <NotificationSettings settings={settings} />
            )}
            {activeSection === 'agents' && (
              <AgentSettings settings={settings} />
            )}
            {activeSection === 'performance' && (
              <PerformanceSettings settings={settings} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Setting Components
function SettingRow({ 
  label, 
  description, 
  children 
}: { 
  label: string; 
  description?: string; 
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-700 last:border-0">
      <div>
        <div className="font-medium">{label}</div>
        {description && (
          <div className="text-sm text-slate-400 mt-0.5">{description}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ 
  checked, 
  onChange 
}: { 
  checked: boolean; 
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'w-11 h-6 rounded-full transition-colors relative',
        checked ? 'bg-blue-500' : 'bg-slate-600'
      )}
    >
      <span
        className={cn(
          'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}

function Select({ 
  value, 
  options, 
  onChange 
}: { 
  value: string | number; 
  options: { value: string | number; label: string }[];
  onChange: (value: string | number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// Section Components
function AppearanceSettings({ settings }: { settings: SettingsStore }) {
  return (
    <div>
      <SettingRow 
        label="Default View" 
        description="Choose how items are displayed by default"
      >
        <Select
          value={settings.defaultView}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'List' },
          ]}
          onChange={(v) => settings.setSetting('defaultView', v as 'grid' | 'list')}
        />
      </SettingRow>
      
      <SettingRow 
        label="Collapse Sidebar by Default" 
        description="Start with a compact sidebar"
      >
        <Toggle
          checked={settings.sidebarCollapsed}
          onChange={(v) => settings.setSetting('sidebarCollapsed', v)}
        />
      </SettingRow>
    </div>
  );
}

function RefreshSettings({ settings }: { settings: SettingsStore }) {
  return (
    <div>
      <SettingRow 
        label="Auto Refresh" 
        description="Automatically refresh data at regular intervals"
      >
        <Toggle
          checked={settings.autoRefreshEnabled}
          onChange={(v) => settings.setSetting('autoRefreshEnabled', v)}
        />
      </SettingRow>
      
      <SettingRow 
        label="Refresh Interval" 
        description="How often to refresh data (in seconds)"
      >
        <Select
          value={settings.autoRefreshInterval}
          options={[
            { value: 10, label: '10 seconds' },
            { value: 30, label: '30 seconds' },
            { value: 60, label: '1 minute' },
            { value: 120, label: '2 minutes' },
            { value: 300, label: '5 minutes' },
          ]}
          onChange={(v) => settings.setSetting('autoRefreshInterval', Number(v))}
        />
      </SettingRow>
    </div>
  );
}

function NotificationSettings({ settings }: { settings: SettingsStore }) {
  return (
    <div>
      <SettingRow 
        label="Show Toast Notifications" 
        description="Display popup notifications for events"
      >
        <Toggle
          checked={settings.showToastNotifications}
          onChange={(v) => settings.setSetting('showToastNotifications', v)}
        />
      </SettingRow>
      
      <SettingRow 
        label="Notify on Handoff" 
        description="Show notification when agents hand off"
      >
        <Toggle
          checked={settings.notifyOnHandoff}
          onChange={(v) => settings.setSetting('notifyOnHandoff', v)}
        />
      </SettingRow>
      
      <SettingRow 
        label="Notify on Plan Complete" 
        description="Show notification when a plan is completed"
      >
        <Toggle
          checked={settings.notifyOnPlanComplete}
          onChange={(v) => settings.setSetting('notifyOnPlanComplete', v)}
        />
      </SettingRow>
    </div>
  );
}

function AgentSettings({ settings }: { settings: SettingsStore }) {
  return (
    <div>
      <SettingRow 
        label="Auto-Deploy on Save" 
        description="Automatically deploy agents when template is saved"
      >
        <Toggle
          checked={settings.autoDeployOnSave}
          onChange={(v) => settings.setSetting('autoDeployOnSave', v)}
        />
      </SettingRow>
      
      <SettingRow 
        label="Confirm Before Deploy" 
        description="Show confirmation dialog before deploying"
      >
        <Toggle
          checked={settings.confirmBeforeDeploy}
          onChange={(v) => settings.setSetting('confirmBeforeDeploy', v)}
        />
      </SettingRow>
    </div>
  );
}

function PerformanceSettings({ settings }: { settings: SettingsStore }) {
  return (
    <div>
      <SettingRow 
        label="Max Activity Items" 
        description="Maximum number of items in activity feed"
      >
        <Select
          value={settings.maxActivityItems}
          options={[
            { value: 25, label: '25 items' },
            { value: 50, label: '50 items' },
            { value: 100, label: '100 items' },
            { value: 200, label: '200 items' },
          ]}
          onChange={(v) => settings.setSetting('maxActivityItems', Number(v))}
        />
      </SettingRow>
      
      <SettingRow 
        label="Max Search Results" 
        description="Maximum number of search results to display"
      >
        <Select
          value={settings.maxSearchResults}
          options={[
            { value: 10, label: '10 results' },
            { value: 20, label: '20 results' },
            { value: 50, label: '50 results' },
          ]}
          onChange={(v) => settings.setSetting('maxSearchResults', Number(v))}
        />
      </SettingRow>
    </div>
  );
}

export default SettingsPanel;
