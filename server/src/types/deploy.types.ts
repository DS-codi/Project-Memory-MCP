/**
 * Deploy types — interfaces for the deploy_for_task action
 * and active agent lifecycle management.
 */

import type { PlanPhaseContextFile } from './plan.types.js';

/** Parameters for deploy_for_task action */
export interface DeployForTaskParams {
  workspace_id: string;
  workspace_path: string;
  agent_name: string;        // e.g. 'Executor'
  plan_id: string;
  phase_name?: string;       // current phase
  step_indices?: number[];   // steps this agent should work on
  include_skills?: boolean;
  include_research?: boolean;
  include_architecture?: boolean;
}

/** Assembled context bundle written alongside agent file */
export interface ContextBundle {
  plan_id: string;
  phase_name?: string;
  step_indices?: number[];
  research_notes?: string[];           // filenames of research note files
  architecture_summary?: string;       // architecture context content
  phase_context?: PlanPhaseContextFile[]; // from PlanPhase.context_files
  matched_skills?: string[];           // skill file paths
  instruction_files?: string[];        // instruction file paths deployed
  execution_notes?: string;            // prior agent's notes (for Revisionist)
  assembled_at: string;                // ISO timestamp
}

/** Manifest file written to active_agents/{name}/ for tracking */
export interface ActiveAgentManifest {
  agent_name: string;
  plan_id: string;
  workspace_id: string;
  phase_name?: string;
  deployed_at: string;
  context_bundle_path: string;
  agent_file_path: string;
  instruction_paths: string[];
}

/** Result of deploy_for_task */
export interface DeployForTaskResult {
  deployed: boolean;
  agent_dir: string;          // path to .projectmemory/active_agents/{name}/
  manifest: ActiveAgentManifest;
  context_bundle: ContextBundle;
  warnings: string[];
}
