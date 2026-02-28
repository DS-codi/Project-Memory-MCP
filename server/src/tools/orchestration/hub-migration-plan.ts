export type DirectOptionAMilestoneId =
  | 'm1_permanent_hub_prompt_analyst'
  | 'm2_session_registry_active'
  | 'm3_legacy_alias_deprecation'
  | 'm4_dynamic_spoke_materialisation'
  | 'm5_remove_legacy_static_files';

export interface DirectOptionAMilestone {
  id: DirectOptionAMilestoneId;
  order: number;
  title: string;
  objective: string;
  strict_gate_checkpoint: string;
  rollback_checkpoint: string;
}

export interface DirectOptionAMigrationPlan {
  strategy: 'direct_option_a';
  session_scoped_from_day_one: true;
  generated_at: string;
  milestones: DirectOptionAMilestone[];
}

export interface DirectOptionAProgressInput {
  permanent_files_ready: boolean;
  session_registry_active: boolean;
  deprecated_legacy_labels: string[];
  dynamic_spoke_materialisation_active: boolean;
  legacy_static_files_remaining: number;
  promotion_gates_passed: boolean;
  rollback_ready: boolean;
}

export interface DirectOptionAMilestoneStatus {
  id: DirectOptionAMilestoneId;
  order: number;
  status: 'complete' | 'blocked' | 'pending';
  blockers: string[];
  strict_gate_checkpoint: string;
  rollback_checkpoint: string;
}

export interface DirectOptionAProgressReport {
  strategy: 'direct_option_a';
  ready_for_full_cutover: boolean;
  generated_at: string;
  milestones: DirectOptionAMilestoneStatus[];
  blockers: string[];
}

const LEGACY_LABEL_SEQUENCE = ['Coordinator', 'Analyst', 'Runner', 'TDDDriver'] as const;

export function getDirectOptionAMigrationPlan(): DirectOptionAMigrationPlan {
  return {
    strategy: 'direct_option_a',
    session_scoped_from_day_one: true,
    generated_at: new Date().toISOString(),
    milestones: [
      {
        id: 'm1_permanent_hub_prompt_analyst',
        order: 1,
        title: 'Deploy permanent Hub + Prompt Analyst files',
        objective:
          'Ensure hub.agent.md and prompt-analyst.agent.md are the only permanent orchestration files.',
        strict_gate_checkpoint: 'gate_m1_permanent_files_present',
        rollback_checkpoint: 'rollback_m1_restore_permanent_files',
      },
      {
        id: 'm2_session_registry_active',
        order: 2,
        title: 'Activate session registry tracking',
        objective:
          'Session registry must be the source-of-truth for active/stale sessions and peer-awareness.',
        strict_gate_checkpoint: 'gate_m2_registry_live',
        rollback_checkpoint: 'rollback_m2_disable_dynamic_registry_dependency',
      },
      {
        id: 'm3_legacy_alias_deprecation',
        order: 3,
        title: 'Deprecate one legacy alias per milestone window',
        objective:
          'Coordinator/Analyst/Runner/TDDDriver legacy labels must be deprecated in fixed sequence with telemetry.',
        strict_gate_checkpoint: 'gate_m3_alias_deprecation_sequence',
        rollback_checkpoint: 'rollback_m3_reenable_alias_path_for_window',
      },
      {
        id: 'm4_dynamic_spoke_materialisation',
        order: 4,
        title: 'Enforce DB-template dynamic spoke materialisation',
        objective:
          'All spoke roles deploy from DB templates into session-scoped files only.',
        strict_gate_checkpoint: 'gate_m4_dynamic_materialisation_active',
        rollback_checkpoint: 'rollback_m4_restore_legacy_static_spoke_path',
      },
      {
        id: 'm5_remove_legacy_static_files',
        order: 5,
        title: 'Remove legacy static spoke files',
        objective:
          'Legacy static spoke files are removed; only Hub and Prompt Analyst remain permanent.',
        strict_gate_checkpoint: 'gate_m5_no_legacy_static_files',
        rollback_checkpoint: 'rollback_m5_restore_from_backup_bundle',
      },
    ],
  };
}

function hasAllLegacyDeprecations(deprecatedLegacyLabels: string[]): boolean {
  const deprecated = new Set(deprecatedLegacyLabels);
  return LEGACY_LABEL_SEQUENCE.every((label) => deprecated.has(label));
}

export function evaluateDirectOptionAProgress(
  input: DirectOptionAProgressInput,
): DirectOptionAProgressReport {
  const plan = getDirectOptionAMigrationPlan();

  const milestoneStatuses: DirectOptionAMilestoneStatus[] = plan.milestones.map((milestone) => ({
    id: milestone.id,
    order: milestone.order,
    status: 'pending',
    blockers: [],
    strict_gate_checkpoint: milestone.strict_gate_checkpoint,
    rollback_checkpoint: milestone.rollback_checkpoint,
  }));

  const byId = (id: DirectOptionAMilestoneId) =>
    milestoneStatuses.find((milestone) => milestone.id === id)!;

  const m1 = byId('m1_permanent_hub_prompt_analyst');
  if (input.permanent_files_ready) {
    m1.status = 'complete';
  } else {
    m1.status = 'blocked';
    m1.blockers.push('Permanent file pair (hub + prompt-analyst) is not ready.');
  }

  const m2 = byId('m2_session_registry_active');
  if (input.session_registry_active) {
    m2.status = 'complete';
  } else {
    m2.status = 'blocked';
    m2.blockers.push('Session registry is not active.');
  }

  const m3 = byId('m3_legacy_alias_deprecation');
  if (hasAllLegacyDeprecations(input.deprecated_legacy_labels)) {
    m3.status = 'complete';
  } else {
    m3.status = 'blocked';
    m3.blockers.push('Not all legacy aliases are deprecated in sequence.');
  }

  const m4 = byId('m4_dynamic_spoke_materialisation');
  if (input.dynamic_spoke_materialisation_active && input.promotion_gates_passed) {
    m4.status = 'complete';
  } else {
    m4.status = 'blocked';
    if (!input.dynamic_spoke_materialisation_active) {
      m4.blockers.push('Dynamic spoke materialisation is not active.');
    }
    if (!input.promotion_gates_passed) {
      m4.blockers.push('Promotion gates must pass before dynamic cutover.');
    }
  }

  const m5 = byId('m5_remove_legacy_static_files');
  if (input.legacy_static_files_remaining === 0 && input.rollback_ready) {
    m5.status = 'complete';
  } else {
    m5.status = 'blocked';
    if (input.legacy_static_files_remaining > 0) {
      m5.blockers.push('Legacy static files still remain in permanent path.');
    }
    if (!input.rollback_ready) {
      m5.blockers.push('Rollback readiness checkpoint is not satisfied.');
    }
  }

  const blockers = milestoneStatuses.flatMap((milestone) => milestone.blockers);

  return {
    strategy: 'direct_option_a',
    ready_for_full_cutover: blockers.length === 0,
    generated_at: new Date().toISOString(),
    milestones: milestoneStatuses,
    blockers,
  };
}
