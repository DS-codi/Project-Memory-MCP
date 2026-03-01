/**
 * Agent Deploy — Core deploy module for on-demand agent deployment
 * into .projectmemory/active_agents/{agentName}/.
 *
 * Three exports:
 *   buildContextBundle  — assembles ContextBundle from plan data
 *   deployForTask       — deploys agent + context + manifest
 *   cleanupAgent        — moves execution notes to reviewed_queue, removes agent dir
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  DeployForTaskParams,
  ContextBundle,
  ActiveAgentManifest,
  DeployForTaskResult,
} from '../types/index.js';
import {
  ensureDir,
  exists,
  nowISO,
  getContextPath,
  listPlanResearchNoteNamesFromDb,
} from '../storage/db-store.js';
import { readJson, writeJson } from '../storage/db-store.js';
import {
  getActiveAgentsDir,
  getAgentDeployDir,
  getDeployedAgentFile,
  getContextBundlePath,
  getManifestPath,
  getInitContextPath,
  getAgentContextDir,
  getAgentInstructionsDir,
  getAgentExecutionNotesDir,
  getAgentToolResponsesDir,
  getAgentPullStagingDir,
  getReviewedAgentDir,
} from '../storage/db-store.js';
import { AGENTS_ROOT, INSTRUCTIONS_ROOT } from './agent.tools.js';
import { AGENT_BOUNDARIES } from '../types/index.js';
import { buildToolContracts } from './preflight/index.js';

function normalizeBundleLookupToken(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, '/');
}

function pathTokensForLookup(filePath: string): string[] {
  const normalizedPath = normalizeBundleLookupToken(filePath);
  const fileName = path.basename(filePath);
  const fileNameToken = normalizeBundleLookupToken(fileName);
  const baseNameToken = normalizeBundleLookupToken(path.basename(fileName, path.extname(fileName)));
  const parentDirToken = normalizeBundleLookupToken(path.basename(path.dirname(filePath)));
  const skillToken = fileNameToken === 'skill.md' ? parentDirToken : '';

  return [normalizedPath, fileNameToken, baseNameToken, parentDirToken, skillToken].filter(Boolean);
}

function selectSubsetByIds(candidates: string[], ids: string[]): string[] {
  const requested = ids.map(normalizeBundleLookupToken);
  if (requested.length === 0 || candidates.length === 0) {
    return [];
  }

  const selected = new Set<string>();
  for (const candidate of candidates) {
    const tokens = pathTokensForLookup(candidate);
    const isMatch = requested.some((id) =>
      tokens.some((token) => token === id || token.endsWith(`/${id}`) || token.includes(`/${id}.`)),
    );
    if (isMatch) {
      selected.add(candidate);
    }
  }

  return Array.from(selected);
}

async function discoverInstructionFiles(workspacePath: string, agentName: string): Promise<string[]> {
  const agentLower = agentName.toLowerCase();
  const searchDirs = [
    path.join(workspacePath, '.memory', 'instructions'),
    path.join(workspacePath, '.github', 'instructions'),
    INSTRUCTIONS_ROOT,
  ];

  const discovered = new Set<string>();
  for (const dir of searchDirs) {
    try {
      const files = await fs.readdir(dir);
      const matching = files.filter(
        file => file.toLowerCase().includes(agentLower) && file.endsWith('.md'),
      );
      for (const file of matching) {
        discovered.add(path.join(dir, file));
      }
    } catch {
      // Directory missing/unreadable — ignore
    }
  }

  return Array.from(discovered);
}

async function discoverSkillFiles(workspacePath: string): Promise<string[]> {
  const skillsDir = path.join(workspacePath, '.github', 'skills');
  const discovered: string[] = [];
  try {
    const entries = await fs.readdir(skillsDir);
    for (const entry of entries) {
      const skillFile = path.join(skillsDir, entry, 'SKILL.md');
      if (await exists(skillFile)) {
        discovered.push(skillFile);
      }
    }
  } catch {
    // No skills directory — ignore
  }
  return discovered;
}

// ---------------------------------------------------------------------------
// buildContextBundle
// ---------------------------------------------------------------------------

/**
 * Assembles a ContextBundle by reading available plan data sources.
 * Each source is individually try/catch-guarded — missing data is skipped.
 */
