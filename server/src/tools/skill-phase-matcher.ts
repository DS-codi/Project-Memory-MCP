/**
 * Skill Phase Matcher — matches registered skills against plan phases
 * by extracting keywords from step task descriptions and scoring
 * skill keyword overlap.
 *
 * @module skill-phase-matcher
 */

import type {
  SkillRegistryIndex,
  SkillMatch,
  SkillPhaseMatchResult,
} from '../types/skill.types.js';
import type { PlanStep, PlanPhase } from '../types/plan.types.js';

// =============================================================================
// Keyword Extraction
// =============================================================================

/** Stop-words to ignore when extracting keywords from step descriptions */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'will',
  'should', 'must', 'can', 'not', 'are', 'all', 'has', 'have', 'been',
  'each', 'when', 'add', 'use', 'new', 'get', 'set', 'any', 'its',
  'also', 'make', 'run', 'via', 'etc', 'per', 'may', 'let', 'one',
]);

/** Minimum token length to consider as a keyword */
const MIN_TOKEN_LENGTH = 3;

/** Minimum relevance score to include a match */
const MIN_MATCH_SCORE = 0.05;

/**
 * Extract meaningful keywords from a text string (e.g. a step task description).
 * Splits on non-word characters, lowercases, removes stop-words, deduplicates.
 */
export function extractKeywordsFromText(text: string): string[] {
  const tokens = new Set<string>();
  for (const word of text.split(/\W+/)) {
    const t = word.toLowerCase();
    if (t.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(t)) {
      tokens.add(t);
    }
  }
  return [...tokens];
}

// =============================================================================
// Single-Step Matching
// =============================================================================

/**
 * Match skills from the registry against a single plan step.
 *
 * Extracts keywords from the step's task description, then scores
 * each skill based on keyword overlap with the registry's keyword_map.
 *
 * @returns Array of SkillMatch sorted by relevance_score descending.
 */
export function matchSkillsToStep(
  registry: SkillRegistryIndex,
  step: PlanStep,
): SkillMatch[] {
  if (!step.task || registry.entries.length === 0) return [];

  const stepKeywords = extractKeywordsFromText(step.task);
  if (stepKeywords.length === 0) return [];

  return scoreSkillsAgainstKeywords(registry, stepKeywords);
}

// =============================================================================
// Phase-Level Matching
// =============================================================================

/**
 * Match skills from the registry against plan phases.
 *
 * For each phase, aggregates keywords from all step task descriptions
 * within that phase, then scores every registered skill against those
 * keywords using keyword overlap.
 *
 * @param registry  — The built skill registry index.
 * @param steps     — All plan steps (used to extract per-phase keywords).
 * @param phases    — Optional explicit PlanPhase objects. If omitted,
 *                    phases are inferred from unique `step.phase` values.
 * @returns A SkillPhaseMatchResult with per-phase matches and summary stats.
 */
export function matchSkillsToPhases(
  registry: SkillRegistryIndex,
  steps: PlanStep[],
  phases?: PlanPhase[],
): SkillPhaseMatchResult {
  // Determine phase names (from explicit phases or inferred from steps)
  const phaseNames = phases
    ? phases.map(p => p.name)
    : [...new Set(steps.map(s => s.phase).filter(Boolean))] as string[];

  const phase_matches: Record<string, SkillMatch[]> = {};
  const unmatched_phases: string[] = [];
  const matchedSkillNames = new Set<string>();

  for (const phaseName of phaseNames) {
    // Gather all step keywords for this phase
    const phaseSteps = steps.filter(s => s.phase === phaseName);
    const phaseKeywords = new Set<string>();
    for (const step of phaseSteps) {
      if (step.task) {
        for (const kw of extractKeywordsFromText(step.task)) {
          phaseKeywords.add(kw);
        }
      }
    }

    if (phaseKeywords.size === 0 || registry.entries.length === 0) {
      phase_matches[phaseName] = [];
      unmatched_phases.push(phaseName);
      continue;
    }

    const matches = scoreSkillsAgainstKeywords(registry, [...phaseKeywords]);
    phase_matches[phaseName] = matches;

    if (matches.length === 0) {
      unmatched_phases.push(phaseName);
    } else {
      for (const m of matches) matchedSkillNames.add(m.skill_name);
    }
  }

  return {
    phase_matches,
    unmatched_phases,
    total_skills_matched: matchedSkillNames.size,
  };
}

// =============================================================================
// Scoring Internals
// =============================================================================

/**
 * Score all skills in the registry against a set of keywords.
 * Returns matches above MIN_MATCH_SCORE, sorted by score descending.
 */
function scoreSkillsAgainstKeywords(
  registry: SkillRegistryIndex,
  keywords: string[],
): SkillMatch[] {
  // Collect candidate skills and their matched keyword sets
  const skillHits = new Map<string, Set<string>>();

  for (const kw of keywords) {
    const skillNames = registry.keyword_map.get(kw);
    if (!skillNames) continue;
    for (const name of skillNames) {
      let hits = skillHits.get(name);
      if (!hits) {
        hits = new Set<string>();
        skillHits.set(name, hits);
      }
      hits.add(kw);
    }
  }

  // Build scored matches
  const matches: SkillMatch[] = [];
  for (const [skillName, hitKeywords] of skillHits) {
    const entry = registry.entries.find(e => e.name === skillName);
    if (!entry) continue;

    // Score = overlap fraction: how many of the skill's keywords matched
    // out of total skill keywords, weighted by how many query keywords hit
    const overlapFraction = hitKeywords.size / Math.max(entry.keywords.length, 1);
    const queryFraction = hitKeywords.size / Math.max(keywords.length, 1);
    const score = (overlapFraction + queryFraction) / 2;

    if (score >= MIN_MATCH_SCORE) {
      matches.push({
        skill_name: skillName,
        relevance_score: Math.round(score * 1000) / 1000, // 3 decimal places
        matched_keywords: [...hitKeywords].sort(),
      });
    }
  }

  // Sort descending by score
  matches.sort((a, b) => b.relevance_score - a.relevance_score);

  return matches;
}
