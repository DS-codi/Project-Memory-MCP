/**
 * Agent Tools - MCP tools for deploying agent instruction files to workspaces
 * and managing agent spawn/validation workflows.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ToolResponse, AgentType } from '../types/index.js';
import { AGENT_BOUNDARIES } from '../types/index.js';
import { appendWorkspaceFileUpdate } from '../logging/workspace-update-log.js';
import { deploySkillsToWorkspace } from './skills.tools.js';
import { validateAgentExists, loadAgentInstructions, listKnownAgentNames } from '../utils/agent-loader.js';
import * as store from '../storage/file-store.js';

// Path to the agents directory (relative to the server)
const AGENTS_ROOT = process.env.MBS_AGENTS_ROOT || path.join(process.cwd(), '..', 'agents');
const PROMPTS_ROOT = process.env.MBS_PROMPTS_ROOT || path.join(process.cwd(), '..', 'prompts');
const INSTRUCTIONS_ROOT = process.env.MBS_INSTRUCTIONS_ROOT || path.join(process.cwd(), '..', 'instructions');

/**
 * List available agent instruction files
 */
export async function listAgents(): Promise<ToolResponse<string[]>> {
  try {
    const files = await fs.readdir(AGENTS_ROOT);
    const agentFiles = files.filter(f => f.endsWith('.agent.md'));
    
    return {
      success: true,
      data: agentFiles
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list agents: ${(error as Error).message}`
    };
  }
}

/**
 * Deploy agent instruction files to a workspace's .github/agents directory
 * Also deploys prompts and instructions if available
 */
export async function deployAgentsToWorkspace(
  params: { workspace_path: string; agents?: string[]; include_prompts?: boolean; include_instructions?: boolean; include_skills?: boolean }
): Promise<ToolResponse<{ deployed: string[]; prompts_deployed: string[]; instructions_deployed: string[]; skills_deployed: string[]; target_path: string }>> {
  try {
    const { workspace_path, agents, include_prompts = true, include_instructions = true, include_skills = true } = params;
    
    if (!workspace_path) {
      return {
        success: false,
        error: 'workspace_path is required'
      };
    }
    
    // Target directories under {workspace}/.github/
    const agentsDir = path.join(workspace_path, '.github', 'agents');
    const promptsDir = path.join(workspace_path, '.github', 'prompts');
    const instructionsDir = path.join(workspace_path, '.github', 'instructions');
    
    // Ensure target directories exist
    await fs.mkdir(agentsDir, { recursive: true });
    
    // Get list of agent files to deploy
    const allAgentFiles = await fs.readdir(AGENTS_ROOT);
    const agentFiles = allAgentFiles.filter(f => f.endsWith('.agent.md'));
    
    // Filter to specific agents if requested
    const filesToDeploy = agents 
      ? agentFiles.filter(f => agents.some(a => f.toLowerCase().includes(a.toLowerCase())))
      : agentFiles;
    
    if (filesToDeploy.length === 0) {
      return {
        success: false,
        error: 'No matching agent files found'
      };
    }
    
    // Copy each agent file
    const deployed: string[] = [];
    for (const file of filesToDeploy) {
      const sourcePath = path.join(AGENTS_ROOT, file);
      const targetPath = path.join(agentsDir, file);
      
      const content = await fs.readFile(sourcePath, 'utf-8');
      await fs.writeFile(targetPath, content, 'utf-8');
      await appendWorkspaceFileUpdate({
        workspace_path: workspace_path,
        file_path: targetPath,
        summary: `Deployed agent file ${file}`,
        action: 'deploy_agent_file'
      });
      deployed.push(file);
    }
    
    // Deploy prompts if requested and directory exists
    const prompts_deployed: string[] = [];
    if (include_prompts) {
      try {
        const promptFiles = await fs.readdir(PROMPTS_ROOT);
        const promptMdFiles = promptFiles.filter(f => f.endsWith('.prompt.md'));
        
        if (promptMdFiles.length > 0) {
          await fs.mkdir(promptsDir, { recursive: true });
          
          for (const file of promptMdFiles) {
            const sourcePath = path.join(PROMPTS_ROOT, file);
            const targetPath = path.join(promptsDir, file);
            
            const content = await fs.readFile(sourcePath, 'utf-8');
            await fs.writeFile(targetPath, content, 'utf-8');
            await appendWorkspaceFileUpdate({
              workspace_path: workspace_path,
              file_path: targetPath,
              summary: `Deployed prompt file ${file}`,
              action: 'deploy_prompt_file'
            });
            prompts_deployed.push(file);
          }
        }
      } catch {
        // Prompts directory doesn't exist, skip
      }
    }
    
    // Deploy instructions if requested and directory exists
    const instructions_deployed: string[] = [];
    if (include_instructions) {
      try {
        const instructionFiles = await fs.readdir(INSTRUCTIONS_ROOT);
        const instructionMdFiles = instructionFiles.filter(f => f.endsWith('.instructions.md'));
        
        if (instructionMdFiles.length > 0) {
          await fs.mkdir(instructionsDir, { recursive: true });
          
          for (const file of instructionMdFiles) {
            const sourcePath = path.join(INSTRUCTIONS_ROOT, file);
            const targetPath = path.join(instructionsDir, file);
            
            const content = await fs.readFile(sourcePath, 'utf-8');
            await fs.writeFile(targetPath, content, 'utf-8');
            await appendWorkspaceFileUpdate({
              workspace_path: workspace_path,
              file_path: targetPath,
              summary: `Deployed instruction file ${file}`,
              action: 'deploy_instruction_file'
            });
            instructions_deployed.push(file);
          }
        }
      } catch {
        // Instructions directory doesn't exist, skip
      }
    }
    
    // Deploy skills if requested
    const skills_deployed: string[] = [];
    if (include_skills) {
      try {
        const skillsResult = await deploySkillsToWorkspace({ workspace_path });
        if (skillsResult.success && skillsResult.data) {
          skills_deployed.push(...skillsResult.data.deployed);
        }
      } catch {
        // Skills directory doesn't exist, skip
      }
    }
    
    return {
      success: true,
      data: {
        deployed,
        prompts_deployed,
        instructions_deployed,
        skills_deployed,
        target_path: agentsDir
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to deploy agents: ${(error as Error).message}`
    };
  }
}