export async function buildContextBundle(
  workspaceId: string,
  planId: string,
  params: DeployForTaskParams,
): Promise<ContextBundle> {
  const bundle: ContextBundle = {
    plan_id: planId,
    phase_name: params.phase_name,
    step_indices: params.step_indices,
    assembled_at: nowISO(),
  };

  if (params.prompt_analyst_output) {
    bundle.prompt_analyst_output = params.prompt_analyst_output;
  }

  if (params.hub_decision_payload) {
    bundle.hub_decision_payload = params.hub_decision_payload;
    bundle.resolved_bundle_ids = {
      hub_skill_bundle_id:
        params.hub_decision_payload.hub_selected_skill_bundle?.bundle_id
        ?? params.prompt_analyst_output?.hub_skill_bundle_id,
      hub_skill_bundle_version:
        params.hub_decision_payload.hub_selected_skill_bundle?.version
        ?? params.prompt_analyst_output?.hub_skill_bundle_version,
      spoke_instruction_bundle_id: params.hub_decision_payload.spoke_instruction_bundle?.bundle_id,
      spoke_instruction_bundle_version: params.hub_decision_payload.spoke_instruction_bundle?.version,
      spoke_skill_bundle_id: params.hub_decision_payload.spoke_skill_bundle?.bundle_id,
      spoke_skill_bundle_version: params.hub_decision_payload.spoke_skill_bundle?.version,
    };
    bundle.resolved_instruction_ids = params.hub_decision_payload.spoke_instruction_bundle?.instruction_ids;
    bundle.resolved_skill_ids = params.hub_decision_payload.spoke_skill_bundle?.skill_ids;
    bundle.bundle_resolution_source = 'explicit_hub_decision';
  }

  // 1. Research notes (filenames only)
  if (params.include_research !== false) {
    try {
      bundle.research_notes = await listPlanResearchNoteNamesFromDb(workspaceId, planId);
    } catch {
      // research_notes/ doesn't exist or is empty — skip
    }
  }

  // 2. Architecture context
  if (params.include_architecture !== false) {
    try {
      const archPath = getContextPath(workspaceId, planId, 'architecture');
      const archData = await readJson<Record<string, unknown>>(archPath);
      if (archData) {
        bundle.architecture_summary = JSON.stringify(archData);
      }
    } catch {
      // No architecture context — skip
    }
  }

  const explicitInstructionIds = params.hub_decision_payload?.spoke_instruction_bundle?.instruction_ids ?? [];
  const explicitSkillIds = params.hub_decision_payload?.spoke_skill_bundle?.skill_ids ?? [];

  const effectiveProvisioningMode = params.provisioning_mode ?? 'on_demand';
  const effectiveFallbackPolicy = params.fallback_policy ?? params.hub_decision_payload?.fallback_policy;
  const compatFallbackAllowed = effectiveFallbackPolicy?.fallback_allowed === true
    && (effectiveFallbackPolicy.fallback_mode === 'compat_dynamic' || !effectiveFallbackPolicy.fallback_mode);

  const legacyAlwaysOnAllowed = effectiveProvisioningMode === 'compat'
    && params.allow_legacy_always_on === true
    && compatFallbackAllowed;

  const ambientInstructionFallbackAllowed = legacyAlwaysOnAllowed
    || (params.allow_ambient_instruction_scan === true && compatFallbackAllowed);

  const ambientSkillFallbackAllowed = legacyAlwaysOnAllowed
    || (params.allow_include_skills_all === true && compatFallbackAllowed);

  // 3. Instruction files (explicit subset first; ambient only via explicit compat fallback controls)
  try {
    const discoveredInstructions = await discoverInstructionFiles(params.workspace_path, params.agent_name);

    if (explicitInstructionIds.length > 0) {
      const explicitSubset = selectSubsetByIds(discoveredInstructions, explicitInstructionIds);
      if (explicitSubset.length > 0) {
        bundle.instruction_files = explicitSubset;
      } else if (ambientInstructionFallbackAllowed && discoveredInstructions.length > 0) {
        bundle.instruction_files = discoveredInstructions;
        bundle.bundle_resolution_source = 'compat_fallback';
      }
    } else if (ambientInstructionFallbackAllowed && discoveredInstructions.length > 0) {
      bundle.instruction_files = discoveredInstructions;
      if (!bundle.bundle_resolution_source) {
        bundle.bundle_resolution_source = params.hub_decision_payload ? 'compat_fallback' : 'ambient_discovery';
      }
    }
  } catch {
    // Instruction discovery failed — skip
  }

  // 4. Matched skills (explicit subset first; ambient only via explicit compat fallback controls)
  if (params.include_skills || explicitSkillIds.length > 0) {
    try {
      const discoveredSkills = await discoverSkillFiles(params.workspace_path);

      if (explicitSkillIds.length > 0) {
        const explicitSubset = selectSubsetByIds(discoveredSkills, explicitSkillIds);
        if (explicitSubset.length > 0) {
          bundle.matched_skills = explicitSubset;
        } else if (ambientSkillFallbackAllowed && discoveredSkills.length > 0) {
          bundle.matched_skills = discoveredSkills;
          bundle.bundle_resolution_source = 'compat_fallback';
        }
      } else if (params.include_skills && ambientSkillFallbackAllowed && discoveredSkills.length > 0) {
        bundle.matched_skills = discoveredSkills;
        if (!bundle.bundle_resolution_source) {
          bundle.bundle_resolution_source = params.hub_decision_payload ? 'compat_fallback' : 'ambient_discovery';
        }
      }
    } catch {
      // No skills directory — skip
    }
  }

  if (!bundle.bundle_resolution_source) {
    bundle.bundle_resolution_source = params.hub_decision_payload
      ? 'explicit_hub_decision'
      : 'ambient_discovery';
  }

  return bundle;
}

