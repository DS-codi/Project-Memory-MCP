/**
 * Deploy types — interfaces for the deploy_for_task action
 * and active agent lifecycle management.
 */

import type { PlanPhaseContextFile } from './plan.types.js';

export type BundleScope = 'task' | 'phase' | 'plan';
export type BundleResolutionMode = 'strict' | 'compat';
export type ProvisioningMode = 'on_demand' | 'compat';
export type FallbackMode = 'none' | 'compat_dynamic' | 'static_restore';

export interface PromptAnalystOutput {
  provisioning_contract_version?: string;
  hub_skill_bundle_id?: string;
  hub_skill_bundle_version?: string;
  hub_skill_scope?: BundleScope;
  hub_skill_selection_reason?: string;
  confidence?: number;
  requires_fallback?: boolean;
  fallback_policy_hint?: 'deny' | 'allow_compat' | 'allow_static_restore';
  trace_id?: string;
}

export interface HubDecisionPayload {
  bundle_decision_id?: string;
  bundle_decision_version?: string;
  hub_selected_skill_bundle?: {
    bundle_id?: string;
    version?: string;
    scope?: BundleScope;
    source?: 'promptanalyst' | 'hub_override';
  };
  spoke_instruction_bundle?: {
    bundle_id?: string;
    version?: string;
    instruction_ids?: string[];
    resolution_mode?: BundleResolutionMode;
  };
  spoke_skill_bundle?: {
    bundle_id?: string;
    version?: string;
    skill_ids?: string[];
    resolution_mode?: BundleResolutionMode;
  };
  fallback_policy?: {
    fallback_allowed?: boolean;
    fallback_mode?: FallbackMode;
    fallback_reason_code?: string | null;
  };
  enforcement?: {
    block_on_missing_promptanalyst?: boolean;
    block_on_ambient_scan?: boolean;
    block_on_include_skills_all?: boolean;
  };
  telemetry?: {
    trace_id?: string;
    session_id?: string;
    plan_id?: string;
    workspace_id?: string;
  };
}

export interface DeployFallbackPolicy {
  fallback_allowed?: boolean;
  fallback_mode?: FallbackMode;
  fallback_reason_code?: string | null;
}

export interface DeployTelemetryContext {
  trace_id?: string;
  session_id?: string;
  plan_id?: string;
  workspace_id?: string;
}

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
  /** Optional: session_id minted by deploy_and_prep — embedded in manifest */
  session_id?: string;
  prompt_analyst_output?: PromptAnalystOutput;
  hub_decision_payload?: HubDecisionPayload;
  provisioning_mode?: ProvisioningMode;
  allow_legacy_always_on?: boolean;
  allow_ambient_instruction_scan?: boolean;
  allow_include_skills_all?: boolean;
  fallback_policy?: DeployFallbackPolicy;
  telemetry_context?: DeployTelemetryContext;
  requested_scope?: BundleScope;
  strict_bundle_resolution?: boolean;
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
  prompt_analyst_output?: PromptAnalystOutput;
  hub_decision_payload?: HubDecisionPayload;
  resolved_bundle_ids?: {
    hub_skill_bundle_id?: string;
    hub_skill_bundle_version?: string;
    spoke_instruction_bundle_id?: string;
    spoke_instruction_bundle_version?: string;
    spoke_skill_bundle_id?: string;
    spoke_skill_bundle_version?: string;
  };
  resolved_instruction_ids?: string[];
  resolved_skill_ids?: string[];
  bundle_resolution_source?: 'explicit_hub_decision' | 'ambient_discovery' | 'compat_fallback';
  assembled_at: string;                // ISO timestamp
}

/** Manifest file written to active_agents/{name}/ for tracking */
export interface ActiveAgentManifest {
  agent_name: string;
  plan_id: string;
  workspace_id: string;
  phase_name?: string;
  step_indices?: number[];
  /** Session ID minted during deploy_and_prep (absent when deployed via standalone deploy_for_task) */
  session_id?: string;
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
