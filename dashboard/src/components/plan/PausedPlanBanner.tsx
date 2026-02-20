import { useState } from 'react';
import { PauseCircle, Play, Clock, AlertTriangle, Timer, FileQuestion } from 'lucide-react';
import { Badge } from '../common/Badge';
import { formatRelative, formatDateTime } from '@/utils/formatters';
import type { PausedAtSnapshot } from '@/types';

interface PausedPlanBannerProps {
  snapshot: PausedAtSnapshot;
  onResume: () => void;
  isResuming?: boolean;
}

const reasonLabels: Record<PausedAtSnapshot['reason'], { label: string; icon: React.ReactNode; color: string }> = {
  rejected: {
    label: 'Rejected by user',
    icon: <AlertTriangle size={16} />,
    color: 'text-red-400',
  },
  timeout: {
    label: 'Approval timed out',
    icon: <Timer size={16} />,
    color: 'text-amber-400',
  },
  deferred: {
    label: 'Deferred for later',
    icon: <FileQuestion size={16} />,
    color: 'text-blue-400',
  },
};

export function PausedPlanBanner({ snapshot, onResume, isResuming }: PausedPlanBannerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const reasonInfo = reasonLabels[snapshot.reason] ?? reasonLabels.deferred;

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <PauseCircle size={22} className="text-yellow-400" />
          <div>
            <h3 className="font-semibold text-yellow-200">Plan Paused</h3>
            <p className="text-sm text-yellow-300/70">
              Paused {formatRelative(snapshot.paused_at)}
            </p>
          </div>
        </div>
        <button
          onClick={onResume}
          disabled={isResuming}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play size={16} />
          {isResuming ? 'Resuming...' : 'Resume Plan'}
        </button>
      </div>

      {/* Pause context summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Reason:</span>
          <span className={`flex items-center gap-1 ${reasonInfo.color}`}>
            {reasonInfo.icon}
            {reasonInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Paused at step:</span>
          <Badge variant="slate">#{snapshot.step_index + 1}</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Phase:</span>
          <Badge variant="slate">{snapshot.phase}</Badge>
        </div>
      </div>

      {/* Step task */}
      <div className="bg-slate-800/60 rounded p-3 text-sm text-slate-300 mb-2">
        <span className="text-slate-500">Step task: </span>
        {snapshot.step_task}
      </div>

      {/* User notes */}
      {snapshot.user_notes && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-sm text-red-300">
          <span className="text-red-400 font-medium">User notes: </span>
          {snapshot.user_notes}
        </div>
      )}

      {/* Expandable details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mt-2 text-xs text-yellow-400/60 hover:text-yellow-400 transition-colors"
      >
        {showDetails ? '▾ Hide details' : '▸ Show details'}
      </button>

      {showDetails && (
        <div className="mt-2 text-xs text-slate-400 space-y-1">
          <div className="flex items-center gap-2">
            <Clock size={12} />
            <span>Paused at: {formatDateTime(snapshot.paused_at)}</span>
          </div>
          {snapshot.session_id && (
            <div>Session: <code className="text-slate-500">{snapshot.session_id}</code></div>
          )}
        </div>
      )}
    </div>
  );
}
