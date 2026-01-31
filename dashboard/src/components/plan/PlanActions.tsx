import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface PlanActionsProps {
  workspaceId: string;
  planId: string;
  planTitle: string;
  onActionComplete?: () => void;
}

type ActionType = 'archive' | 'delete' | 'duplicate' | null;

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmVariant: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  children?: React.ReactNode;
}

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmText,
  confirmVariant,
  onConfirm,
  onCancel,
  isLoading,
  children,
}: ConfirmDialogProps) => {
  if (!isOpen) return null;

  const variantClasses = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    primary: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onCancel} />
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">{message}</p>
          {children}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-white rounded-lg transition-colors focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${variantClasses[confirmVariant]}`}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PlanActions = ({
  workspaceId,
  planId,
  planTitle,
  onActionComplete,
}: PlanActionsProps) => {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [duplicateTitle, setDuplicateTitle] = useState(`${planTitle} (Copy)`);
  const [permanentDelete, setPermanentDelete] = useState(false);
  const queryClient = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: () => axios.post(`/api/plans/${workspaceId}/${planId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
      setActiveAction(null);
      onActionComplete?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (permanent: boolean) =>
      axios.delete(`/api/plans/${workspaceId}/${planId}?archive=${!permanent}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
      setActiveAction(null);
      onActionComplete?.();
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (newTitle: string) =>
      axios.post(`/api/plans/${workspaceId}/${planId}/duplicate`, { newTitle }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
      setActiveAction(null);
      onActionComplete?.();
    },
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveAction('duplicate')}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          title="Duplicate as template"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          onClick={() => setActiveAction('archive')}
          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
          title="Archive plan"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>
        <button
          onClick={() => setActiveAction('delete')}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          title="Delete plan"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Archive Confirmation */}
      <ConfirmDialog
        isOpen={activeAction === 'archive'}
        title="Archive Plan"
        message={`Are you sure you want to archive "${planTitle}"? The plan will be marked as archived and removed from the active list.`}
        confirmText="Archive"
        confirmVariant="warning"
        onConfirm={() => archiveMutation.mutate()}
        onCancel={() => setActiveAction(null)}
        isLoading={archiveMutation.isPending}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={activeAction === 'delete'}
        title="Delete Plan"
        message={`Are you sure you want to delete "${planTitle}"?`}
        confirmText={permanentDelete ? 'Delete Permanently' : 'Move to Archive'}
        confirmVariant="danger"
        onConfirm={() => deleteMutation.mutate(permanentDelete)}
        onCancel={() => {
          setActiveAction(null);
          setPermanentDelete(false);
        }}
        isLoading={deleteMutation.isPending}
      >
        <label className="flex items-center gap-2 mt-4 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={permanentDelete}
            onChange={(e) => setPermanentDelete(e.target.checked)}
            className="rounded text-red-600 focus:ring-red-500"
          />
          Delete permanently (cannot be undone)
        </label>
      </ConfirmDialog>

      {/* Duplicate Dialog */}
      <ConfirmDialog
        isOpen={activeAction === 'duplicate'}
        title="Duplicate Plan"
        message="Create a copy of this plan as a template. All steps will be reset to pending status."
        confirmText="Duplicate"
        confirmVariant="primary"
        onConfirm={() => duplicateMutation.mutate(duplicateTitle)}
        onCancel={() => setActiveAction(null)}
        isLoading={duplicateMutation.isPending}
      >
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            New Plan Title
          </label>
          <input
            type="text"
            value={duplicateTitle}
            onChange={(e) => setDuplicateTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </ConfirmDialog>
    </>
  );
};

// Import Plan Dialog Component
interface ImportPlanDialogProps {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ImportPlanDialog = ({
  isOpen,
  workspaceId,
  onClose,
  onSuccess,
}: ImportPlanDialogProps) => {
  const [filePath, setFilePath] = useState('');
  const [category, setCategory] = useState<string>('change');
  const [priority, setPriority] = useState<string>('medium');
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: () =>
      axios.post(`/api/plans/${workspaceId}/import`, {
        filePath,
        category,
        priority,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
      setFilePath('');
      onClose();
      onSuccess?.();
    },
  });

  if (!isOpen) return null;

  const categories = ['feature', 'bug', 'change', 'analysis', 'debug', 'refactor', 'documentation'];
  const priorities = ['low', 'medium', 'high', 'critical'];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Import Plan from File
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                File Path
              </label>
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/path/to/plan.md"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Markdown file with checkbox items (- [ ] task)
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {importMutation.isError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-4">
              Failed to import plan. Please check the file path.
            </p>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={importMutation.isPending}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || !filePath.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {importMutation.isPending ? 'Importing...' : 'Import Plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
