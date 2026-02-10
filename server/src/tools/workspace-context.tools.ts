/**
 * Workspace Context Tools - CRUD for workspace-level context storage
 */

import { promises as fs } from 'fs';
import type {
  ToolResponse,
  WorkspaceContext,
  WorkspaceContextSection,
  WorkspaceMeta
} from '../types/index.js';
import * as store from '../storage/file-store.js';
import { sanitizeJsonData } from '../security/sanitize.js';
import { appendWorkspaceFileUpdate } from '../logging/workspace-update-log.js';

const WORKSPACE_CONTEXT_SCHEMA_VERSION = '1.0.0';
const MAX_CONTEXT_BYTES = 1024 * 1024;

interface WorkspaceContextResult {
  context: WorkspaceContext;
  path: string;
}

interface WorkspaceContextDeleteResult {
  deleted: boolean;
  path: string;
}

function getWorkspacePathForValidation(workspace: WorkspaceMeta): string {
  return workspace.workspace_path || workspace.path;
}

async function validateWorkspaceIdentity(workspaceId: string, workspace: WorkspaceMeta): Promise<ToolResponse<void>> {
  const workspacePath = getWorkspacePathForValidation(workspace);
  const resolvedId = await store.resolveWorkspaceIdForPath(workspacePath);

  if (resolvedId !== workspaceId) {
    return {
      success: false,
      error: `Workspace ID mismatch: resolved ${resolvedId} for path ${workspacePath}, but got ${workspaceId}`
    };
  }

  return { success: true };
}

function parseSections(sections: unknown): ToolResponse<Record<string, WorkspaceContextSection>> {
  if (sections === undefined) {
    return { success: true, data: {} } as ToolResponse<Record<string, WorkspaceContextSection>>;
  }

  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) {
    return {
      success: false,
      error: 'sections must be an object keyed by section name'
    };
  }

  const validated: Record<string, WorkspaceContextSection> = {};

  for (const [sectionKey, value] of Object.entries(sections)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        success: false,
        error: `Section "${sectionKey}" must be an object`
      };
    }

    const section = value as WorkspaceContextSection;

    if (section.summary !== undefined && typeof section.summary !== 'string') {
      return {
        success: false,
        error: `Section "${sectionKey}" summary must be a string`
      };
    }

    if (section.items !== undefined) {
      if (!Array.isArray(section.items)) {
        return {
          success: false,
          error: `Section "${sectionKey}" items must be an array`
        };
      }

      for (const item of section.items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return {
            success: false,
            error: `Section "${sectionKey}" items must be objects`
          };
        }

        if (typeof (item as { title?: unknown }).title !== 'string') {
          return {
            success: false,
            error: `Section "${sectionKey}" items require a string title`
          };
        }
      }
    }

    validated[sectionKey] = section;
  }

  const sanitized = sanitizeJsonData(validated as Record<string, unknown>) as Record<string, WorkspaceContextSection>;
  return { success: true, data: sanitized };
}

function mergeSections(
  existing: Record<string, WorkspaceContextSection>,
  updates: Record<string, WorkspaceContextSection>
): Record<string, WorkspaceContextSection> {
  const merged: Record<string, WorkspaceContextSection> = { ...existing };

  for (const [key, value] of Object.entries(updates)) {
    const current = existing[key] || {};
    merged[key] = {
      summary: value.summary !== undefined ? value.summary : current.summary,
      items: value.items !== undefined ? value.items : current.items
    };
  }

  return merged;
}

function ensureSizeLimit(context: WorkspaceContext): ToolResponse<void> {
  const bytes = Buffer.byteLength(JSON.stringify(context), 'utf8');
  if (bytes > MAX_CONTEXT_BYTES) {
    return {
      success: false,
      error: `Workspace context exceeds size limit (${MAX_CONTEXT_BYTES} bytes)`
    };
  }
  return { success: true };
}

async function loadWorkspace(workspaceId: string): Promise<ToolResponse<WorkspaceMeta>> {
  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) {
    return {
      success: false,
      error: `Workspace not found: ${workspaceId}`
    };
  }

  const identityCheck = await validateWorkspaceIdentity(workspaceId, workspace);
  if (!identityCheck.success) {
    return identityCheck as ToolResponse<WorkspaceMeta>;
  }

  return { success: true, data: workspace };
}

