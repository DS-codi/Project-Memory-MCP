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

interface ArchiveMetadata {
  archive_path: string | null;
  moved_files_count: number;
  moved_files: string[];
  warnings: string[];
  conflicts: string[];
}

async function listFilesRecursive(dir: string, root = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(fullPath, root));
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(root, fullPath).replace(/\\/g, '/'));
    }
  }

  return files;
}

async function resolveUniqueArchivePath(baseArchivePath: string): Promise<{ archivePath: string; hadConflict: boolean }> {
  if (!existsSync(baseArchivePath)) {
    return { archivePath: baseArchivePath, hadConflict: false };
  }

  let suffix = 1;
  while (existsSync(`${baseArchivePath}-${suffix}`)) {
    suffix++;
  }

  return { archivePath: `${baseArchivePath}-${suffix}`, hadConflict: true };
}

async function moveDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  try {
    await fs.rename(sourceDir, destinationDir);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'EXDEV') {
      throw error;
    }

    await fs.cp(sourceDir, destinationDir, { recursive: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
}

export async function archiveWorkspaceAgents(workspacePath: string): Promise<ArchiveMetadata> {
  const sourceAgentsDir = path.join(workspacePath, '.github', 'agents');
  const metadata: ArchiveMetadata = {
    archive_path: null,
    moved_files_count: 0,
    moved_files: [],
    warnings: [],
    conflicts: [],
  };

  if (!existsSync(sourceAgentsDir)) {
    metadata.warnings.push('No existing .github/agents directory found; archive step skipped.');
    return metadata;
  }

  const existingFiles = await listFilesRecursive(sourceAgentsDir);
  if (existingFiles.length === 0) {
    metadata.warnings.push('Existing .github/agents directory was empty; archive step skipped.');
    return metadata;
  }

  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const archiveRoot = path.join(workspacePath, '.archived_github', 'agents');
  const preferredArchivePath = path.join(archiveRoot, timestamp);
  const { archivePath, hadConflict } = await resolveUniqueArchivePath(preferredArchivePath);

  if (hadConflict) {
    metadata.conflicts.push(`Archive folder already existed; used ${archivePath} instead.`);
  }

  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await moveDirectory(sourceAgentsDir, archivePath);

  metadata.archive_path = archivePath;
  metadata.moved_files = existingFiles;
  metadata.moved_files_count = existingFiles.length;
  return metadata;
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
      archive: {
        archive_path: null as string | null,
        moved_files_count: 0,
        moved_files: [] as string[],
        warnings: [] as string[],
        conflicts: [] as string[],
      },
    };

    // Archive existing agent deployment before writing fresh files
    if (agents && agents.length > 0) {
      try {
        const archive = await archiveWorkspaceAgents(workspace_path);
        results.archive = archive;
      } catch (error) {
        results.archive.warnings.push(`Failed to archive existing agents: ${error}`);
      }
    }

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
