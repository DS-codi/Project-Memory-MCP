/**
 * Agent Tools - MCP tools for deploying agent instruction files to workspaces.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ToolResponse } from '../types/index.js';
import { appendWorkspaceFileUpdate } from '../logging/workspace-update-log.js';
import { deploySkillsToWorkspace } from './skills.tools.js';
import { listInstructions as listDbInstructions } from '../db/instruction-db.js';
import { listAgents as listDbAgents } from '../db/agent-definition-db.js';

// Path to the agents directory (relative to the server)
export const AGENTS_ROOT = process.env.MBS_AGENTS_ROOT || path.join(process.cwd(), '..', 'agents');
const PROMPTS_ROOT = process.env.MBS_PROMPTS_ROOT || path.join(process.cwd(), '..', 'prompts');
export const INSTRUCTIONS_ROOT = process.env.MBS_INSTRUCTIONS_ROOT || path.join(process.cwd(), '..', 'instructions');

/**
 * List available agent instruction files
 */
export async function listAgents(): Promise<ToolResponse<string[]>> {
  try {
    // DB-first
    const dbAgents = listDbAgents();
    if (dbAgents.length > 0) {
      return {
        success: true,
        data: dbAgents.map(a => a.name),
      };
    }

    // Filesystem fallback
    const files = await fs.readdir(AGENTS_ROOT);
    const agentFiles = files.filter(f => f.endsWith('.agent.md'));

    return {
      success: true,
      data: agentFiles,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list agents: ${(error as Error).message}`,
    };
  }
}

/**
 * Deploy agent instruction files to a workspace's .github/agents directory
 * Also deploys prompts and instructions if available
 */
export async function deployAgentsToWorkspace(
  params: {
    workspace_path: string;
    agents?: string[];
    include_prompts?: boolean;
    include_instructions?: boolean;
    include_skills?: boolean;
  }
): Promise<ToolResponse<{ deployed: string[]; prompts_deployed: string[]; instructions_deployed: string[]; skills_deployed: string[]; target_path: string }>> {
  try {
    const {
      workspace_path,
      agents,
      include_prompts = true,
      include_instructions = true,
      include_skills = true,
    } = params;

    if (!workspace_path) {
      return {
        success: false,
        error: 'workspace_path is required',
      };
    }

    // Target directories under {workspace}/.github/
    const agentsDir = path.join(workspace_path, '.github', 'agents');
    const promptsDir = path.join(workspace_path, '.github', 'prompts');
    const instructionsDir = path.join(workspace_path, '.github', 'instructions');

    // Ensure target directories exist
    await fs.mkdir(agentsDir, { recursive: true });

    // Get list of agent files to deploy (filesystem source for materialized files)
    const allAgentFiles = await fs.readdir(AGENTS_ROOT);
    const agentFiles = allAgentFiles.filter(f => f.endsWith('.agent.md'));

    // Filter to specific agents if requested
    const filesToDeploy = agents
      ? agentFiles.filter(f => agents.some(a => f.toLowerCase().includes(a.toLowerCase())))
      : agentFiles;

    if (filesToDeploy.length === 0) {
      return {
        success: false,
        error: 'No matching agent files found',
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
        workspace_path,
        file_path: targetPath,
        summary: `Deployed agent file ${file}`,
        action: 'deploy_agent_file',
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
              workspace_path,
              file_path: targetPath,
              summary: `Deployed prompt file ${file}`,
              action: 'deploy_prompt_file',
            });
            prompts_deployed.push(file);
          }
        }
      } catch {
        // Prompts directory doesn't exist, skip
      }
    }

    // Deploy instructions if requested
    const instructions_deployed: string[] = [];
    if (include_instructions) {
      try {
        const dbInstructions = listDbInstructions();

        if (dbInstructions.length > 0) {
          await fs.mkdir(instructionsDir, { recursive: true });
          for (const instruction of dbInstructions) {
            const targetPath = path.join(instructionsDir, instruction.filename);
            await fs.writeFile(targetPath, instruction.content, 'utf-8');
            await appendWorkspaceFileUpdate({
              workspace_path,
              file_path: targetPath,
              summary: `Deployed instruction file ${instruction.filename} (DB)`,
              action: 'deploy_instruction_file',
            });
            instructions_deployed.push(instruction.filename);
          }
        } else {
          // Filesystem fallback
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
                workspace_path,
                file_path: targetPath,
                summary: `Deployed instruction file ${file}`,
                action: 'deploy_instruction_file',
              });
              instructions_deployed.push(file);
            }
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
        target_path: agentsDir,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to deploy agents: ${(error as Error).message}`,
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
        error: 'agent_name is required',
      };
    }

    // DB-first
    const normalized = agent_name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const dbMatch = listDbAgents().find(a => a.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);

    if (dbMatch) {
      const filename = `${dbMatch.name.toLowerCase().replace(/\s+/g, '-')}.agent.md`;
      return {
        success: true,
        data: {
          filename,
          content: dbMatch.content,
        },
      };
    }

    // Filesystem fallback
    const files = await fs.readdir(AGENTS_ROOT);
    const agentFile = files.find(f =>
      f.endsWith('.agent.md') &&
      f.toLowerCase().includes(agent_name.toLowerCase())
    );

    if (!agentFile) {
      return {
        success: false,
        error: `Agent not found: ${agent_name}`,
      };
    }

    const content = await fs.readFile(path.join(AGENTS_ROOT, agentFile), 'utf-8');

    return {
      success: true,
      data: {
        filename: agentFile,
        content,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get agent instructions: ${(error as Error).message}`,
    };
  }
}
