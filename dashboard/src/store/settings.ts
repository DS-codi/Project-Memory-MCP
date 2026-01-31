import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DashboardSettings {
  // Appearance
  sidebarCollapsed: boolean;
  defaultView: 'grid' | 'list';
  
  // Data refresh
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number; // seconds
  
  // Notifications
  showNotifications: boolean;
  showToastNotifications: boolean;
  notifyOnHandoff: boolean;
  notifyOnPlanComplete: boolean;
  notifyOnStepComplete: boolean;
  
  // Agent settings
  autoDeployOnSave: boolean;
  confirmBeforeDeploy: boolean;
  
  // Performance
  maxActivityItems: number;
  maxSearchResults: number;
}

interface SettingsStore extends DashboardSettings {
  // Actions
  setSetting: <K extends keyof DashboardSettings>(key: K, value: DashboardSettings[K]) => void;
  resetSettings: () => void;
}

const defaultSettings: DashboardSettings = {
  sidebarCollapsed: false,
  defaultView: 'grid',
  autoRefreshEnabled: true,
  autoRefreshInterval: 30,
  showNotifications: true,
  showToastNotifications: true,
  notifyOnHandoff: true,
  notifyOnPlanComplete: true,
  notifyOnStepComplete: true,
  autoDeployOnSave: false,
  confirmBeforeDeploy: true,
  maxActivityItems: 50,
  maxSearchResults: 20,
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      
      setSetting: (key, value) => set({ [key]: value }),
      
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'memory-observer-settings',
    }
  )
);

// Alias for backwards compatibility
export const useSettingsStore = useSettings;

export default useSettings;
