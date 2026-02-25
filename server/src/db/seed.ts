/**
 * db/seed.ts — Database seed utilities
 *
 * Populates static reference data on first run (idempotent):
 *   1. Tool catalog  — MCP tools, actions, and their parameter specs
 *   2. Agent defs    — agent type descriptions from agents-v2/*.agent.md
 *   3. Instructions  — instruction files from .github/instructions/
 *   4. Skills        — skill definitions from .github/skills/{name}/SKILL.md
 *
 * Can be called at server startup (via `runSeed()`) or directly as a CLI:
 *   npx tsx server/src/db/seed.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb } from './connection.js';
import { runMigrations } from './migration-runner.js';
import { seedToolCatalog, type CatalogTool } from './tool-catalog-db.js';
import { storeAgent } from './agent-definition-db.js';
import { storeInstruction } from './instruction-db.js';
import { storeSkill } from './skill-db.js';

// ── Path resolution ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Walk up from server/src/db (or server/dist/db) to find the project root.
 *
 * Strategy: look for a directory that has BOTH a package.json and a known
 * project-root marker (agents-v2/ or Containerfile). This skips the nested
 * server/package.json which would otherwise be found first.
 *
 * Fallback: server/src/db → 3 levels up → Project-Memory-MCP/ root.
 */
function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const isRootMarker = fs.existsSync(path.join(dir, 'agents-v2')) ||
                         fs.existsSync(path.join(dir, 'Containerfile'));
    if (isRootMarker) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: from server/src/db/ or server/dist/db/ → 3 levels up = project root
  return path.resolve(__dirname, '..', '..', '..');
}

// ── Tool catalog data ─────────────────────────────────────────────────────────

/**
 * Builds the full CatalogTool[] from the static action-param-registry that
 * already lives in server/src/tools/preflight/.
 *
 * We import at runtime using dynamic import so this seed file stays
 * compatible with both startup usage and CLI usage.
 */
async function buildToolCatalog(): Promise<CatalogTool[]> {
  // Dynamic import keeps circular-dependency risk zero and works in both
  // module-level and CLI invocations.
  const { ACTION_PARAM_SPECS } = await import(
    '../tools/preflight/action-param-registry.js'
  );

  const catalog: CatalogTool[] = [
    {
      name: 'memory_workspace',
      description:
        'Consolidated workspace management: register, list, info, reindex, merge, scan_ghosts, migrate, link, export_pending.',
      actions: buildActions(ACTION_PARAM_SPECS['memory_workspace'] ?? {}),
    },
    {
      name: 'memory_plan',
      description:
        'Comprehensive plan lifecycle management: create, update, archive, programs, build scripts, goals, templates, and more.',
      actions: buildActions(ACTION_PARAM_SPECS['memory_plan'] ?? {}),
    },
    {
      name: 'memory_steps',
      description:
        'Step-level operations: add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace.',
      actions: buildActions(ACTION_PARAM_SPECS['memory_steps'] ?? {}),
    },
    {
      name: 'memory_agent',
      description:
        'Agent lifecycle management: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage.',
      actions: buildActions(ACTION_PARAM_SPECS['memory_agent'] ?? {}),
    },
    {
      name: 'memory_context',
      description:
        'Context and research management: store, get, store_initial, workspace_get/set/update/delete, knowledge CRUD, append_research.',
      actions: buildActions(ACTION_PARAM_SPECS['memory_context'] ?? {}),
    },
    {
      name: 'memory_terminal',
      description:
        'Server-side headless terminal with allowlist-based authorization: run, read_output, kill, get_allowlist, update_allowlist.',
      actions: buildActions(ACTION_PARAM_SPECS['memory_terminal'] ?? {}),
    },
    {
      name: 'memory_filesystem',
      description:
        'Workspace-scoped file operations with safety boundaries: read, write, search, list, tree, delete, move, copy, append, exists.',
      actions: buildActions(ACTION_PARAM_SPECS['memory_filesystem'] ?? {}),
    },
    {
      name: 'memory_session',
      description:
        'Agent session management and spawn preparation: prep, deploy_and_prep, list_sessions, get_session.',
      actions: [
        { name: 'prep',            description: 'Mint session ID + enrich prompt' },
        { name: 'deploy_and_prep', description: 'Deploy context bundle + prepare enriched prompt' },
        { name: 'list_sessions',   description: 'Query sessions from plan state' },
        { name: 'get_session',     description: 'Find a specific session by ID' },
      ],
    },
  ];

  return catalog;
}

