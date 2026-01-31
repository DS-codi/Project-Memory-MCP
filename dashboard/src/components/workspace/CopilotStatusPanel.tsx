import { CheckCircle, AlertCircle, XCircle, Upload, RefreshCw, FileText, BookOpen, Users } from 'lucide-react';
import { cn } from '@/utils/cn';
import { CopilotStatus } from '@/types';

interface CopilotStatusPanelProps {
  status: CopilotStatus | null;
  isLoading?: boolean;
  onDeploy?: () => void;
  onRefresh?: () => void;
  className?: string;
}

interface StatusItemProps {
  label: string;
  icon: React.ReactNode;
  status: 'success' | 'warning' | 'error' | 'none';
  count?: number;
  detail?: string;
}

function StatusItem({ label, icon, status, count, detail }: StatusItemProps) {
  const statusConfig = {
    success: { color: 'text-green-400', bg: 'bg-green-500/10', icon: <CheckCircle className="w-4 h-4" /> },
    warning: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: <AlertCircle className="w-4 h-4" /> },
    error: { color: 'text-red-400', bg: 'bg-red-500/10', icon: <XCircle className="w-4 h-4" /> },
    none: { color: 'text-slate-400', bg: 'bg-slate-500/10', icon: null },
  };

  const config = statusConfig[status];

  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-lg', config.bg)}>
      <div className={cn('flex-shrink-0', config.color)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">{label}</span>
          {count !== undefined && (
            <span className={cn('text-xs px-1.5 py-0.5 rounded', config.color, config.bg)}>
              {count}
            </span>
          )}
        </div>
        {detail && (
          <p className="text-xs text-slate-400 truncate">{detail}</p>
        )}
      </div>
      <div className={config.color}>
        {config.icon}
      </div>
    </div>
  );
}

export function CopilotStatusPanel({ 
  status, 
  isLoading, 
  onDeploy, 
  onRefresh,
  className 
}: CopilotStatusPanelProps) {
  if (isLoading) {
    return (
      <div className={cn('bg-slate-800 rounded-lg p-4', className)}>
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
          <span className="text-sm text-slate-400">Checking Copilot status...</span>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={cn('bg-slate-800 rounded-lg p-4', className)}>
        <p className="text-sm text-slate-400">Unable to load Copilot status</p>
      </div>
    );
  }

  const overallStatus = status.hasAgents && status.hasPrompts && status.hasInstructions
    ? 'success'
    : status.hasAgents
    ? 'warning'
    : 'error';

  const overallLabel = {
    success: 'Fully Configured',
    warning: 'Partially Configured',
    error: 'Not Configured',
  }[overallStatus];

  return (
    <div className={cn('bg-slate-800 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <div>
            <h3 className="font-semibold text-sm">VS Code Copilot</h3>
            <p className={cn('text-xs', {
              'text-green-400': overallStatus === 'success',
              'text-amber-400': overallStatus === 'warning',
              'text-red-400': overallStatus === 'error',
            })}>
              {overallLabel}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
          )}
          {onDeploy && (
            <button
              onClick={onDeploy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Deploy
            </button>
          )}
        </div>
      </div>

      {/* Status Items */}
      <div className="p-3 space-y-2">
        <StatusItem
          label="Agents"
          icon={<Users className="w-4 h-4" />}
          status={status.hasAgents ? (status.outdatedAgents > 0 ? 'warning' : 'success') : 'error'}
          count={status.agentCount}
          detail={status.outdatedAgents > 0 ? `${status.outdatedAgents} outdated` : undefined}
        />
        
        <StatusItem
          label="Prompts"
          icon={<FileText className="w-4 h-4" />}
          status={status.hasPrompts ? 'success' : 'none'}
          count={status.promptCount}
          detail={status.hasPrompts ? 'Workflow templates available' : 'No prompts configured'}
        />
        
        <StatusItem
          label="Instructions"
          icon={<BookOpen className="w-4 h-4" />}
          status={status.hasInstructions ? 'success' : 'none'}
          count={status.instructionCount}
          detail={status.hasInstructions ? 'Coding guidelines active' : 'No instructions configured'}
        />
      </div>

      {/* Missing Files Warning */}
      {status.missingFiles && status.missingFiles.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-400 mb-2">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-semibold">Missing Files</span>
            </div>
            <ul className="text-xs text-slate-400 space-y-1">
              {status.missingFiles.slice(0, 5).map((file, i) => (
                <li key={i} className="truncate">• {file}</li>
              ))}
              {status.missingFiles.length > 5 && (
                <li className="text-slate-500">
                  +{status.missingFiles.length - 5} more...
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default CopilotStatusPanel;
