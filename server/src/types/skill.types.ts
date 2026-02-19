/**
 * Skill Type Definitions
 *
 * Types for the skills system: skill definitions, matching, and deployment.
 * Skills are deployable knowledge files (SKILL.md) with structured registry metadata.
 */

// =============================================================================
// Skill Category
// =============================================================================

export type SkillCategory =
  | 'architecture'
  | 'testing'
  | 'deployment'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'devops'
  | 'security';

// =============================================================================
// Skill Definition
// =============================================================================

export interface SkillDefinition {
  /** Unique skill name (matches directory name) */
  name: string;

  /** Human-readable description of when/how to use this skill */
  description: string;

  /** Absolute path to the skill's SKILL.md file */
  path: string;

  /** Full content of the SKILL.md file */
  content: string;

  // --- Structured Registry Fields (Step 38) ---

  /** Broad category for filtering */
  category?: SkillCategory;

  /** Freeform tags for flexible matching */
  tags?: string[];

  /** Programming languages this skill targets (e.g., ['typescript', 'python']) */
  language_targets?: string[];

  /** Frameworks this skill targets (e.g., ['react', 'pyside6']) */
  framework_targets?: string[];
}

// =============================================================================
// Skill Matching
// =============================================================================

export interface SkillMatch {
  /** Name of the matched skill */
  skill_name: string;

  /** Relevance score (0.0 - 1.0) */
  relevance_score: number;

  /** Keywords that contributed to the match */
  matched_keywords: string[];
}

/** Result of matching skills to plan phases */
export interface SkillPhaseMatchResult {
  /** Map of phase name → matched skills with scores */
  phase_matches: Record<string, SkillMatch[]>;
  /** Phase names that had zero skill matches */
  unmatched_phases: string[];
  /** Count of distinct skills matched across all phases */
  total_skills_matched: number;
}

// =============================================================================
// Skill Registry
// =============================================================================

/** Entry in the skill registry index (lightweight, no full content) */
export interface SkillRegistryEntry {
  /** Unique skill name (matches directory name) */
  name: string;
  /** Absolute path to the SKILL.md file */
  file_path: string;
  /** Broad category for filtering */
  category: string;
  /** Freeform tags */
  tags: string[];
  /** Extracted searchable keywords (from name, description, tags, targets) */
  keywords: string[];
  /** Programming languages this skill targets */
  language_targets?: string[];
  /** Frameworks this skill targets */
  framework_targets?: string[];
  /** Human-readable description */
  description?: string;
}

/** In-memory indexed registry of all skills in a workspace */
export interface SkillRegistryIndex {
  /** All registered skill entries */
  entries: SkillRegistryEntry[];
  /** Map of lowercase keyword → skill names that match */
  keyword_map: Map<string, string[]>;
  /** Workspace root path this registry was built from */
  workspace_path: string;
  /** ISO timestamp when the registry was built */
  built_at: string;
}

/** Recommendation for creating a new skill */
export interface SkillCreationRecommendation {
  /** Suggested name for the new skill */
  skill_name: string;
  /** Suggested category */
  category: string;
  /** Suggested tags */
  tags: string[];
  /** Why this skill should be created */
  reason: string;
  /** Evidence supporting this recommendation */
  evidence: { metric: string; value: number; threshold: number }[];
  /** Priority of the recommendation */
  priority: 'low' | 'medium' | 'high';
  /** Optional outline for the skill content */
  suggested_content_outline?: string;
}

// =============================================================================
// Skill Deployment
// =============================================================================

export interface SkillDeploymentResult {
  /** Skills that were successfully deployed */
  deployed: string[];

  /** Target directory where skills were deployed */
  target_path: string;

  /** Skills that were skipped (e.g., already existed) */
  skipped?: string[];

  /** Errors encountered during deployment */
  errors?: string[];
}
