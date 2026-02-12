/**
 * Prompt Storage - Plan-scoped prompt CRUD helpers
 * 
 * Stores/loads prompts at: data/{workspace_id}/plans/{plan_id}/prompts/
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getPlanPath, ensureDir, exists } from '../storage/file-store.js';
import type { PromptFrontmatter } from './prompt-writer.js';

// =============================================================================
// Path Helpers
// =============================================================================

export function getPlanPromptsPath(workspaceId: string, planId: string): string {
  return path.join(getPlanPath(workspaceId, planId), 'prompts');
}

function getPromptFilePath(workspaceId: string, planId: string, slug: string): string {
  return path.join(getPlanPromptsPath(workspaceId, planId), `${slug}.prompt.md`);
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Save a prompt to the plan's prompts directory.
 * If a prompt with the same slug already exists, it is overwritten.
 */
export async function savePlanPrompt(
  workspaceId: string,
  planId: string,
  slug: string,
  content: string,
): Promise<string> {
  const promptsDir = getPlanPromptsPath(workspaceId, planId);
  await ensureDir(promptsDir);
  const filePath = path.join(promptsDir, `${slug}.prompt.md`);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Load a prompt from the plan's prompts directory.
 * Returns null if the prompt doesn't exist.
 */
export async function loadPlanPrompt(
  workspaceId: string,
  planId: string,
  slug: string,
): Promise<string | null> {
  const filePath = getPromptFilePath(workspaceId, planId, slug);
  if (!(await exists(filePath))) return null;
  return fs.readFile(filePath, 'utf-8');
}

/**
 * List all prompt slugs for a plan.
 * Returns an array of slug strings (filename without .prompt.md).
 */
export async function listPlanPrompts(
  workspaceId: string,
  planId: string,
): Promise<string[]> {
  const promptsDir = getPlanPromptsPath(workspaceId, planId);
  if (!(await exists(promptsDir))) return [];

  const entries = await fs.readdir(promptsDir);
  return entries
    .filter(f => f.endsWith('.prompt.md'))
    .map(f => f.replace(/\.prompt\.md$/, ''));
}

/**
 * Delete a prompt from the plan's prompts directory.
 * Returns true if the file was deleted, false if it didn't exist.
 */
export async function deletePlanPrompt(
  workspaceId: string,
  planId: string,
  slug: string,
): Promise<boolean> {
  const filePath = getPromptFilePath(workspaceId, planId, slug);
  if (!(await exists(filePath))) return false;
  await fs.unlink(filePath);
  return true;
}

/**
 * Archive all prompts for a plan by adding archival headers.
 * Used when the Archivist archives a plan.
 */
export async function archivePlanPrompts(
  workspaceId: string,
  planId: string,
  planTitle: string,
): Promise<number> {
  const { addArchivalHeader, parsePromptFile } = await import('./prompt-writer.js');
  const slugs = await listPlanPrompts(workspaceId, planId);
  let archived = 0;

  for (const slug of slugs) {
    const content = await loadPlanPrompt(workspaceId, planId, slug);
    if (!content) continue;

    const { frontmatter } = parsePromptFile(content);
    if (frontmatter['archived'] === true) continue; // Already archived

    const stepIndices = Array.isArray(frontmatter['step_indices'])
      ? (frontmatter['step_indices'] as number[]).join(', ')
      : 'N/A';

    const archivedContent = addArchivalHeader(content, planTitle, stepIndices);
    await savePlanPrompt(workspaceId, planId, slug, archivedContent);
    archived++;
  }

  return archived;
}

// =============================================================================
// Versioning
// =============================================================================

/**
 * Increment a semver string's patch version.
 * "1.0.0" → "1.0.1", "2.3.5" → "2.3.6"
 */
export function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '1.0.1';
  parts[2]++;
  return parts.join('.');
}

/**
 * Get the current version of an existing prompt (if any).
 * Returns the version string or null if prompt doesn't exist.
 */
