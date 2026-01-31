import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import matter from 'gray-matter';

export const promptsRouter = Router();

// Path to prompts directory
const getPromptsRoot = () => globalThis.MBS_PROMPTS_ROOT || path.join(process.cwd(), '..', 'prompts');

interface PromptFile {
  id: string;
  name: string;
  filename: string;
  description?: string;
  mode?: 'agent' | 'ask' | 'edit';
  content: string;
  variables: string[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Extract variables from prompt content ({{variableName}})
 */
function extractVariables(content: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  return variables;
}

/**
 * Parse a prompt file and extract metadata
 */
async function parsePromptFile(filePath: string): Promise<PromptFile | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter, content: body } = matter(content);
    const filename = path.basename(filePath);
    const id = filename.replace('.prompt.md', '');
    const stats = await fs.stat(filePath);
    
    return {
      id,
      name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      filename,
      description: frontmatter.description,
      mode: frontmatter.mode || 'agent',
      content,
      variables: extractVariables(body),
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

// GET /api/prompts - List all prompt templates
promptsRouter.get('/', async (req, res) => {
  try {
    const promptsRoot = getPromptsRoot();
    
    if (!existsSync(promptsRoot)) {
      return res.json({ prompts: [], total: 0 });
    }
    
    const files = await fs.readdir(promptsRoot);
    const promptFiles = files.filter(f => f.endsWith('.prompt.md'));
    
    const prompts: PromptFile[] = [];
    for (const file of promptFiles) {
      const prompt = await parsePromptFile(path.join(promptsRoot, file));
      if (prompt) {
        prompts.push(prompt);
      }
    }
    
    res.json({
      prompts,
      total: prompts.length,
    });
  } catch (error) {
    console.error('Error listing prompts:', error);
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

// GET /api/prompts/:id - Get single prompt
promptsRouter.get('/:id', async (req, res) => {
  try {
    const promptsRoot = getPromptsRoot();
    const filePath = path.join(promptsRoot, `${req.params.id}.prompt.md`);
    
    const prompt = await parsePromptFile(filePath);
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    res.json({ prompt });
  } catch (error) {
    console.error('Error getting prompt:', error);
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

// POST /api/prompts - Create new prompt
promptsRouter.post('/', async (req, res) => {
  try {
    const { id, description, mode, content } = req.body;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id is required' });
    }
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    
    const promptsRoot = getPromptsRoot();
    await fs.mkdir(promptsRoot, { recursive: true });
    
    const filePath = path.join(promptsRoot, `${id}.prompt.md`);
    
    if (existsSync(filePath)) {
      return res.status(409).json({ error: 'Prompt already exists' });
    }
    
    // Build content with frontmatter
    const frontmatter = [
      '---',
      `mode: "${mode || 'agent'}"`,
      description ? `description: "${description}"` : null,
      '---',
    ].filter(Boolean).join('\n');
    
    const fullContent = frontmatter + '\n\n' + content;
    await fs.writeFile(filePath, fullContent, 'utf-8');
    
    const prompt = await parsePromptFile(filePath);
    res.status(201).json({ prompt });
  } catch (error) {
    console.error('Error creating prompt:', error);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// PUT /api/prompts/:id - Update prompt
promptsRouter.put('/:id', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    
    const promptsRoot = getPromptsRoot();
    const filePath = path.join(promptsRoot, `${req.params.id}.prompt.md`);
    
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    await fs.writeFile(filePath, content, 'utf-8');
    
    const prompt = await parsePromptFile(filePath);
    res.json({ prompt });
  } catch (error) {
    console.error('Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// DELETE /api/prompts/:id - Delete prompt
promptsRouter.delete('/:id', async (req, res) => {
  try {
    const promptsRoot = getPromptsRoot();
    const filePath = path.join(promptsRoot, `${req.params.id}.prompt.md`);
    
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    await fs.unlink(filePath);
    res.json({ success: true, deleted: req.params.id });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

// POST /api/prompts/:id/deploy - Deploy prompt to workspaces
promptsRouter.post('/:id/deploy', async (req, res) => {
  try {
    const { workspace_paths } = req.body;
    
    if (!Array.isArray(workspace_paths) || workspace_paths.length === 0) {
      return res.status(400).json({ error: 'workspace_paths array is required' });
    }
    
    const promptsRoot = getPromptsRoot();
    const sourceFile = path.join(promptsRoot, `${req.params.id}.prompt.md`);
    
    if (!existsSync(sourceFile)) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    const content = await fs.readFile(sourceFile, 'utf-8');
    const deployed: string[] = [];
    const failed: { path: string; error: string }[] = [];
    
    for (const workspacePath of workspace_paths) {
      try {
        const targetDir = path.join(workspacePath, '.github', 'prompts');
        await fs.mkdir(targetDir, { recursive: true });
        
        const targetFile = path.join(targetDir, `${req.params.id}.prompt.md`);
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
    console.error('Error deploying prompt:', error);
    res.status(500).json({ error: 'Failed to deploy prompt' });
  }
});
