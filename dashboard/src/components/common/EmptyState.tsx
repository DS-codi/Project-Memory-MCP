import React from 'react';
import { 
  FolderOpen, 
  FileText, 
  ListTodo, 
  Users, 
  Search, 
  AlertCircle,
  Plus,
  Sparkles
} from 'lucide-react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ 
  icon, 
  title, 
  description, 
  action,
  className 
}: EmptyStateProps) {
  return (
    <div 
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
      role="status"
      aria-label={title}
    >
      {icon && (
        <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-full" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={action.label}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {action.label}
        </button>
      )}
    </div>
  );
}

// Pre-built empty states for common scenarios

export function NoWorkspaces({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={<FolderOpen className="h-8 w-8 text-gray-400" />}
      title="No workspaces yet"
      description="Register a workspace to start tracking plans and agent sessions."
      action={onAdd ? { label: 'Register Workspace', onClick: onAdd } : undefined}
    />
  );
}

export function NoPlans({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={<ListTodo className="h-8 w-8 text-gray-400" />}
      title="No plans yet"
      description="Create a plan to start organizing work and tracking progress through agent workflows."
      action={onAdd ? { label: 'Create Plan', onClick: onAdd } : undefined}
    />
  );
}

export function NoAgents({ onDeploy }: { onDeploy?: () => void }) {
  return (
    <EmptyState
      icon={<Users className="h-8 w-8 text-gray-400" />}
      title="No agents deployed"
      description="Deploy agent instruction files to enable the hub-and-spoke AI workflow."
      action={onDeploy ? { label: 'Deploy Agents', onClick: onDeploy } : undefined}
    />
  );
}

export function NoPrompts({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={<Sparkles className="h-8 w-8 text-gray-400" />}
      title="No prompts available"
      description="Create prompt files to build reusable workflows for VS Code Copilot."
      action={onAdd ? { label: 'Create Prompt', onClick: onAdd } : undefined}
    />
  );
}

export function NoInstructions({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={<FileText className="h-8 w-8 text-gray-400" />}
      title="No instructions found"
      description="Add instruction files to provide context-aware guidance to Copilot."
      action={onAdd ? { label: 'Add Instructions', onClick: onAdd } : undefined}
    />
  );
}

export function NoSearchResults({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<Search className="h-8 w-8 text-gray-400" />}
      title="No results found"
      description={`No items matching "${query}". Try a different search term.`}
    />
  );
}

export function NoSteps() {
  return (
    <EmptyState
      icon={<ListTodo className="h-8 w-8 text-gray-400" />}
      title="No steps defined"
      description="This plan doesn't have any steps yet. The Architect agent will define steps during planning."
    />
  );
}

export function NoTimeline() {
  return (
    <EmptyState
      icon={<Users className="h-8 w-8 text-gray-400" />}
      title="No activity yet"
      description="Agent handoffs and activities will appear here as work progresses."
    />
  );
}

export function NoResearch() {
  return (
    <EmptyState
      icon={<FileText className="h-8 w-8 text-gray-400" />}
      title="No research notes"
      description="Research findings and notes will be collected here by the Researcher agent."
    />
  );
}

export function ErrorState({ 
  error, 
  onRetry 
}: { 
  error?: string; 
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={<AlertCircle className="h-8 w-8 text-red-400" />}
      title="Something went wrong"
      description={error || "An unexpected error occurred. Please try again."}
      action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
    />
  );
}

export function LoadingState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {message || 'Loading...'}
      </p>
    </div>
  );
}

export default EmptyState;
