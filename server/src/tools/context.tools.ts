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
  ToolResponse,
  GenerateAgentInstructionsParams,
  AgentInstructionFile
} from '../types/index.js';
import * as store from '../storage/file-store.js';
import { sanitizeJsonData, sanitizeContent, addSecurityMetadata } from '../security/sanitize.js';
import { appendWorkspaceFileUpdate } from '../logging/workspace-update-log.js';

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
    
    await store.writeJsonLocked(contextPath, contextData);
    await appendWorkspaceFileUpdate({
      workspace_id,
      plan_id,
      file_path: contextPath,
      summary: `Stored context ${type}`,
      action: 'store_context'
    });
    
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
    
    await store.writeJsonLocked(contextPath, initialContext);
    await appendWorkspaceFileUpdate({
      workspace_id,
      plan_id,
      file_path: contextPath,
      summary: 'Stored initial user context',
      action: 'store_initial_context'
    });
    
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
    await appendWorkspaceFileUpdate({
      workspace_id,
      plan_id,
      file_path: filePath,
      summary: `Appended research note ${safeFilename}`,
      action: 'append_research'
    });
    
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
      await appendWorkspaceFileUpdate({
        workspace_id,
        plan_id,
        file_path: output_path,
        summary: 'Generated plan instructions',
        action: 'generate_plan_instructions'
      });
      
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

/**
 * Generate agent-specific instruction file for subagent handoff
 * 
 * This creates a lightweight instruction file in the user's workspace 
 * (not MCP data folder) that the Coordinator can generate before handing 
 * off to a subagent. The subagent can then read this file to understand
 * their mission.
 * 
 * Files are written to: {workspace}/.memory/instructions/{target_agent}-{timestamp}.md
 */
