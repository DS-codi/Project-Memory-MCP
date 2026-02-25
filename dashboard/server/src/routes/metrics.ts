import { Router } from 'express';
import {
  listWorkspaces, getAllPlans, getPlansByWorkspace,
  getPlanSteps, getPlanSessions, getPlanLineage,
  getWorkspaceMetrics,
} from '../db/queries.js';

export const metricsRouter = Router();

interface AgentMetrics {
  agent_type: string;
  total_sessions: number;
  completed_sessions: number;
  total_duration_ms: number;
  average_duration_ms: number;
  plans_worked: number;
}

interface StepMetrics {
  total_steps: number;
  done: number;
  active: number;
  pending: number;
  blocked: number;
  completion_rate: number;
}

interface PlanMetrics {
  total_plans: number;
  active: number;
  completed: number;
  archived: number;
  failed: number;
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
  average_steps_per_plan: number;
  average_sessions_per_plan: number;
}

interface HandoffMetrics {
  total_handoffs: number;
  by_transition: Record<string, number>;
  most_common_transitions: Array<{ from: string; to: string; count: number }>;
}

interface TimeMetrics {
  average_plan_duration_ms: number;
  average_plan_duration_human: string;
  fastest_completion_ms: number;
  slowest_completion_ms: number;
  plans_by_day: Record<string, number>;
  plans_by_week: Record<string, number>;
}

interface DashboardMetrics {
  generated_at: string;
  workspaces: {
    total: number;
    with_active_plans: number;
  };
  plans: PlanMetrics;
  steps: StepMetrics;
  agents: AgentMetrics[];
  handoffs: HandoffMetrics;
  time: TimeMetrics;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function getWeekNumber(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + 1) / 7);
  return `${date.getFullYear()}-W${week.toString().padStart(2, '0')}`;
}

