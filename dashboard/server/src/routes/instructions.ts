import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import matter from 'gray-matter';

export const instructionsRouter = Router();

// Path to instructions directory
const getInstructionsRoot = () => globalThis.MBS_INSTRUCTIONS_ROOT || path.join(process.cwd(), '..', 'instructions');

interface InstructionFile {
  id: string;
  name: string;
  filename: string;
  applyTo?: string;
  content: string;
  isPathSpecific: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Parse an instruction file and extract metadata
 */
async function parseInstructionFile(filePath: string): Promise<InstructionFile | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter } = matter(content);
    const filename = path.basename(filePath);
    const id = filename.replace('.instructions.md', '');
    const stats = await fs.stat(filePath);
    
    return {
      id,
      name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      filename,
      applyTo: frontmatter.applyTo,
      content,
      isPathSpecific: !!frontmatter.applyTo && frontmatter.applyTo !== '**/*',
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

// GET /api/instructions - List all instruction templates
instructionsRouter.get('/', async (req, res) => {
  try {
    const instructionsRoot = getInstructionsRoot();
    
    if (!existsSync(instructionsRoot)) {
      return res.json({ instructions: [], total: 0 });
    }
    
    const files = await fs.readdir(instructionsRoot);
    const instructionFiles = files.filter(f => f.endsWith('.instructions.md'));
    
    const instructions: InstructionFile[] = [];
    for (const file of instructionFiles) {
      const instruction = await parseInstructionFile(path.join(instructionsRoot, file));
      if (instruction) {
        instructions.push(instruction);
      }
    }
    
    res.json({
      instructions,
      total: instructions.length,
    });
  } catch (error) {
    console.error('Error listing instructions:', error);
    res.status(500).json({ error: 'Failed to list instructions' });
  }
});

// GET /api/instructions/:id - Get single instruction
instructionsRouter.get('/:id', async (req, res) => {
  try {
    const instructionsRoot = getInstructionsRoot();
    const filePath = path.join(instructionsRoot, `${req.params.id}.instructions.md`);
    
    const instruction = await parseInstructionFile(filePath);
    if (!instruction) {
      return res.status(404).json({ error: 'Instruction not found' });
    }
    
    res.json({ instruction });
  } catch (error) {
    console.error('Error getting instruction:', error);
    res.status(500).json({ error: 'Failed to get instruction' });
  }
});

// GET /api/instructions/workspace/:wsId - List deployed instructions for a workspace
instructionsRouter.get('/workspace/:wsId', async (req, res) => {
  try {
    // Get workspace path from workspace metadata
    const dataRoot = globalThis.MBS_DATA_ROOT || path.join(process.cwd(), '..', 'data');
    const metaPath = path.join(dataRoot, req.params.wsId, 'workspace.meta.json');
    
    if (!existsSync(metaPath)) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    const workspacePath = meta.path;
    
    const instructionsDir = path.join(workspacePath, '.github', 'instructions');
    
    if (!existsSync(instructionsDir)) {
      return res.json({ instructions: [], total: 0 });
    }
    
    const files = await fs.readdir(instructionsDir);
    const instructionFiles = files.filter(f => f.endsWith('.instructions.md'));
    
    const instructions: InstructionFile[] = [];
    for (const file of instructionFiles) {
      const instruction = await parseInstructionFile(path.join(instructionsDir, file));
      if (instruction) {
        instructions.push(instruction);
      }
    }
    
    res.json({
      workspace_id: req.params.wsId,
      workspace_path: workspacePath,
      instructions,
      total: instructions.length,
    });
  } catch (error) {
    console.error('Error listing workspace instructions:', error);
    res.status(500).json({ error: 'Failed to list workspace instructions' });
  }
});

// POST /api/instructions - Create new instruction
instructionsRouter.post('/', async (req, res) => {
  try {
    const { id, applyTo, content } = req.body;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id is required' });
    }
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    
    const instructionsRoot = getInstructionsRoot();
    await fs.mkdir(instructionsRoot, { recursive: true });
    
    const filePath = path.join(instructionsRoot, `${id}.instructions.md`);
    
    if (existsSync(filePath)) {
      return res.status(409).json({ error: 'Instruction already exists' });
    }
    
    // Build content with frontmatter
    const frontmatter = [
      '---',
      `applyTo: "${applyTo || '**/*'}"`,
      '---',
    ].join('\n');
    
    const fullContent = frontmatter + '\n\n' + content;
    await fs.writeFile(filePath, fullContent, 'utf-8');
    
    const instruction = await parseInstructionFile(filePath);
    res.status(201).json({ instruction });
  } catch (error) {
    console.error('Error creating instruction:', error);
    res.status(500).json({ error: 'Failed to create instruction' });
  }
});

// PUT /api/instructions/:id - Update instruction
instructionsRouter.put('/:id', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    
    const instructionsRoot = getInstructionsRoot();
    const filePath = path.join(instructionsRoot, `${req.params.id}.instructions.md`);
    
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Instruction not found' });
    }
    
    await fs.writeFile(filePath, content, 'utf-8');
    
    const instruction = await parseInstructionFile(filePath);
    res.json({ instruction });
  } catch (error) {
    console.error('Error updating instruction:', error);
    res.status(500).json({ error: 'Failed to update instruction' });
  }
});

// DELETE /api/instructions/:id - Delete instruction
instructionsRouter.delete('/:id', async (req, res) => {
  try {
    const instructionsRoot = getInstructionsRoot();
    const filePath = path.join(instructionsRoot, `${req.params.id}.instructions.md`);
    
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Instruction not found' });
    }
    
    await fs.unlink(filePath);
    res.json({ success: true, deleted: req.params.id });
  } catch (error) {
    console.error('Error deleting instruction:', error);
    res.status(500).json({ error: 'Failed to delete instruction' });
  }
});

// POST /api/instructions/:id/deploy - Deploy instruction to workspaces
instructionsRouter.post('/:id/deploy', async (req, res) => {
  try {
    const { workspace_paths } = req.body;
    
    if (!Array.isArray(workspace_paths) || workspace_paths.length === 0) {
      return res.status(400).json({ error: 'workspace_paths array is required' });
    }
    
    const instructionsRoot = getInstructionsRoot();
    const sourceFile = path.join(instructionsRoot, `${req.params.id}.instructions.md`);
    
    if (!existsSync(sourceFile)) {
      return res.status(404).json({ error: 'Instruction not found' });
    }
    
    const content = await fs.readFile(sourceFile, 'utf-8');
    const deployed: string[] = [];
    const failed: { path: string; error: string }[] = [];
    
    for (const workspacePath of workspace_paths) {
      try {
        const targetDir = path.join(workspacePath, '.github', 'instructions');
        await fs.mkdir(targetDir, { recursive: true });
        
        const targetFile = path.join(targetDir, `${req.params.id}.instructions.md`);
        await fs.writeFile(targetFile, content, 'utf-8');
        deployed.push(workspacePath);
      } catch (err) {
        failed.push({
          path: workspacePath,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    
    res.json({ deployed, failed });
  } catch (error) {
    console.error('Error deploying instruction:', error);
    res.status(500).json({ error: 'Failed to deploy instruction' });
  }
});
