import * as store from '../storage/db-store.js';
import type { WorkspaceContext, WorkspaceContextSection, WorkspaceContextSectionItem } from '../types/index.js';

export interface ImportantResponseContext {
  section_key: string;
  summary?: string;
  items?: WorkspaceContextSectionItem[];
  updated_at?: string;
}

const IMPORTANT_SECTION_KEYS = [
  'important_context',
  'important_notes',
  'always_include_context',
  'always_include_notes',
  'global_context'
] as const;

function pickImportantSection(
  sections: Record<string, WorkspaceContextSection>
): { key: string; section: WorkspaceContextSection } | null {
  for (const candidate of IMPORTANT_SECTION_KEYS) {
    const section = sections[candidate];
    if (!section) {
      continue;
    }
    const hasSummary = typeof section.summary === 'string' && section.summary.trim().length > 0;
    const hasItems = Array.isArray(section.items) && section.items.length > 0;
    if (hasSummary || hasItems) {
      return { key: candidate, section };
    }
  }

  return null;
}

export function extractImportantResponseContext(
  context: WorkspaceContext | null | undefined
): ImportantResponseContext | undefined {
  if (!context || !context.sections || typeof context.sections !== 'object') {
    return undefined;
  }

  const matched = pickImportantSection(context.sections);
  if (!matched) {
    return undefined;
  }

  return {
    section_key: matched.key,
    summary: matched.section.summary,
    items: matched.section.items,
    updated_at: context.updated_at
  };
}

export async function getImportantResponseContext(
  workspaceId: string | undefined
): Promise<ImportantResponseContext | undefined> {
  if (!workspaceId) {
    return undefined;
  }

  try {
    const context = await store.getWorkspaceContextFromDb(workspaceId);
    return extractImportantResponseContext(context);
  } catch {
    return undefined;
  }
}

export async function getImportantResponseContextForRequest(params: {
  workspace_id?: unknown;
  workspace_path?: unknown;
}): Promise<ImportantResponseContext | undefined> {
  const workspaceId = typeof params.workspace_id === 'string' ? params.workspace_id : undefined;
  if (workspaceId) {
    return getImportantResponseContext(workspaceId);
  }

  const workspacePath = typeof params.workspace_path === 'string' ? params.workspace_path : undefined;
  if (!workspacePath) {
    return undefined;
  }

  try {
    const resolvedWorkspaceId = await store.resolveWorkspaceIdForPath(workspacePath);
    return getImportantResponseContext(resolvedWorkspaceId);
  } catch {
    return undefined;
  }
}
