import { cn } from '@/utils/cn';
import type { WorkspaceHealth } from '@/types';
import { healthColors } from '@/utils/colors';

interface HealthIndicatorProps {
  health: WorkspaceHealth;
  className?: string;
  showLabel?: boolean;
}

const healthLabels: Record<WorkspaceHealth, string> = {
  active: 'Active',
  stale: 'Stale',
  blocked: 'Blocked',
  idle: 'Idle',
};

export function HealthIndicator({ health, className, showLabel = false }: HealthIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('rounded-full', healthColors[health], className?.includes('w-') ? '' : 'w-3 h-3')} />
      {showLabel && (
        <span className="text-sm text-slate-400">{healthLabels[health]}</span>
      )}
    </div>
  );
}
