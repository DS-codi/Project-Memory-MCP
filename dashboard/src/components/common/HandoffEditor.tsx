import { useState } from 'react';
import { Plus, Trash2, GripVertical, Send, ArrowRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { HandoffEntry } from '@/types';

const AGENT_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'coordinator', label: 'Coordinator', icon: '🎯' },
  { value: 'researcher', label: 'Researcher', icon: '🔬' },
  { value: 'architect', label: 'Architect', icon: '📐' },
  { value: 'executor', label: 'Executor', icon: '⚙️' },
  { value: 'reviewer', label: 'Reviewer', icon: '🔍' },
  { value: 'tester', label: 'Tester', icon: '🧪' },
  { value: 'revisionist', label: 'Revisionist', icon: '🔄' },
  { value: 'archivist', label: 'Archivist', icon: '📦' },
];

interface HandoffEditorProps {
  handoffs: HandoffEntry[];
  onChange: (handoffs: HandoffEntry[]) => void;
  currentAgent?: string;
  className?: string;
}

export function HandoffEditor({ handoffs, onChange, currentAgent, className }: HandoffEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const addHandoff = () => {
    const newHandoff: HandoffEntry = {
      label: 'New Handoff',
      agent: 'coordinator',
      prompt: 'Describe the task:',
      send: false,
    };
    onChange([...handoffs, newHandoff]);
  };

  const updateHandoff = (index: number, updates: Partial<HandoffEntry>) => {
    const updated = [...handoffs];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeHandoff = (index: number) => {
    onChange(handoffs.filter((_, i) => i !== index));
  };

  const moveHandoff = (fromIndex: number, toIndex: number) => {
    const updated = [...handoffs];
    const [removed] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, removed);
    onChange(updated);
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      moveHandoff(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Handoff Configuration</h3>
        <button
          onClick={addHandoff}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Handoff
        </button>
      </div>

      {handoffs.length === 0 ? (
        <div className="text-center py-8 text-slate-500 border border-dashed border-slate-700 rounded-lg">
          <p className="text-sm">No handoffs configured</p>
          <p className="text-xs mt-1">Add handoffs to enable agent-to-agent transitions in Copilot</p>
        </div>
      ) : (
        <div className="space-y-2">
          {handoffs.map((handoff, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                'bg-slate-800 rounded-lg border transition-all',
                dragIndex === index
                  ? 'border-blue-500 opacity-50'
                  : 'border-slate-700 hover:border-slate-600'
              )}
            >
              <div className="p-3">
                {/* Header with drag handle and delete */}
                <div className="flex items-center gap-2 mb-3">
                  <GripVertical className="w-4 h-4 text-slate-500 cursor-move" />
                  
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={handoff.label}
                      onChange={(e) => updateHandoff(index, { label: e.target.value })}
                      placeholder="Button label..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    onClick={() => removeHandoff(index)}
                    className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Agent selector and flow visualization */}
                <div className="flex items-center gap-3 mb-3">
                  {currentAgent && (
                    <>
                      <span className="text-xs text-slate-400 px-2 py-1 bg-slate-900 rounded">
                        {currentAgent}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                    </>
                  )}
                  
                  <select
                    value={handoff.agent}
                    onChange={(e) => updateHandoff(index, { agent: e.target.value })}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                  >
                    {AGENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Prompt input */}
                <div className="mb-2">
                  <label className="text-xs text-slate-400 block mb-1">Prompt Template</label>
                  <textarea
                    value={handoff.prompt || ''}
                    onChange={(e) => updateHandoff(index, { prompt: e.target.value })}
                    placeholder="Prompt to pass to the target agent..."
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Auto-send toggle */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={handoff.send ?? false}
                      onChange={(e) => updateHandoff(index, { send: e.target.checked })}
                      className="w-4 h-4 rounded bg-slate-700 border-slate-600"
                    />
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Send className="w-3 h-3" />
                      Auto-send (execute immediately)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Handoff Flow Preview */}
      {handoffs.length > 0 && (
        <div className="mt-4 p-3 bg-slate-900 rounded-lg border border-slate-700">
          <h4 className="text-xs font-semibold text-slate-400 mb-2">Flow Preview</h4>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-1 bg-violet-500/20 text-violet-300 rounded text-xs font-medium">
              {currentAgent || 'This Agent'}
            </span>
            {handoffs.map((h, i) => (
              <div key={i} className="flex items-center gap-1">
                <ArrowRight className="w-3 h-3 text-slate-500" />
                <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs">
                  {AGENT_OPTIONS.find(a => a.value === h.agent)?.icon} {h.agent}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default HandoffEditor;
