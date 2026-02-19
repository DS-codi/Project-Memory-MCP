/**
 * Skills Tools - MCP tools for managing and deploying skill definition files
 *
 * Skills are deployable knowledge files (SKILL.md) that provide domain-specific
 * guidance to agents. Each skill lives in a subdirectory under the skills root.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ToolResponse } from '../types/index.js';
import type {
  SkillDefinition,
  SkillMatch,
  SkillDeploymentResult,
  SkillCategory,
} from '../types/skill.types.js';
import { appendWorkspaceFileUpdate } from '../logging/workspace-update-log.js';
import { invalidateSkillRegistryCache } from './skill-registry.js';

// Path to the skills directory (relative to the server)
const SKILLS_ROOT = process.env.MBS_SKILLS_ROOT || path.join(process.cwd(), '..', 'skills');

// =============================================================================
// Frontmatter Parser
// =============================================================================

/**
 * Parse YAML-like frontmatter from a SKILL.md file.
 * Handles: name, description, category, tags, language_targets, framework_targets.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const rawFrontmatter = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of rawFrontmatter.split(/\r?\n/)) {
    // List item (e.g., "  - react")
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!currentList) {
        currentList = [];
      }
      currentList.push(listMatch[1].trim());
      frontmatter[currentKey] = currentList;
      continue;
    }

    // Key-value pair (e.g., "name: my-skill")
    const kvMatch = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (kvMatch) {
      // Flush previous list
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === '' || value === '[]') {
        // Expect a list on following lines, or empty array
        currentList = [];
        frontmatter[currentKey] = currentList;
      } else {
        currentList = null;
        frontmatter[currentKey] = value;
      }
    }
  }

  return { frontmatter, body };
}

// =============================================================================
// listSkills
// =============================================================================

/**
 * Read all skills from the skills root directory.
 * Each skill is a subdirectory containing a SKILL.md file.
 */
