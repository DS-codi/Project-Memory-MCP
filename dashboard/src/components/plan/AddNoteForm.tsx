import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { StickyNote, Info, AlertTriangle, MessageSquare } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { PlanNoteType } from '@/types';

interface AddNoteFormProps {
  workspaceId: string;
  planId: string;
  onSuccess?: () => void;
  autoExpand?: boolean;
}

export function AddNoteForm({ workspaceId, planId, onSuccess, autoExpand = false }: AddNoteFormProps) {
  const [note, setNote] = useState('');
  const [type, setType] = useState<PlanNoteType>('info');
  const [isExpanded, setIsExpanded] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (autoExpand) {
      setIsExpanded(true);
    }
  }, [autoExpand]);

  const addNoteMutation = useMutation({
    mutationFn: async (params: { note: string; type: PlanNoteType }) => {
      const res = await axios.post(`/api/plans/${workspaceId}/${planId}/notes`, params);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', workspaceId, planId] });
      setNote('');
      setIsExpanded(false);
      onSuccess?.();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    addNoteMutation.mutate({ note: note.trim(), type });
  };

  const typeIcons = {
    info: <Info size={16} />,
    warning: <AlertTriangle size={16} />,
    instruction: <MessageSquare size={16} />,
  };

  const typeColors = {
    info: 'text-blue-400 hover:bg-blue-900/20 border-blue-500/30',
    warning: 'text-amber-400 hover:bg-amber-900/20 border-amber-500/30',
    instruction: 'text-violet-400 hover:bg-violet-900/20 border-violet-500/30',
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full py-3 px-4 bg-slate-800 border-2 border-dashed border-slate-600 hover:border-violet-500 rounded-lg text-sm text-slate-400 hover:text-violet-300 transition-colors flex items-center justify-center gap-2"
      >
        <StickyNote size={16} />
        Add note for next agent
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <StickyNote size={18} className="text-violet-400" />
        <h4 className="font-semibold">Add Note for Next Agent</h4>
      </div>

      <p className="text-sm text-slate-400 mb-3">
        This note will be included in the next tool response and automatically cleared after delivery.
      </p>

      {/* Note type selector */}
      <div className="flex gap-2 mb-3">
        {(['info', 'warning', 'instruction'] as const).map((noteType) => (
          <button
            key={noteType}
            type="button"
            onClick={() => setType(noteType)}
            className={cn(
              'flex-1 py-2 px-3 border rounded-lg text-sm transition-colors flex items-center justify-center gap-2',
              type === noteType
                ? typeColors[noteType] + ' border-current'
                : 'text-slate-400 border-slate-600 hover:bg-slate-700'
            )}
          >
            {typeIcons[noteType]}
            {noteType}
          </button>
        ))}
      </div>

      {/* Note input */}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Enter your note here (e.g., additional context, instructions, or corrections)..."
        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 mb-3"
        rows={3}
        autoFocus
      />

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            setIsExpanded(false);
            setNote('');
          }}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
          disabled={addNoteMutation.isPending}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!note.trim() || addNoteMutation.isPending}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
        </button>
      </div>

      {addNoteMutation.isError && (
        <p className="mt-2 text-sm text-red-400">
          Failed to add note: {(addNoteMutation.error as Error).message}
        </p>
      )}
    </form>
  );
}
