import {
  resolveHubAliasRouting,
  type CanonicalHubMode,
  type HubAliasResolution,
  type LegacyHubLabel,
} from './hub-alias-routing.js';
import type {
  PromptAnalystOutput,
  HubDecisionPayload,
  ProvisioningMode,
  DeployFallbackPolicy,
  BundleScope,
} from '../../types/index.js';

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
  prompt_analyst_output?: PromptAnalystOutput;
  hub_decision_payload?: HubDecisionPayload;
  provisioning_mode?: ProvisioningMode;
  fallback_policy?: DeployFallbackPolicy;
  requested_scope?: BundleScope;
  strict_bundle_resolution?: boolean;
}

export interface HubPolicyResult {
  valid: boolean;
  code?:
    | 'POLICY_MODE_BOUNDARY_VIOLATION'
    | 'POLICY_TRANSITION_EVENT_REQUIRED'
    | 'POLICY_PROMPT_ANALYST_REQUIRED'
    | 'POLICY_PROMPT_ANALYST_FALLBACK_REQUIRES_UNAVAILABLE'
    | 'POLICY_BUNDLE_DECISION_REQUIRED'
    | 'POLICY_BUNDLE_DECISION_INVALID';
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
    prompt_analyst_recheck_required?: boolean;
    prompt_analyst_recheck_trigger?: string;
  };
}

