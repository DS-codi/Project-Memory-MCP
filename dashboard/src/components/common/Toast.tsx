import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { 
  CheckCircle, 
  AlertCircle, 
  Info, 
  X, 
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'handoff';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { ...toast, id }], // Keep max 5 toasts
    }));
    return id;
  },
  
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  
  clearAll: () => set({ toasts: [] }),
}));

// Hook for easy toast usage
export function useToast() {
  const { addToast, removeToast } = useToastStore();
  
  return {
    success: (title: string, message?: string) => 
      addToast({ type: 'success', title, message }),
    error: (title: string, message?: string) => 
      addToast({ type: 'error', title, message }),
    info: (title: string, message?: string) => 
      addToast({ type: 'info', title, message }),
    warning: (title: string, message?: string) => 
      addToast({ type: 'warning', title, message }),
    handoff: (fromAgent: string, toAgent: string, planTitle: string) =>
      addToast({ 
        type: 'handoff', 
        title: `${fromAgent} → ${toAgent}`,
        message: planTitle,
        duration: 5000,
      }),
    dismiss: removeToast,
  };
}

// Toast Container Component
export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onDismiss={() => removeToast(toast.id)} 
        />
      ))}
    </div>
  );
}

// Individual Toast Component
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true));
    
    // Auto dismiss
    const duration = toast.duration || 4000;
    const timer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(onDismiss, 200);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.duration, onDismiss]);

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(onDismiss, 200);
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-400" />,
    error: <AlertCircle className="w-5 h-5 text-red-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    handoff: <ArrowRight className="w-5 h-5 text-purple-400" />,
  };

  const bgColors = {
    success: 'bg-green-500/10 border-green-500/30',
    error: 'bg-red-500/10 border-red-500/30',
    info: 'bg-blue-500/10 border-blue-500/30',
    warning: 'bg-amber-500/10 border-amber-500/30',
    handoff: 'bg-purple-500/10 border-purple-500/30',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-sm transition-all duration-200 min-w-[320px] max-w-md',
        bgColors[toast.type],
        isVisible && !isLeaving 
          ? 'translate-x-0 opacity-100' 
          : 'translate-x-8 opacity-0'
      )}
    >
      {icons[toast.type]}
      
      <div className="flex-1 min-w-0">
        <div className="font-medium">{toast.title}</div>
        {toast.message && (
          <div className="text-sm text-slate-400 mt-0.5 truncate">
            {toast.message}
          </div>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="text-sm text-blue-400 hover:underline mt-2"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        onClick={handleDismiss}
        className="p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X className="w-4 h-4 text-slate-400" />
      </button>
    </div>
  );
}

export default ToastContainer;