/** Convert an ActionParamDef map → CatalogAction[]. */
function buildActions(
  paramMap: Record<string, { required: Array<{ name: string; type?: string; description?: string }>; optional: Array<{ name: string; type?: string; description?: string }> }>,
) {
  return Object.entries(paramMap).map(([actionName, spec]) => ({
    name: actionName,
    params: [
      ...spec.required.map(p => ({ name: p.name, type: p.type, required: true,  description: p.description })),
      ...spec.optional.map(p => ({ name: p.name, type: p.type, required: false, description: p.description })),
    ],
  }));
}

// ── Agent definitions ─────────────────────────────────────────────────────────

interface AgentFrontmatter {
  name:        string;
  description: string;
  version?:    string;
  tags?:       string[];
}

/**
 * Parse an agent .md file's YAML frontmatter (simple key-value, no deps).
 * Falls back to filename-derived name if frontmatter is absent.
 */
function parseAgentMd(filePath: string): AgentFrontmatter | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath, '.agent.md');
  // Normalize: "skill-writer" → "SkillWriter", etc.
  const defaultName = filename
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    // No frontmatter — use filename as name and first non-empty line as desc
    const firstLine = content.split('\n').find(l => l.trim().startsWith('#'));
    return {
      name:        defaultName,
      description: firstLine ? firstLine.replace(/^#+\s*/, '').trim() : defaultName,
    };
  }

  const fm = fmMatch[1];
  const extract = (key: string): string | undefined => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
  };

  const tagsMatch = fm.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m);
  const tags = tagsMatch
    ? tagsMatch[1].split('\n').map(l => l.replace(/^\s+-\s+/, '').trim()).filter(Boolean)
    : undefined;

  // Description: try 'description' key first, then first H1/H2 in body
  let description = extract('description');
  if (!description) {
    const headingMatch = content.match(/^##?\s+(.+)/m);
    description = headingMatch ? headingMatch[1].trim() : defaultName;
  }

  return {
    name:        extract('name') ?? defaultName,
    description: description ?? defaultName,
    version:     extract('version'),
    tags,
  };
}

async function seedAgentDefinitions(projectRoot: string): Promise<number> {
  const agentsDir = path.join(projectRoot, 'agents-v2');
  if (!fs.existsSync(agentsDir)) {
    console.warn(`  [seed] agents-v2 directory not found at ${agentsDir}, skipping agent defs`);
    return 0;
  }

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
  let count = 0;

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    const parsed = parseAgentMd(filePath);
    if (!parsed) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    storeAgent(
      parsed.name,
      content,
      {
        slug:        file.replace('.agent.md', ''),
        description: parsed.description,
        version:     parsed.version ?? '1.0.0',
        tags:        parsed.tags ?? [],
      }
    );
    count++;
  }

  return count;
}

// ── Instruction files ─────────────────────────────────────────────────────────

