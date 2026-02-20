/**
 * Program Risk Detector — Automatic risk detection from plan blocker patterns.
 *
 * Scans plans in a program for blocked steps and classifies risk type
 * based on note content keywords:
 *   - 'conflict' / 'breaking change' → functional_conflict
 *   - 'behavior' / 'regression'      → behavioral_change
 *   - blocked step referencing another plan → dependency_risk
 *   - No keyword match → dependency_risk (default)
 *
 * Detected risks are appended to risks.json with detected_by: 'auto'.
 * Duplicate detection: skips risks with matching title + source_plan_id.
 */

import type {
  ProgramRisk,
  RiskType,
  ProgramManifest,
} from '../../types/program-v2.types.js';
import type { PlanState, PlanStep } from '../../types/plan.types.js';
import {
  readManifest,
  readRisks,
  saveRisks,
} from '../../storage/program-store.js';
import { getPlanState } from '../../storage/file-store.js';
import { addRisk } from './program-risks.js';

// =============================================================================
// Keyword Classification
// =============================================================================

/** Pattern sets for classifying risk type from note content. */
const CONFLICT_PATTERNS = /conflict|breaking[\s_-]?change/i;
const BEHAVIOR_PATTERNS = /behavio(?:u)?r|regression/i;
const PLAN_REF_PATTERN = /plan_[a-z0-9_]+/i;

/**
 * Classify risk type from a blocked step's notes.
 *
 * Priority order:
 * 1. functional_conflict — if notes mention 'conflict' or 'breaking change'
 * 2. behavioral_change   — if notes mention 'behavior'/'behaviour' or 'regression'
 * 3. dependency_risk     — if notes reference another plan ID, or as default
 */
export function classifyRiskType(notes: string, _planIds?: string[]): RiskType {
  if (CONFLICT_PATTERNS.test(notes)) return 'functional_conflict';
  if (BEHAVIOR_PATTERNS.test(notes)) return 'behavioral_change';
  return 'dependency_risk';
}

/**
 * Build a human-readable risk title from a blocked step.
 */
function buildRiskTitle(step: PlanStep, planId: string): string {
  const taskSnippet = step.task.length > 60
    ? step.task.substring(0, 57) + '...'
    : step.task;
  return `Blocked: ${taskSnippet} (${planId})`;
}

// =============================================================================
// autoDetectRisks
// =============================================================================

/** Result of auto-detection scan. */
export interface AutoDetectResult {
  /** Number of plans scanned */
  plans_scanned: number;
  /** Number of blocked steps found */
  blocked_steps_found: number;
  /** Risks that were newly added (excludes duplicates) */
  risks_added: ProgramRisk[];
  /** Number of duplicates skipped */
  duplicates_skipped: number;
}

/**
 * Automatically detect risks from blocked steps across all plans in a program.
 *
 * 1. Read manifest to get plan IDs
 * 2. Read each plan's steps
 * 3. Find blocked steps with notes
 * 4. Classify risk type from note content
 * 5. Generate ProgramRisk entries with detected_by: 'auto'
 * 6. Skip duplicates (same title + source_plan_id already exists)
 * 7. Add newly detected risks
 *
 * @returns Summary of what was detected and added.
 */
export async function autoDetectRisks(
  workspaceId: string,
  programId: string
): Promise<AutoDetectResult> {
  // 1. Read manifest for plan IDs
  const manifest = await readManifest(workspaceId, programId);
  if (!manifest || manifest.plan_ids.length === 0) {
    return {
      plans_scanned: 0,
      blocked_steps_found: 0,
      risks_added: [],
      duplicates_skipped: 0,
    };
  }

  const planIds = manifest.plan_ids;

  // Pre-load existing risks for duplicate detection
  const existingRisks = await readRisks(workspaceId, programId);
  const existingKeys = new Set(
    existingRisks.map(r => `${r.title}::${r.source_plan_id ?? ''}`)
  );

  let blockedStepsFound = 0;
  let duplicatesSkipped = 0;
  const risksAdded: ProgramRisk[] = [];

  // 2–6. Scan each plan
  for (const planId of planIds) {
    const planState = await getPlanState(workspaceId, planId);
    if (!planState || !planState.steps) continue;

    const blockedSteps = planState.steps.filter(
      (s: PlanStep) => s.status === 'blocked' && s.notes
    );
    blockedStepsFound += blockedSteps.length;

    for (const step of blockedSteps) {
      const notes = step.notes!;
      const riskType = classifyRiskType(notes, planIds);
      const title = buildRiskTitle(step, planId);

      // Duplicate check
      const key = `${title}::${planId}`;
      if (existingKeys.has(key)) {
        duplicatesSkipped++;
        continue;
      }

      // 7. Add the new risk
      const newRisk = await addRisk(workspaceId, programId, {
        program_id: programId,
        type: riskType,
        severity: 'medium',
        status: 'identified',
        title,
        description: `Auto-detected from blocked step: ${step.task}. Notes: ${notes}`,
        detected_by: 'auto',
        source_plan_id: planId,
      });

      risksAdded.push(newRisk);
      existingKeys.add(key);
    }
  }

  return {
    plans_scanned: planIds.length,
    blocked_steps_found: blockedStepsFound,
    risks_added: risksAdded,
    duplicates_skipped: duplicatesSkipped,
  };
}
