import { cn } from '@/utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

export function Badge({ children, variant, className }: BadgeProps) {
  return (
    <span 
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
        variant || 'bg-slate-500/20 text-slate-300 border-slate-500/50',
        className
      )}
    >
      {children}
    </span>
  );
}