export async function getWorkspaceContext(
  params: { workspace_id: string }
): Promise<ToolResponse<WorkspaceContextResult>> {
  try {
    const { workspace_id } = params;

    if (!workspace_id) {
      return {
        success: false,
        error: 'workspace_id is required'
      };
    }

    const workspaceResult = await loadWorkspace(workspace_id);
    if (!workspaceResult.success || !workspaceResult.data) {
      return {
        success: false,
        error: workspaceResult.error || 'Workspace validation failed'
      };
    }

    const contextPath = store.getWorkspaceContextPath(workspace_id);
    const context = await store.readJson<WorkspaceContext>(contextPath);

    if (!context) {
      return {
        success: false,
        error: `Workspace context not found for ${workspace_id}`
      };
    }

    return {
      success: true,
      data: {
        context,
        path: contextPath
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get workspace context: ${(error as Error).message}`
    };
  }
}

export async function setWorkspaceContext(
  params: { workspace_id: string; data: Record<string, unknown> }
): Promise<ToolResponse<WorkspaceContextResult>> {
  try {
    const { workspace_id, data } = params;

    if (!workspace_id || !data) {
      return {
        success: false,
        error: 'workspace_id and data are required'
      };
    }

    const workspaceResult = await loadWorkspace(workspace_id);
    if (!workspaceResult.success || !workspaceResult.data) {
      return {
        success: false,
        error: workspaceResult.error || 'Workspace validation failed'
      };
    }

    const workspace = workspaceResult.data;
    const contextPath = store.getWorkspaceContextPath(workspace_id);
    const existing = await store.readJson<WorkspaceContext>(contextPath);

    if (data.workspace_id && data.workspace_id !== workspace_id) {
      return {
        success: false,
        error: `workspace_id mismatch in payload (expected ${workspace_id})`
      };
    }

    const workspacePath = getWorkspacePathForValidation(workspace);
    if (data.workspace_path && data.workspace_path !== workspacePath) {
      return {
        success: false,
        error: `workspace_path mismatch in payload (expected ${workspacePath})`
      };
    }

    const sectionsResult = parseSections(data.sections);
    if (!sectionsResult.success || !sectionsResult.data) {
      return {
        success: false,
        error: sectionsResult.error || 'Invalid sections payload'
      };
    }

    const now = store.nowISO();
    const identityFilePath = store.getWorkspaceIdentityPath(workspacePath);
    const context: WorkspaceContext = {
      schema_version: typeof data.schema_version === 'string'
        ? data.schema_version
        : WORKSPACE_CONTEXT_SCHEMA_VERSION,
      workspace_id,
      workspace_path: workspacePath,
      identity_file_path: identityFilePath,
      name: typeof data.name === 'string' ? data.name : workspace.name,
      created_at: existing?.created_at || now,
      updated_at: now,
      sections: sectionsResult.data,
      update_log: existing?.update_log,
      audit_log: existing?.audit_log
    };

    const sizeCheck = ensureSizeLimit(context);
    if (!sizeCheck.success) {
      return sizeCheck as ToolResponse<WorkspaceContextResult>;
    }

    await store.writeJsonLocked(contextPath, context);
    await appendWorkspaceFileUpdate({
      workspace_id,
      file_path: contextPath,
      summary: 'Set workspace context',
      action: 'set_workspace_context'
    });

    return {
      success: true,
      data: {
        context,
        path: contextPath
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to set workspace context: ${(error as Error).message}`
    };
  }
}

export async function updateWorkspaceContext(
  params: { workspace_id: string; data: Record<string, unknown> }
): Promise<ToolResponse<WorkspaceContextResult>> {
  try {
    const { workspace_id, data } = params;

    if (!workspace_id || !data) {
      return {
        success: false,
        error: 'workspace_id and data are required'
      };
    }

    const workspaceResult = await loadWorkspace(workspace_id);
    if (!workspaceResult.success || !workspaceResult.data) {
      return {
        success: false,
        error: workspaceResult.error || 'Workspace validation failed'
      };
    }

    const workspace = workspaceResult.data;
    const contextPath = store.getWorkspaceContextPath(workspace_id);
    const existing = await store.readJson<WorkspaceContext>(contextPath);

    if (!existing) {
      return {
        success: false,
        error: `Workspace context not found for ${workspace_id}`
      };
    }

    if (data.workspace_id && data.workspace_id !== workspace_id) {
      return {
        success: false,
        error: `workspace_id mismatch in payload (expected ${workspace_id})`
      };
    }

    const workspacePath = getWorkspacePathForValidation(workspace);
    if (data.workspace_path && data.workspace_path !== workspacePath) {
      return {
        success: false,
        error: `workspace_path mismatch in payload (expected ${workspacePath})`
      };
    }

    const sectionsResult = parseSections(data.sections);
    if (!sectionsResult.success || !sectionsResult.data) {
      return {
        success: false,
        error: sectionsResult.error || 'Invalid sections payload'
      };
    }

    const now = store.nowISO();
    const identityFilePath = store.getWorkspaceIdentityPath(workspacePath);
    const updated: WorkspaceContext = {
      ...existing,
      schema_version: typeof data.schema_version === 'string'
        ? data.schema_version
        : existing.schema_version,
      workspace_id,
      workspace_path: workspacePath,
      identity_file_path: identityFilePath,
      name: typeof data.name === 'string' ? data.name : existing.name,
      updated_at: now,
      sections: mergeSections(existing.sections || {}, sectionsResult.data)
    };

    const sizeCheck = ensureSizeLimit(updated);
    if (!sizeCheck.success) {
      return sizeCheck as ToolResponse<WorkspaceContextResult>;
    }

    await store.writeJsonLocked(contextPath, updated);
    await appendWorkspaceFileUpdate({
      workspace_id,
      file_path: contextPath,
      summary: 'Updated workspace context',
      action: 'update_workspace_context'
    });

    return {
      success: true,
      data: {
        context: updated,
        path: contextPath
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update workspace context: ${(error as Error).message}`
    };
  }
}

export async function deleteWorkspaceContext(
  params: { workspace_id: string }
): Promise<ToolResponse<WorkspaceContextDeleteResult>> {
  try {
    const { workspace_id } = params;

    if (!workspace_id) {
      return {
        success: false,
        error: 'workspace_id is required'
      };
    }

    const workspaceResult = await loadWorkspace(workspace_id);
    if (!workspaceResult.success || !workspaceResult.data) {
      return {
        success: false,
        error: workspaceResult.error || 'Workspace validation failed'
      };
    }

    const contextPath = store.getWorkspaceContextPath(workspace_id);
    const exists = await store.exists(contextPath);

    if (!exists) {
      return {
        success: false,
        error: `Workspace context not found for ${workspace_id}`
      };
    }

    await fs.unlink(contextPath);
    await appendWorkspaceFileUpdate({
      workspace_id,
      file_path: contextPath,
      summary: 'Deleted workspace context',
      action: 'delete_workspace_context'
    });

    return {
      success: true,
      data: {
        deleted: true,
        path: contextPath
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete workspace context: ${(error as Error).message}`
    };
  }
}
