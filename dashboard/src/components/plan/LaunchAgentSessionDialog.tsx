import { useState } from 'react';
import { Bot, Terminal, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useLaunchAgentSession } from '@/hooks/useLaunchAgentSession';

export interface LaunchAgentSessionDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  planId: string;
  /** Scope the session to a specific phase */
  phase?: string;
  /** Scope the session to a specific step */
  stepIndex?: number;
  stepTask?: string;
}

export function LaunchAgentSessionDialog({
  open,
  onClose,
  workspaceId,
  planId,
  phase,
  stepIndex,
  stepTask,
}: LaunchAgentSessionDialogProps) {
  const [provider, setProvider] = useState<'gemini' | 'copilot'>('gemini');
  const { mutate, isPending, isSuccess, isError, error, data, reset } = useLaunchAgentSession();

  if (!open) return null;

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleLaunch = () => {
    mutate({ workspaceId, planId, provider, phase, stepIndex, stepTask });
  };

  const contextLabel = stepTask
    ? `Step #${(stepIndex ?? 0) + 1}: ${stepTask.length > 60 ? stepTask.slice(0, 60) + '…' : stepTask}`
    : phase
    ? `Phase: ${phase}`
    : 'Entire plan';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/60" onClick={handleClose} />

        {/* Modal */}
        <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-emerald-400" />
              <h3 className="text-base font-semibold text-white">Launch Agent Session</h3>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Context scope */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Context scope</p>
              <p className="text-sm text-slate-300 bg-slate-800 rounded-lg px-3 py-2 font-mono break-all">
                {contextLabel}
              </p>
            </div>

            {/* Provider selector */}
            <div>
              <p className="text-xs text-slate-500 mb-2">Provider</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setProvider('gemini')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    provider === 'gemini'
                      ? 'bg-blue-600/30 border-blue-500/60 text-blue-300'
                      : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <Terminal size={14} />
                  Gemini CLI
                </button>
                <button
                  onClick={() => setProvider('copilot')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    provider === 'copilot'
                      ? 'bg-violet-600/30 border-violet-500/60 text-violet-300'
                      : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <Bot size={14} />
                  Copilot CLI
                </button>
              </div>
            </div>

            {/* Error state */}
            {isError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-500/40 rounded-lg text-sm text-red-300">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{error?.message ?? 'Failed to launch agent session'}</span>
              </div>
            )}

            {/* Rejected by IT — accepted: false */}
            {isSuccess && data && !data.accepted && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-500/40 rounded-lg text-sm text-red-300">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{data.error ?? data.message ?? 'Session was rejected by the interactive terminal'}</span>
              </div>
            )}

            {/* Success state */}
            {isSuccess && data && data.accepted && (
              <div className="flex items-start gap-2 px-3 py-2 bg-green-900/20 border border-green-500/40 rounded-lg text-sm text-green-300">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Session started</span>
                  {data.session_id && (
                    <span className="block text-xs text-green-400/70 font-mono mt-0.5">
                      {data.session_id}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              {isSuccess && data?.accepted ? 'Close' : 'Cancel'}
            </button>
            {(!isSuccess || (data && !data.accepted)) && (
              <button
                onClick={handleLaunch}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                {isPending ? 'Launching…' : 'Launch'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
