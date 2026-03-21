/**
 * workspace-context-manifest.ts
 *
 * Single source of truth for what belongs in a workspace's .github/ folder
 * when using Project Memory MCP.
 *
 * Rules:
 *   MANDATORY — must exist in the workspace; deployed from DB if missing.
 *   CULL      — should NOT exist in the workspace; they are DB-only and
 *               fetched on demand by agents via memory_instructions / memory_agent.
 *
 * Used by:
 *   - memory_workspace(action: register) — reports context_health in response
 *   - VS Code extension deployer         — deploys missing, warns about cull candidates
 *   - registry checks                    — consistent state across workspaces
 */

// ---------------------------------------------------------------------------
// Mandatory files
// ---------------------------------------------------------------------------

/**
 * Agent files that must exist in .github/agents/.
 * These are the ONLY agents VS Code needs on disk to offer chat modes.
 * All other agents are provisioned by Hub at spawn time from the DB.
 */
export const MANDATORY_AGENTS: string[] = [
  'hub.agent.md',
  'prompt-analyst.agent.md',
  'shell.agent.md',
];

/**
 * Instruction files that must exist in .github/instructions/.
 * These are the minimal bootstrap context an agent needs before it can
 * call memory_agent(action: init) and pull the rest from the DB.
 *
 * Every other instruction should be DB-only and fetched on demand.
 */
export const MANDATORY_INSTRUCTIONS: string[] = [
  'mcp-usage.instructions.md',         // tool table + init protocol
  'hub.instructions.md',               // hub-specific supplement (applyTo: hub.agent.md)
  'prompt-analyst.instructions.md',    // pa-specific supplement (applyTo: prompt-analyst.agent.md)
  'subagent-recovery.instructions.md', // recovery protocol (applyTo: hub.agent.md)
];

/** No skill files are mandatory in the workspace. Skills are always DB-only. */
export const MANDATORY_SKILLS: string[] = [];

// ---------------------------------------------------------------------------
// Cull lists
// ---------------------------------------------------------------------------

/**
 * Agent files that should NOT exist in the workspace.
 * Shell and specialist spokes are provisioned dynamically; having their
 * .agent.md files on disk pollutes VS Code's agent picker with modes that
 * are never directly invoked by users.
 */
export const CULL_AGENTS: string[] = [
  'folder-cleanup-shell.agent.md',
];

/**
 * Instruction files that should NOT exist in the workspace.
 * These are detailed reference docs or role-specific instructions that agents
 * fetch from the DB on demand (via memory_instructions or memory_agent).
 */
export const CULL_INSTRUCTIONS: string[] = [
  // Role-specific: fetched by Shell agents on spawn init
  'shell.instructions.md',
  'folder-cleanup.instructions.md',
  'hub-interaction-discipline.instructions.md',

  // Reference docs: available via memory_instructions(action: get/search)
  'plan-context.instructions.md',
  'session-interruption.instructions.md',
  'workspace-migration.instructions.md',
  'build-scripts.instructions.md',        // workspace-specific; assigned via workspace_instruction_assignments

  // Archive subdirectory: all files in it are cull candidates
  // (checked separately as a directory)
];

/**
 * The archive subdirectory inside .github/instructions/ — all files here
 * should be removed from the workspace. They are DB-only reference files.
 */
export const CULL_INSTRUCTIONS_ARCHIVE_DIR = 'archive';

/**
 * Skill directories are never deployed to the workspace.
 * All skills are stored in the DB and pulled on demand.
 * If a .github/skills/ directory is detected, all its contents are cull candidates.
 */
export const CULL_ALL_SKILLS = true;

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

export interface WorkspaceContextHealth {
  /** Files that must exist but are missing */
  mandatory_missing: string[];
  /** Files that are present but should not be in the workspace */
  cull_detected: string[];
  /** 'ok' | 'needs_attention' */
  status: 'ok' | 'needs_attention';
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Inspect a workspace's .github/ directory and return a health report.
 * Does not modify any files — reporting only.
 */
export function checkWorkspaceContextHealth(workspacePath: string): WorkspaceContextHealth {
  const githubDir = path.join(workspacePath, '.github');
  const agentsDir = path.join(githubDir, 'agents');
  const instructionsDir = path.join(githubDir, 'instructions');
  const skillsDir = path.join(githubDir, 'skills');

  const mandatoryMissing: string[] = [];
  const cullDetected: string[] = [];

  // ── mandatory agents ────────────────────────────────────────────────────
  for (const filename of MANDATORY_AGENTS) {
    if (!fs.existsSync(path.join(agentsDir, filename))) {
      mandatoryMissing.push(`agents/${filename}`);
    }
  }

  // ── mandatory instructions ───────────────────────────────────────────────
  for (const filename of MANDATORY_INSTRUCTIONS) {
    if (!fs.existsSync(path.join(instructionsDir, filename))) {
      mandatoryMissing.push(`instructions/${filename}`);
    }
  }

  // ── cull: agent files ────────────────────────────────────────────────────
  if (fs.existsSync(agentsDir)) {
    const allAgents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
    for (const filename of allAgents) {
      // cull anything not in the mandatory list
      if (!MANDATORY_AGENTS.includes(filename)) {
        cullDetected.push(`agents/${filename}`);
      }
    }
  }

  // ── cull: named instruction files ────────────────────────────────────────
  for (const filename of CULL_INSTRUCTIONS) {
    if (fs.existsSync(path.join(instructionsDir, filename))) {
      cullDetected.push(`instructions/${filename}`);
    }
  }

  // ── cull: archive/ subdirectory ──────────────────────────────────────────
  const archiveDir = path.join(instructionsDir, CULL_INSTRUCTIONS_ARCHIVE_DIR);
  if (fs.existsSync(archiveDir)) {
    const archiveFiles = fs.readdirSync(archiveDir).filter(f => f.endsWith('.md'));
    for (const filename of archiveFiles) {
      cullDetected.push(`instructions/${CULL_INSTRUCTIONS_ARCHIVE_DIR}/${filename}`);
    }
  }

  // ── cull: skills directory ───────────────────────────────────────────────
  if (CULL_ALL_SKILLS && fs.existsSync(skillsDir)) {
    try {
      const skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of skillEntries) {
        if (entry.isDirectory()) {
          cullDetected.push(`skills/${entry.name}/`);
        } else if (entry.name.endsWith('.md')) {
          cullDetected.push(`skills/${entry.name}`);
        }
      }
    } catch {
      // ignore read errors — directory may be empty or inaccessible
    }
  }

  const status = mandatoryMissing.length > 0 || cullDetected.length > 0
    ? 'needs_attention'
    : 'ok';

  return { mandatory_missing: mandatoryMissing, cull_detected: cullDetected, status };
}
