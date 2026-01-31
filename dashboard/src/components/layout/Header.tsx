import { useState } from 'react';
import { Search, Settings, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ThemeToggle } from '../common/ThemeToggle';
import { SettingsModal } from '../common/SettingsModal';

export function Header() {
  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <>
      <header className="h-14 bg-slate-800 dark:bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 md:px-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search plans, workspaces..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4 ml-4">
          <ThemeToggle className="text-slate-400 hover:text-slate-200 hover:bg-slate-700" />
          <button
            onClick={handleRefresh}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
          
          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-green-300">Live</span>
          </div>
        </div>
      </header>
      
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}