export async function getPromptVersion(
  workspaceId: string,
  planId: string,
  slug: string,
): Promise<string | null> {
  const { parsePromptFile } = await import('./prompt-writer.js');
  const content = await loadPlanPrompt(workspaceId, planId, slug);
  if (!content) return null;
  const { frontmatter } = parsePromptFile(content);
  return (frontmatter['version'] as string) || null;
}

/**
 * Auto-increment version if a prompt with the same slug already exists.
 * Returns the version to use for the new prompt.
 */
export async function resolveNextVersion(
  workspaceId: string,
  planId: string,
  slug: string,
  requestedVersion?: string,
): Promise<string> {
  const existing = await getPromptVersion(workspaceId, planId, slug);
  if (!existing) return requestedVersion || '1.0.0';
  if (requestedVersion && requestedVersion !== existing) return requestedVersion;
  return incrementVersion(existing);
}

// =============================================================================
// Staleness Detection
// =============================================================================

export interface PromptStalenessInfo {
  slug: string;
  version: string;
  isStale: boolean;
  reasons: string[];
}

const STALENESS_DAYS = 7;

/**
 * Check if a prompt is stale based on plan state.
 * A prompt is stale if:
 * - It references steps that are now complete/deleted
 * - plan_updated_at in frontmatter is older than plan's updated_at
 * - The prompt is older than STALENESS_DAYS
 */
export async function checkPromptStaleness(
  workspaceId: string,
  planId: string,
  slug: string,
  planUpdatedAt?: string,
  completedStepIndices?: number[],
): Promise<PromptStalenessInfo> {
  const { parsePromptFile } = await import('./prompt-writer.js');
  const content = await loadPlanPrompt(workspaceId, planId, slug);
  const result: PromptStalenessInfo = {
    slug,
    version: '0.0.0',
    isStale: false,
    reasons: [],
  };

  if (!content) {
    result.isStale = true;
    result.reasons.push('Prompt file not found');
    return result;
  }

  const { frontmatter } = parsePromptFile(content);
  result.version = (frontmatter['version'] as string) || '1.0.0';

  // Check archived
  if (frontmatter['archived'] === true) {
    result.isStale = true;
    result.reasons.push('Prompt is already archived');
    return result;
  }

  // Check plan_updated_at staleness
  if (planUpdatedAt && frontmatter['plan_updated_at']) {
    const promptPlanDate = new Date(frontmatter['plan_updated_at'] as string);
    const currentPlanDate = new Date(planUpdatedAt);
    if (promptPlanDate < currentPlanDate) {
      result.isStale = true;
      result.reasons.push('Prompt was written for an older plan state');
    }
  }

  // Check step_indices — are referenced steps now complete?
  if (
    completedStepIndices &&
    Array.isArray(frontmatter['step_indices'])
  ) {
    const promptSteps = frontmatter['step_indices'] as number[];
    const completedPromptSteps = promptSteps.filter(s =>
      completedStepIndices.includes(s)
    );
    if (completedPromptSteps.length === promptSteps.length && promptSteps.length > 0) {
      result.isStale = true;
      result.reasons.push(`All referenced steps are complete: [${completedPromptSteps.join(', ')}]`);
    }
  }

  // Check age-based staleness
  if (frontmatter['plan_updated_at']) {
    const promptAge = Date.now() - new Date(frontmatter['plan_updated_at'] as string).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (promptAge > STALENESS_DAYS * dayMs) {
      result.isStale = true;
      result.reasons.push(`Prompt is older than ${STALENESS_DAYS} days`);
    }
  }

  return result;
}

/**
 * Check staleness of all prompts for a plan.
 */
export async function checkAllPromptsStaleness(
  workspaceId: string,
  planId: string,
  planUpdatedAt?: string,
  completedStepIndices?: number[],
): Promise<PromptStalenessInfo[]> {
  const slugs = await listPlanPrompts(workspaceId, planId);
  const results: PromptStalenessInfo[] = [];
  for (const slug of slugs) {
    results.push(
      await checkPromptStaleness(workspaceId, planId, slug, planUpdatedAt, completedStepIndices)
    );
  }
  return results;
}
