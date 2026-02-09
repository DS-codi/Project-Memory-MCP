import { useState, useRef, useCallback } from 'react';
import { GripVertical, Check, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { statusColors, statusIcons } from '@/utils/colors';
import { displayStepNumber } from '@/utils/formatters';
import type { PlanStep } from '@/types';

interface DragDropStepReorderProps {
  steps: PlanStep[];
  onSave: (steps: PlanStep[]) => void;
  onCancel: () => void;
}

export function DragDropStepReorder({
  steps,
  onSave,
  onCancel,
}: DragDropStepReorderProps) {
  const [orderedSteps, setOrderedSteps] = useState<PlanStep[]>([...steps]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const draggedItemRef = useRef<PlanStep | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      setDraggedIndex(index);
      draggedItemRef.current = orderedSteps[index];
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
      // Add a slight delay so the dragged item shows properly
      setTimeout(() => {
        (e.target as HTMLElement).classList.add('opacity-50');
      }, 0);
    },
    [orderedSteps]
  );

  const handleDragEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).classList.remove('opacity-50');
    setDraggedIndex(null);
    setDropTargetIndex(null);
    draggedItemRef.current = null;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (index !== draggedIndex) {
        setDropTargetIndex(index);
      }
    },
    [draggedIndex]
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
      e.preventDefault();
      
      const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      
      if (dragIndex === dropIndex) {
        setDropTargetIndex(null);
        return;
      }

      const newSteps = [...orderedSteps];
      const [draggedStep] = newSteps.splice(dragIndex, 1);
      
      // Adjust dropIndex if we removed an item before it
      const adjustedDropIndex = dragIndex < dropIndex ? dropIndex - 1 : dropIndex;
      newSteps.splice(adjustedDropIndex, 0, draggedStep);

      // Reindex all steps
      const reindexedSteps = newSteps.map((step, idx) => ({
        ...step,
        index: idx,
      }));

      setOrderedSteps(reindexedSteps);
      setDropTargetIndex(null);
    },
    [orderedSteps]
  );

  const handleSave = () => {
    onSave(orderedSteps);
  };

  // Calculate if order changed
  const hasChanges = orderedSteps.some(
    (step, idx) => step.index !== steps.find((s) => s.task === step.task)?.index
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700">
        <div>
          <h3 className="text-lg font-semibold">Drag & Drop Reorder</h3>
          <p className="text-sm text-slate-400">
            Drag steps to reorder them. Changes are saved when you click Save.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-2"
          >
            <X size={16} />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={cn(
              'px-4 py-2 rounded-lg transition-colors flex items-center gap-2',
              hasChanges
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            )}
          >
            <Check size={16} />
            Save Order
          </button>
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-2">
        {orderedSteps.map((step, idx) => (
          <div
            key={`${step.task}-${idx}`}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, idx)}
            className={cn(
              'flex items-center gap-3 p-3 bg-slate-800 border rounded-lg cursor-grab active:cursor-grabbing transition-all',
              draggedIndex === idx && 'opacity-50',
              dropTargetIndex === idx && draggedIndex !== null && draggedIndex < idx && 'border-t-2 border-t-violet-500',
              dropTargetIndex === idx && draggedIndex !== null && draggedIndex > idx && 'border-b-2 border-b-violet-500',
              step.status === 'active'
                ? 'border-blue-500/50'
                : 'border-slate-700 hover:border-slate-600'
            )}
          >
            {/* Drag handle */}
            <div className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
              <GripVertical size={20} />
            </div>

            {/* Index */}
            <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-slate-700 rounded text-xs text-slate-400">
              {displayStepNumber(idx)}
            </span>

            {/* Phase badge */}
            <span className="flex-shrink-0 px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
              {step.phase}
            </span>

            {/* Status */}
            <Badge variant={statusColors[step.status]}>
              <span className="flex items-center gap-1">
                {statusIcons[step.status]}
                {step.status}
              </span>
            </Badge>

            {/* Task */}
            <span className="flex-1 text-sm text-slate-300 truncate">
              {step.task}
            </span>

            {/* Original index indicator */}
            {step.index !== idx && (
              <span className="text-xs text-yellow-400" title="Original position">
                was {displayStepNumber(step.index)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Drop zone at the end */}
      {draggedIndex !== null && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropTargetIndex(orderedSteps.length);
          }}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, orderedSteps.length)}
          className={cn(
            'h-12 border-2 border-dashed rounded-lg flex items-center justify-center text-sm transition-colors',
            dropTargetIndex === orderedSteps.length
              ? 'border-violet-500 bg-violet-500/10 text-violet-400'
              : 'border-slate-700 text-slate-500'
          )}
        >
          Drop here to move to end
        </div>
      )}
    </div>
  );
}
