/**
 * Program V2 Type Definitions
 *
 * Independent program types for the redesigned Integrated Programs system.
 * Programs have dedicated storage in data/{workspace_id}/programs/{program_id}/
 * with separate JSON files for state, dependencies, risks, and manifest.
 *
 * Unlike the v1 approach (PlanState with is_program flag), ProgramState is
 * a fully independent type with its own metadata schema.
 */

// =============================================================================
// Core Program State
// =============================================================================

export type ProgramStatus = 'active' | 'archived';

export interface ProgramState {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  status: ProgramStatus;
  created_at: string;
  updated_at: string;
  archived_at?: string;
}

// =============================================================================
// Cross-Plan Dependencies
// =============================================================================

export type DependencyType = 'blocks' | 'informs';
export type DependencyStatus = 'pending' | 'satisfied';

export interface ProgramDependency {
  id: string;
  source_plan_id: string;
  source_phase?: string;
  target_plan_id: string;
  target_phase?: string;
  type: DependencyType;
  status: DependencyStatus;
  created_at: string;
  satisfied_at?: string;
}

// =============================================================================
// Risk Register
// =============================================================================

export type RiskType = 'functional_conflict' | 'behavioral_change' | 'dependency_risk';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'identified' | 'mitigated' | 'accepted' | 'resolved';

export interface ProgramRisk {
  id: string;
  program_id: string;
  type: RiskType;
  severity: RiskSeverity;
  status: RiskStatus;
  title: string;
  description: string;
  mitigation?: string;
  detected_by: 'auto' | 'manual';
  source_plan_id?: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Program Manifest (ordered child plan references)
// =============================================================================

export interface ProgramManifest {
  program_id: string;
  plan_ids: string[];
  updated_at: string;
}

// =============================================================================
// Storage File Shapes (what each JSON file contains)
// =============================================================================

/** Shape of program.json */
export type ProgramStateFile = ProgramState;

/** Shape of dependencies.json */
export type ProgramDependenciesFile = ProgramDependency[];

/** Shape of risks.json */
export type ProgramRisksFile = ProgramRisk[];

/** Shape of manifest.json */
export type ProgramManifestFile = ProgramManifest;

// =============================================================================
// Parameter & Result Types for Program Actions
// =============================================================================

export interface CreateProgramV2Params {
  workspace_id: string;
  title: string;
  description: string;
  priority?: ProgramState['priority'];
  category?: string;
}

export interface UpdateProgramV2Params {
  workspace_id: string;
  program_id: string;
  title?: string;
  description?: string;
  priority?: ProgramState['priority'];
  category?: string;
}

export interface ArchiveProgramV2Params {
  workspace_id: string;
  program_id: string;
}