// ---------------------------------------------------------------------------
// deployForTask
// ---------------------------------------------------------------------------

/**
 * Deploy an agent file + context bundle + manifest to
 * .projectmemory/active_agents/{agentName}/.
 */
export async function deployForTask(
  params: DeployForTaskParams,
): Promise<DeployForTaskResult> {
  const warnings: string[] = [];
  const agentName = params.agent_name.toLowerCase();
  const deployDir = getAgentDeployDir(params.workspace_path, agentName);

  // 1. Ensure directory structure
  await ensureDir(deployDir);
  await ensureDir(getAgentContextDir(params.workspace_path, agentName));
  await ensureDir(getAgentInstructionsDir(params.workspace_path, agentName));

  // 2. Copy agent .md file
  const agentFileName = `${agentName}.agent.md`;
  const sourcePath = path.join(AGENTS_ROOT, agentFileName);
  const destPath = getDeployedAgentFile(params.workspace_path, agentName);

  try {
    const agentContent = await fs.readFile(sourcePath, 'utf-8');
    await fs.writeFile(destPath, agentContent, 'utf-8');
  } catch (err) {
    warnings.push(`Could not copy agent file ${agentFileName}: ${(err as Error).message}`);
  }

  // 3. Build and write context bundle
  const bundle = await buildContextBundle(
    params.workspace_id,
    params.plan_id,
    params,
  );

  const bundlePath = getContextBundlePath(params.workspace_path, agentName);
  await writeJson(bundlePath, bundle);

  // 4. Copy matched instruction files to instructions/ subdirectory
  const deployedInstructionPaths: string[] = [];
  if (bundle.instruction_files && bundle.instruction_files.length > 0) {
    const instrDir = getAgentInstructionsDir(params.workspace_path, agentName);
    for (const instrPath of bundle.instruction_files) {
      try {
        const fileName = path.basename(instrPath);
        const instrDest = path.join(instrDir, fileName);
        await fs.copyFile(instrPath, instrDest);
        deployedInstructionPaths.push(instrDest);
      } catch {
        warnings.push(`Could not copy instruction file: ${instrPath}`);
      }
    }
  }

  // 5. Write manifest
  const manifest: ActiveAgentManifest = {
    agent_name: params.agent_name,
    plan_id: params.plan_id,
    workspace_id: params.workspace_id,
    phase_name: params.phase_name,
    step_indices: params.step_indices,
    session_id: params.session_id,
    deployed_at: nowISO(),
    context_bundle_path: bundlePath,
    agent_file_path: destPath,
    instruction_paths: deployedInstructionPaths,
  };

  const manifestPath = getManifestPath(params.workspace_path, agentName);
  await writeJson(manifestPath, manifest);

  // 6. Write init-context.json — pre-loads large static context for slim init response
  const initContextPath = getInitContextPath(params.workspace_path, agentName);
  try {
    const agentType = params.agent_name as import('../types/index.js').AgentType;
    const roleBoundaries = AGENT_BOUNDARIES[agentType];
    let toolContracts: import('../types/preflight.types.js').ToolContractSummary[] | undefined;
    try {
      toolContracts = buildToolContracts(agentType);
    } catch {
      // Non-fatal: if tool contracts can't be built, skip
    }
    const initContext = {
      schema_version: '1.0',
      written_at: nowISO(),
      agent_name: params.agent_name,
      plan_id: params.plan_id,
      workspace_id: params.workspace_id,
      phase_name: params.phase_name,
      step_indices: params.step_indices,
      role_boundaries: roleBoundaries,
      tool_contracts: toolContracts,
      matched_skills: [] as { skill_name: string; file_path: string }[],
      research_note_files: bundle.research_notes ?? [],
      architecture_path: bundle.architecture_summary ? 'architecture.json' : undefined,
      instruction_file_paths: deployedInstructionPaths,
    };
    await writeJson(initContextPath, initContext);
  } catch {
    // Non-fatal: init-context.json write failure doesn't block deployment
    warnings.push('Could not write init-context.json (non-fatal)');
  }

  return {
    deployed: true,
    agent_dir: deployDir,
    manifest,
    context_bundle: bundle,
    warnings,
  };
}
// ---------------------------------------------------------------------------

