import { cn } from '@/utils/cn';

interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, max, className, showLabel = false }: ProgressBarProps) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className={cn(
            'h-full rounded-full transition-all duration-300',
            percentage === 100 ? 'bg-green-500' : 'bg-blue-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-slate-400 min-w-[3rem] text-right">
          {value}/{max}
        </span>
      )}
    </div>
  );
}
