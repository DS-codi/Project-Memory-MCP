/**
 * Context Tools - MCP tools for storing and retrieving context data
 * 
 * Handles audit logs, research notes, and other context data storage.
 * Includes security sanitization for all stored content.
 */

import type {
  StoreContextParams,
  GetContextParams,
  AppendResearchParams,
  ToolResponse
} from '../types/index.js';
import * as store from '../storage/file-store.js';
import { sanitizeJsonData, sanitizeContent, addSecurityMetadata } from '../security/sanitize.js';

/**
 * Store context data (audit, research, decisions, etc.)
 * All data is sanitized for prompt injection before storage.
 */
export async function storeContext(
  params: StoreContextParams
): Promise<ToolResponse<{ path: string; security_warnings?: string[] }>> {
  try {
    const { workspace_id, plan_id, type, data } = params;
    
    if (!workspace_id || !plan_id || !type || !data) {
      return {
        success: false,
        error: 'workspace_id, plan_id, type, and data are required'
      };
    }
    
    // Verify plan exists
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const contextPath = store.getContextPath(workspace_id, plan_id, type);
    
    // Sanitize data for security
    const sanitizedData = addSecurityMetadata(data, `context/${type}`);
    
    // Add metadata to the context
    const contextData = {
      type,
      plan_id,
      workspace_id,
      stored_at: store.nowISO(),
      data: sanitizedData
    };
    
    await store.writeJson(contextPath, contextData);
    
    return {
      success: true,
      data: { path: contextPath }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to store context: ${(error as Error).message}`
    };
  }
}

/**
 * Get stored context data by type
 */
export async function getContext(
  params: GetContextParams
): Promise<ToolResponse<Record<string, unknown>>> {
  try {
    const { workspace_id, plan_id, type } = params;
    
    if (!workspace_id || !plan_id || !type) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and type are required'
      };
    }
    
    const contextPath = store.getContextPath(workspace_id, plan_id, type);
    const data = await store.readJson<Record<string, unknown>>(contextPath);
    
    if (!data) {
      return {
        success: false,
        error: `Context not found: ${type}`
      };
    }
    
    return {
      success: true,
      data
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get context: ${(error as Error).message}`
    };
  }
}

/**
 * Append a research note file
 * Content is sanitized for potential injection patterns.
 */
export async function appendResearch(
  params: AppendResearchParams
): Promise<ToolResponse<{ 
  path: string; 
  sanitized: boolean; 
  injection_attempts: string[]; 
  warnings: string[] 
}>> {
  try {
    const { workspace_id, plan_id, filename, content } = params;
    
    if (!workspace_id || !plan_id || !filename || !content) {
      return {
        success: false,
        error: 'workspace_id, plan_id, filename, and content are required'
      };
    }
    
    // Verify plan exists
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Sanitize filename
    const safeFilename = filename.replace(/[^a-zA-Z0-9-_.]/g, '-');
    const researchPath = store.getResearchNotesPath(workspace_id, plan_id);
    const filePath = `${researchPath}/${safeFilename}`;
    
    // Sanitize content for security
    const sanitizationResult = sanitizeContent(content);
    
    // Add header with metadata
    const header = `---
plan_id: ${plan_id}
created_at: ${store.nowISO()}
sanitized: ${sanitizationResult.wasModified}
injection_attempts: ${sanitizationResult.injectionAttempts.length}
warnings: ${sanitizationResult.warnings.length}
---

`;
    
    await store.writeText(filePath, header + sanitizationResult.sanitized);
    
    return {
      success: true,
      data: { 
        path: filePath, 
        sanitized: sanitizationResult.wasModified,
        injection_attempts: sanitizationResult.injectionAttempts,
        warnings: sanitizationResult.warnings
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to append research: ${(error as Error).message}`
    };
  }
}

/**
 * List all context files for a plan
 */
export async function listContext(
  params: { workspace_id: string; plan_id: string }
): Promise<ToolResponse<string[]>> {
  try {
    const { workspace_id, plan_id } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    const planPath = store.getPlanPath(workspace_id, plan_id);
    const exists = await store.exists(planPath);
    
    if (!exists) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // List all .json files except state.json
    const { promises: fs } = await import('fs');
    const files = await fs.readdir(planPath);
    const contextFiles = files.filter(f => 
      f.endsWith('.json') && f !== 'state.json'
    );
    
    return {
      success: true,
      data: contextFiles
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list context: ${(error as Error).message}`
    };
  }
}

/**
 * List all research notes for a plan
 */
export async function listResearchNotes(
  params: { workspace_id: string; plan_id: string }
): Promise<ToolResponse<string[]>> {
  try {
    const { workspace_id, plan_id } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    const researchPath = store.getResearchNotesPath(workspace_id, plan_id);
    const exists = await store.exists(researchPath);
    
    if (!exists) {
      return {
        success: true,
        data: []
      };
    }
    
    const { promises: fs } = await import('fs');
    const files = await fs.readdir(researchPath);
    
    return {
      success: true,
      data: files
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list research notes: ${(error as Error).message}`
    };
  }
}
