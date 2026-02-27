import { SlidersHorizontal, UploadCloud } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { DeployDefaults } from '@/utils/deployDefaults';

interface DeployDefaultsCardProps {
  defaults: DeployDefaults | null;
  onConfigure: () => void;
}

export function DeployDefaultsCard({ defaults, onConfigure }: DeployDefaultsCardProps) {
  const defaultAgents = Array.isArray(defaults?.agents) ? defaults.agents : [];
  const defaultPrompts = Array.isArray(defaults?.prompts) ? defaults.prompts : [];
  const defaultInstructions = Array.isArray(defaults?.instructions) ? defaults.instructions : [];
  const total = defaultAgents.length + defaultPrompts.length + defaultInstructions.length;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-300">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Deploy Defaults</h3>
              <p className="text-xs text-slate-400">Used when deploying to new workspaces</p>
            </div>
          </div>
        </div>
        <button
          onClick={onConfigure}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
            'bg-blue-600/20 text-blue-200 hover:bg-blue-600/30'
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Configure Defaults
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-300">
        <div className="bg-slate-900/60 rounded-lg p-3">
          <div className="text-slate-500">Agents</div>
          <div className="text-base font-semibold text-slate-200">{defaultAgents.length}</div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-3">
          <div className="text-slate-500">Prompts</div>
          <div className="text-base font-semibold text-slate-200">{defaultPrompts.length}</div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-3">
          <div className="text-slate-500">Instructions</div>
          <div className="text-base font-semibold text-slate-200">{defaultInstructions.length}</div>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        {defaults?.updatedAt ? `Last updated ${new Date(defaults.updatedAt).toLocaleString()}` : 'No defaults saved yet.'}
      </div>

      <div className="mt-2 text-xs text-slate-500">
        {total === 0 && defaults ? 'Defaults saved with no selections.' : 'Defaults persist across refreshes.'}
      </div>
    </div>
  );
}

export default DeployDefaultsCard;
