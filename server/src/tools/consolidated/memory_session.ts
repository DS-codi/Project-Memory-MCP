/**
 * memory_session — Consolidated MCP tool for agent session management & spawn preparation
 *
 * This tool handles two concerns:
 *   1. **Spawn preparation** (action: prep) — Mints a session ID, enriches the prompt with
 *      context/boundary/anti-spawning blocks, and returns a prep payload. The extension proxy
 *      then registers the session locally in SessionInterceptRegistry before surfacing the
 *      result to the LLM caller.
 *   2. **Session queries** (action: list_sessions, get_session) — Lets agents query active
 *      session state from plan data without needing extension-side access.
 *
 * This tool does NOT execute spawns. Callers must use native runSubagent with the
 * returned enriched_prompt.
 */

import { randomBytes } from 'crypto';
import * as store from '../../storage/db-store.js';
import { deployForTask } from '../agent-deploy.js';
import { getWorkspaceInstructionsWithContent, getInstruction } from '../../db/instruction-db.js';
import { getWorkspaceSkillsWithContent, getSkill } from '../../db/skill-db.js';
import { getImportantResponseContext } from '../../utils/important-response-context.js';
import { isSupervisorRunning } from '../orchestration/supervisor-client.js';
import {
    type CanonicalHubMode,
    type HubAliasResolution,
} from '../orchestration/hub-alias-routing.js';
import {
    evaluateHubDispatchPolicy,
    isAnalystDispatchTarget,
} from '../orchestration/hub-policy-enforcement.js';
import { events } from '../../events/event-emitter.js';
import type {
    PromptAnalystOutput,
    HubDecisionPayload,
    ProvisioningMode,
    DeployFallbackPolicy,
    DeployTelemetryContext,
    BundleScope,
} from '../../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionAction = 'prep' | 'deploy_and_prep' | 'list_sessions' | 'get_session' | 'prep_claude';

export interface MemorySessionParams {
    action: SessionAction;

    // Required for all actions
    workspace_id?: string;

    // For prep action
    agent_name?: string;
    prompt?: string;
    plan_id?: string;
    compat_mode?: 'legacy' | 'strict';
    parent_session_id?: string;
    prep_config?: {
        scope_boundaries?: {
            files_allowed?: string[];
            directories_allowed?: string[];
            scope_escalation_instruction?: string;
        };
    };
    phase_name?: string;
    step_indices?: number[];
    include_skills?: boolean;
    include_research?: boolean;
    include_architecture?: boolean;
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
    requested_hub_label?: 'Coordinator' | 'Analyst' | 'Runner' | 'TDDDriver' | 'Hub';
    current_hub_mode?: CanonicalHubMode;
    previous_hub_mode?: CanonicalHubMode;
    requested_hub_mode?: CanonicalHubMode;
    transition_event?: string;
    transition_reason_code?: string;
    prompt_analyst_enrichment_applied?: boolean;
    bypass_prompt_analyst_policy?: boolean;
    prompt_analyst_latency_ms?: number;
    peer_sessions_count?: number;

    // For get_session
    session_id?: string;

    // For list_sessions
    status_filter?: 'active' | 'stopping' | 'completed' | 'all';

    // For prep_claude
    role?: 'Researcher' | 'Architect' | 'Executor' | 'Reviewer' | 'Tester' | 'Revisionist' | 'Archivist' | 'Worker';
    context_summary?: string;
    skills_to_load?: string[];
    instructions_to_load?: string[];
}

interface PrepResult {
    agent_name: string;
    enriched_prompt: string;
    session_id: string;
    mode: 'context-prep-only';
    compat_mode: 'legacy' | 'strict';
    execution: { spawn_executed: false };
    workspace_context?: {
        workspace_id: string;
        workspace_path?: string;
    };
    plan_context?: {
        plan_id: string;
        title?: string;
        current_phase?: string;
    };
    scope_boundaries_injected: boolean;
    anti_spawning_injected: boolean;
    session_registration: {
        session_id: string;
        workspace_id: string;
        plan_id: string;
        agent_type: string;
        parent_session_id?: string;
        started_at: string;
    };
    hub_alias_routing: HubAliasResolution;
    compatibility_metadata: {
        requested_hub_label: HubAliasResolution['requested_hub_label'];
        resolved_mode: HubAliasResolution['resolved_mode'];
        alias_resolution_applied: boolean;
        deprecation_phase: string;
        prompt_analyst_enrichment_applied: boolean;
        session_id: string;
        peer_sessions_count: number;
    };
    launch_routing: LaunchRoutingDecision;
    orchestration_routing: LaunchRoutingDecision;
}

interface PrepWarning {
    code: string;
    message: string;
}

type FallbackReason =
    | 'none'
    | 'host_unavailable'
    | 'contract_invalid'
    | 'startup_degradation'
    | 'control_plane_parity_gap'
    | 'feature_gate_disabled';

type LaunchMode = 'specialized_host' | 'legacy_runsubagent';

