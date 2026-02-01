import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync, copyFileSync } from 'fs';

export const deployRouter = Router();

interface DeployRequest {
  workspace_id: string;
  workspace_path: string;
  agents: string[];
  prompts: string[];
  instructions: string[];
}

// POST /api/deploy - Deploy selected items to a workspace
deployRouter.post('/', async (req, res) => {
  try {
    const { workspace_path, agents, prompts, instructions } = req.body as DeployRequest;
    
    if (!workspace_path) {
      return res.status(400).json({ error: 'workspace_path is required' });
    }

    const results = {
      agents: 0,
      prompts: 0,
      instructions: 0,
      errors: [] as string[],
    };

    // Deploy agents
    if (agents && agents.length > 0) {
      const agentsRoot = globalThis.MBS_AGENTS_ROOT;
      const targetDir = path.join(workspace_path, '.github', 'agents');
      
      try {
        mkdirSync(targetDir, { recursive: true });
        
        for (const agentId of agents) {
          const sourceFile = path.join(agentsRoot, `${agentId}.agent.md`);
          const targetFile = path.join(targetDir, `${agentId}.agent.md`);
          
          if (existsSync(sourceFile)) {
            copyFileSync(sourceFile, targetFile);
            results.agents++;
          } else {
            results.errors.push(`Agent not found: ${agentId}`);
          }
        }
      } catch (error) {
        results.errors.push(`Failed to deploy agents: ${error}`);
      }
    }

    // Deploy prompts
    if (prompts && prompts.length > 0) {
      const promptsRoot = globalThis.MBS_PROMPTS_ROOT;
      const targetDir = path.join(workspace_path, '.github', 'prompts');
      
      try {
        mkdirSync(targetDir, { recursive: true });
        
        for (const promptId of prompts) {
          const sourceFile = path.join(promptsRoot, `${promptId}.prompt.md`);
          const targetFile = path.join(targetDir, `${promptId}.prompt.md`);
          
          if (existsSync(sourceFile)) {
            copyFileSync(sourceFile, targetFile);
            results.prompts++;
          } else {
            results.errors.push(`Prompt not found: ${promptId}`);
          }
        }
      } catch (error) {
        results.errors.push(`Failed to deploy prompts: ${error}`);
      }
    }

    // Deploy instructions
    if (instructions && instructions.length > 0) {
      const instructionsRoot = globalThis.MBS_INSTRUCTIONS_ROOT;
      const targetDir = path.join(workspace_path, '.github', 'instructions');
      
      try {
        mkdirSync(targetDir, { recursive: true });
        
        for (const instructionId of instructions) {
          const sourceFile = path.join(instructionsRoot, `${instructionId}.instructions.md`);
          const targetFile = path.join(targetDir, `${instructionId}.instructions.md`);
          
          if (existsSync(sourceFile)) {
            copyFileSync(sourceFile, targetFile);
            results.instructions++;
          } else {
            results.errors.push(`Instruction not found: ${instructionId}`);
          }
        }
      } catch (error) {
        results.errors.push(`Failed to deploy instructions: ${error}`);
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Deploy error:', error);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

export default deployRouter;
