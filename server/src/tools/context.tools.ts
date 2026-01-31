/**
 * Context Tools - MCP tools for storing and retrieving context data
 * 
 * Handles audit logs, research notes, and other context data storage.
 * Includes security sanitization for all stored content.
 */

import type {
  StoreContextParams,
  StoreInitialContextParams,
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
 * Store the initial user context for a plan.
 * 
 * This is a specialized tool for Coordinators to capture the full user request
 * and all associated context when creating a new plan. This data is used by
 * Researcher and Architect to understand what the user wants.
 * 
 * Creates: original_request.json in the plan folder
 */
export async function storeInitialContext(
  params: StoreInitialContextParams
): Promise<ToolResponse<{ path: string; context_summary: string }>> {
  try {
    const { 
      workspace_id, 
      plan_id, 
      user_request,
      files_mentioned,
      file_contents,
      requirements,
      constraints,
      examples,
      conversation_context,
      additional_notes
    } = params;
    
    if (!workspace_id || !plan_id || !user_request) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and user_request are required'
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
    
    const contextPath = store.getContextPath(workspace_id, plan_id, 'original_request');
    
    // Structure the initial context
    const initialContext = {
      type: 'original_request',
      plan_id,
      workspace_id,
      captured_at: store.nowISO(),
      user_request: sanitizeContent(user_request),
      context: {
        files_mentioned: files_mentioned || [],
        file_contents: file_contents ? sanitizeJsonData(file_contents) : {},
        requirements: requirements || [],
        constraints: constraints || [],
        examples: examples || [],
        conversation_context: conversation_context ? sanitizeContent(conversation_context) : null,
        additional_notes: additional_notes ? sanitizeContent(additional_notes) : null
      }
    };
    
    await store.writeJson(contextPath, initialContext);
    
    // Generate a summary for the response
    const contextSummary = [
      `User request: ${user_request.substring(0, 100)}${user_request.length > 100 ? '...' : ''}`,
      files_mentioned?.length ? `Files mentioned: ${files_mentioned.length}` : null,
      file_contents ? `File contents attached: ${Object.keys(file_contents).length}` : null,
      requirements?.length ? `Requirements: ${requirements.length}` : null,
      constraints?.length ? `Constraints: ${constraints.length}` : null,
    ].filter(Boolean).join(' | ');
    
    return {
      success: true,
      data: { 
        path: contextPath,
        context_summary: contextSummary
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to store initial context: ${(error as Error).message}`
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

/**
 * Generate a dynamic .instructions.md file with current plan context
 * This can be written to the workspace for Copilot to pick up
 */
export async function generatePlanInstructions(
  params: { workspace_id: string; plan_id: string; output_path?: string }
): Promise<ToolResponse<{ content: string; written_to?: string }>> {
  try {
    const { workspace_id, plan_id, output_path } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    // Get plan state
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Get recent handoffs (last 5)
    const recentHandoffs = state.lineage?.slice(-5) || [];
    
    // Get active/pending steps
    const activeSteps = state.steps?.filter(s => s.status === 'active') || [];
    const pendingSteps = state.steps?.filter(s => s.status === 'pending')?.slice(0, 5) || [];
    
    // Get current agent session
    const currentSession = state.agent_sessions?.find(s => !s.completed_at);
    
    // Generate markdown content
    const content = `---
applyTo: "**/*"
---

# Current Plan Context

> Auto-generated instructions for plan: ${state.title}
> Generated: ${new Date().toISOString()}

## Plan Overview

- **Plan ID**: ${plan_id}
- **Title**: ${state.title}
- **Category**: ${state.category || 'unknown'}
- **Priority**: ${state.priority || 'medium'}
- **Status**: ${state.status}
- **Current Phase**: ${state.current_phase || 'not set'}

## Current Agent

${currentSession ? `
- **Agent**: ${currentSession.agent_type}
- **Started**: ${currentSession.started_at}
` : 'No active agent session'}

## Active Steps

${activeSteps.length > 0 
  ? activeSteps.map(s => `- [ ] **${s.task}** (step ${s.index})`).join('\n')
  : 'No active steps'}

## Upcoming Steps

${pendingSteps.length > 0
  ? pendingSteps.map(s => `- ${s.task}`).join('\n')
  : 'No pending steps'}

## Recent Handoffs

${recentHandoffs.length > 0
  ? recentHandoffs.map(h => `- ${h.from_agent} → ${h.to_agent}: ${h.reason}`).join('\n')
  : 'No handoff history'}

## Recommended Next Agent

${state.recommended_next_agent 
  ? `**${state.recommended_next_agent}** is recommended as the next agent.`
  : 'No recommendation set'}

## Instructions

When working on this plan:
1. Use \`get_plan_state\` to fetch the latest state before making decisions
2. Use \`update_step\` to mark progress on active steps
3. Call \`handoff\` to recommend the next agent when done
4. Call \`complete_agent\` to finalize your session
`;

    // Write to file if output path provided
    if (output_path) {
      const { promises: fs } = await import('fs');
      const path = await import('path');
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(output_path), { recursive: true });
      await fs.writeFile(output_path, content, 'utf-8');
      
      return {
        success: true,
        data: {
          content,
          written_to: output_path
        }
      };
    }
    
    return {
      success: true,
      data: { content }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate plan instructions: ${(error as Error).message}`
    };
  }
}