export async function generateAgentInstructions(
  params: GenerateAgentInstructionsParams
): Promise<ToolResponse<{ instruction_file: AgentInstructionFile; content: string; written_to: string }>> {
  try {
    const { 
      workspace_id, 
      plan_id, 
      target_agent,
      mission,
      context = [],
      constraints = [],
      deliverables = [],
      files_to_read = [],
      output_path
    } = params;
    
    if (!workspace_id || !plan_id || !target_agent || !mission) {
      return {
        success: false,
        error: 'workspace_id, plan_id, target_agent, and mission are required'
      };
    }
    
    // Get workspace to find actual workspace path
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
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
    
    const { promises: fs } = await import('fs');
    const path = await import('path');
    
    // Generate timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `${target_agent.toLowerCase()}-${timestamp}.md`;
    
    // Determine output path - write to USER'S workspace, not MCP data folder
    const workspaceRoot = workspace.path;
    const instructionsDir = path.join(workspaceRoot, '.memory', 'instructions');
    const finalOutputPath = output_path 
      ? path.isAbsolute(output_path) 
        ? output_path 
        : path.join(workspaceRoot, output_path)
      : path.join(instructionsDir, defaultFilename);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(finalOutputPath), { recursive: true });
    
    // Generate markdown content using template
    const content = generateInstructionTemplate({
      target_agent,
      mission,
      context,
      constraints,
      deliverables,
      files_to_read,
      plan_id,
      plan_title: state.title,
      timestamp: new Date().toISOString()
    });
    
    // Write the instruction file
    await fs.writeFile(finalOutputPath, content, 'utf-8');
    await appendWorkspaceFileUpdate({
      workspace_id,
      plan_id,
      file_path: finalOutputPath,
      summary: `Generated agent instructions for ${target_agent}`,
      action: 'generate_agent_instructions'
    });
    
    // Create the instruction file metadata
    const instructionFile: AgentInstructionFile = {
      filename: path.basename(finalOutputPath),
      target_agent,
      mission,
      context,
      constraints,
      deliverables,
      files_to_read,
      generated_at: new Date().toISOString(),
      plan_id,
      full_path: finalOutputPath
    };
    
    return {
      success: true,
      data: {
        instruction_file: instructionFile,
        content,
        written_to: finalOutputPath
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate agent instructions: ${(error as Error).message}`
    };
  }
}

/**
 * Generate the markdown template for agent instructions
 */
function generateInstructionTemplate(params: {
  target_agent: string;
  mission: string;
  context: string[];
  constraints: string[];
  deliverables: string[];
  files_to_read: string[];
  plan_id: string;
  plan_title: string;
  timestamp: string;
}): string {
  const {
    target_agent,
    mission,
    context,
    constraints,
    deliverables,
    files_to_read,
    plan_id,
    plan_title,
    timestamp
  } = params;
  
  const contextSection = context.length > 0
    ? context.map(c => `- ${c}`).join('\n')
    : '_No additional context provided._';
  
  const constraintsSection = constraints.length > 0
    ? constraints.map(c => `- ${c}`).join('\n')
    : '_No specific constraints._';
  
  const deliverablesSection = deliverables.length > 0
    ? deliverables.map(d => `- ${d}`).join('\n')
    : '_No specific deliverables defined._';
  
  const filesSection = files_to_read.length > 0
    ? files_to_read.map(f => `- \`${f}\``).join('\n')
    : '_No specific files to review._';
  
  return `# Instructions for ${target_agent}

## Mission

${mission}

## Context

${contextSection}

## Constraints

${constraintsSection}

## Deliverables

${deliverablesSection}

## Files to Review

${filesSection}

---
Generated: ${timestamp}
Plan: ${plan_id}
Plan Title: ${plan_title}
`;
}

/**
 * Discover instruction files in a workspace for a specific agent
 * 
 * Searches in {workspace}/.memory/instructions/ for files that match
 * the target agent name. Returns the content of matching instruction files.
 */
export async function discoverInstructionFiles(
  params: { workspace_id: string; target_agent: string }
): Promise<ToolResponse<{ instructions: AgentInstructionFile[]; contents: Record<string, string> }>> {
  try {
    const { workspace_id, target_agent } = params;
    
    if (!workspace_id || !target_agent) {
      return {
        success: false,
        error: 'workspace_id and target_agent are required'
      };
    }
    
    // Get workspace to find actual workspace path
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }
    
    const { promises: fs } = await import('fs');
    const path = await import('path');
    
    const instructionsDir = path.join(workspace.path, '.memory', 'instructions');
    
    // Check if instructions directory exists
    try {
      await fs.access(instructionsDir);
    } catch {
      // Directory doesn't exist, no instructions to discover
      return {
        success: true,
        data: { instructions: [], contents: {} }
      };
    }
    
    // List all files in the instructions directory
    const files = await fs.readdir(instructionsDir);
    
    // Filter files that match the target agent (case-insensitive)
    const agentLower = target_agent.toLowerCase();
    const matchingFiles = files.filter(f => 
      f.toLowerCase().startsWith(agentLower) && f.endsWith('.md')
    );
    
    // Sort by modification time (newest first) to get most recent instruction
    const fileStats = await Promise.all(
      matchingFiles.map(async f => {
        const fullPath = path.join(instructionsDir, f);
        const stats = await fs.stat(fullPath);
        return { filename: f, path: fullPath, mtime: stats.mtime };
      })
    );
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    // Read the content of each matching file and parse it
    const instructions: AgentInstructionFile[] = [];
    const contents: Record<string, string> = {};
    
    for (const file of fileStats) {
      const content = await fs.readFile(file.path, 'utf-8');
      contents[file.filename] = content;
      
      // Parse the instruction file content to extract metadata
      const parsed = parseInstructionFile(content, file.filename, file.path, target_agent);
      if (parsed) {
        instructions.push(parsed);
      }
    }
    
    return {
      success: true,
      data: { instructions, contents }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to discover instruction files: ${(error as Error).message}`
    };
  }
}

/**
 * Parse an instruction markdown file to extract metadata
 */
function parseInstructionFile(
  content: string, 
  filename: string, 
  fullPath: string,
  target_agent: string
): AgentInstructionFile | null {
  try {
    // Extract mission from ## Mission section
    const missionMatch = content.match(/## Mission\n\n([\s\S]*?)(?=\n## |$)/);
    const mission = missionMatch ? missionMatch[1].trim() : '';
    
    // Extract context from ## Context section
    const contextMatch = content.match(/## Context\n\n([\s\S]*?)(?=\n## |$)/);
    const contextRaw = contextMatch ? contextMatch[1].trim() : '';
    const context = extractBulletList(contextRaw);
    
    // Extract constraints from ## Constraints section
    const constraintsMatch = content.match(/## Constraints\n\n([\s\S]*?)(?=\n## |$)/);
    const constraintsRaw = constraintsMatch ? constraintsMatch[1].trim() : '';
    const constraints = extractBulletList(constraintsRaw);
    
    // Extract deliverables from ## Deliverables section
    const deliverablesMatch = content.match(/## Deliverables\n\n([\s\S]*?)(?=\n## |$)/);
    const deliverablesRaw = deliverablesMatch ? deliverablesMatch[1].trim() : '';
    const deliverables = extractBulletList(deliverablesRaw);
    
    // Extract files to review from ## Files to Review section
    const filesMatch = content.match(/## Files to Review\n\n([\s\S]*?)(?=\n---|$)/);
    const filesRaw = filesMatch ? filesMatch[1].trim() : '';
    const files_to_read = extractBulletList(filesRaw).map(f => f.replace(/`/g, ''));
    
    // Extract plan_id from footer
    const planIdMatch = content.match(/Plan: ([a-zA-Z0-9_-]+)/);
    const plan_id = planIdMatch ? planIdMatch[1] : '';
    
    // Extract generated timestamp from footer
    const timestampMatch = content.match(/Generated: (.+)/);
    const generated_at = timestampMatch ? timestampMatch[1].trim() : '';
    
    return {
      filename,
      target_agent: target_agent as import('../types/index.js').AgentType,
      mission,
      context,
      constraints,
      deliverables,
      files_to_read,
      generated_at,
      plan_id,
      full_path: fullPath
    };
  } catch {
    return null;
  }
}

/**
 * Extract bullet list items from markdown content
 */
function extractBulletList(content: string): string[] {
  if (content.startsWith('_')) {
    // Italicized placeholder text like "_No additional context provided._"
    return [];
  }
  return content
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.substring(2).trim());
}
