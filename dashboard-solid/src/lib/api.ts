import { createResource } from "solid-js";
import axios from "axios";

// Standard API base for the SolidJS dashboard.
// Proxied via vite.config.ts to the backend.
const API_BASE = "/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface WorkspaceSummary {
  workspace_id: string;
  name: string;
  path: string;
  active_plan_count: number;
  archived_plan_count: number;
  health: string;
}

export interface PlanSummary {
  id: string;
  title: string;
  description?: string;
  status: string;
  category: string;
  priority: string;
  updated_at: string;
  created_at: string;
  steps_done: number;
  steps_total: number;
  next_step_task: string | null;
  goals?: string[];
  success_criteria?: string[];
  steps?: any[];
}

export interface DashboardMetrics {
  generated_at: string;
  workspaces: {
    total: number;
    with_active_plans: number;
  };
  plans: {
    total_plans: number;
    active: number;
    completed: number;
    archived: number;
    failed: number;
    by_category: Record<string, number>;
    by_priority: Record<string, number>;
  };
  steps: {
    total_steps: number;
    completion_rate: number;
  };
  handoffs: {
    total_handoffs: number;
    most_common_transitions: Array<{ from: string; to: string; count: number }>;
  };
  time: {
    average_plan_duration_human: string;
  };
}

/**
 * Fetch all workspaces
 */
export async function fetchWorkspaces(): Promise<{ workspaces: WorkspaceSummary[], total: number }> {
  const response = await api.get("/workspaces");
  return response.data;
}

/**
 * Fetch a specific workspace by ID
 */
export async function fetchWorkspace(id: string): Promise<WorkspaceSummary> {
  const response = await api.get(`/workspaces/${id}`);
  return response.data;
}

/**
 * Fetch plans for a specific workspace
 */
export async function fetchPlans(workspaceId: string): Promise<{ plans: PlanSummary[] }> {
  const response = await api.get(`/plans/workspace/${workspaceId}`);
  return response.data;
}

/**
 * Fetch a specific plan
 */
export async function fetchPlan(workspaceId: string, planId: string): Promise<{ data: PlanSummary }> {
  const response = await api.get(`/plans/${workspaceId}/${planId}`);
  return response.data;
}

/**
 * Fetch system health
 */
export async function fetchHealth() {
  const response = await api.get("/health");
  return response.data;
}

/**
 * Fetch detailed metrics
 */
export async function fetchMetrics(): Promise<DashboardMetrics> {
  const response = await api.get("/metrics");
  return response.data;
}

// Hook-like patterns for SolidJS Resources
export function useWorkspaces() {
  return createResource(fetchWorkspaces);
}

export function useWorkspace(id: () => string | undefined) {
  return createResource(id, (workspaceId) => fetchWorkspace(workspaceId));
}

export function usePlans(workspaceId: () => string | undefined) {
  return createResource(workspaceId, (id) => fetchPlans(id));
}

export function useHealth() {
  return createResource(fetchHealth);
}
