import type { AgentType, StepStatus, StepType, PlanStatus, PlanPriority, WorkspaceHealth } from '@/types';

export const agentColors: Record<AgentType, string> = {
  Coordinator: '#8b5cf6',
  Analyst: '#14b8a6',
  Brainstorm: '#f97316',
  Runner: '#22c55e',
  Researcher: '#06b6d4',
  Architect: '#f59e0b',
  Executor: '#10b981',
  Reviewer: '#6366f1',
  Tester: '#ec4899',
  Revisionist: '#f97316',
  Archivist: '#64748b',
  Builder: '#3b82f6',
};

export const agentBgColors: Record<AgentType, string> = {
  Coordinator: 'bg-violet-500/20 text-violet-300 border-violet-500/50',
  Analyst: 'bg-teal-500/20 text-teal-300 border-teal-500/50',
  Brainstorm: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  Runner: 'bg-green-500/20 text-green-300 border-green-500/50',
  Researcher: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',
  Architect: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  Executor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  Reviewer: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50',
  Tester: 'bg-pink-500/20 text-pink-300 border-pink-500/50',
  Revisionist: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  Archivist: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
  Builder: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
};

export const agentIcons: Record<AgentType, string> = {
  Coordinator: '🎯',
  Analyst: '🧭',
  Brainstorm: '💡',
  Runner: '🏃',
  Researcher: '🔬',
  Architect: '📐',
  Executor: '⚙️',
  Reviewer: '🔍',
  Tester: '🧪',
  Revisionist: '🔄',
  Archivist: '📦',
  Builder: '🏗️',
};

export const statusColors: Record<StepStatus, string> = {
  pending: 'bg-gray-500/20 text-gray-300 border-gray-500/50',
  active: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  done: 'bg-green-500/20 text-green-300 border-green-500/50',
  blocked: 'bg-red-500/20 text-red-300 border-red-500/50',
};

export const statusIcons: Record<StepStatus, string> = {
  pending: '⏳',
  active: '🔄',
  done: '✅',
  blocked: '🚫',
};

export const planStatusColors: Record<PlanStatus, string> = {
  active: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  paused: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  completed: 'bg-green-500/20 text-green-300 border-green-500/50',
  archived: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
  failed: 'bg-red-500/20 text-red-300 border-red-500/50',
};

export const priorityColors: Record<PlanPriority, string> = {
  low: 'bg-green-500/20 text-green-300 border-green-500/50',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  critical: 'bg-red-500/20 text-red-300 border-red-500/50',
};

export const priorityIcons: Record<PlanPriority, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

export const healthColors: Record<WorkspaceHealth, string> = {
  active: 'bg-green-500',
  stale: 'bg-yellow-500',
  blocked: 'bg-red-500',
  idle: 'bg-gray-500',
};

export const categoryColors: Record<string, string> = {
  feature: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  bug: 'bg-red-500/20 text-red-300 border-red-500/50',
  change: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
  analysis: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',
  investigation: 'bg-teal-500/20 text-teal-300 border-teal-500/50',
  debug: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  refactor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  documentation: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
};

export const stepTypeColors: Record<StepType, string> = {
  standard: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
  analysis: 'bg-teal-500/20 text-teal-300 border-teal-500/50',
  validation: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  user_validation: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  complex: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
  critical: 'bg-red-500/20 text-red-300 border-red-500/50',
  build: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  fix: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
  refactor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  confirmation: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  research: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',
  planning: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50',
  code: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  test: 'bg-pink-500/20 text-pink-300 border-pink-500/50',
  documentation: 'bg-slate-500/20 text-slate-300 border-slate-500/50'
};
