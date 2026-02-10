/**
 * Knowledge Files REST API routes
 * 
 * CRUD endpoints for workspace knowledge files.
 * Reads/writes directly from {MBS_DATA_ROOT}/{workspaceId}/knowledge/{slug}.json
 */

import { Router, type Request } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';

export const knowledgeRouter = Router({ mergeParams: true });

/** Merged params include :id from parent route and optionally :slug from child routes */
type KnowledgeParams = { id: string; slug?: string };

// =============================================================================
// Types
// =============================================================================

type KnowledgeFileCategory =
  | 'schema'
  | 'config'
  | 'limitation'
  | 'plan-summary'
  | 'reference'
  | 'convention';

interface KnowledgeFile {
  slug: string;
  title: string;
  category: KnowledgeFileCategory;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by_agent?: string;
  created_by_plan?: string;
}

type KnowledgeFileMeta = Omit<KnowledgeFile, 'content'>;

// =============================================================================
// Constants
// =============================================================================

const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const MAX_SLUG_LENGTH = 100;
const MAX_CONTENT_SIZE = 256 * 1024; // 256KB
const MAX_FILES_PER_WORKSPACE = 100;

const VALID_CATEGORIES: KnowledgeFileCategory[] = [
  'schema', 'config', 'limitation', 'plan-summary', 'reference', 'convention',
];

// =============================================================================
// Helpers
// =============================================================================

function getKnowledgeDir(workspaceId: string): string {
  return path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'knowledge');
}

function getKnowledgeFilePath(workspaceId: string, slug: string): string {
  return path.join(getKnowledgeDir(workspaceId), `${slug}.json`);
}

function validateSlug(slug: string): string | null {
  if (!slug || typeof slug !== 'string') return 'slug is required';
  if (slug.length > MAX_SLUG_LENGTH) return `slug must be ${MAX_SLUG_LENGTH} chars or fewer`;
  if (!VALID_SLUG_REGEX.test(slug)) return 'slug must be lowercase alphanumeric with hyphens only';
  return null;
}

// =============================================================================
// GET /api/workspaces/:id/knowledge — list all (metadata only)
// =============================================================================

knowledgeRouter.get('/', async (req: Request<KnowledgeParams>, res) => {
  try {
    const workspaceId = req.params.id;
    const dir = getKnowledgeDir(workspaceId);
    const { category } = req.query;

    let fileNames: string[];
    try {
      fileNames = await fs.readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.json({ files: [], total: 0 });
      }
      throw err;
    }

    const files: KnowledgeFileMeta[] = [];

    for (const name of fileNames) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, name), 'utf-8');
        const data = JSON.parse(raw) as KnowledgeFile;
        if (category && data.category !== category) continue;
        // Return metadata only — no content
        const { content: _, ...meta } = data;
        files.push(meta);
      } catch {
        // Skip corrupt files
      }
    }

    // Sort by updated_at descending
    files.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

    res.json({ files, total: files.length });
  } catch (error) {
    console.error('Error listing knowledge files:', error);
    res.status(500).json({ error: 'Failed to list knowledge files' });
  }
});

// =============================================================================
// GET /api/workspaces/:id/knowledge/:slug — get full file content
// =============================================================================

knowledgeRouter.get('/:slug', async (req: Request<KnowledgeParams>, res) => {
  try {
    const { id: workspaceId, slug } = req.params as { id: string; slug: string };
    const slugError = validateSlug(slug);
    if (slugError) return res.status(400).json({ error: slugError });

    const filePath = getKnowledgeFilePath(workspaceId, slug);
    const raw = await fs.readFile(filePath, 'utf-8');
    const file = JSON.parse(raw) as KnowledgeFile;
    res.json({ file });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return res.status(404).json({ error: 'Knowledge file not found' });
    }
    console.error('Error getting knowledge file:', error);
    res.status(500).json({ error: 'Failed to get knowledge file' });
  }
});

// =============================================================================
// PUT /api/workspaces/:id/knowledge/:slug — create or update
// =============================================================================

knowledgeRouter.put('/:slug', async (req: Request<KnowledgeParams>, res) => {
  try {
    const { id: workspaceId, slug } = req.params as { id: string; slug: string };
    const slugError = validateSlug(slug);
    if (slugError) return res.status(400).json({ error: slugError });

    const { title, content, category, tags } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    if (Buffer.byteLength(content, 'utf-8') > MAX_CONTENT_SIZE) {
      return res.status(400).json({ error: `content exceeds ${MAX_CONTENT_SIZE / 1024}KB limit` });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    const dir = getKnowledgeDir(workspaceId);
    const filePath = getKnowledgeFilePath(workspaceId, slug);
    const now = new Date().toISOString();

    // Check file count limit for new files
    let existing: KnowledgeFile | null = null;
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      existing = JSON.parse(raw) as KnowledgeFile;
    } catch {
      // New file — check count limit
      try {
        const dirFiles = await fs.readdir(dir);
        const jsonCount = dirFiles.filter(f => f.endsWith('.json')).length;
        if (jsonCount >= MAX_FILES_PER_WORKSPACE) {
          return res.status(400).json({ error: `Maximum ${MAX_FILES_PER_WORKSPACE} knowledge files per workspace` });
        }
      } catch {
        // Dir doesn't exist yet — will be created
      }
    }

    await fs.mkdir(dir, { recursive: true });

    const file: KnowledgeFile = {
      slug,
      title: title.trim(),
      category: category || existing?.category || 'reference',
      content,
      tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string' && t.trim()).map((t: string) => t.trim()) : existing?.tags || [],
      created_at: existing?.created_at || now,
      updated_at: now,
      created_by_agent: req.body.created_by_agent || existing?.created_by_agent,
      created_by_plan: req.body.created_by_plan || existing?.created_by_plan,
    };

    await fs.writeFile(filePath, JSON.stringify(file, null, 2));
    res.json({ success: true, file });
  } catch (error) {
    console.error('Error saving knowledge file:', error);
    res.status(500).json({ error: 'Failed to save knowledge file' });
  }
});

// =============================================================================
// DELETE /api/workspaces/:id/knowledge/:slug — delete a file
// =============================================================================

knowledgeRouter.delete('/:slug', async (req: Request<KnowledgeParams>, res) => {
  try {
    const { id: workspaceId, slug } = req.params as { id: string; slug: string };
    const slugError = validateSlug(slug);
    if (slugError) return res.status(400).json({ error: slugError });

    const filePath = getKnowledgeFilePath(workspaceId, slug);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Knowledge file not found' });
    }

    await fs.unlink(filePath);
    res.json({ success: true, deleted: slug });
  } catch (error) {
    console.error('Error deleting knowledge file:', error);
    res.status(500).json({ error: 'Failed to delete knowledge file' });
  }
});
