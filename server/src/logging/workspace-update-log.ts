/**
 * Workspace Update Log - Records file updates in workspace.context.json
 */

import path from 'path';
import type {
  WorkspaceContext,
  WorkspaceUpdateLogEntry,
  WorkspaceAuditEntry
} from '../types/index.js';
import * as store from '../storage/file-store.js';
import { getCurrentAgent, getToolContext } from './tool-logger.js';
import { sanitizeJsonData } from '../security/sanitize.js';

const MAX_UPDATE_LOG_ENTRIES = 500;

export interface WorkspaceFileUpdateInput {
  workspace_id?: string;
  workspace_path?: string;
  plan_id?: string;
  file_path: string;
  summary: string;
  tool?: string;
  action?: string;
  agent?: string;
  untracked?: boolean;
  warning?: string;
}

function normalizePath(value: string): string {
  return path.resolve(value).toLowerCase().replace(/\\/g, '/');
}

async function resolveWorkspaceId(input: WorkspaceFileUpdateInput): Promise<string | undefined> {
  if (input.workspace_id) {
    return input.workspace_id;
  }

  if (input.plan_id) {
    const planMatch = await store.findPlanById(input.plan_id);
    if (planMatch?.workspace_id) {
      return planMatch.workspace_id;
    }
  }

  const toolContext = getToolContext();
  const workspaceFromParams = toolContext?.params?.workspace_id as string | undefined;
  if (workspaceFromParams) {
    return workspaceFromParams;
  }

  if (input.workspace_path) {
    const allWorkspaces = await store.getAllWorkspaces();
    const normalizedInput = normalizePath(input.workspace_path);
    const match = allWorkspaces.find(workspace =>
      normalizePath(workspace.path || workspace.workspace_path || '') === normalizedInput
    );
    if (match?.workspace_id) {
      return match.workspace_id;
    }
  }

  if (input.file_path) {
    const dataRoot = normalizePath(store.getDataRoot());
    const normalizedFilePath = normalizePath(input.file_path);
    if (normalizedFilePath.startsWith(`${dataRoot}/`)) {
      const relative = normalizedFilePath.slice(dataRoot.length + 1);
      const [workspaceId] = relative.split('/');
      if (workspaceId) {
        return workspaceId;
      }
    }
  }

  return undefined;
}

function buildUpdateEntry(input: WorkspaceFileUpdateInput, planId?: string): WorkspaceUpdateLogEntry {
  const toolContext = getToolContext();
  const tool = input.tool || toolContext?.tool || 'unknown';
  const action = input.action;
  const agent = input.agent || (planId ? getCurrentAgent(planId) : undefined) || (toolContext?.params?.agent_type as string | undefined);
  const untracked = input.untracked ?? !planId;
  const warning = input.warning ?? (untracked ? 'File update missing plan_id for provenance.' : undefined);

  const entry: WorkspaceUpdateLogEntry = {
    timestamp: store.nowISO(),
    tool,
    action,
    file_path: input.file_path,
    summary: input.summary,
    plan_id: planId,
    agent,
    untracked,
    warning
  };

  return sanitizeJsonData(entry as unknown as Record<string, unknown>) as unknown as WorkspaceUpdateLogEntry;
}

function buildAuditEntry(update: WorkspaceUpdateLogEntry, warning?: string): WorkspaceAuditEntry | null {
  if (!warning) {
    return null;
  }

  return {
    timestamp: update.timestamp,
    tool: update.tool,
    action: update.action,
    file_path: update.file_path,
    summary: update.summary,
    plan_id: update.plan_id,
    agent: update.agent,
    warning
  };
}

export async function appendWorkspaceFileUpdate(input: WorkspaceFileUpdateInput): Promise<void> {
  const workspaceId = await resolveWorkspaceId(input);
  if (!workspaceId) {
    return;
  }

  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) {
    return;
  }

  const toolContext = getToolContext();
  const planId = input.plan_id || (toolContext?.params?.plan_id as string | undefined);
  let entry = buildUpdateEntry(input, planId);

  if (planId && !entry.warning) {
    const planState = await store.getPlanState(workspaceId, planId);
    const hasActiveStep = planState?.steps.some(step => step.status === 'active');
    if (!hasActiveStep) {
      entry = {
        ...entry,
        untracked: true,
        warning: 'No active plan step recorded for this file update.'
      };
    }
  }

  const auditEntry = buildAuditEntry(entry, entry.warning);
  const contextPath = store.getWorkspaceContextPath(workspaceId);

  await store.modifyJsonLocked<WorkspaceContext>(contextPath, (existing) => {
    const now = store.nowISO();
    const base: WorkspaceContext = existing || {
      schema_version: '1.0.0',
      workspace_id: workspaceId,
      workspace_path: workspace.workspace_path || workspace.path,
      name: workspace.name,
      created_at: now,
      updated_at: now,
      sections: {}
    };

    const updateLog = base.update_log || { entries: [], last_updated: now };
    updateLog.entries = [...updateLog.entries, entry].slice(-MAX_UPDATE_LOG_ENTRIES);
    updateLog.last_updated = now;
    base.update_log = updateLog;

    if (auditEntry) {
      const auditLog = base.audit_log || { entries: [], last_updated: now };
      auditLog.entries = [...auditLog.entries, auditEntry].slice(-MAX_UPDATE_LOG_ENTRIES);
      auditLog.last_updated = now;
      base.audit_log = auditLog;
    }

    base.updated_at = now;
    return base;
  });
}