interface LaunchRoutingDecision {
    selected_mode: LaunchMode;
    fallback_used: boolean;
    fallback_reason: FallbackReason;
    decision_points: {
        d0_feature_gate: 'specialized' | 'legacy_fallback';
        d1_host_availability: 'pass' | 'legacy_fallback';
        d2_contract_validation: 'pass' | 'legacy_fallback';
        d3_post_launch_degradation: 'monitor';
        d4_control_plane_parity: 'pass' | 'legacy_fallback';
    };
    startup_policy: {
        stabilization_required: true;
        legacy_fallback_on_startup_degradation: true;
        next_retry_fallback_reason: 'startup_degradation';
    };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HUB_AGENTS = ['Coordinator', 'Analyst', 'Runner', 'TDDDriver'] as const;

const ANTI_SPAWNING_TEMPLATE = `
You are a spoke agent. Do NOT call runSubagent or memory_session to spawn other agents.
Use memory_agent(action: handoff) to recommend the next agent back to the Coordinator.
`;

const GIT_STABILITY_GUARD = `
STABILITY GUARDRAIL:
- Do NOT call git changed-files tools during startup or routine execution.
- Do NOT run git diff/status scans unless the user explicitly asks for git-state diagnostics.
- Begin with plan/context/file reads first; only use git inspection tools when strictly required.
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isHubAgent(name: string): boolean {
    return HUB_AGENTS.includes(name as typeof HUB_AGENTS[number]);
}

function mintSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = randomBytes(4).toString('hex');
    return `sess_${timestamp}_${randomPart}`;
}

function buildScopeBoundariesBlock(boundaries?: MemorySessionParams['prep_config']): string {
    const sb = boundaries?.scope_boundaries;
    if (!sb) return '';

    const lines: string[] = ['', 'SCOPE BOUNDARIES (strictly enforced):'];

    if (sb.files_allowed?.length) {
        lines.push(`- ONLY modify these files: ${sb.files_allowed.join(', ')}`);
    }
    if (sb.directories_allowed?.length) {
        lines.push(`- ONLY create files in these directories: ${sb.directories_allowed.join(', ')}`);
    }
    if (sb.scope_escalation_instruction) {
        lines.push(`- ${sb.scope_escalation_instruction}`);
    } else {
        lines.push(
            '- If your task requires changes beyond this scope, STOP and use ' +
            'memory_agent(action: handoff) to report back. Do NOT expand scope yourself.'
        );
    }
    lines.push('');
    return lines.join('\n');
}

function buildAlwaysProvidedNotesBlock(
    importantContext?: {
        section_key: string;
        summary?: string;
        items?: Array<{ title?: string; description?: string; links?: string[] }>;
        updated_at?: string;
    }
): string {
    if (!importantContext) return '';

    const lines: string[] = ['', '--- ALWAYS-PROVIDED NOTES (WORKSPACE CONTEXT) ---'];
    lines.push(
        'Priority: treat these notes as high-priority workspace constraints unless they conflict with higher-priority system, developer, or direct user instructions.'
    );
    lines.push(`Source section: ${importantContext.section_key}`);
    if (importantContext.updated_at) {
        lines.push(`Updated: ${importantContext.updated_at}`);
    }

    if (importantContext.summary && importantContext.summary.trim()) {
        lines.push(`Summary: ${importantContext.summary.trim()}`);
    }

    if (Array.isArray(importantContext.items) && importantContext.items.length > 0) {
        lines.push('Items:');
        for (const item of importantContext.items) {
            const title = typeof item?.title === 'string' ? item.title.trim() : '';
            const description = typeof item?.description === 'string' ? item.description.trim() : '';
            if (title && description) {
                lines.push(`- ${title}: ${description}`);
            } else if (title) {
                lines.push(`- ${title}`);
            } else if (description) {
                lines.push(`- ${description}`);
            }

            if (Array.isArray(item?.links) && item.links.length > 0) {
                lines.push(`  links: ${item.links.join(', ')}`);
            }
        }
    }

    lines.push('--- END ALWAYS-PROVIDED NOTES ---\n');
    return lines.join('\n');
}

function ok<T>(actionName: string, data: T) {
    return { success: true as const, data: { action: actionName, data } };
}

function err(message: string) {
    return { success: false as const, error: message };
}

function envFlag(name: string, defaultValue: boolean): boolean {
    const raw = process.env[name]?.trim().toLowerCase();
    if (!raw) return defaultValue;
    if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
    if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
    return defaultValue;
}

function envPort(name: string, defaultValue: number): number {
    const raw = process.env[name]?.trim();
    if (!raw) return defaultValue;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return defaultValue;
    return Math.floor(parsed);
}

async function checkHostAvailability(timeoutMs = 600): Promise<boolean> {
    const host = process.env.PM_SPECIALIZED_HOST_PROBE_HOST?.trim();
    const portRaw = process.env.PM_SPECIALIZED_HOST_PROBE_PORT?.trim();
    const hasPortOverride = Boolean(portRaw);
    const forceTcp = Boolean(host || hasPortOverride);
    const minConnectTimeout = Math.max(timeoutMs, 1000);
    const requestTimeout = Math.max(timeoutMs * 2, 1500);

    if (forceTcp) {
        const port = envPort('PM_SPECIALIZED_HOST_PROBE_PORT', 45470);
        return isSupervisorRunning({
            forceTcp: true,
            tcpHost: host || '127.0.0.1',
            tcpPort: port,
            connectTimeoutMs: minConnectTimeout,
            requestTimeoutMs: requestTimeout,
        });
    }

    return isSupervisorRunning({
        connectTimeoutMs: minConnectTimeout,
        requestTimeoutMs: requestTimeout,
    });
}

async function selectLaunchRouting(params: MemorySessionParams): Promise<LaunchRoutingDecision> {
    const featureGateEnabled = envFlag('PM_SPECIALIZED_HOST_MODE_ENABLED', true);
    const controlPlaneParityOk = envFlag('PM_SPECIALIZED_HOST_CONTROL_PARITY_OK', true);

    const hasContractMetadata = Boolean(
        params.workspace_id?.trim()
        && params.plan_id?.trim()
        && params.agent_name?.trim()
        && params.prompt?.trim()
    );

    const hostAvailable = featureGateEnabled ? await checkHostAvailability() : false;

    const baseDecision: LaunchRoutingDecision = {
        selected_mode: 'specialized_host',
        fallback_used: false,
        fallback_reason: 'none',
        decision_points: {
            d0_feature_gate: 'specialized',
            d1_host_availability: 'pass',
            d2_contract_validation: 'pass',
            d3_post_launch_degradation: 'monitor',
            d4_control_plane_parity: 'pass'
        },
        startup_policy: {
            stabilization_required: true,
            legacy_fallback_on_startup_degradation: true,
            next_retry_fallback_reason: 'startup_degradation'
        }
    };

    if (!featureGateEnabled) {
        return {
            ...baseDecision,
            decision_points: {
                ...baseDecision.decision_points,
                d0_feature_gate: 'legacy_fallback',
                d1_host_availability: 'legacy_fallback'
            }
        };
    }

    if (!hostAvailable) {
        return {
            ...baseDecision,
            decision_points: {
                ...baseDecision.decision_points,
                d1_host_availability: 'legacy_fallback'
            }
        };
    }

    if (!hasContractMetadata) {
        return {
            ...baseDecision,
            decision_points: {
                ...baseDecision.decision_points,
                d2_contract_validation: 'legacy_fallback'
            }
        };
    }

    if (!controlPlaneParityOk) {
        return {
            ...baseDecision,
            decision_points: {
                ...baseDecision.decision_points,
                d4_control_plane_parity: 'legacy_fallback'
            }
        };
    }

    return baseDecision;
}

async function enforceDispatchPolicy(
    params: MemorySessionParams,
    targetAgentType: string,
    action: 'prep' | 'deploy_and_prep',
): Promise<
    | { ok: true; evaluation: ReturnType<typeof evaluateHubDispatchPolicy> }
    | { ok: false; error: string }
> {
    const evaluation = evaluateHubDispatchPolicy({
        target_agent_type: targetAgentType,
        current_hub_mode: params.current_hub_mode,
        previous_hub_mode: params.previous_hub_mode,
        requested_hub_mode: params.requested_hub_mode,
        requested_hub_label: params.requested_hub_label,
        transition_event: params.transition_event,
        transition_reason_code: params.transition_reason_code,
        prompt_analyst_enrichment_applied: params.prompt_analyst_enrichment_applied,
        bypass_prompt_analyst_policy: params.bypass_prompt_analyst_policy,
        prompt_analyst_output: params.prompt_analyst_output,
        hub_decision_payload: params.hub_decision_payload,
        provisioning_mode: params.provisioning_mode,
        fallback_policy: params.fallback_policy,
        requested_scope: params.requested_scope,
        strict_bundle_resolution: params.strict_bundle_resolution,
    });

    if (!evaluation.policy.valid) {
        if (params.workspace_id && params.plan_id) {
            await events.hubPolicyBlocked(params.workspace_id, params.plan_id, {
                action,
                code: evaluation.policy.code,
                reason: evaluation.policy.reason,
                details: evaluation.policy.details,
                requested_hub_label: evaluation.alias_routing.requested_hub_label,
                resolved_mode: evaluation.alias_routing.resolved_mode,
                deprecation_phase: evaluation.alias_routing.deprecation_phase,
                fallback_requested: evaluation.fallback.requested,
                fallback_used: evaluation.fallback.used,
                fallback_reason_code: evaluation.fallback.reason_code,
                prompt_analyst_outcome: evaluation.telemetry.prompt_analyst_outcome,
            });
        }

        return {
            ok: false,
            error: `${evaluation.policy.code}: ${evaluation.policy.reason}`,
        };
    }

    if (evaluation.fallback.used && params.workspace_id && params.plan_id) {
        await events.promptAnalystEnrichment(params.workspace_id, params.plan_id, {
            action,
            target_agent_type: targetAgentType,
            applied: false,
            fallback_used: true,
            fallback_reason_code: evaluation.fallback.reason_code,
            requested_hub_label: evaluation.alias_routing.requested_hub_label,
            resolved_mode: evaluation.alias_routing.resolved_mode,
            transition_event: evaluation.normalized_input.transition_event,
            transition_reason_code: evaluation.normalized_input.transition_reason_code,
            outcome_label: evaluation.telemetry.prompt_analyst_outcome,
        });
    }

    return {
        ok: true,
        evaluation,
    };
}

// ---------------------------------------------------------------------------
// Action: prep
// ---------------------------------------------------------------------------

async function handlePrep(
    params: MemorySessionParams,
    enforcedPolicy?: ReturnType<typeof evaluateHubDispatchPolicy>,
) {
    const { agent_name, prompt, workspace_id, plan_id, parent_session_id } = params;
    const warnings: PrepWarning[] = [];

    if (!agent_name) return err('agent_name is required');
    if (!prompt) return err('prompt is required');

    const compatMode = params.compat_mode === 'strict' ? 'strict' : 'legacy';
    const launchRouting = await selectLaunchRouting(params);
    const dispatchPolicy = enforcedPolicy
        ? { ok: true as const, evaluation: enforcedPolicy }
        : await enforceDispatchPolicy(params, agent_name, 'prep');
    if (!dispatchPolicy.ok) {
        return err(dispatchPolicy.error);
    }

    const hubAliasRouting = dispatchPolicy.evaluation.alias_routing;
    const promptAnalystEnrichmentApplied = params.prompt_analyst_enrichment_applied === true;
    const promptAnalystLatencyMs = Number.isFinite(params.prompt_analyst_latency_ms)
        ? Math.max(0, Number(params.prompt_analyst_latency_ms))
        : undefined;
    const peerSessionsCount = Number.isFinite(params.peer_sessions_count)
        ? Math.max(0, Math.floor(params.peer_sessions_count as number))
        : 0;

    // Fetch workspace context
    let workspaceContext: PrepResult['workspace_context'];
    if (workspace_id) {
        try {
            const wsInfo = await store.getWorkspace(workspace_id);
            if (wsInfo) {
                workspaceContext = {
                    workspace_id,
                    workspace_path: wsInfo.path
                };
            } else {
                workspaceContext = { workspace_id };
            }
        } catch {
            workspaceContext = { workspace_id };
            warnings.push({ code: 'CONTEXT_PARTIAL', message: 'Could not fetch workspace info' });
        }
    }

    // Fetch plan context
    let planContext: PrepResult['plan_context'];
    if (workspace_id && plan_id) {
        try {
            const planState = await store.getPlanState(workspace_id, plan_id);
            if (planState) {
                planContext = {
                    plan_id,
                    title: planState.title,
                    current_phase: planState.current_phase
                };
            } else {
                planContext = { plan_id };
            }
        } catch {
            planContext = { plan_id };
            warnings.push({ code: 'CONTEXT_PARTIAL', message: 'Could not fetch plan info' });
        }
    }

    let importantContext:
        | {
            section_key: string;
            summary?: string;
            items?: Array<{ title?: string; description?: string; links?: string[] }>;
            updated_at?: string;
        }
        | undefined;
    if (workspace_id) {
        try {
            const context = await getImportantResponseContext(workspace_id);
            if (context) {
                importantContext = {
                    section_key: context.section_key,
                    summary: context.summary,
                    items: context.items as Array<{ title?: string; description?: string; links?: string[] }> | undefined,
                    updated_at: context.updated_at,
                };
            }
        } catch {
            warnings.push({ code: 'CONTEXT_PARTIAL', message: 'Could not fetch always-provided workspace notes' });
        }
    }

    // Mint session ID
    const sessionId = mintSessionId();
    const startedAt = new Date().toISOString();

    if (
        workspace_id
        && plan_id
        && dispatchPolicy.evaluation.normalized_input.target_agent_type !== 'Analyst'
        && dispatchPolicy.evaluation.telemetry.prompt_analyst_outcome !== 'fallback'
    ) {
        await events.promptAnalystEnrichment(workspace_id, plan_id, {
            session_id: sessionId,
            target_agent_type: agent_name,
            applied: promptAnalystEnrichmentApplied,
            latency_ms: promptAnalystLatencyMs,
            requested_hub_label: hubAliasRouting.requested_hub_label,
            resolved_mode: hubAliasRouting.resolved_mode,
            outcome_label: dispatchPolicy.evaluation.telemetry.prompt_analyst_outcome,
        });
    }

    // Build enriched prompt
    const promptParts: string[] = [];

    if (workspaceContext || planContext) {
        promptParts.push('--- CONTEXT ---');
        if (workspaceContext) {
            promptParts.push(`Workspace: ${workspaceContext.workspace_id}`);
            if (workspaceContext.workspace_path) {
                promptParts.push(`Path: ${workspaceContext.workspace_path}`);
            }
        }
        if (planContext) {
            promptParts.push(`Plan: ${planContext.plan_id}`);
            if (planContext.title) promptParts.push(`Title: ${planContext.title}`);
            if (planContext.current_phase) promptParts.push(`Phase: ${planContext.current_phase}`);
        }
        promptParts.push(`Session: ${sessionId}`);
        promptParts.push('--- END CONTEXT ---\n');
    }

    const alwaysProvidedNotesBlock = buildAlwaysProvidedNotesBlock(importantContext);
    if (alwaysProvidedNotesBlock) {
        promptParts.push(alwaysProvidedNotesBlock);
    }

    promptParts.push(
        '--- ORCHESTRATION ROUTING ---',
        `selected_mode: ${launchRouting.selected_mode}`,
        `fallback_used: ${String(launchRouting.fallback_used)}`,
        `fallback_reason: ${launchRouting.fallback_reason}`,
        `requested_hub_label: ${hubAliasRouting.requested_hub_label ?? 'none'}`,
        `resolved_mode: ${hubAliasRouting.resolved_mode ?? 'none'}`,
        `alias_resolution_applied: ${String(hubAliasRouting.alias_resolution_applied)}`,
        `deprecation_phase: ${hubAliasRouting.deprecation_phase}`,
        `prompt_analyst_enrichment_applied: ${String(promptAnalystEnrichmentApplied)}`,
        `peer_sessions_count: ${String(peerSessionsCount)}`,
        'Section16_decision_points: D0,D1,D2,D3,D4',
        '--- END ORCHESTRATION ROUTING ---\n'
    );

    // Session tracking meta-instruction
    promptParts.push(
        '--- SESSION TRACKING (REQUIRED) ---',
        `Include "_session_id": "${sessionId}" in every tool call input.`,
        'This enables the session management system to track your activity.',
        'Do not omit this field from any tool call.',
        '--- END SESSION TRACKING ---\n'
    );

    // Scope boundaries
    let scopeBoundariesInjected = false;
    const boundariesBlock = buildScopeBoundariesBlock(params.prep_config);
    if (boundariesBlock) {
        promptParts.push(boundariesBlock);
        scopeBoundariesInjected = true;
    }

    // Anti-spawning for spoke agents
    let antiSpawningInjected = false;
    if (!isHubAgent(agent_name)) {
        promptParts.push(ANTI_SPAWNING_TEMPLATE);
        antiSpawningInjected = true;
    }

    promptParts.push(GIT_STABILITY_GUARD);
    promptParts.push(prompt);

    const enrichedPrompt = promptParts.join('\n');

    // Session registration data (extension proxy will use this to register locally)
    const sessionRegistration = {
        session_id: sessionId,
        workspace_id: workspace_id ?? '',
        plan_id: plan_id ?? '',
        agent_type: agent_name,
        parent_session_id: parent_session_id,
        started_at: startedAt
    };

    const prepResult: PrepResult = {
        agent_name,
        enriched_prompt: enrichedPrompt,
        session_id: sessionId,
        mode: 'context-prep-only',
        compat_mode: compatMode,
        execution: { spawn_executed: false },
        workspace_context: workspaceContext,
        plan_context: planContext,
        scope_boundaries_injected: scopeBoundariesInjected,
        anti_spawning_injected: antiSpawningInjected,
        session_registration: sessionRegistration,
        hub_alias_routing: hubAliasRouting,
        compatibility_metadata: {
            requested_hub_label: hubAliasRouting.requested_hub_label,
            resolved_mode: hubAliasRouting.resolved_mode,
            alias_resolution_applied: hubAliasRouting.alias_resolution_applied,
            deprecation_phase: hubAliasRouting.deprecation_phase,
            prompt_analyst_enrichment_applied: promptAnalystEnrichmentApplied,
            session_id: sessionId,
            peer_sessions_count: peerSessionsCount,
        },
        launch_routing: launchRouting,
        orchestration_routing: launchRouting
    };

    const output: Record<string, unknown> = {
        accepted: true,
        mode: 'context-prep-only',
        message: 'Spawn context prepared. Call runSubagent next using prep_config.enriched_prompt.',
        prep_config: prepResult,
        hub_alias_routing: hubAliasRouting,
        compatibility_metadata: prepResult.compatibility_metadata,
        launch_routing: launchRouting,
        orchestration_routing: launchRouting,
        warnings,
        note: antiSpawningInjected
            ? 'Anti-spawning instructions were injected for a spoke target.'
            : 'No anti-spawning instructions needed for a hub target.'
    };

    if (launchRouting.fallback_used) {
        warnings.push({
            code: 'SPECIALIZED_ROUTE_FALLBACK',
            message: `Specialized route unavailable; use legacy runSubagent (${launchRouting.fallback_reason}).`
        });
    }

    if (compatMode === 'legacy') {
        output.spawn_config = prepResult;
        warnings.push({
            code: 'LEGACY_ALIAS',
            message: 'spawn_config is deprecated; migrate to prep_config.'
        });
    }

    return ok('prep', output);
}

// ---------------------------------------------------------------------------
// Action: deploy_and_prep
// ---------------------------------------------------------------------------

async function handleDeployAndPrep(params: MemorySessionParams) {
    const { workspace_id, plan_id, agent_name } = params;

    if (!workspace_id) return err('workspace_id is required');
    if (!agent_name) return err('agent_name is required');
    if (!params.prompt) return err('prompt is required');

    const dispatchPolicy = await enforceDispatchPolicy(params, agent_name, 'deploy_and_prep');
    if (!dispatchPolicy.ok) {
        return err(dispatchPolicy.error);
    }

    const ws = await store.getWorkspace(workspace_id);
    if (!ws) return err(`Workspace not found: ${workspace_id}`);

    const workspacePath = ws.workspace_path || ws.path;
    if (!workspacePath) return err(`Workspace path missing for workspace: ${workspace_id}`);

    if (!plan_id) {
        if (!isAnalystDispatchTarget(agent_name)) {
            return err('plan_id is required');
        }

        const prepResponse = await handlePrep(params, dispatchPolicy.evaluation);
        if (!prepResponse.success || !prepResponse.data) {
            return prepResponse;
        }

        const prepData = prepResponse.data.data as Record<string, unknown>;
        const warnings = Array.isArray(prepData.warnings)
            ? [...prepData.warnings as PrepWarning[]]
            : [];
        warnings.push({
            code: 'DEPLOYMENT_SKIPPED_NO_PLAN',
            message: 'Hub pre-routing analyst startup does not require a plan; skipped plan-scoped deployment and returned prep-only output.'
        });

        return ok('deploy_and_prep', {
            accepted: true,
            mode: 'context-prep-only',
            message: 'Analyst-class pre-routing spawn context prepared without a plan. Call runSubagent next using prep_config.enriched_prompt.',
            deployment: null,
            deploy_result: null,
            prep_config: prepData.prep_config,
            prep_result: prepData.prep_config,
            compatibility_metadata: prepData.compatibility_metadata,
            launch_routing: prepData.launch_routing,
            orchestration_routing: prepData.orchestration_routing,
            warnings,
            note: 'Hub pre-routing analyst startup skipped plan-scoped deployment because plan_id was not provided.',
            deprecation_notice: 'Use memory_session(action: "deploy_and_prep") for new orchestration flows. memory_agent(action: "deploy_for_task") and memory_session(action: "prep") remain supported for backward compatibility.'
        });
    }

    const prepResponse = await handlePrep(params, dispatchPolicy.evaluation);
    if (!prepResponse.success || !prepResponse.data) {
        return prepResponse;
    }

    const deployResult = await deployForTask({
        workspace_id,
        workspace_path: workspacePath,
        agent_name,
        plan_id,
        phase_name: params.phase_name,
        step_indices: params.step_indices,
        include_skills: params.include_skills,
        include_research: params.include_research,
        include_architecture: params.include_architecture,
        prompt_analyst_output: params.prompt_analyst_output,
        hub_decision_payload: params.hub_decision_payload,
        provisioning_mode: params.provisioning_mode,
        allow_legacy_always_on: params.allow_legacy_always_on,
        allow_ambient_instruction_scan: params.allow_ambient_instruction_scan,
        allow_include_skills_all: params.allow_include_skills_all,
        fallback_policy: params.fallback_policy,
        telemetry_context: params.telemetry_context,
        requested_scope: params.requested_scope,
        strict_bundle_resolution: params.strict_bundle_resolution,
    });

    const prepData = prepResponse.data.data as Record<string, unknown>;

    return ok('deploy_and_prep', {
        accepted: true,
        mode: 'deploy-and-prep',
        message: 'Deployment and spawn prep complete. Call runSubagent using prep_config.enriched_prompt.',
        deployment: deployResult,
        deploy_result: deployResult,
        prep_config: prepData.prep_config,
        prep_result: prepData.prep_config,
        compatibility_metadata: prepData.compatibility_metadata,
        launch_routing: prepData.launch_routing,
        orchestration_routing: prepData.orchestration_routing,
        warnings: prepData.warnings ?? [],
        note: prepData.note,
        deprecation_notice: 'Use memory_session(action: "deploy_and_prep") for new orchestration flows. memory_agent(action: "deploy_for_task") and memory_session(action: "prep") remain supported for backward compatibility.'
    });
}

// ---------------------------------------------------------------------------
// Action: list_sessions
// ---------------------------------------------------------------------------

/** Slim session entry for list_sessions response — full detail is via get_session. */
function slimSession(sess: any, overridePlanId?: string): Record<string, unknown> {
    const entry: Record<string, unknown> = {
        session_id: sess.session_id,
        agent_type: sess.agent_type,
    };
    // Include status and plan_id only when present
    if (sess.status != null) entry.status = sess.status;
    const pid = overridePlanId ?? sess.plan_id;
    if (pid != null) entry.plan_id = pid;
    // Date portion only from started_at
    if (sess.started_at != null) {
        entry.started_at = typeof sess.started_at === 'string'
            ? (sess.started_at.split('T')[0] ?? sess.started_at)
            : sess.started_at;
    }
    return entry;
}

async function handleListSessions(params: MemorySessionParams) {
    const { workspace_id, plan_id, status_filter } = params;

    if (!workspace_id) return err('workspace_id is required');

    // If plan_id provided, get sessions from that plan's state
    if (plan_id) {
        try {
            const planState = await store.getPlanState(workspace_id, plan_id);
            if (!planState) return err(`Plan not found: ${plan_id}`);

            const sessions = (planState as any).agent_sessions || [];
            const filtered: any[] = status_filter && status_filter !== 'all'
                ? sessions.filter((s: any) => s.status === status_filter)
                : sessions;

            return ok('list_sessions', {
                workspace_id,
                plan_id,
                session_count: filtered.length,
                sessions: filtered.map((s: any) => slimSession(s, plan_id))
            });
        } catch (e) {
            return err(`Failed to load plan sessions: ${(e as Error).message}`);
        }
    }

    // Without plan_id, list across all active plans
    try {
        const plans = await store.getWorkspacePlans(workspace_id);
        const activePlans = plans.filter((p: any) => p.status !== 'archived');
        const allSessions: any[] = [];

        for (const plan of activePlans) {
            const state = await store.getPlanState(workspace_id, plan.id);
            if (state && (state as any).agent_sessions) {
                for (const sess of (state as any).agent_sessions) {
                    allSessions.push({ ...sess, plan_id: plan.id });
                }
            }
        }

        const filtered: any[] = status_filter && status_filter !== 'all'
            ? allSessions.filter(s => s.status === status_filter)
            : allSessions;

        return ok('list_sessions', {
            workspace_id,
            session_count: filtered.length,
            sessions: filtered.map((s: any) => slimSession(s))
        });
    } catch (e) {
        return err(`Failed to list sessions: ${(e as Error).message}`);
    }
}

// ---------------------------------------------------------------------------
// Action: get_session
// ---------------------------------------------------------------------------

async function handleGetSession(params: MemorySessionParams) {
    const { workspace_id, plan_id, session_id } = params;

    if (!workspace_id) return err('workspace_id is required');
    if (!session_id) return err('session_id is required');

    // If plan_id provided, search that plan only
    if (plan_id) {
        const planState = await store.getPlanState(workspace_id, plan_id);
        if (!planState) return err(`Plan not found: ${plan_id}`);

        const sessions = (planState as any).agent_sessions || [];
        const match = sessions.find((s: any) => s.session_id === session_id);

        return match
            ? ok('get_session', { session: match, plan_id, workspace_id })
            : err(`Session not found: ${session_id}`);
    }

    // Search across all plans
    const plans = await store.getWorkspacePlans(workspace_id);
    for (const plan of plans) {
        const state = await store.getPlanState(workspace_id, plan.id);
        if (state && (state as any).agent_sessions) {
            const match = (state as any).agent_sessions.find((s: any) => s.session_id === session_id);
            if (match) {
                return ok('get_session', { session: match, plan_id: plan.id, workspace_id });
            }
        }
    }

    return err(`Session not found across all plans: ${session_id}`);
}

// ---------------------------------------------------------------------------
// Action: prep_claude
// ---------------------------------------------------------------------------

/**
 * Simplified spoke-spawn preparation for Claude Code hub-and-spoke.
 *
 * Unlike deploy_and_prep, this action:
 *   - Takes simple inputs (role, step_indices, context_summary, scope_boundaries)
 *   - Pre-embeds instruction and skill content from the DB into the enriched_prompt
 *   - Requires no hub policy params, bundle scope, or compat modes
 *   - Returns enriched_prompt + session_id ready for direct use with the Agent tool
 *
 * The spoke receives all context it needs inline; it does NOT need to call
 * memory_agent(action: get_instructions) or get_skill at startup.
 */
async function handlePrepClaude(params: MemorySessionParams) {
    const { workspace_id, plan_id, role, prompt, parent_session_id } = params;

    if (!workspace_id) return err('workspace_id is required');
    if (!role) return err('role is required');
    if (!prompt) return err('prompt is required');

    // Mint session ID
    const sessionId = mintSessionId();
    const startedAt = new Date().toISOString();

    // Fetch workspace info
    let workspacePath: string | undefined;
    try {
        const ws = await store.getWorkspace(workspace_id);
        workspacePath = ws?.path;
    } catch { /* non-fatal */ }

    // Fetch plan info
    let planTitle: string | undefined;
    let currentPhase: string | undefined;
    let planSteps: Array<{ index: number; title: string; description?: string; status: string }> = [];

    if (plan_id) {
        try {
            const planState = await store.getPlanState(workspace_id, plan_id);
            if (planState) {
                planTitle = planState.title;
                currentPhase = planState.current_phase;

                // Collect requested steps
                if (params.step_indices?.length && Array.isArray((planState as any).steps)) {
                    const allSteps = (planState as any).steps as Array<any>;
                    planSteps = params.step_indices
                        .map(idx => {
                            const s = allSteps[idx];
                            if (!s) return null;
                            return {
                                index: idx,
                                title: s.title ?? s.name ?? `Step ${idx}`,
                                description: s.description,
                                status: s.status ?? 'pending',
                            };
                        })
                        .filter((s): s is NonNullable<typeof s> => s !== null);
                }
            }
        } catch { /* non-fatal */ }
    }

    // Fetch instructions to embed
    const instructionNames: string[] = [];
    const instructionBlocks: string[] = [];

    if (params.instructions_to_load?.length) {
        for (const name of params.instructions_to_load) {
            try {
                const row = getInstruction(name);
                if (row) {
                    instructionNames.push(row.filename);
                    instructionBlocks.push(`### ${row.filename}\n${row.content}`);
                }
            } catch { /* non-fatal */ }
        }
    } else {
        try {
            const rows = getWorkspaceInstructionsWithContent(workspace_id);
            for (const row of rows) {
                instructionNames.push(row.filename);
                instructionBlocks.push(`### ${row.filename}\n${row.content}`);
            }
        } catch { /* non-fatal */ }
    }

    // Fetch skills to embed
    const skillNames: string[] = [];
    const skillBlocks: string[] = [];

    if (params.skills_to_load?.length) {
        for (const name of params.skills_to_load) {
            try {
                const row = getSkill(name);
                if (row) {
                    skillNames.push(row.name);
                    skillBlocks.push(`### ${row.name}\n${row.content}`);
                }
            } catch { /* non-fatal */ }
        }
    } else {
        try {
            const rows = getWorkspaceSkillsWithContent(workspace_id);
            for (const row of rows) {
                skillNames.push(row.name);
                skillBlocks.push(`### ${row.name}\n${row.content}`);
            }
        } catch { /* non-fatal */ }
    }

    // Build enriched prompt
    const parts: string[] = [];

    // Session context block
    parts.push('--- SESSION CONTEXT ---');
    parts.push(`Workspace: ${workspace_id}`);
    if (workspacePath) parts.push(`Path: ${workspacePath}`);
    if (plan_id) {
        parts.push(`Plan: ${plan_id}`);
        if (planTitle) parts.push(`Plan title: ${planTitle}`);
    }
    if (params.phase_name || currentPhase) parts.push(`Phase: ${params.phase_name ?? currentPhase}`);
    if (params.step_indices?.length) parts.push(`Step indices: ${params.step_indices.join(', ')}`);
    parts.push(`Session: ${sessionId}`);
    parts.push(`Role: ${role}`);
    parts.push('--- END SESSION CONTEXT ---\n');

    // Assigned steps block
    if (planSteps.length > 0) {
        parts.push('--- ASSIGNED STEPS ---');
        for (const step of planSteps) {
            parts.push(`[${step.index}] ${step.title} (status: ${step.status})`);
            if (step.description) parts.push(`    ${step.description}`);
        }
        parts.push('--- END ASSIGNED STEPS ---\n');
    }

    // Instructions block
    if (instructionBlocks.length > 0) {
        parts.push('--- INSTRUCTIONS ---');
        parts.push(instructionBlocks.join('\n\n'));
        parts.push('--- END INSTRUCTIONS ---\n');
    }

    // Skills block
    if (skillBlocks.length > 0) {
        parts.push('--- SKILLS ---');
        parts.push(skillBlocks.join('\n\n'));
        parts.push('--- END SKILLS ---\n');
    }

    // Scope boundaries block
    const scopeBlock = buildScopeBoundariesBlock(params.prep_config);
    if (scopeBlock) parts.push(scopeBlock);

    // Anti-spawning + git stability
    parts.push(ANTI_SPAWNING_TEMPLATE);
    parts.push(GIT_STABILITY_GUARD);

    // Hub context
    if (params.context_summary) {
        parts.push(`--- HUB CONTEXT ---\n${params.context_summary}\n--- END HUB CONTEXT ---\n`);
    }

    // User prompt (the task itself)
    parts.push(prompt);

    const enrichedPrompt = parts.join('\n');

    return ok('prep_claude', {
        session_id: sessionId,
        role,
        enriched_prompt: enrichedPrompt,
        workspace_id,
        plan_id,
        instructions_embedded: instructionNames,
        skills_embedded: skillNames,
        steps_embedded: planSteps.map(s => s.index),
        session_registration: {
            session_id: sessionId,
            workspace_id,
            plan_id,
            agent_type: role,
            parent_session_id,
            started_at: startedAt,
        },
    });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function memorySession(params: MemorySessionParams) {
    switch (params.action) {
        case 'prep':
            return handlePrep(params);
        case 'deploy_and_prep':
            return handleDeployAndPrep(params);
        case 'list_sessions':
            return handleListSessions(params);
        case 'get_session':
            return handleGetSession(params);
        case 'prep_claude':
            return handlePrepClaude(params);
        default:
            return err(`Unknown action: ${(params as any).action}`);
    }
}
