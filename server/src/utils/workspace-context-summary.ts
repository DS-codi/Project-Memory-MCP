/**
 * Workspace Context Summary - utility for extracting lightweight summaries
 * from workspace.context.json for inclusion in agent init responses.
 * 
 * Keeps the handoff.tools.ts file from growing further.
 */

import type {
  WorkspaceContext,
  WorkspaceContextSummary,
  WorkspaceContextSectionSummary,
} from '../types/index.js';
import * as store from '../storage/file-store.js';
import { listKnowledgeFiles } from '../tools/knowledge.tools.js';

/** Threshold in days before workspace context is flagged as stale */
const CONTEXT_STALE_DAYS = 30;

/** Threshold in days before knowledge files are flagged as stale */
export const KNOWLEDGE_STALE_DAYS = 60;

/**
 * Calculate age in days from an ISO date string to now.
 * Returns NaN if the date is invalid.
 */
export function daysOld(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  if (isNaN(then)) return NaN;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

/**
 * Load workspace.context.json and build a lightweight summary.
 * Returns undefined if the context file doesn't exist or can't be read.
 */
export async function buildWorkspaceContextSummary(
  workspaceId: string
): Promise<WorkspaceContextSummary | undefined> {
  const contextPath = store.getWorkspaceContextPath(workspaceId);
  const context = await store.readJson<WorkspaceContext>(contextPath);

  if (!context || !context.sections) {
    return undefined;
  }

  // Build section summaries: key → { summary, item_count }
  const sections: Record<string, WorkspaceContextSectionSummary> = {};
  for (const [key, section] of Object.entries(context.sections)) {
    if (!section) continue;
    sections[key] = {
      summary: section.summary,
      item_count: section.items?.length ?? 0,
    };
  }

  const summary: WorkspaceContextSummary = {
    sections,
    updated_at: context.updated_at,
  };

  // Check for staleness
  if (context.updated_at) {
    const age = daysOld(context.updated_at);
    if (!isNaN(age) && age >= CONTEXT_STALE_DAYS) {
      summary.stale_context_warning =
        `Workspace context last updated ${age} days ago — consider refreshing`;
    }
  }

  // Include knowledge files summary
  await enrichWithKnowledgeFiles(workspaceId, summary);

  return summary;
}

/**
 * Load knowledge files and add metadata + stale warnings to the summary.
 */
async function enrichWithKnowledgeFiles(
  workspaceId: string,
  summary: WorkspaceContextSummary
): Promise<void> {
  const result = await listKnowledgeFiles(workspaceId);
  if (!result.success || !result.data || result.data.files.length === 0) {
    return;
  }

  summary.knowledge_files = result.data.files.map(f => ({
    slug: f.slug,
    title: f.title,
    category: f.category,
    updated_at: f.updated_at,
  }));

  // Flag stale knowledge files
  const stale: { slug: string; title: string; days_old: number }[] = [];
  for (const f of result.data.files) {
    const age = daysOld(f.updated_at);
    if (!isNaN(age) && age >= KNOWLEDGE_STALE_DAYS) {
      stale.push({ slug: f.slug, title: f.title, days_old: age });
    }
  }
  if (stale.length > 0) {
    summary.stale_knowledge_files = stale;
  }
}
