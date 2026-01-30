/**
 * Agent Tools - MCP tools for deploying agent instruction files to workspaces
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ToolResponse } from '../types/index.js';

// Path to the agents directory (relative to the server)
const AGENTS_ROOT = process.env.MBS_AGENTS_ROOT || path.join(process.cwd(), '..', 'agents');

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
 * Deploy agent instruction files to a workspace's .vscode/agents directory
 */
export async function deployAgentsToWorkspace(
  params: { workspace_path: string; agents?: string[] }
): Promise<ToolResponse<{ deployed: string[]; target_path: string }>> {
  try {
    const { workspace_path, agents } = params;
    
    if (!workspace_path) {
      return {
        success: false,
        error: 'workspace_path is required'
      };
    }
    
    // Target directory: {workspace}/.github/agents/
    const targetDir = path.join(workspace_path, '.github', 'agents');
    
    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });
    
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
      const targetPath = path.join(targetDir, file);
      
      const content = await fs.readFile(sourcePath, 'utf-8');
      await fs.writeFile(targetPath, content, 'utf-8');
      deployed.push(file);
    }
    
    return {
      success: true,
      data: {
        deployed,
        target_path: targetDir
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