/**
 * Cleanup an agent deployment after handoff/complete.
 * Moves execution_notes/ to reviewed_queue/{planId}/{name}_{timestamp}/
 * then removes the entire active_agents/{name}/ directory.
 *
 * Idempotent: returns silently if agent dir doesn't exist.
 * All operations wrapped in try/catch (non-fatal).
 */
export async function cleanupAgent(
  workspacePath: string,
  agentName: string,
  planId: string,
): Promise<void> {
  async function cleanupPlanPullStaging(): Promise<void> {
    try {
      const activeAgentsDir = getActiveAgentsDir(workspacePath);
      if (!(await exists(activeAgentsDir))) {
        return;
      }

      const agentDirs = await fs.readdir(activeAgentsDir, { withFileTypes: true });
      for (const agentDirEntry of agentDirs) {
        if (!agentDirEntry.isDirectory()) {
          continue;
        }

        const pullStagingRoot = getAgentPullStagingDir(workspacePath, agentDirEntry.name);
        if (!(await exists(pullStagingRoot))) {
          continue;
        }

        const sessionDirs = await fs.readdir(pullStagingRoot, { withFileTypes: true });
        for (const sessionDirEntry of sessionDirs) {
          if (!sessionDirEntry.isDirectory()) {
            continue;
          }

          const sessionDir = path.join(pullStagingRoot, sessionDirEntry.name);
          const manifestPath = path.join(sessionDir, 'manifest.json');
          if (!(await exists(manifestPath))) {
            continue;
          }

          try {
            const manifest = await readJson<Record<string, unknown>>(manifestPath);
            if (manifest?.plan_id === planId) {
              await fs.rm(sessionDir, { recursive: true, force: true });
            }
          } catch {
            // If manifest can't be read/parsed, leave session dir untouched
          }
        }

        try {
          const remaining = await fs.readdir(pullStagingRoot);
          if (remaining.length === 0) {
            await fs.rm(pullStagingRoot, { recursive: true, force: true });
          }
        } catch {
          // Non-fatal cleanup best-effort
        }
      }
    } catch {
      // Non-fatal cleanup best-effort
    }
  }

  const agentLower = agentName.toLowerCase();
  const agentDir = getAgentDeployDir(workspacePath, agentLower);

  await cleanupPlanPullStaging();

  // If agent dir doesn't exist, return silently (idempotent)
  if (!(await exists(agentDir))) {
    return;
  }

  // Archive execution_notes/ and tool_responses/ to reviewed_queue/{planId}/{name}_{timestamp}/
  // Both land under a shared session container dir for easy inspection and recovery.
  try {
    const timestamp = nowISO().replace(/[:.]/g, '-');
    const sessionDir = getReviewedAgentDir(workspacePath, planId, agentLower, timestamp);

    const notesDir = getAgentExecutionNotesDir(workspacePath, agentLower);
    if (await exists(notesDir)) {
      await ensureDir(sessionDir);
      await fs.rename(notesDir, path.join(sessionDir, 'execution_notes'));
    }

    const toolResponsesDir = getAgentToolResponsesDir(workspacePath, agentLower);
    if (await exists(toolResponsesDir)) {
      await ensureDir(sessionDir);
      await fs.rename(toolResponsesDir, path.join(sessionDir, 'tool_responses'));
    }
  } catch {
    // Non-fatal — archival failure shouldn't block cleanup
  }

  // Remove entire agent deployment directory
  try {
    await fs.rm(agentDir, { recursive: true, force: true });
  } catch {
    // Non-fatal — cleanup failure is logged but not thrown
  }
}