export async function listSkills(): Promise<ToolResponse<SkillDefinition[]>> {
  try {
    let entries: string[];
    try {
      entries = await fs.readdir(SKILLS_ROOT);
    } catch {
      return {
        success: true,
        data: [],
      };
    }

    const skills: SkillDefinition[] = [];

    for (const entry of entries) {
      const skillDir = path.join(SKILLS_ROOT, entry);
      const stat = await fs.stat(skillDir);
      if (!stat.isDirectory()) continue;

      const skillFile = path.join(skillDir, 'SKILL.md');
      try {
        const content = await fs.readFile(skillFile, 'utf-8');
        const { frontmatter } = parseFrontmatter(content);

        skills.push({
          name: (frontmatter.name as string) || entry,
          description: (frontmatter.description as string) || '',
          path: skillFile,
          content,
          category: frontmatter.category as SkillCategory | undefined,
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : undefined,
          language_targets: Array.isArray(frontmatter.language_targets) ? frontmatter.language_targets : undefined,
          framework_targets: Array.isArray(frontmatter.framework_targets) ? frontmatter.framework_targets : undefined,
        });
      } catch {
        // No SKILL.md in this directory, skip
      }
    }

    return { success: true, data: skills };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list skills: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// deploySkillsToWorkspace
// =============================================================================

/**
 * Deploy skill files to a workspace's .github/skills/ directory.
 * Copies each {skill-name}/SKILL.md to {workspace}/.github/skills/{skill-name}/SKILL.md
 */
export async function deploySkillsToWorkspace(
  params: { workspace_path: string }
): Promise<ToolResponse<SkillDeploymentResult>> {
  try {
    const { workspace_path } = params;

    if (!workspace_path) {
      return { success: false, error: 'workspace_path is required' };
    }

    const targetRoot = path.join(workspace_path, '.github', 'skills');
    const result: SkillDeploymentResult = {
      deployed: [],
      target_path: targetRoot,
      skipped: [],
      errors: [],
    };

    // Read source skills
    let entries: string[];
    try {
      entries = await fs.readdir(SKILLS_ROOT);
    } catch {
      return {
        success: true,
        data: { ...result, errors: ['Skills source directory not found'] },
      };
    }

    for (const entry of entries) {
      const sourceDir = path.join(SKILLS_ROOT, entry);
      const stat = await fs.stat(sourceDir);
      if (!stat.isDirectory()) continue;

      const sourceFile = path.join(sourceDir, 'SKILL.md');
      try {
        await fs.access(sourceFile);
      } catch {
        continue; // No SKILL.md, skip
      }

      const targetDir = path.join(targetRoot, entry);
      const targetFile = path.join(targetDir, 'SKILL.md');

      try {
        await fs.mkdir(targetDir, { recursive: true });
        const content = await fs.readFile(sourceFile, 'utf-8');
        await fs.writeFile(targetFile, content, 'utf-8');
        await appendWorkspaceFileUpdate({
          workspace_path,
          file_path: targetFile,
          summary: `Deployed skill ${entry}`,
          action: 'deploy_skill_file',
        });
        result.deployed.push(entry);
      } catch (err) {
        result.errors!.push(`Failed to deploy ${entry}: ${(err as Error).message}`);
      }
    }

    // Invalidate skill registry cache so it rebuilds on next access
    try {
      invalidateSkillRegistryCache(workspace_path);
    } catch {
      // Non-fatal: cache invalidation failure shouldn't block deploy
    }

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: `Failed to deploy skills: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// matchSkillsToContext
// =============================================================================

/**
 * Score skills against a task description for relevance.
 * Uses keyword matching on skill name, description, tags, and content.
 * Returns matches sorted by score descending.
 */
export async function matchSkillsToContext(
  params: { task_description: string; min_score?: number }
): Promise<ToolResponse<SkillMatch[]>> {
  try {
    const { task_description, min_score = 0.1 } = params;

    if (!task_description) {
      return { success: false, error: 'task_description is required' };
    }

    const skillsResult = await listSkills();
    if (!skillsResult.success || !skillsResult.data) {
      return { success: true, data: [] };
    }

    const taskLower = task_description.toLowerCase();
    const taskWords = new Set(
      taskLower.split(/[\s,.\-_/\\;:!?()[\]{}'"]+/).filter(w => w.length > 2)
    );

    const matches: SkillMatch[] = [];

    for (const skill of skillsResult.data) {
      const { score, keywords } = scoreSkill(skill, taskLower, taskWords);

      if (score >= min_score) {
        matches.push({
          skill_name: skill.name,
          relevance_score: Math.round(score * 1000) / 1000,
          matched_keywords: keywords,
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.relevance_score - a.relevance_score);

    return { success: true, data: matches };
  } catch (error) {
    return {
      success: false,
      error: `Failed to match skills: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// Scoring Helpers
// =============================================================================

function scoreSkill(
  skill: SkillDefinition,
  taskLower: string,
  taskWords: Set<string>
): { score: number; keywords: string[] } {
  const keywords: string[] = [];
  let keywordScore = 0;
  let categoryScore = 0;
  let languageScore = 0;
  let tagScore = 0;

  // --- Keyword matching (weight: 0.4) ---
  // Match against skill name, description, and first 500 chars of content
  const skillTerms = [
    skill.name,
    skill.description,
    skill.content.slice(0, 500),
  ].join(' ').toLowerCase();

  const skillWords = new Set(
    skillTerms.split(/[\s,.\-_/\\;:!?()[\]{}'"]+/).filter(w => w.length > 2)
  );

  let matchCount = 0;
  for (const word of taskWords) {
    if (skillWords.has(word)) {
      matchCount++;
      if (keywords.length < 10) keywords.push(word);
    }
  }
  // Normalize: cap at matching 30% of task words for full score
  keywordScore = Math.min(matchCount / Math.max(taskWords.size * 0.3, 1), 1);

  // --- Category matching (weight: 0.2) ---
  if (skill.category && taskLower.includes(skill.category)) {
    categoryScore = 1;
    if (!keywords.includes(skill.category)) keywords.push(skill.category);
  }

  // --- Language matching (weight: 0.2) ---
  if (skill.language_targets && skill.language_targets.length > 0) {
    for (const lang of skill.language_targets) {
      if (taskLower.includes(lang.toLowerCase())) {
        languageScore = 1;
        if (!keywords.includes(lang)) keywords.push(lang);
        break;
      }
    }
  }

  // --- Tag matching (weight: 0.2) ---
  if (skill.tags && skill.tags.length > 0) {
    let tagMatches = 0;
    for (const tag of skill.tags) {
      const tagLower = tag.toLowerCase();
      if (taskLower.includes(tagLower) || taskWords.has(tagLower)) {
        tagMatches++;
        if (!keywords.includes(tag)) keywords.push(tag);
      }
    }
    tagScore = Math.min(tagMatches / skill.tags.length, 1);
  }

  const score =
    keywordScore * 0.4 +
    categoryScore * 0.2 +
    languageScore * 0.2 +
    tagScore * 0.2;

  return { score, keywords };
}

// =============================================================================
// matchWorkspaceSkillsToContext
// =============================================================================

/**
 * Match skills from a workspace's .github/skills/ directory against a task description.
 * Returns matches with full content included for top results.
 * Used by agent init to provide skill awareness.
 */
export async function matchWorkspaceSkillsToContext(
  params: {
    workspace_path: string;
    task_description: string;
    min_score?: number;
    max_results?: number;
  }
): Promise<ToolResponse<Array<SkillMatch & { content?: string }>>> {
  try {
    const { workspace_path, task_description, min_score = 0.3, max_results = 5 } = params;

    if (!workspace_path || !task_description) {
      return { success: false, error: 'workspace_path and task_description are required' };
    }

    const skillsRoot = path.join(workspace_path, '.github', 'skills');

    // Read workspace skills
    let entries: string[];
    try {
      entries = await fs.readdir(skillsRoot);
    } catch {
      // No .github/skills/ directory — fall back to server skills
      return matchSkillsToContext({ task_description, min_score });
    }

    const skills: SkillDefinition[] = [];
    for (const entry of entries) {
      const skillDir = path.join(skillsRoot, entry);
      const stat = await fs.stat(skillDir);
      if (!stat.isDirectory()) continue;

      const skillFile = path.join(skillDir, 'SKILL.md');
      try {
        const content = await fs.readFile(skillFile, 'utf-8');
        const { frontmatter } = parseFrontmatter(content);

        skills.push({
          name: (frontmatter.name as string) || entry,
          description: (frontmatter.description as string) || '',
          path: skillFile,
          content,
          category: frontmatter.category as SkillCategory | undefined,
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : undefined,
          language_targets: Array.isArray(frontmatter.language_targets) ? frontmatter.language_targets : undefined,
          framework_targets: Array.isArray(frontmatter.framework_targets) ? frontmatter.framework_targets : undefined,
        });
      } catch {
        // No SKILL.md in this directory, skip
      }
    }

    if (skills.length === 0) {
      // No workspace skills found — fall back to server skills
      return matchSkillsToContext({ task_description, min_score });
    }

    // Detect workspace tech stack for boosting
    const detectedStack = await detectWorkspaceTechStack(workspace_path);

    const taskLower = task_description.toLowerCase();
    const taskWords = new Set(
      taskLower.split(/[\s,.\-_/\\;:!?()[\]{}'"]+/).filter(w => w.length > 2)
    );

    // Add detected tech stack terms to context for better matching
    const augmentedTaskLower = detectedStack.length > 0
      ? taskLower + ' ' + detectedStack.join(' ').toLowerCase()
      : taskLower;
    const augmentedTaskWords = new Set([...taskWords]);
    for (const tech of detectedStack) {
      for (const w of tech.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 2)) {
        augmentedTaskWords.add(w);
      }
    }

    const matches: Array<SkillMatch & { content?: string }> = [];

    for (const skill of skills) {
      const { score, keywords } = scoreSkill(skill, augmentedTaskLower, augmentedTaskWords);

      if (score >= min_score) {
        matches.push({
          skill_name: skill.name,
          relevance_score: Math.round(score * 1000) / 1000,
          matched_keywords: keywords,
          content: skill.content,
        });
      }
    }

    // Sort by score descending and limit
    matches.sort((a, b) => b.relevance_score - a.relevance_score);
    const limited = matches.slice(0, max_results);

    return { success: true, data: limited };
  } catch (error) {
    return {
      success: false,
      error: `Failed to match workspace skills: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// Tech Stack Detection
// =============================================================================

/**
 * Detect workspace tech stack from config files.
 * Returns an array of technology names (languages, frameworks, tools).
 */
export async function detectWorkspaceTechStack(workspacePath: string): Promise<string[]> {
  const stack: string[] = [];

  // Check package.json for Node.js/JS ecosystem
  try {
    const pkgRaw = await fs.readFile(path.join(workspacePath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    stack.push('javascript', 'nodejs');

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const knownFrameworks: Record<string, string> = {
      react: 'react', vue: 'vue', angular: 'angular',
      next: 'nextjs', nuxt: 'nuxtjs', svelte: 'svelte',
      express: 'express', fastify: 'fastify', nestjs: 'nestjs',
      tailwindcss: 'tailwind', vitest: 'vitest', jest: 'jest',
      playwright: 'playwright', cypress: 'cypress',
    };
    for (const [dep, name] of Object.entries(knownFrameworks)) {
      if (allDeps && dep in allDeps) {
        stack.push(name);
      }
    }
  } catch {
    // No package.json
  }

  // Check tsconfig.json for TypeScript
  try {
    await fs.access(path.join(workspacePath, 'tsconfig.json'));
    stack.push('typescript');
  } catch {
    // No tsconfig
  }

  // Check for Python
  try {
    await fs.access(path.join(workspacePath, 'pyproject.toml'));
    stack.push('python');
  } catch {
    try {
      await fs.access(path.join(workspacePath, 'requirements.txt'));
      stack.push('python');
    } catch {
      // No Python project files
    }
  }

  // Check for Rust
  try {
    await fs.access(path.join(workspacePath, 'Cargo.toml'));
    stack.push('rust');
  } catch {
    // No Cargo.toml
  }

  // Check for Go
  try {
    await fs.access(path.join(workspacePath, 'go.mod'));
    stack.push('go', 'golang');
  } catch {
    // No go.mod
  }

  return [...new Set(stack)];
}
