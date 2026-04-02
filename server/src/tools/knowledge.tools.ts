/**
 * Knowledge File Tools - Workspace knowledge file CRUD operations
 *
 * Knowledge files are long-lived, freeform documents stored in the DB
 * knowledge table. They persist across plans and build institutional memory
 * for the workspace.
 */

import type { ToolResponse } from '../types/index.js';
import { makeDbRef, type DbRef } from '../types/db-ref.types.js';
import {
  storeKnowledge,
  getKnowledge,
  listKnowledge,
  deleteKnowledge,
} from '../db/knowledge-db.js';
import type { KnowledgeRow } from '../db/types.js';

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
// Helpers
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

function rowToKnowledgeFile(row: KnowledgeRow): KnowledgeFile {
  const data = JSON.parse(row.data) as { content?: string };
  return {
    slug: row.slug,
    title: row.title,
    category: (row.category as KnowledgeFileCategory) || 'reference',
    content: data.content ?? '',
    tags: row.tags ? JSON.parse(row.tags) as string[] : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by_agent: row.created_by_agent ?? undefined,
    created_by_plan: row.created_by_plan ?? undefined,
  };
}

function rowToKnowledgeFileMeta(row: KnowledgeRow): KnowledgeFileMeta {
  return {
    slug: row.slug,
    title: row.title,
    category: (row.category as KnowledgeFileCategory) || 'reference',
    tags: row.tags ? JSON.parse(row.tags) as string[] : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by_agent: row.created_by_agent ?? undefined,
    created_by_plan: row.created_by_plan ?? undefined,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Store (create or overwrite) a knowledge file.
 */
export async function storeKnowledgeFile(
  params: StoreKnowledgeParams
): Promise<ToolResponse<{ knowledge_file: KnowledgeFile; created: boolean; _ref?: DbRef }>> {
  const { workspace_id, slug, title, content, tags = [], created_by_agent, created_by_plan } = params;
  const category = params.category || 'reference';

  const slugError = validateSlug(slug);
  if (slugError) {
    return { success: false, error: slugError };
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { success: false, error: 'title is required and must be a non-empty string' };
  }

  if (!validateCategory(category)) {
    return {
      success: false,
      error: `Invalid category '${category}'. Valid categories: ${VALID_CATEGORIES.join(', ')}`
    };
  }

  const contentBytes = Buffer.byteLength(content || '', 'utf-8');
  if (contentBytes > MAX_CONTENT_SIZE) {
    return {
      success: false,
      error: `Content size ${contentBytes} bytes exceeds maximum ${MAX_CONTENT_SIZE} bytes (256KB)`
    };
  }

  const existing = getKnowledge(workspace_id, slug);
  const isUpdate = !!existing;

  if (!isUpdate) {
    const count = listKnowledge(workspace_id).length;
    if (count >= MAX_FILES_PER_WORKSPACE) {
      return {
        success: false,
        error: `Maximum knowledge files limit reached (${MAX_FILES_PER_WORKSPACE}). Delete unused files before adding new ones.`
      };
    }
  }

  const row = storeKnowledge(workspace_id, slug, title.trim(), { content: content || '' }, {
    category,
    tags: tags.filter(t => typeof t === 'string' && t.trim().length > 0),
    created_by_agent: created_by_agent || existing?.created_by_agent || null,
    created_by_plan: created_by_plan || existing?.created_by_plan || null,
  });

  return {
    success: true,
    data: {
      knowledge_file: rowToKnowledgeFile(row),
      created: !isUpdate,
      _ref: makeDbRef('knowledge', slug, 'knowledge', title.trim() || slug),
    }
  };
}

/**
 * Retrieve a knowledge file by slug.
 */
export async function getKnowledgeFile(
  workspaceId: string,
  slug: string
): Promise<ToolResponse<{ knowledge_file: KnowledgeFile; _ref?: DbRef }>> {
  const slugError = validateSlug(slug);
  if (slugError) {
    return { success: false, error: slugError };
  }

  const row = getKnowledge(workspaceId, slug);

  if (!row) {
    return {
      success: false,
      error: `Knowledge file '${slug}' not found in workspace ${workspaceId}`
    };
  }

  return {
    success: true,
    data: {
      knowledge_file: rowToKnowledgeFile(row),
      _ref: makeDbRef('knowledge', slug, 'knowledge', row.title || slug),
    }
  };
}

/**
 * List all knowledge files in a workspace (metadata only, no content).
 * Optionally filter by category.
 */
export async function listKnowledgeFiles(
  workspaceId: string,
  category?: string
): Promise<ToolResponse<{ files: KnowledgeFileMeta[]; total: number }>> {
  const rows = listKnowledge(workspaceId, category);

  // Sort by updated_at descending (most recent first)
  rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

  const files = rows.map(rowToKnowledgeFileMeta);

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

  const existing = getKnowledge(workspaceId, slug);
  if (!existing) {
    return {
      success: false,
      error: `Knowledge file '${slug}' not found in workspace ${workspaceId}`
    };
  }

  deleteKnowledge(workspaceId, slug);
  return { success: true, data: { deleted: true, slug } };
}

