/**
 * Knowledge File Tools - Workspace knowledge file CRUD operations
 * 
 * Knowledge files are long-lived, freeform documents stored at
 * /data/{workspace_id}/knowledge/{slug}.json. They persist across
 * plans and build institutional memory for the workspace.
 */

import path from 'path';
import { promises as fs } from 'fs';
import * as store from '../storage/db-store.js';
import type { ToolResponse } from '../types/index.js';

// =============================================================================
// Types
// =============================================================================

export type KnowledgeFileCategory =
  | 'schema'
  | 'config'
  | 'limitation'
  | 'plan-summary'
  | 'reference'
  | 'convention'
  | 'difficulty-profile'
  | 'skill-recommendation';

export interface KnowledgeFile {
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

/** Lightweight metadata returned by list (no content) */
export interface KnowledgeFileMeta {
  slug: string;
  title: string;
  category: KnowledgeFileCategory;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by_agent?: string;
  created_by_plan?: string;
}

export interface StoreKnowledgeParams {
  workspace_id: string;
  slug: string;
  title: string;
  content: string;
  category?: KnowledgeFileCategory;
  tags?: string[];
  created_by_agent?: string;
  created_by_plan?: string;
}

// =============================================================================
// Constants
// =============================================================================

const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const MAX_SLUG_LENGTH = 100;
const MAX_CONTENT_SIZE = 256 * 1024; // 256KB
const MAX_FILES_PER_WORKSPACE = 100;

const VALID_CATEGORIES: KnowledgeFileCategory[] = [
  'schema', 'config', 'limitation', 'plan-summary', 'reference', 'convention', 'difficulty-profile', 'skill-recommendation'
];

// =============================================================================
// Path Helpers
// =============================================================================

export function getKnowledgeDirPath(workspaceId: string): string {
  return path.join(store.getWorkspacePath(workspaceId), 'knowledge');
}

export function getKnowledgeFilePath(workspaceId: string, slug: string): string {
  return path.join(getKnowledgeDirPath(workspaceId), `${slug}.json`);
}

// =============================================================================
// Validation
// =============================================================================

function validateSlug(slug: string): string | null {
  if (!slug || typeof slug !== 'string') {
    return 'slug is required and must be a string';
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    return `slug must be ${MAX_SLUG_LENGTH} characters or fewer (got ${slug.length})`;
  }
  if (!VALID_SLUG_REGEX.test(slug)) {
    return 'slug must contain only lowercase alphanumeric characters and hyphens, and cannot start or end with a hyphen';
  }
  return null;
}

function validateCategory(category: string): category is KnowledgeFileCategory {
  return VALID_CATEGORIES.includes(category as KnowledgeFileCategory);
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Store (create or overwrite) a knowledge file.
 */
export async function storeKnowledgeFile(
  params: StoreKnowledgeParams
): Promise<ToolResponse<{ knowledge_file: KnowledgeFile; created: boolean }>> {
  const { workspace_id, slug, title, content, tags = [], created_by_agent, created_by_plan } = params;
  const category = params.category || 'reference';

  // Validate slug
  const slugError = validateSlug(slug);
  if (slugError) {
    return { success: false, error: slugError };
  }

  // Validate title
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { success: false, error: 'title is required and must be a non-empty string' };
  }

  // Validate category
  if (!validateCategory(category)) {
    return {
      success: false,
      error: `Invalid category '${category}'. Valid categories: ${VALID_CATEGORIES.join(', ')}`
    };
  }

  // Validate content size
  const contentBytes = Buffer.byteLength(content || '', 'utf-8');
  if (contentBytes > MAX_CONTENT_SIZE) {
    return {
      success: false,
      error: `Content size ${contentBytes} bytes exceeds maximum ${MAX_CONTENT_SIZE} bytes (256KB)`
    };
  }

  // Check existing file for update vs create
  const filePath = getKnowledgeFilePath(workspace_id, slug);
  const existing = await store.readJson<KnowledgeFile>(filePath);
  const isUpdate = !!existing;

  // If creating new, enforce max files limit
  if (!isUpdate) {
    const dirPath = getKnowledgeDirPath(workspace_id);
    const fileCount = await countKnowledgeFiles(dirPath);
    if (fileCount >= MAX_FILES_PER_WORKSPACE) {
      return {
        success: false,
        error: `Maximum knowledge files limit reached (${MAX_FILES_PER_WORKSPACE}). Delete unused files before adding new ones.`
      };
    }
  }

  const now = store.nowISO();
  const knowledgeFile: KnowledgeFile = {
    slug,
    title: title.trim(),
    category,
    content: content || '',
    tags: tags.filter(t => typeof t === 'string' && t.trim().length > 0),
    created_at: existing?.created_at || now,
    updated_at: now,
    created_by_agent: created_by_agent || existing?.created_by_agent,
    created_by_plan: created_by_plan || existing?.created_by_plan,
  };

  // Ensure directory exists and write
  await store.ensureDir(getKnowledgeDirPath(workspace_id));
  await store.writeJson(filePath, knowledgeFile);

  return {
    success: true,
    data: { knowledge_file: knowledgeFile, created: !isUpdate }
  };
}

/**
 * Retrieve a knowledge file by slug.
 */
export async function getKnowledgeFile(
  workspaceId: string,
  slug: string
): Promise<ToolResponse<{ knowledge_file: KnowledgeFile }>> {
  const slugError = validateSlug(slug);
  if (slugError) {
    return { success: false, error: slugError };
  }

  const filePath = getKnowledgeFilePath(workspaceId, slug);
  const file = await store.readJson<KnowledgeFile>(filePath);

  if (!file) {
    return {
      success: false,
      error: `Knowledge file '${slug}' not found in workspace ${workspaceId}`
    };
  }

  return { success: true, data: { knowledge_file: file } };
}

/**
 * List all knowledge files in a workspace (metadata only, no content).
 * Optionally filter by category.
 */
export async function listKnowledgeFiles(
  workspaceId: string,
  category?: string
): Promise<ToolResponse<{ files: KnowledgeFileMeta[]; total: number }>> {
  const dirPath = getKnowledgeDirPath(workspaceId);
  const files: KnowledgeFileMeta[] = [];

  try {
    const entries = await fs.readdir(dirPath);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;

      const filePath = path.join(dirPath, entry);
      const data = await store.readJson<KnowledgeFile>(filePath);
      if (!data || !data.slug) continue;

      // Apply category filter
      if (category && data.category !== category) continue;

      // Return metadata only (no content)
      files.push({
        slug: data.slug,
        title: data.title,
        category: data.category,
        tags: data.tags || [],
        created_at: data.created_at,
        updated_at: data.updated_at,
        created_by_agent: data.created_by_agent,
        created_by_plan: data.created_by_plan,
      });
    }
  } catch {
    // Directory doesn't exist yet — return empty list
  }

  // Sort by updated_at descending (most recent first)
  files.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

  return {
    success: true,
    data: { files, total: files.length }
  };
}

/**
 * Delete a knowledge file by slug.
 */
export async function deleteKnowledgeFile(
  workspaceId: string,
  slug: string
): Promise<ToolResponse<{ deleted: boolean; slug: string }>> {
  const slugError = validateSlug(slug);
  if (slugError) {
    return { success: false, error: slugError };
  }

  const filePath = getKnowledgeFilePath(workspaceId, slug);

  try {
    await fs.unlink(filePath);
    return { success: true, data: { deleted: true, slug } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: false,
        error: `Knowledge file '${slug}' not found in workspace ${workspaceId}`
      };
    }
    throw error;
  }
}

// =============================================================================
// Helpers
// =============================================================================

async function countKnowledgeFiles(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.filter(e => e.endsWith('.json')).length;
  } catch {
    return 0;
  }
}