// GET /api/metrics - Get comprehensive metrics dashboard
metricsRouter.get('/', (req, res) => {
  try {
    const workspaces = listWorkspaces();
    const allPlans = getAllPlans(true); // include archived

    const metrics: DashboardMetrics = {
      generated_at: new Date().toISOString(),
      workspaces: { total: workspaces.length, with_active_plans: 0 },
      plans: {
        total_plans: 0, active: 0, completed: 0, archived: 0, failed: 0,
        by_category: {}, by_priority: {},
        average_steps_per_plan: 0, average_sessions_per_plan: 0,
      },
      steps: { total_steps: 0, done: 0, active: 0, pending: 0, blocked: 0, completion_rate: 0 },
      agents: [],
      handoffs: { total_handoffs: 0, by_transition: {}, most_common_transitions: [] },
      time: {
        average_plan_duration_ms: 0, average_plan_duration_human: '0m',
        fastest_completion_ms: Infinity, slowest_completion_ms: 0,
        plans_by_day: {}, plans_by_week: {},
      },
    };

    const agentStats = new Map<string, {
      total_sessions: number;
      completed_sessions: number;
      total_duration_ms: number;
      plans: Set<string>;
    }>();

    const workspacesWithActivePlans = new Set<string>();
    const planDurations: number[] = [];
    let totalSteps = 0;
    let totalSessions = 0;

    for (const plan of allPlans) {
      metrics.plans.total_plans++;

      // Status counts
      if (plan.status === 'active') {
        metrics.plans.active++;
        workspacesWithActivePlans.add(plan.workspace_id);
      } else if (plan.status === 'completed') metrics.plans.completed++;
      else if (plan.status === 'archived') metrics.plans.archived++;
      else if (plan.status === 'failed') metrics.plans.failed++;

      // Category / priority
      const category = plan.category || 'unknown';
      metrics.plans.by_category[category] = (metrics.plans.by_category[category] || 0) + 1;
      const priority = plan.priority || 'medium';
      metrics.plans.by_priority[priority] = (metrics.plans.by_priority[priority] || 0) + 1;

      // Steps
      const steps = getPlanSteps(plan.id);
      totalSteps += steps.length;
      metrics.steps.total_steps += steps.length;
      for (const step of steps) {
        if (step.status === 'done') metrics.steps.done++;
        else if (step.status === 'active') metrics.steps.active++;
        else if (step.status === 'pending') metrics.steps.pending++;
        else if (step.status === 'blocked') metrics.steps.blocked++;
      }

      // Sessions / agent stats
      const sessions = getPlanSessions(plan.id);
      totalSessions += sessions.length;
      for (const session of sessions) {
        const agentType = session.agent_type;
        if (!agentStats.has(agentType)) {
          agentStats.set(agentType, { total_sessions: 0, completed_sessions: 0, total_duration_ms: 0, plans: new Set() });
        }
        const stats = agentStats.get(agentType)!;
        stats.total_sessions++;
        stats.plans.add(plan.id);
        if (session.completed_at) {
          stats.completed_sessions++;
          stats.total_duration_ms += new Date(session.completed_at).getTime() - new Date(session.started_at).getTime();
        }
      }

      // Handoffs
      const lineage = getPlanLineage(plan.id);
      for (const entry of lineage) {
        metrics.handoffs.total_handoffs++;
        const transition = `${entry.from_agent} → ${entry.to_agent}`;
        metrics.handoffs.by_transition[transition] = (metrics.handoffs.by_transition[transition] || 0) + 1;
      }

      // Time stats
      if (plan.created_at) {
        const createdDate = new Date(plan.created_at);
        const dayKey = createdDate.toISOString().split('T')[0];
        const weekKey = getWeekNumber(createdDate);
        metrics.time.plans_by_day[dayKey] = (metrics.time.plans_by_day[dayKey] || 0) + 1;
        metrics.time.plans_by_week[weekKey] = (metrics.time.plans_by_week[weekKey] || 0) + 1;
      }

      // Plan duration for completed/archived plans
      if ((plan.status === 'completed' || plan.status === 'archived') && plan.created_at && plan.updated_at) {
        const duration = new Date(plan.updated_at).getTime() - new Date(plan.created_at).getTime();
        planDurations.push(duration);
        if (duration < metrics.time.fastest_completion_ms) metrics.time.fastest_completion_ms = duration;
        if (duration > metrics.time.slowest_completion_ms) metrics.time.slowest_completion_ms = duration;
      }
    }

    metrics.workspaces.with_active_plans = workspacesWithActivePlans.size;

    // Calculate averages
    if (metrics.plans.total_plans > 0) {
      metrics.plans.average_steps_per_plan = Math.round(totalSteps / metrics.plans.total_plans * 10) / 10;
      metrics.plans.average_sessions_per_plan = Math.round(totalSessions / metrics.plans.total_plans * 10) / 10;
    }
    if (metrics.steps.total_steps > 0) {
      metrics.steps.completion_rate = Math.round((metrics.steps.done / metrics.steps.total_steps) * 100);
    }
    if (planDurations.length > 0) {
      const avgDuration = planDurations.reduce((a, b) => a + b, 0) / planDurations.length;
      metrics.time.average_plan_duration_ms = Math.round(avgDuration);
      metrics.time.average_plan_duration_human = formatDuration(avgDuration);
    }
    if (metrics.time.fastest_completion_ms === Infinity) {
      metrics.time.fastest_completion_ms = 0;
    }

    // Convert agent stats to array
    for (const [agentType, stats] of agentStats) {
      metrics.agents.push({
        agent_type: agentType,
        total_sessions: stats.total_sessions,
        completed_sessions: stats.completed_sessions,
        total_duration_ms: stats.total_duration_ms,
        average_duration_ms: stats.completed_sessions > 0
          ? Math.round(stats.total_duration_ms / stats.completed_sessions)
          : 0,
        plans_worked: stats.plans.size,
      });
    }
    metrics.agents.sort((a, b) => b.total_sessions - a.total_sessions);

    // Most common transitions
    metrics.handoffs.most_common_transitions = Object.entries(metrics.handoffs.by_transition)
      .map(([key, count]) => {
        const [from, to] = key.split(' → ');
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// GET /api/metrics/agents - Get agent-specific metrics
metricsRouter.get('/agents', (req, res) => {
  try {
    const allPlans = getAllPlans(true);

    const agentDetails = new Map<string, {
      sessions: Array<{
        plan_id: string;
        plan_title: string;
        workspace_id: string;
        started_at: string;
        completed_at?: string;
        duration_ms?: number;
        summary?: string;
      }>;
    }>();

    for (const plan of allPlans) {
      const sessions = getPlanSessions(plan.id);
      for (const session of sessions) {
        if (!agentDetails.has(session.agent_type)) {
          agentDetails.set(session.agent_type, { sessions: [] });
        }
        const duration = session.completed_at
          ? new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()
          : undefined;
        agentDetails.get(session.agent_type)!.sessions.push({
          plan_id: plan.id,
          plan_title: plan.title,
          workspace_id: plan.workspace_id,
          started_at: session.started_at,
          completed_at: session.completed_at ?? undefined,
          duration_ms: duration,
          summary: session.summary ?? undefined,
        });
      }
    }

    const result: Record<string, unknown> = {};
    for (const [agentType, data] of agentDetails) {
      const completedSessions = data.sessions.filter(s => s.duration_ms !== undefined);
      const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
      result[agentType] = {
        total_sessions: data.sessions.length,
        completed_sessions: completedSessions.length,
        average_duration_ms: completedSessions.length > 0 ? Math.round(totalDuration / completedSessions.length) : 0,
        average_duration_human: completedSessions.length > 0 ? formatDuration(totalDuration / completedSessions.length) : '0m',
        recent_sessions: data.sessions.slice(-10).reverse(),
      };
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting agent metrics:', error);
    res.status(500).json({ error: 'Failed to get agent metrics' });
  }
});

// GET /api/metrics/workspace/:workspaceId - Get workspace-specific metrics
metricsRouter.get('/workspace/:workspaceId', (req, res) => {
  try {
    const { workspaceId } = req.params;
    const plans = getPlansByWorkspace(workspaceId, true); // include archived

    const metrics = {
      workspace_id: workspaceId,
      total_plans: plans.length,
      plans_by_status: {} as Record<string, number>,
      plans_by_category: {} as Record<string, number>,
      total_steps: 0,
      completed_steps: 0,
      completion_rate: 0,
      total_handoffs: 0,
      agent_activity: {} as Record<string, number>,
    };

    for (const plan of plans) {
      metrics.plans_by_status[plan.status] = (metrics.plans_by_status[plan.status] || 0) + 1;
      const category = plan.category || 'unknown';
      metrics.plans_by_category[category] = (metrics.plans_by_category[category] || 0) + 1;

      const steps = getPlanSteps(plan.id);
      metrics.total_steps += steps.length;
      metrics.completed_steps += steps.filter(s => s.status === 'done').length;

      const lineage = getPlanLineage(plan.id);
      metrics.total_handoffs += lineage.length;

      const sessions = getPlanSessions(plan.id);
      for (const session of sessions) {
        metrics.agent_activity[session.agent_type] = (metrics.agent_activity[session.agent_type] || 0) + 1;
      }
    }

    if (metrics.total_steps > 0) {
      metrics.completion_rate = Math.round((metrics.completed_steps / metrics.total_steps) * 100);
    }

    res.json(metrics);
  } catch (error) {
    console.error('Error getting workspace metrics:', error);
    res.status(500).json({ error: 'Failed to get workspace metrics' });
  }
});

