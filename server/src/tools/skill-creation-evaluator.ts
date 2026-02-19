/**
 * Skill-Creation Evaluator
 *
 * Analyzes a plan's difficulty profile and incident reports to recommend
 * whether new skills should be created. Produces SkillCreationRecommendation[]
 * consumed during plan archive to surface SkillWriter tasks.
 */

import type {
  DifficultyProfile,
  IncidentReport,
  SkillCreationRecommendation,
} from '../types/index.js';

// =============================================================================
// Constants / Thresholds
// =============================================================================

/** Aggregated tool_retries across incidents sharing a root cause */
const TOOL_RETRY_THRESHOLD = 5;

/** Minimum blockers_hit to trigger a pattern-avoidance recommendation */
const BLOCKER_PATTERN_THRESHOLD = 2;

/** Unsolicited context reads above this → context-packaging skill */
const HIGH_UNSOLICITED_READS_THRESHOLD = 10;

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Normalise a root-cause string for grouping (lowercase, trim, collapse whitespace).
 */
function normaliseRootCause(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Group incidents by their normalised root_cause_analysis.
 * Returns a Map of rootCause → incident array.
 */
function groupIncidentsByRootCause(
  incidents: IncidentReport[],
): Map<string, IncidentReport[]> {
  const groups = new Map<string, IncidentReport[]>();

  for (const inc of incidents) {
    const key = normaliseRootCause(inc.root_cause_analysis);
    const arr = groups.get(key) ?? [];
    arr.push(inc);
    groups.set(key, arr);
  }

  return groups;
}

/**
 * Sum tool_retries across a grouped set of incidents.
 */
function sumToolRetries(incidents: IncidentReport[]): number {
  let total = 0;
  for (const inc of incidents) {
    total += inc.stats_snapshot?.tool_retries ?? 0;
  }
  return total;
}

/**
 * Detect recurring blocker patterns across incidents.
 * Returns a Map of pattern string → count.
 */
function detectBlockerPatterns(
  incidents: IncidentReport[],
): Map<string, number> {
  const patterns = new Map<string, number>();

  for (const inc of incidents) {
    for (const blocker of inc.blocked_steps) {
      const key = normaliseRootCause(blocker);
      patterns.set(key, (patterns.get(key) ?? 0) + 1);
    }
  }

  return patterns;
}

// =============================================================================
// Recommendation Builders
// =============================================================================

function buildToolUsageRecommendation(
  rootCause: string,
  totalRetries: number,
  incidentCount: number,
): SkillCreationRecommendation {
  return {
    skill_name: `tool-usage-${slugify(rootCause)}`,
    category: 'tool-usage',
    tags: ['tool-retries', 'agent-efficiency'],
    reason: `High tool retry count (${totalRetries}) across ${incidentCount} incident(s) sharing root cause: "${rootCause}"`,
    evidence: [
      { metric: 'tool_retries', value: totalRetries, threshold: TOOL_RETRY_THRESHOLD },
    ],
    priority: totalRetries > TOOL_RETRY_THRESHOLD * 2 ? 'high' : 'medium',
  };
}

function buildPatternAvoidanceRecommendation(
  pattern: string,
  count: number,
): SkillCreationRecommendation {
  return {
    skill_name: `pattern-avoidance-${slugify(pattern)}`,
    category: 'pattern-avoidance',
    tags: ['blockers', 'recurring-pattern'],
    reason: `Recurring blocker pattern (${count} occurrences): "${pattern}"`,
    evidence: [
      { metric: 'blocker_pattern_count', value: count, threshold: BLOCKER_PATTERN_THRESHOLD },
    ],
    priority: count > BLOCKER_PATTERN_THRESHOLD * 2 ? 'high' : 'medium',
  };
}

function buildContextPackagingRecommendation(
  readCount: number,
): SkillCreationRecommendation {
  return {
    skill_name: 'context-packaging',
    category: 'context-management',
    tags: ['unsolicited-reads', 'context-efficiency'],
    reason: `Unsolicited context reads (${readCount}) exceeded threshold (${HIGH_UNSOLICITED_READS_THRESHOLD})`,
    evidence: [
      { metric: 'unsolicited_context_reads', value: readCount, threshold: HIGH_UNSOLICITED_READS_THRESHOLD },
    ],
    priority: readCount > HIGH_UNSOLICITED_READS_THRESHOLD * 2 ? 'high' : 'medium',
  };
}

function buildGapFillingRecommendation(
  gap: string,
): SkillCreationRecommendation {
  return {
    skill_name: `gap-${slugify(gap)}`,
    category: 'skill-gap',
    tags: ['skill-gap', 'knowledge-gap'],
    reason: `Skill gap identified in difficulty profile: "${gap}"`,
    evidence: [
      { metric: 'skill_gap', value: 1, threshold: 1 },
    ],
    priority: 'medium',
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Convert a free-text string to a URL-safe slug (for skill_name).
 * Keeps lowercase alphanumeric + hyphens, max 40 chars.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Evaluate whether new skills should be created based on a plan's
 * difficulty profile and incident history.
 *
 * @param _workspaceId  Workspace identifier (reserved for future filtering)
 * @param _planId       Plan identifier (reserved for future filtering)
 * @param profile       Aggregated difficulty profile for the archived plan
 * @param incidents     Array of incident reports from Revisionist sessions
 * @returns Array of skill-creation recommendations (empty if none warranted)
 */
export function evaluateSkillCreationNeed(
  _workspaceId: string,
  _planId: string,
  profile: DifficultyProfile,
  incidents: IncidentReport[],
): SkillCreationRecommendation[] {
  const recommendations: SkillCreationRecommendation[] = [];

  // ── 1. Tool-retries with shared root cause ──────────────────────────
  const grouped = groupIncidentsByRootCause(incidents);
  for (const [rootCause, group] of grouped) {
    const totalRetries = sumToolRetries(group);
    if (totalRetries > TOOL_RETRY_THRESHOLD) {
      recommendations.push(
        buildToolUsageRecommendation(rootCause, totalRetries, group.length),
      );
    }
  }

  // ── 2. Recurring blocker patterns ───────────────────────────────────
  const blockerPatterns = detectBlockerPatterns(incidents);
  for (const [pattern, count] of blockerPatterns) {
    if (count > BLOCKER_PATTERN_THRESHOLD) {
      recommendations.push(
        buildPatternAvoidanceRecommendation(pattern, count),
      );
    }
  }

  // ── 3. Unsolicited context reads from aggregated stats ──────────────
  const unsolicitedReads = profile.aggregated_stats?.unsolicited_context_reads ?? 0;
  if (unsolicitedReads > HIGH_UNSOLICITED_READS_THRESHOLD) {
    recommendations.push(
      buildContextPackagingRecommendation(unsolicitedReads),
    );
  }

  // ── 4. Skill gaps from difficulty profile ───────────────────────────
  if (profile.skill_gaps_identified?.length) {
    for (const gap of profile.skill_gaps_identified) {
      recommendations.push(buildGapFillingRecommendation(gap));
    }
  }

  return recommendations;
}
