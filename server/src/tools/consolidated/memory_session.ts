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
import * as net from 'node:net';
import * as store from '../../storage/file-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionAction = 'prep' | 'list_sessions' | 'get_session';

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

    // For get_session
    session_id?: string;

    // For list_sessions
    status_filter?: 'active' | 'stopping' | 'completed' | 'all';
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

function ok<T>(data: T) {
    return { success: true as const, data: { action: 'memory_session' as const, data } };
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
    const host = process.env.PM_SPECIALIZED_HOST_PROBE_HOST?.trim() || '127.0.0.1';
    const port = envPort('PM_SPECIALIZED_HOST_PROBE_PORT', 9100);

    return new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.once('close', () => finish(false));
        socket.connect(port, host);
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
            selected_mode: 'legacy_runsubagent',
            fallback_used: true,
            fallback_reason: 'feature_gate_disabled',
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
            selected_mode: 'legacy_runsubagent',
            fallback_used: true,
            fallback_reason: 'host_unavailable',
            decision_points: {
                ...baseDecision.decision_points,
                d1_host_availability: 'legacy_fallback'
            }
        };
    }

    if (!hasContractMetadata) {
        return {
            ...baseDecision,
            selected_mode: 'legacy_runsubagent',
            fallback_used: true,
            fallback_reason: 'contract_invalid',
            decision_points: {
                ...baseDecision.decision_points,
                d2_contract_validation: 'legacy_fallback'
            }
        };
    }

    if (!controlPlaneParityOk) {
        return {
            ...baseDecision,
            selected_mode: 'legacy_runsubagent',
            fallback_used: true,
            fallback_reason: 'control_plane_parity_gap',
            decision_points: {
                ...baseDecision.decision_points,
                d4_control_plane_parity: 'legacy_fallback'
            }
        };
    }

    return baseDecision;
}

// ---------------------------------------------------------------------------
// Action: prep
// ---------------------------------------------------------------------------

async function handlePrep(params: MemorySessionParams) {
    const { agent_name, prompt, workspace_id, plan_id, parent_session_id } = params;
    const warnings: PrepWarning[] = [];

    if (!agent_name) return err('agent_name is required');
    if (!prompt) return err('prompt is required');

    const compatMode = params.compat_mode === 'strict' ? 'strict' : 'legacy';
    const launchRouting = await selectLaunchRouting(params);

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

    // Mint session ID
    const sessionId = mintSessionId();
    const startedAt = new Date().toISOString();

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

    promptParts.push(
        '--- ORCHESTRATION ROUTING ---',
        `selected_mode: ${launchRouting.selected_mode}`,
        `fallback_used: ${String(launchRouting.fallback_used)}`,
        `fallback_reason: ${launchRouting.fallback_reason}`,
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
        launch_routing: launchRouting,
        orchestration_routing: launchRouting
    };

    const output: Record<string, unknown> = {
        accepted: true,
        mode: 'context-prep-only',
        message: 'Spawn context prepared. Call runSubagent next using prep_config.enriched_prompt.',
        prep_config: prepResult,
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

    return ok(output);
}

// ---------------------------------------------------------------------------
// Action: list_sessions
// ---------------------------------------------------------------------------

async function handleListSessions(params: MemorySessionParams) {
    const { workspace_id, plan_id, status_filter } = params;

    if (!workspace_id) return err('workspace_id is required');

    // If plan_id provided, get sessions from that plan's state
    if (plan_id) {
        try {
            const planState = await store.getPlanState(workspace_id, plan_id);
            if (!planState) return err(`Plan not found: ${plan_id}`);

            const sessions = (planState as any).agent_sessions || [];
            const filtered = status_filter && status_filter !== 'all'
                ? sessions.filter((s: any) => s.status === status_filter)
                : sessions;

            return ok({
                workspace_id,
                plan_id,
                session_count: filtered.length,
                sessions: filtered
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
                    allSessions.push({ ...sess, plan_id: plan.id, plan_title: state.title });
                }
            }
        }

        const filtered = status_filter && status_filter !== 'all'
            ? allSessions.filter(s => s.status === status_filter)
            : allSessions;

        return ok({
            workspace_id,
            session_count: filtered.length,
            sessions: filtered
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
            ? ok({ session: match, plan_id, workspace_id })
            : err(`Session not found: ${session_id}`);
    }

    // Search across all plans
    const plans = await store.getWorkspacePlans(workspace_id);
    for (const plan of plans) {
        const state = await store.getPlanState(workspace_id, plan.id);
        if (state && (state as any).agent_sessions) {
            const match = (state as any).agent_sessions.find((s: any) => s.session_id === session_id);
            if (match) {
                return ok({ session: match, plan_id: plan.id, workspace_id });
            }
        }
    }

    return err(`Session not found across all plans: ${session_id}`);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function memorySession(params: MemorySessionParams) {
    switch (params.action) {
        case 'prep':
            return handlePrep(params);
        case 'list_sessions':
            return handleListSessions(params);
        case 'get_session':
            return handleGetSession(params);
        default:
            return err(`Unknown action: ${(params as any).action}`);
    }
}
