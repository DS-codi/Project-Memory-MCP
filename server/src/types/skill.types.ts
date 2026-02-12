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