async function seedInstructionFiles(projectRoot: string): Promise<number> {
  const instrDir = path.join(projectRoot, '.github', 'instructions');
  if (!fs.existsSync(instrDir)) {
    console.warn(`  [seed] instructions directory not found at ${instrDir}, skipping`);
    return 0;
  }

  const files = fs.readdirSync(instrDir).filter(f => f.endsWith('.md'));
  let count = 0;

  for (const file of files) {
    const filePath = path.join(instrDir, file);
    const content  = fs.readFileSync(filePath, 'utf-8');

    // Parse applyTo from frontmatter if present (e.g. applyTo: "agents/*.agent.md")
    const applyToMatch = content.match(/^applyTo:\s*["']?([^"'\n]+)["']?\s*$/m);
    const applyTo = applyToMatch ? applyToMatch[1].trim() : '**/*';

    // Title from first heading or filename
    const titleMatch = content.match(/^#+\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : file.replace('.instructions.md', '');

    storeInstruction(file, applyTo, content);
    count++;
  }

  return count;
}

// ── Skill definitions ─────────────────────────────────────────────────────────

interface SkillFrontmatter {
  name?:       string;
  category?:   string;
  tags?:       string[];
  language_targets?: string[];
  framework_targets?: string[];
}

function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};

  const fm = fmMatch[1];

  const extractStr = (key: string): string | undefined => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
  };

  const extractList = (key: string): string[] | undefined => {
    const m = fm.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, 'm'));
    if (!m) {
      // inline list: key: [a, b, c]
      const inline = fm.match(new RegExp(`^${key}:\\s*\\[([^\\]]+)\\]`, 'm'));
      if (inline) {
        return inline[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      }
      return undefined;
    }
    return m[1]
      .split('\n')
      .map(l => l.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  };

  return {
    name:               extractStr('name'),
    category:           extractStr('category'),
    tags:               extractList('tags'),
    language_targets:   extractList('language_targets'),
    framework_targets:  extractList('framework_targets'),
  };
}

async function seedSkills(projectRoot: string): Promise<number> {
  const skillsDir = path.join(projectRoot, 'skills');
  if (!fs.existsSync(skillsDir)) {
    console.warn(`  [seed] skills directory not found at ${skillsDir}, skipping`);
    return 0;
  }

  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let count = 0;

  for (const skillSlug of skillDirs) {
    const skillMdPath = path.join(skillsDir, skillSlug, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const fm = parseSkillFrontmatter(content);

    // Title: frontmatter name → first heading → slug
    const headingMatch = content.match(/^#+\s+(.+)/m);
    const title = fm.name ?? (headingMatch ? headingMatch[1].trim() : skillSlug);

    // Description: first non-heading, non-frontmatter paragraph
    const stripped = content.replace(/^---[\s\S]*?---\n/, '');
    const descMatch = stripped.match(/^(?!#)[^\n]+/m);
    const description = descMatch ? descMatch[0].trim() : title;

    storeSkill(title, {
      description,
      category:           fm.category ?? 'general',
      tags:               fm.tags ?? [],
      language_targets:   fm.language_targets ?? [],
      framework_targets:  fm.framework_targets ?? [],
      content,
    });
    count++;
  }

  return count;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SeedResult {
  tools:        number;
  agents:       number;
  instructions: number;
  skills:       number;
}

/**
 * Run all seed operations. Safe to call multiple times (idempotent).
 * Ensures DB is initialised (migrations run) before seeding.
 */
export async function runSeed(projectRoot?: string): Promise<SeedResult> {
  const root = projectRoot ?? findProjectRoot();

  // Ensure DB is migrated
  getDb(); // Opens DB and applies pragmas
  runMigrations();

  console.log('[seed] Seeding tool catalog...');
  const catalog = await buildToolCatalog();
  seedToolCatalog(catalog);
  const toolActionCount = catalog.reduce((acc, t) => acc + t.actions.length, 0);
  console.log(`[seed]   ${catalog.length} tools, ${toolActionCount} actions`);

  console.log('[seed] Seeding agent definitions...');
  const agentCount = await seedAgentDefinitions(root);
  console.log(`[seed]   ${agentCount} agents`);

  console.log('[seed] Seeding instruction files...');
  const instrCount = await seedInstructionFiles(root);
  console.log(`[seed]   ${instrCount} instruction files`);

  console.log('[seed] Seeding skill definitions...');
  const skillCount = await seedSkills(root);
  console.log(`[seed]   ${skillCount} skills`);

  console.log('[seed] Done.');

  return {
    tools:        catalog.length,
    agents:       agentCount,
    instructions: instrCount,
    skills:       skillCount,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

// When run directly: npx tsx server/src/db/seed.ts
const isMain = process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isMain) {
  runSeed()
    .then(result => {
      console.log('\n[seed] Summary:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('[seed] Error:', err);
      process.exit(1);
    });
}