/**
 * Get the content of a specific agent instruction file
 */
export async function getAgentInstructions(
  params: { agent_name: string }
): Promise<ToolResponse<{ filename: string; content: string }>> {
  try {
    const { agent_name } = params;
    
    if (!agent_name) {
      return {
        success: false,
        error: 'agent_name is required'
      };
    }
    
    // Find matching agent file
    const files = await fs.readdir(AGENTS_ROOT);
    const agentFile = files.find(f => 
      f.endsWith('.agent.md') && 
      f.toLowerCase().includes(agent_name.toLowerCase())
    );
    
    if (!agentFile) {
      return {
        success: false,
        error: `Agent not found: ${agent_name}`
      };
    }
    
    const content = await fs.readFile(path.join(AGENTS_ROOT, agentFile), 'utf-8');
    
    return {
      success: true,
      data: {
        filename: agentFile,
        content
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get agent instructions: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Spawn Handler — Gatekeeper Validation + Context Injection
// =============================================================================

/** Hub agent types that are allowed to spawn subagents */
const HUB_AGENTS: AgentType[] = ['Coordinator', 'Analyst', 'Runner', 'TDDDriver'];

export interface SpawnParams {
  agent_name: string;
  task_context?: string;
  workspace_id?: string;
  plan_id?: string;
  /** The agent type of the caller (from the current session) */
  requesting_agent?: AgentType;
}

export interface SpawnResult {
  agent_name: string;
  agent_file: string;
  agent_instructions: string;
  workspace_context: Record<string, unknown>;
  plan_context: Record<string, unknown>;
}

/**
 * Handle a spawn request — validates the target agent exists, checks
 * permissions, injects workspace + plan context, and returns structured
 * data the hub agent can use via runSubagent.
 *
 * This is a VALIDATION + CONTEXT INJECTION tool, not server-side execution.
 */
export async function handleSpawn(
  params: SpawnParams
): Promise<ToolResponse<SpawnResult>> {
  const { agent_name, task_context, workspace_id, plan_id } = params;

  // 1. Validate required params
  if (!agent_name) {
    return { success: false, error: 'agent_name is required for action: spawn' };
  }

  // 2. Gatekeeper — validate agent exists on filesystem
  const agentInfo = await validateAgentExists(agent_name);
  if (!agentInfo) {
    const known = listKnownAgentNames();
    return {
      success: false,
      error: `Agent not found: "${agent_name}". Known agents: ${known.join(', ')}`
    };
  }

  // 3. Check role boundaries — is the target agent allowed to be spawned?
  const targetBoundaries = AGENT_BOUNDARIES[agentInfo.name as AgentType];
  if (!targetBoundaries) {
    return {
      success: false,
      error: `No role boundaries defined for agent: ${agentInfo.name}. Cannot spawn unknown agent type.`
    };
  }

  // 4. Load agent instructions
  const loadResult = await loadAgentInstructions(agent_name);
  if (!loadResult) {
    return {
      success: false,
      error: `Agent file found but could not be loaded: ${agentInfo.filename}`
    };
  }

  // 5. Inject workspace context (if workspace_id provided)
  let workspaceContext: Record<string, unknown> = {};
  if (workspace_id) {
    try {
      const workspace = await store.getWorkspace(workspace_id);
      if (workspace) {
        workspaceContext = {
          workspace_id,
          workspace_path: workspace.path,
          registered_at: workspace.registered_at,
        };
      }
    } catch {
      // Non-fatal — proceed without workspace context
      workspaceContext = { workspace_id, error: 'Could not load workspace metadata' };
    }
  }

  // 6. Inject plan context (if plan_id + workspace_id provided)
  let planContext: Record<string, unknown> = {};
  if (workspace_id && plan_id) {
    try {
      const planState = await store.getPlanState(workspace_id, plan_id);
      if (planState) {
        planContext = {
          plan_id: planState.id,
          title: planState.title,
          status: planState.status,
          current_phase: planState.current_phase,
          current_agent: planState.current_agent,
          step_summary: {
            total: planState.steps?.length ?? 0,
            pending: planState.steps?.filter((s: { status: string }) => s.status === 'pending').length ?? 0,
            active: planState.steps?.filter((s: { status: string }) => s.status === 'active').length ?? 0,
            done: planState.steps?.filter((s: { status: string }) => s.status === 'done').length ?? 0,
            blocked: planState.steps?.filter((s: { status: string }) => s.status === 'blocked').length ?? 0,
          },
        };
        if (task_context) {
          planContext.task_context = task_context;
        }
      }
    } catch {
      // Non-fatal — proceed without plan context
      planContext = { plan_id, error: 'Could not load plan state' };
    }
  }

  return {
    success: true,
    data: {
      agent_name: agentInfo.name,
      agent_file: agentInfo.filename,
      agent_instructions: loadResult.instructions,
      workspace_context: workspaceContext,
      plan_context: planContext,
    }
  };
}
