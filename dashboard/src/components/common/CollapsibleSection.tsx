import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Collapsible accordion section with a toggle header.
 * Used by WorkspaceContextPanel, PlanDetailPage, and PlanContextViewer
 * to keep large panels manageable.
 */
export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  badge,
  actions,
  className,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('border border-slate-700 rounded-lg overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/60 hover:bg-slate-900/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isOpen ? (
            <ChevronDown size={16} className="text-slate-400 shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          )}
          <h4 className="text-sm font-semibold text-white truncate">{title}</h4>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
          {actions && (
            <span
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1"
            >
              {actions}
            </span>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="px-4 py-3 bg-slate-900/40">
          {children}
        </div>
      )}
    </div>
  );
}
