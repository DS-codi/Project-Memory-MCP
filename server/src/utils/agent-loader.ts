/**
 * Agent Loader Utility
 * 
 * Discovers and validates agent files from the agents/ directory.
 * Used by the spawn action to verify agent existence and load instructions.
 */

import { promises as fs } from 'fs';
import path from 'path';

// Path to the agents directory (matches agent.tools.ts convention)
const AGENTS_ROOT = process.env.MBS_AGENTS_ROOT || path.join(process.cwd(), '..', 'agents');

/**
 * Canonical mapping of agent names to their expected filenames.
 * Agent names are case-insensitive during lookup but must match a known agent.
 */
const AGENT_FILE_MAP: Record<string, string> = {
  coordinator: 'coordinator.agent.md',
  analyst: 'analyst.agent.md',
  researcher: 'researcher.agent.md',
  architect: 'architect.agent.md',
  executor: 'executor.agent.md',
  reviewer: 'reviewer.agent.md',
  tester: 'tester.agent.md',
  revisionist: 'revisionist.agent.md',
  archivist: 'archivist.agent.md',
  brainstorm: 'brainstorm.agent.md',
  runner: 'runner.agent.md',
  skillwriter: 'skill-writer.agent.md',
  worker: 'worker.agent.md',
  tdddriver: 'tdd-driver.agent.md',
  cognition: 'cognition.agent.md',
};

export interface AgentFileInfo {
  /** The canonical agent name (e.g. 'Coordinator') */
  name: string;
  /** The filename on disk (e.g. 'coordinator.agent.md') */
  filename: string;
  /** Absolute path to the agent file */
  filepath: string;
}

export interface AgentLoadResult {
  agent: AgentFileInfo;
  /** The full markdown content of the agent instruction file */
  instructions: string;
}

/**
 * Discover all agent files from the agents/ directory.
 * Returns only files matching the *.agent.md pattern.
 */
export async function discoverAgents(): Promise<AgentFileInfo[]> {
  try {
    const files = await fs.readdir(AGENTS_ROOT);
    const agentFiles = files.filter(f => f.endsWith('.agent.md'));

    return agentFiles.map(filename => ({
      name: agentNameFromFilename(filename),
      filename,
      filepath: path.join(AGENTS_ROOT, filename),
    }));
  } catch (error) {
    throw new Error(`Failed to discover agents in ${AGENTS_ROOT}: ${(error as Error).message}`);
  }
}

/**
 * Validate that an agent name maps to an existing agent file on disk.
 * Returns the agent info if valid, null if not found.
 * 
 * @param agentName - Case-insensitive agent name (e.g. 'Executor', 'cognition')
 */
export async function validateAgentExists(agentName: string): Promise<AgentFileInfo | null> {
  const key = agentName.toLowerCase();
  const expectedFile = AGENT_FILE_MAP[key];

  if (!expectedFile) {
    // Not in canonical map — try filesystem discovery as fallback
    const agents = await discoverAgents();
    const match = agents.find(a => a.name.toLowerCase() === key);
    return match ?? null;
  }

  const filepath = path.join(AGENTS_ROOT, expectedFile);
  try {
    await fs.access(filepath);
    return {
      name: capitalizeAgentName(key),
      filename: expectedFile,
      filepath,
    };
  } catch {
    return null;
  }
}

/**
 * Load an agent's instruction file content.
 * Validates existence first, then reads the file.
 * 
 * @param agentName - Case-insensitive agent name
 */
export async function loadAgentInstructions(agentName: string): Promise<AgentLoadResult | null> {
  const agent = await validateAgentExists(agentName);
  if (!agent) return null;

  try {
    const instructions = await fs.readFile(agent.filepath, 'utf-8');
    return { agent, instructions };
  } catch (error) {
    throw new Error(`Agent file exists but could not be read: ${agent.filepath} — ${(error as Error).message}`);
  }
}

/**
 * List all known agent names (from the canonical map).
 */
export function listKnownAgentNames(): string[] {
  return Object.keys(AGENT_FILE_MAP).map(capitalizeAgentName);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract the agent name from a filename.
 * e.g. 'coordinator.agent.md' → 'Coordinator'
 *      'tdd-driver.agent.md' → 'TDDDriver'
 *      'skill-writer.agent.md' → 'SkillWriter'
 */
function agentNameFromFilename(filename: string): string {
  const base = filename.replace('.agent.md', '');
  // Special cases for multi-word names
  const specialCases: Record<string, string> = {
    'tdd-driver': 'TDDDriver',
    'skill-writer': 'SkillWriter',
  };
  if (specialCases[base]) return specialCases[base];
  // Default: capitalize first letter
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Capitalize an agent key back to its canonical form.
 * e.g. 'coordinator' → 'Coordinator', 'tdddriver' → 'TDDDriver'
 */
function capitalizeAgentName(key: string): string {
  const specialCases: Record<string, string> = {
    tdddriver: 'TDDDriver',
    skillwriter: 'SkillWriter',
  };
  if (specialCases[key]) return specialCases[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}
