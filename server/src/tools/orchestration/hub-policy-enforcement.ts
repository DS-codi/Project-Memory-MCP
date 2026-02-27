import type { CanonicalHubMode, HubAliasResolution, LegacyHubLabel } from './hub-alias-routing.js';

export interface HubPolicyInput {
  target_agent_type: string;
  current_hub_mode?: CanonicalHubMode;
  previous_hub_mode?: CanonicalHubMode;
  requested_hub_mode?: CanonicalHubMode;
  requested_hub_label?: LegacyHubLabel | 'Hub';
  transition_event?: string;
  transition_reason_code?: string;
  prompt_analyst_enrichment_applied?: boolean;
  bypass_prompt_analyst_policy?: boolean;
}

export interface HubPolicyResult {
  valid: boolean;
  code?:
    | 'POLICY_MODE_BOUNDARY_VIOLATION'
    | 'POLICY_TRANSITION_EVENT_REQUIRED'
    | 'POLICY_PROMPT_ANALYST_REQUIRED';
  reason?: string;
  details: {
    current_hub_mode?: CanonicalHubMode;
    previous_hub_mode?: CanonicalHubMode;
    requested_hub_mode?: CanonicalHubMode;
    requested_hub_label?: LegacyHubLabel | 'Hub';
    target_agent_type: string;
    transition_event?: string;
    transition_reason_code?: string;
    prompt_analyst_enrichment_applied?: boolean;
  };
}

const MODE_ALLOWED_TARGETS: Record<CanonicalHubMode, Set<string>> = {
  standard_orchestration: new Set([
    'Researcher',
    'Architect',
    'Executor',
    'Reviewer',
    'Tester',
    'Revisionist',
    'Archivist',
    'Worker',
    'Cognition',
    'SkillWriter',
    'Migrator',
    'Brainstorm',
  ]),
  investigation: new Set([
    'Researcher',
    'Brainstorm',
    'Worker',
    'Cognition',
    'Executor',
    'Architect',
  ]),
  adhoc_runner: new Set(['Worker', 'Executor', 'Researcher', 'Cognition']),
  tdd_cycle: new Set(['Tester', 'Executor', 'Reviewer', 'Revisionist']),
};

export function hasHubPolicyContext(input: HubPolicyInput): boolean {
  return Boolean(
    input.current_hub_mode
      || input.previous_hub_mode
      || input.requested_hub_mode
      || input.requested_hub_label
      || input.transition_event
      || input.transition_reason_code
      || input.prompt_analyst_enrichment_applied !== undefined
      || input.bypass_prompt_analyst_policy,
  );
}

export function validateHubPolicy(
  input: HubPolicyInput,
  aliasRouting: HubAliasResolution,
): HubPolicyResult {
  const requestedMode = input.requested_hub_mode ?? aliasRouting.resolved_mode ?? undefined;
  const currentMode = input.current_hub_mode ?? requestedMode;
  const details = {
    current_hub_mode: currentMode,
    previous_hub_mode: input.previous_hub_mode,
    requested_hub_mode: requestedMode,
    requested_hub_label: input.requested_hub_label ?? aliasRouting.requested_hub_label ?? undefined,
    target_agent_type: input.target_agent_type,
    transition_event: input.transition_event,
    transition_reason_code: input.transition_reason_code,
    prompt_analyst_enrichment_applied: input.prompt_analyst_enrichment_applied,
  };

  if (
    input.previous_hub_mode
    && requestedMode
    && input.previous_hub_mode !== requestedMode
    && (!input.transition_event || !input.transition_reason_code)
  ) {
    return {
      valid: false,
      code: 'POLICY_TRANSITION_EVENT_REQUIRED',
      reason:
        'Hub mode transition requires explicit transition_event and transition_reason_code before mode change.',
      details,
    };
  }

  if (currentMode) {
    const allowed = MODE_ALLOWED_TARGETS[currentMode];
    if (allowed && !allowed.has(input.target_agent_type)) {
      return {
        valid: false,
        code: 'POLICY_MODE_BOUNDARY_VIOLATION',
        reason: `Target agent ${input.target_agent_type} is not allowed in hub mode ${currentMode}.`,
        details,
      };
    }
  }

  if (
    !input.bypass_prompt_analyst_policy
    && input.target_agent_type !== 'Analyst'
    && input.prompt_analyst_enrichment_applied !== true
  ) {
    return {
      valid: false,
      code: 'POLICY_PROMPT_ANALYST_REQUIRED',
      reason:
        'Prompt Analyst pre-dispatch enrichment is required before deploying non-Analyst agents.',
      details,
    };
  }

  return {
    valid: true,
    details,
  };
}
