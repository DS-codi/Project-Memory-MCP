import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getPlanState, getPlanLineage, getPlanAudit } from '../services/fileScanner.js';

export const reportsRouter = Router();

// Type definitions for reports
interface PlanStep {
  phase?: string;
  task: string;
  status: string;
  notes?: string;
}

interface AgentSession {
  agent_type: string;
  started_at: string;
  completed_at?: string;
  summary?: string;
  artifacts?: string[];
}

interface LineageEntry {
  timestamp: string;
  from_agent: string;
  to_agent: string;
  reason: string;
}

interface PlanState {
  id: string;
  workspace_id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  category: string;
  current_agent: string | null;
  created_at: string;
  updated_at: string;
  agent_sessions?: AgentSession[];
  lineage?: LineageEntry[];
  steps?: PlanStep[];
}

// Status icons for markdown
const statusIcons: Record<string, string> = {
  pending: '⏳',
  active: '🔄',
  done: '✅',
  blocked: '🚫',
};

// Priority icons
const priorityIcons: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

// Agent icons
const agentIcons: Record<string, string> = {
  Coordinator: '🎯',
  Researcher: '🔬',
  Architect: '📐',
  Executor: '⚙️',
  Reviewer: '🔍',
  Tester: '🧪',
  Revisionist: '🔄',
  Archivist: '📦',
};

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startDate: string, endDate?: string): string {
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  const diffMs = end - start;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24);
    return `${days}d ${diffHours % 24}h`;
  }
  return diffHours > 0 ? `${diffHours}h ${diffMins}m` : `${diffMins}m`;
}

function generateMarkdownReport(
  plan: PlanState,
  lineage: unknown[],
  audit: { entries?: Array<{ timestamp: string; action: string; details?: unknown }> } | null
): string {
  // Cast lineage to typed array
  const typedLineage = lineage as LineageEntry[];
  const typedAudit = audit || { entries: [] };
  
  const lines: string[] = [];
  
  // Header
  lines.push(`# 📋 Plan Report: ${plan.title}`);
  lines.push('');
  lines.push(`> Generated on ${formatDate(new Date().toISOString())}`);
  lines.push('');
  
  // Overview
  lines.push('## 📊 Overview');
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| **Plan ID** | \`${plan.id}\` |`);
  lines.push(`| **Workspace** | \`${plan.workspace_id}\` |`);
  lines.push(`| **Status** | ${plan.status.toUpperCase()} |`);
  lines.push(`| **Category** | ${plan.category} |`);
  lines.push(`| **Priority** | ${priorityIcons[plan.priority] || ''} ${plan.priority} |`);
  lines.push(`| **Current Agent** | ${plan.current_agent ? `${agentIcons[plan.current_agent] || ''} ${plan.current_agent}` : 'None'} |`);
  lines.push(`| **Created** | ${formatDate(plan.created_at)} |`);
  lines.push(`| **Last Updated** | ${formatDate(plan.updated_at)} |`);
  lines.push(`| **Duration** | ${formatDuration(plan.created_at, plan.status === 'completed' ? plan.updated_at : undefined)} |`);
  lines.push('');
  
  // Description
  if (plan.description) {
    lines.push('### Description');
    lines.push('');
    lines.push(plan.description);
    lines.push('');
  }
  
  // Progress Summary
  const doneSteps = plan.steps?.filter(s => s.status === 'done').length || 0;
  const totalSteps = plan.steps?.length || 0;
  const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
  
  lines.push('## 📈 Progress Summary');
  lines.push('');
  lines.push(`**${doneSteps} / ${totalSteps}** steps completed (**${progressPct}%**)`);
  lines.push('');
  
  // Progress bar visualization
  const barLength = 20;
  const filled = Math.round((progressPct / 100) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  lines.push(`\`[${bar}]\` ${progressPct}%`);
  lines.push('');
  
  // Steps breakdown by status
  const statusCounts = {
    done: plan.steps?.filter(s => s.status === 'done').length || 0,
    active: plan.steps?.filter(s => s.status === 'active').length || 0,
    pending: plan.steps?.filter(s => s.status === 'pending').length || 0,
    blocked: plan.steps?.filter(s => s.status === 'blocked').length || 0,
  };
  
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  lines.push(`| ✅ Done | ${statusCounts.done} |`);
  lines.push(`| 🔄 Active | ${statusCounts.active} |`);
  lines.push(`| ⏳ Pending | ${statusCounts.pending} |`);
  lines.push(`| 🚫 Blocked | ${statusCounts.blocked} |`);
  lines.push('');
  
  // Steps Detail
  if (plan.steps && plan.steps.length > 0) {
    lines.push('## 📝 Steps');
    lines.push('');
    
    // Group by phase
    const phases = new Map<string, PlanStep[]>();
    for (const step of plan.steps) {
      const phase = step.phase || 'General';
      if (!phases.has(phase)) {
        phases.set(phase, []);
      }
      phases.get(phase)!.push(step);
    }
    
    for (const [phase, steps] of phases) {
      lines.push(`### ${phase}`);
      lines.push('');
      for (const step of steps) {
        const checkbox = step.status === 'done' ? '[x]' : '[ ]';
        const icon = statusIcons[step.status] || '';
        lines.push(`- ${checkbox} ${icon} ${step.task}`);
        if (step.notes) {
          lines.push(`  - _Note: ${step.notes}_`);
        }
      }
      lines.push('');
    }
  }
  
  // Agent Sessions
  if (plan.agent_sessions && plan.agent_sessions.length > 0) {
    lines.push('## 🤖 Agent Sessions');
    lines.push('');
    lines.push('| Agent | Started | Duration | Status |');
    lines.push('|-------|---------|----------|--------|');
    
    for (const session of plan.agent_sessions) {
      const icon = agentIcons[session.agent_type] || '';
      const duration = formatDuration(session.started_at, session.completed_at);
      const status = session.completed_at ? '✅ Completed' : '🔄 Active';
      lines.push(`| ${icon} ${session.agent_type} | ${formatDate(session.started_at)} | ${duration} | ${status} |`);
    }
    lines.push('');
    
    // Session details with summaries
    const completedSessions = plan.agent_sessions.filter(s => s.summary);
    if (completedSessions.length > 0) {
      lines.push('### Session Summaries');
      lines.push('');
      for (const session of completedSessions) {
        lines.push(`#### ${agentIcons[session.agent_type] || ''} ${session.agent_type}`);
        lines.push('');
        lines.push(session.summary || '');
        if (session.artifacts && session.artifacts.length > 0) {
          lines.push('');
          lines.push('**Artifacts:**');
          for (const artifact of session.artifacts) {
            lines.push(`- \`${artifact}\``);
          }
        }
        lines.push('');
      }
    }
  }
  
  // Handoff Timeline
  if (typedLineage && typedLineage.length > 0) {
    lines.push('## 🔀 Handoff Timeline');
    lines.push('');
    lines.push('```mermaid');
    lines.push('graph LR');
    
    for (let i = 0; i < typedLineage.length; i++) {
      const entry = typedLineage[i];
      const fromIcon = entry.from_agent === 'User' ? '👤' : (agentIcons[entry.from_agent] || '');
      const toIcon = agentIcons[entry.to_agent] || '';
      lines.push(`  ${entry.from_agent}["${fromIcon} ${entry.from_agent}"] -->|"${entry.reason.substring(0, 30)}..."| ${entry.to_agent}["${toIcon} ${entry.to_agent}"]`);
    }
    
    lines.push('```');
    lines.push('');
    
    // Text version
    lines.push('| # | From | To | Reason | Time |');
    lines.push('|---|------|----|--------|------|');
    typedLineage.forEach((entry, i) => {
      const fromIcon = entry.from_agent === 'User' ? '👤' : (agentIcons[entry.from_agent] || '');
      const toIcon = agentIcons[entry.to_agent] || '';
      lines.push(`| ${i + 1} | ${fromIcon} ${entry.from_agent} | ${toIcon} ${entry.to_agent} | ${entry.reason} | ${formatDate(entry.timestamp)} |`);
    });
    lines.push('');
  }
  
  // Audit Log (recent entries)
  if (typedAudit.entries && typedAudit.entries.length > 0) {
    lines.push('## 📜 Recent Activity');
    lines.push('');
    lines.push('| Time | Action | Details |');
    lines.push('|------|--------|---------|');
    
    const recentEntries = typedAudit.entries.slice(-20);
    for (const entry of recentEntries) {
      const details = entry.details ? JSON.stringify(entry.details).substring(0, 50) : '-';
      lines.push(`| ${formatDate(entry.timestamp)} | ${entry.action} | ${details} |`);
    }
    lines.push('');
  }
  
  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Report generated by Memory Observer Dashboard*');
  
  return lines.join('\n');
}