export interface HubPolicyEvaluation {
  alias_routing: HubAliasResolution;
  normalized_input: HubPolicyInput;
  fallback: {
    requested: boolean;
    used: boolean;
    reason_code?: 'prompt_analyst_unavailable';
  };
  policy: HubPolicyResult;
  telemetry: {
    prompt_analyst_outcome: 'rerun' | 'reuse' | 'fallback';
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
  const recheckTrigger = resolvePromptAnalystRecheckTrigger(input);
  const details = {
    current_hub_mode: currentMode,
    previous_hub_mode: input.previous_hub_mode,
    requested_hub_mode: requestedMode,
    requested_hub_label: input.requested_hub_label ?? aliasRouting.requested_hub_label ?? undefined,
    target_agent_type: input.target_agent_type,
    transition_event: input.transition_event,
    transition_reason_code: input.transition_reason_code,
    prompt_analyst_enrichment_applied: input.prompt_analyst_enrichment_applied,
    prompt_analyst_recheck_required: recheckTrigger !== undefined,
    prompt_analyst_recheck_trigger: recheckTrigger,
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
    && recheckTrigger !== undefined
    && input.prompt_analyst_enrichment_applied !== true
  ) {
    return {
      valid: false,
      code: 'POLICY_PROMPT_ANALYST_REQUIRED',
      reason: `Prompt Analyst pre-dispatch enrichment is required before deploying non-Analyst agents when trigger "${recheckTrigger}" is active.`,
      details,
    };
  }

  const bundleDecisionContractRequired =
    input.target_agent_type !== 'Analyst'
    && (
      input.strict_bundle_resolution === true
      || input.provisioning_mode === 'on_demand'
      || input.hub_decision_payload !== undefined
      || input.prompt_analyst_output !== undefined
      || input.requested_scope !== undefined
    );

  if (bundleDecisionContractRequired) {
    if (!input.hub_decision_payload) {
      return {
        valid: false,
        code: 'POLICY_BUNDLE_DECISION_REQUIRED',
        reason:
          'Explicit hub_decision_payload is required for non-Analyst dispatches when strict/on-demand bundle resolution is active.',
        details,
      };
    }

    const decisionId = input.hub_decision_payload.bundle_decision_id?.trim();
    const decisionVersion = input.hub_decision_payload.bundle_decision_version?.trim();
    const hasBundleSelection = Boolean(
      input.hub_decision_payload.hub_selected_skill_bundle?.bundle_id
      || input.hub_decision_payload.spoke_instruction_bundle?.bundle_id
      || input.hub_decision_payload.spoke_skill_bundle?.bundle_id,
    );

    if (!decisionId || !decisionVersion || !hasBundleSelection) {
      return {
        valid: false,
        code: 'POLICY_BUNDLE_DECISION_INVALID',
        reason:
          'hub_decision_payload must include bundle_decision_id, bundle_decision_version, and at least one selected bundle id.',
        details,
      };
    }
  }

  return {
    valid: true,
    details,
  };
}

const PROMPT_ANALYST_RECHECK_TRIGGERS = new Set([
  'new_prompt',
  'new_session',
  'scope_change',
  'scope_changed',
  'context_stale',
  'stale_context',
  'user_override',
  'force_prompt_analyst',
]);

function resolvePromptAnalystRecheckTrigger(input: HubPolicyInput): string | undefined {
  const transitionEvent = input.transition_event?.trim().toLowerCase();
  if (transitionEvent && PROMPT_ANALYST_RECHECK_TRIGGERS.has(transitionEvent)) {
    return transitionEvent;
  }

  const transitionReason = input.transition_reason_code?.trim().toLowerCase();
  if (transitionReason && PROMPT_ANALYST_RECHECK_TRIGGERS.has(transitionReason)) {
    return transitionReason;
  }

  return undefined;
}

function isPromptAnalystUnavailable(input: HubPolicyInput): boolean {
  return (
    input.transition_reason_code === 'prompt_analyst_unavailable'
    || input.transition_event === 'prompt_analyst_unavailable'
  );
}

export function evaluateHubDispatchPolicy(input: HubPolicyInput): HubPolicyEvaluation {
  const aliasRouting = resolveHubAliasRouting(
    input.requested_hub_label ?? 'Hub',
    input.requested_hub_mode,
  );

  const fallbackRequested = input.bypass_prompt_analyst_policy === true;
  const fallbackAllowed = fallbackRequested && isPromptAnalystUnavailable(input);

  const normalizedInput: HubPolicyInput = {
    ...input,
    requested_hub_label: input.requested_hub_label ?? aliasRouting.requested_hub_label ?? 'Hub',
    requested_hub_mode: input.requested_hub_mode ?? aliasRouting.resolved_mode ?? 'standard_orchestration',
    current_hub_mode:
      input.current_hub_mode
      ?? input.requested_hub_mode
      ?? aliasRouting.resolved_mode
      ?? 'standard_orchestration',
    prompt_analyst_enrichment_applied: input.prompt_analyst_enrichment_applied === true,
    bypass_prompt_analyst_policy: fallbackAllowed,
    prompt_analyst_output: input.prompt_analyst_output,
    hub_decision_payload: input.hub_decision_payload,
    provisioning_mode: input.provisioning_mode,
    fallback_policy: input.fallback_policy,
    requested_scope: input.requested_scope,
    strict_bundle_resolution: input.strict_bundle_resolution,
  };

  const promptAnalystOutcome: 'rerun' | 'reuse' | 'fallback' = fallbackAllowed
    ? 'fallback'
    : normalizedInput.prompt_analyst_enrichment_applied === true
      ? 'rerun'
      : 'reuse';

  if (fallbackRequested && !fallbackAllowed) {
    return {
      alias_routing: aliasRouting,
      normalized_input: normalizedInput,
      fallback: {
        requested: true,
        used: false,
      },
      policy: {
        valid: false,
        code: 'POLICY_PROMPT_ANALYST_FALLBACK_REQUIRES_UNAVAILABLE',
        reason:
          'Prompt Analyst fallback is only allowed when transition_reason_code or transition_event is prompt_analyst_unavailable.',
        details: {
          current_hub_mode: normalizedInput.current_hub_mode,
          previous_hub_mode: normalizedInput.previous_hub_mode,
          requested_hub_mode: normalizedInput.requested_hub_mode,
          requested_hub_label: normalizedInput.requested_hub_label,
          target_agent_type: normalizedInput.target_agent_type,
          transition_event: normalizedInput.transition_event,
          transition_reason_code: normalizedInput.transition_reason_code,
          prompt_analyst_enrichment_applied: normalizedInput.prompt_analyst_enrichment_applied,
          prompt_analyst_recheck_required: resolvePromptAnalystRecheckTrigger(normalizedInput) !== undefined,
          prompt_analyst_recheck_trigger: resolvePromptAnalystRecheckTrigger(normalizedInput),
        },
      },
      telemetry: {
        prompt_analyst_outcome: promptAnalystOutcome,
      },
    };
  }

  const policy = validateHubPolicy(normalizedInput, aliasRouting);

  return {
    alias_routing: aliasRouting,
    normalized_input: normalizedInput,
    fallback: {
      requested: fallbackRequested,
      used: fallbackAllowed,
      reason_code: fallbackAllowed ? 'prompt_analyst_unavailable' : undefined,
    },
    policy,
    telemetry: {
      prompt_analyst_outcome: promptAnalystOutcome,
    },
  };
}
