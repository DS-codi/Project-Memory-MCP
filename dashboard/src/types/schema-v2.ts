/**
 * Plan Schema v2 Types
 *
 * Optional extensions to PlanState for phase-level views, difficulty profiles,
 * risk registers, and phase announcements. All fields are optional-safe so
 * legacy v1 plans continue to render without error.
 */

import type { AgentType, StepStatus } from './index';

// =============================================================================
// Phase-Level Types
// =============================================================================

/** Status of a plan phase. Mirrors step statuses at the phase level. */
export type PhaseStatus = 'pending' | 'active' | 'complete' | 'blocked';

/** Approval gate that can optionally block a phase transition. */
export interface ApprovalGate {
  type: 'user_approval' | 'automated_check' | 'review_required';
  confirmed_by?: string;
  confirmed_at?: string;
}

/** Rich phase metadata available on v2 plans. */
export interface PlanPhase {
  name: string;
  criteria?: string[];
  required_agents?: AgentType[];
  approval_gate?: ApprovalGate;
  phase_status?: PhaseStatus;
}

// =============================================================================
// Difficulty Profile
// =============================================================================

/** Difficulty level used by the categorization engine. */
export type DifficultyLevel = 'trivial' | 'easy' | 'moderate' | 'hard' | 'extreme';

/** Assessed difficulty profile for a plan. */
export interface DifficultyProfile {
  level: DifficultyLevel;
  complexity_factors?: string[];
  estimated_effort?: string;
  risk_level?: string;
}

// =============================================================================
// Pre-Plan Build Status
// =============================================================================

/** Build status captured before plan work begins. */
export type PrePlanBuildStatus = 'passing' | 'failing' | 'unknown';

// =============================================================================
// Risk Register
// =============================================================================

/** Severity levels for risk entries. */
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Type of risk identified during planning or execution. */
export type RiskType =
  | 'functional_conflict'
  | 'behavioral_change'
  | 'dependency_risk';

/** Status of a risk through its lifecycle. */
export type RiskStatus = 'open' | 'mitigated' | 'accepted' | 'closed';

/** A single risk entry within the plan risk register. */
export interface RiskEntry {
  id: string;
  type: RiskType;
  severity: RiskSeverity;
  description: string;
  mitigation?: string;
  status?: RiskStatus;
  affected_phases?: string[];
  source_plan?: string;
  detected_at?: string;
}

// =============================================================================
// Phase Announcements
// =============================================================================

/** Announcement attached to a phase transition or milestone. */
export interface PhaseAnnouncement {
  phase: string;
  message: string;
  announced_by?: AgentType | 'system';
  announced_at?: string;
}

// =============================================================================
// Skill Match
// =============================================================================

/** A skill matched to the plan by the categorization engine. */
export interface SkillMatch {
  name: string;
  description?: string;
  file_path?: string;
  relevance?: number;
}

// =============================================================================
// Derived UI Types (for grouping steps into phases)
// =============================================================================

/** A group of steps that belong to the same phase string. */
export interface PhaseGroup {
  phase: string;
  steps: Array<{
    index: number;
    task: string;
    status: StepStatus;
    type?: string;
    assignee?: string;
    notes?: string;
  }>;
  meta?: PlanPhase;
}

/** Progress summary for a single phase. */
export interface PhaseProgress {
  phase: string;
  done: number;
  total: number;
  pct: number;
}