// GET /api/reports/:workspaceId/:planId/markdown - Export plan as Markdown
reportsRouter.get('/:workspaceId/:planId/markdown', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    
    const plan = await getPlanState(globalThis.MBS_DATA_ROOT, workspaceId, planId) as PlanState | null;
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    const lineage = await getPlanLineage(globalThis.MBS_DATA_ROOT, workspaceId, planId);
    const audit = await getPlanAudit(globalThis.MBS_DATA_ROOT, workspaceId, planId) as { entries?: Array<{ timestamp: string; action: string; details?: unknown }> } | null;
    
    const markdown = generateMarkdownReport(plan, lineage, audit);
    
    // Return as downloadable file or JSON with content
    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${plan.title.replace(/[^a-z0-9]/gi, '_')}_report.md"`);
      res.send(markdown);
    } else {
      res.json({ 
        content: markdown,
        filename: `${plan.title.replace(/[^a-z0-9]/gi, '_')}_report.md`,
        plan_id: planId,
        generated_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error generating markdown report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// GET /api/reports/:workspaceId/:planId/json - Export plan as JSON
reportsRouter.get('/:workspaceId/:planId/json', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    
    const plan = await getPlanState(globalThis.MBS_DATA_ROOT, workspaceId, planId) as PlanState | null;
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    const lineage = await getPlanLineage(globalThis.MBS_DATA_ROOT, workspaceId, planId);
    const audit = await getPlanAudit(globalThis.MBS_DATA_ROOT, workspaceId, planId);
    
    const planSteps = (plan.steps || []) as PlanStep[];
    const planSessions = (plan.agent_sessions || []) as AgentSession[];
    
    const report = {
      generated_at: new Date().toISOString(),
      plan,
      lineage,
      audit,
      summary: {
        total_steps: planSteps.length,
        completed_steps: planSteps.filter((s: PlanStep) => s.status === 'done').length,
        total_sessions: planSessions.length,
        total_handoffs: lineage.length,
        duration_ms: new Date(plan.updated_at).getTime() - new Date(plan.created_at).getTime(),
      }
    };
    
    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${plan.title.replace(/[^a-z0-9]/gi, '_')}_report.json"`);
    }
    
    res.json(report);
  } catch (error) {
    console.error('Error generating JSON report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

