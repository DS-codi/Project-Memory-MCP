/**
 * Skill Registry — builds and caches an in-memory keyword-indexed registry
 * of workspace skills from .github/skills/{name}/SKILL.md files.
 *
 * @module skill-registry
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { SkillRegistryEntry, SkillRegistryIndex } from '../types/skill.types.js';
import { parseFrontmatter } from './skills.tools.js';

// =============================================================================
// Cache
// =============================================================================

interface CacheEntry {
  index: SkillRegistryIndex;
  mtimeMs: number;
}

/** In-memory cache keyed by workspace path */
const registryCache = new Map<string, CacheEntry>();

// =============================================================================
// Keyword Extraction
// =============================================================================

/**
 * Extract searchable keywords from a skill's metadata.
 * Sources: name, description, tags, category, language_targets, framework_targets.
 * Returns de-duplicated lowercase tokens.
 */
function extractKeywords(entry: {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  language_targets?: string[];
  framework_targets?: string[];
}): string[] {
  const tokens = new Set<string>();

  // Name — split on hyphens / underscores
  for (const part of entry.name.split(/[-_]+/)) {
    const t = part.trim().toLowerCase();
    if (t) tokens.add(t);
  }

  // Description — split on word boundaries, keep tokens ≥3 chars
  if (entry.description) {
    for (const word of entry.description.split(/\W+/)) {
      const t = word.toLowerCase();
      if (t.length >= 3) tokens.add(t);
    }
  }

  // Scalar & array metadata
  if (entry.category) tokens.add(entry.category.toLowerCase());
  for (const tag of entry.tags ?? []) tokens.add(tag.toLowerCase());
  for (const lang of entry.language_targets ?? []) tokens.add(lang.toLowerCase());
  for (const fw of entry.framework_targets ?? []) tokens.add(fw.toLowerCase());

  return [...tokens];
}

// =============================================================================
// Build Registry
// =============================================================================

/**
 * Build (or return cached) keyword-indexed skill registry for a workspace.
 *
 * Reads `{workspacePath}/.github/skills/` SKILL.md files,
 * parses frontmatter, extracts keywords, and builds a lookup map.
 */
export async function buildSkillRegistry(
  workspacePath: string,
): Promise<SkillRegistryIndex> {
  const skillsDir = path.join(workspacePath, '.github', 'skills');

  // --- Cache check ---
  const cached = registryCache.get(workspacePath);
  if (cached) {
    try {
      const stat = await fs.stat(skillsDir);
      if (stat.mtimeMs === cached.mtimeMs) {
        return cached.index;
      }
    } catch {
      // Directory gone — invalidate and return empty
      registryCache.delete(workspacePath);
    }
  }

  // --- Build fresh ---
  const entries: SkillRegistryEntry[] = [];
  let dirMtimeMs = 0;

  try {
    const stat = await fs.stat(skillsDir);
    dirMtimeMs = stat.mtimeMs;
    const dirEntries = await fs.readdir(skillsDir);

    for (const dirName of dirEntries) {
      const skillDir = path.join(skillsDir, dirName);
      const skillStat = await fs.stat(skillDir).catch(() => null);
      if (!skillStat?.isDirectory()) continue;

      const skillFile = path.join(skillDir, 'SKILL.md');
      let content: string;
      try {
        content = await fs.readFile(skillFile, 'utf-8');
      } catch {
        continue; // No SKILL.md in this directory
      }

      const { frontmatter } = parseFrontmatter(content);

      const name = (frontmatter.name as string) || dirName;
      const description = (frontmatter.description as string) || undefined;
      const category = (frontmatter.category as string) || 'general';
      const tags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [];
      const language_targets = Array.isArray(frontmatter.language_targets)
        ? (frontmatter.language_targets as string[])
        : undefined;
      const framework_targets = Array.isArray(frontmatter.framework_targets)
        ? (frontmatter.framework_targets as string[])
        : undefined;

      const keywords = extractKeywords({
        name,
        description,
        category,
        tags,
        language_targets,
        framework_targets,
      });

      entries.push({
        name,
        file_path: skillFile,
        category,
        tags,
        keywords,
        language_targets,
        framework_targets,
        description,
      });
    }
  } catch {
    // .github/skills/ doesn't exist — return empty registry
  }

  // --- Build keyword map ---
  const keyword_map = new Map<string, string[]>();
  for (const entry of entries) {
    for (const kw of entry.keywords) {
      const existing = keyword_map.get(kw);
      if (existing) {
        if (!existing.includes(entry.name)) existing.push(entry.name);
      } else {
        keyword_map.set(kw, [entry.name]);
      }
    }
  }

  const index: SkillRegistryIndex = {
    entries,
    keyword_map,
    workspace_path: workspacePath,
    built_at: new Date().toISOString(),
  };

  // --- Store in cache ---
  registryCache.set(workspacePath, { index, mtimeMs: dirMtimeMs });

  return index;
}

// =============================================================================
// Cache Invalidation
// =============================================================================

/**
 * Invalidate the skill registry cache.
 * @param workspacePath If provided, only that workspace's cache is cleared.
 *                      Otherwise all caches are cleared.
 */
export function invalidateSkillRegistryCache(workspacePath?: string): void {
  if (workspacePath) {
    registryCache.delete(workspacePath);
  } else {
    registryCache.clear();
  }
}
