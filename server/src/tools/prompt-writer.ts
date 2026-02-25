/**
 * Prompt Writer - Generates .prompt.md files with YAML frontmatter
 * for the Dynamic Prompt System.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ensureDir } from '../storage/db-store.js';

// =============================================================================
// Types
// =============================================================================

export interface PromptFrontmatter {
  agent: string;
  description: string;
  mode?: string;
  version?: string;
  created_by?: string;
  plan_id?: string;
  phase?: string;
  step_indices?: number[];
  expires_after?: string;
  archived?: boolean;
  archived_at?: string;
  plan_updated_at?: string;
  tags?: string[];
}

export interface PromptSection {
  title: string;
  content: string;
}

export interface PromptData {
  title: string;
  frontmatter: PromptFrontmatter;
  intro?: string;
  sections?: PromptSection[];
  variables?: string[];
  rawBody?: string;
}

export interface PromptWriteResult {
  filePath: string;
  slug: string;
  version: string;
  content: string;
}

// =============================================================================
// Frontmatter Serialization
// =============================================================================

function yamlValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}]`;
  }
  const str = String(value);
  // Quote strings containing special YAML characters
  if (/[:#\[\]{}&*!|>'"%@`,?]/.test(str) || str.includes('\n') || str.trim() !== str) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return `"${str}"`;
}

function serializeFrontmatter(fm: PromptFrontmatter): string {
  const lines: string[] = ['---'];

  // Output fields in a deterministic, logical order
  const ordered: Array<[string, unknown]> = [
    ['agent', fm.agent],
    ['description', fm.description],
    ['mode', fm.mode],
    ['version', fm.version],
    ['created_by', fm.created_by],
    ['plan_id', fm.plan_id],
    ['phase', fm.phase],
    ['step_indices', fm.step_indices],
    ['expires_after', fm.expires_after],
    ['tags', fm.tags],
    ['archived', fm.archived],
    ['archived_at', fm.archived_at],
    ['plan_updated_at', fm.plan_updated_at],
  ];

  for (const [key, value] of ordered) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    lines.push(`${key}: ${yamlValue(value)}`);
  }

  lines.push('---');
  return lines.join('\n');
}

// =============================================================================
// Slug Generation
// =============================================================================

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

// =============================================================================
// Prompt Generation
// =============================================================================

export function generatePromptContent(data: PromptData): string {
  const parts: string[] = [];

  // Frontmatter
  parts.push(serializeFrontmatter(data.frontmatter));
  parts.push('');

  // Title
  parts.push(`# ${data.title}`);
  parts.push('');

  // Optional intro
  if (data.intro) {
    parts.push(data.intro);
    parts.push('');
  }

  // Body: either raw or sectioned
  if (data.rawBody) {
    parts.push(data.rawBody);
  } else if (data.sections && data.sections.length > 0) {
    for (const section of data.sections) {
      parts.push(`## ${section.title}`);
      parts.push('');
      parts.push(section.content);
      parts.push('');
    }
  }

  // Document template variables if any
  if (data.variables && data.variables.length > 0) {
    parts.push('---');
    parts.push('');
    parts.push('**Template Variables:**');
    parts.push('');
    for (const v of data.variables) {
      parts.push(`- \`{{${v}}}\``);
    }
    parts.push('');
  }

  return parts.join('\n').trimEnd() + '\n';
}

/** Generate a .prompt.md file and write it to disk. */
export async function generatePromptFile(
  data: PromptData,
  outputDir: string,
  filenameOverride?: string,
): Promise<PromptWriteResult> {
  // Validate required fields
  if (!data.title?.trim()) {
    throw new Error('Prompt title is required');
  }
  if (!data.frontmatter?.agent?.trim()) {
    throw new Error('Prompt frontmatter.agent is required');
  }
  if (!data.frontmatter?.description?.trim()) {
    throw new Error('Prompt frontmatter.description is required');
  }

  // Default version
  const version = data.frontmatter.version || '1.0.0';
  data.frontmatter.version = version;

  // Generate slug and filename
  const slug = filenameOverride || slugify(data.title);
  const filename = `${slug}.prompt.md`;
  const filePath = path.join(outputDir, filename);

  // Generate content
  const content = generatePromptContent(data);

  // Write to disk
  await ensureDir(outputDir);
  await fs.writeFile(filePath, content, 'utf-8');

  return { filePath, slug, version, content };
}

// =============================================================================
// Prompt Reading & Parsing
// =============================================================================

export function parsePromptFile(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yamlStr = match[1];
  const body = match[2];

  // Simple YAML parser for our frontmatter format
  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    let value: string | boolean | number | unknown[] = line.substring(colonIdx + 1).trim();

    // Parse arrays: [1, 2, 3] or ["a", "b"]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1);
      if (inner.trim() === '') {
        frontmatter[key] = [];
        continue;
      }
      frontmatter[key] = inner.split(',').map(item => {
        const trimmed = item.trim().replace(/^"(.*)"$/, '$1');
        const num = Number(trimmed);
        return isNaN(num) ? trimmed : num;
      });
      continue;
    }

    // Parse booleans
    if (value === 'true') { frontmatter[key] = true; continue; }
    if (value === 'false') { frontmatter[key] = false; continue; }

    // Strip quotes from strings
    if (typeof value === 'string') {
      value = value.replace(/^"(.*)"$/, '$1');
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// =============================================================================
// Archival
// =============================================================================

export function addArchivalHeader(
  content: string,
  planTitle: string,
  relatedSteps: string,
): string {
  const { frontmatter, body } = parsePromptFile(content);

  // Update frontmatter
  frontmatter['archived'] = true;
  frontmatter['archived_at'] = new Date().toISOString();

  // Reconstruct frontmatter
  const fmLines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    fmLines.push(`${key}: ${yamlValue(value)}`);
  }
  fmLines.push('---');

  const header = `\n### ARCHIVED PROMPT: Used for plan "${planTitle}", Related Steps "${relatedSteps}"\n`;

  return fmLines.join('\n') + header + '\n' + body;
}
