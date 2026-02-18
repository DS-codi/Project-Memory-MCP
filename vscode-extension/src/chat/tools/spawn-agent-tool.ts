/**
 * Session Tool Handler — memory_session language model tool
 *
 * Hybrid proxy: delegates context prep + session minting to MCP server,
 * then registers the session locally in SessionInterceptRegistry.
 *
 * Actions:
 *   - prep: MCP server mints session, enriches prompt; extension registers session locally
 *   - list_sessions / get_session: pure MCP proxy
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';
import { SPAWN_REASON_CODES } from '../orchestration/spawn-reason-codes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpawnAgentInput {
    action?: 'prep' | 'list_sessions' | 'get_session';
    agent_name?: string;
    prompt?: string;
    workspace_id?: string;
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
    // Legacy aliases (deprecated)
    spawn_config?: {
        scope_boundaries?: {
            files_allowed?: string[];
            directories_allowed?: string[];
            scope_escalation_instruction?: string;
        };
    };
    scope_boundaries?: {
        files_allowed?: string[];
        directories_allowed?: string[];
        scope_escalation_instruction?: string;
    };
    // Session query params
    session_id?: string;
    status_filter?: 'active' | 'stopping' | 'completed' | 'all';
    // Deprecated execution-centric inputs (ignored)
    execution?: unknown;
    orchestration?: unknown;
    lane_policy?: unknown;
    run_id?: unknown;
}

interface PrepWarning {
    code: string;
    message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXECUTION_CENTRIC_INPUT_KEYS = ['execution', 'orchestration', 'lane_policy', 'run_id'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasExecutionCentricInputs(input: SpawnAgentInput): boolean {
    return EXECUTION_CENTRIC_INPUT_KEYS.some(key => typeof input[key] !== 'undefined');
}

function resolveScopeBoundaries(
    input: SpawnAgentInput,
    warnings: PrepWarning[]
): SpawnAgentInput['scope_boundaries'] | undefined {
    if (input.prep_config?.scope_boundaries) {
        return input.prep_config.scope_boundaries;
    }

    if (input.spawn_config?.scope_boundaries) {
        warnings.push({
            code: SPAWN_REASON_CODES.SPAWN_PREP_LEGACY_ALIAS,
            message: 'Input spawn_config is deprecated; migrate to prep_config.'
        });
        return input.spawn_config.scope_boundaries;
    }

    if (input.scope_boundaries) {
        warnings.push({
            code: SPAWN_REASON_CODES.SPAWN_PREP_LEGACY_ALIAS,
            message: 'Top-level scope_boundaries is deprecated; nest under prep_config.scope_boundaries.'
        });
        return input.scope_boundaries;
    }

    return undefined;
}

function successResult(data: Record<string, unknown>): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: true, ...data }, null, 2))
    ]);
}

function errorResult(error: unknown): vscode.LanguageModelToolResult {
    const message = error instanceof Error ? error.message : String(error);
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: false, error: message }))
    ]);
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export async function handleSpawnAgentTool(
    options: vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
    token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        if (!ctx.mcpBridge.isConnected()) {
            return errorResult('MCP server not connected');
        }

        // Default to 'prep' for backwards compatibility (callers that omit action)
        const action = options.input.action ?? 'prep';

        switch (action) {
            case 'prep':
                return handlePrep(options.input, token, ctx);
            case 'list_sessions':
                return handleListSessions(options.input, ctx);
            case 'get_session':
                return handleGetSession(options.input, ctx);
            default:
                return errorResult(`Unknown action: ${action}`);
        }
    } catch (error) {
        return errorResult(error);
    }
}

// ---------------------------------------------------------------------------
// Action: prep — Server context enrichment + local session registration
// ---------------------------------------------------------------------------

async function handlePrep(
    input: SpawnAgentInput,
    token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    const { agent_name, prompt, workspace_id, plan_id, parent_session_id } = input;
    const warnings: PrepWarning[] = [
        {
            code: SPAWN_REASON_CODES.SPAWN_PREP_ONLY,
            message: 'memory_session no longer executes spawns; call runSubagent next.'
        }
    ];

    const compatMode = input.compat_mode === 'strict' ? 'strict' : 'legacy';
    const scope_boundaries = resolveScopeBoundaries(input, warnings);
    const hasDeprecatedExecutionInputs = hasExecutionCentricInputs(input);

    if (token.isCancellationRequested) {
        return successResult({
            accepted: false,
            reason_code: SPAWN_REASON_CODES.SPAWN_CANCELLED_TOKEN,
            message: 'Spawn preparation cancelled before execution.'
        });
    }

    if (!agent_name) {
        return errorResult('agent_name is required');
    }
    if (!prompt) {
        return errorResult('prompt is required');
    }

    if (compatMode === 'strict' && hasDeprecatedExecutionInputs) {
        return errorResult(
            'compat_mode "strict" does not allow execution-centric inputs (execution, orchestration, lane_policy, run_id).'
        );
    }

    if (hasDeprecatedExecutionInputs) {
        warnings.push({
            code: SPAWN_REASON_CODES.SPAWN_PREP_DEPRECATED_INPUT_IGNORED,
            message: 'Deprecated execution-centric inputs were ignored.'
        });
    }

    // Delegate to MCP server for context enrichment + session minting
    const mcpParams: Record<string, unknown> = {
        action: 'prep',
        agent_name,
        prompt,
        workspace_id,
        plan_id,
        compat_mode: compatMode,
        parent_session_id
    };

    if (scope_boundaries) {
        mcpParams.prep_config = { scope_boundaries };
    }

    const mcpResult = await ctx.mcpBridge.callTool<{
        success: boolean;
        data?: {
            data?: {
                accepted?: boolean;
                prep_config?: {
                    session_id?: string;
                    enriched_prompt?: string;
                    agent_name?: string;
                    session_registration?: {
                        session_id: string;
                        workspace_id: string;
                        plan_id: string;
                        agent_type: string;
                        parent_session_id?: string;
                        started_at: string;
                    };
                    [key: string]: unknown;
                };
                warnings?: PrepWarning[];
                [key: string]: unknown;
            };
        };
        error?: string;
    }>('memory_session', mcpParams);

    if (!mcpResult?.data?.data?.accepted) {
        const errMsg = mcpResult?.error
            ?? (mcpResult?.data?.data as Record<string, unknown>)?.message as string
            ?? 'MCP server prep failed';
        return errorResult(errMsg);
    }

    const serverData = mcpResult.data.data;
    const prepConfig = serverData.prep_config;
    const sessionReg = prepConfig?.session_registration;

    // Register session locally in SessionInterceptRegistry
    if (sessionReg && ctx.sessionRegistry) {
        try {
            await ctx.sessionRegistry.register({
                sessionId: sessionReg.session_id,
                workspaceId: sessionReg.workspace_id,
                planId: sessionReg.plan_id,
                agentType: sessionReg.agent_type,
                parentSessionId: sessionReg.parent_session_id,
                startedAt: sessionReg.started_at
            });
        } catch (regError) {
            warnings.push({
                code: 'SESSION_REG_FAILED',
                message: `Local session registration failed: ${regError instanceof Error ? regError.message : String(regError)}`
            });
        }
    }

    // Merge server warnings with local warnings
    if (serverData.warnings && Array.isArray(serverData.warnings)) {
        warnings.push(...serverData.warnings);
    }

    // Build output — preserving the established response shape
    const output: Record<string, unknown> = {
        accepted: true,
        mode: 'context-prep-only',
        reason_code: SPAWN_REASON_CODES.SPAWN_PREP_ONLY,
        message: 'Spawn context prepared. Call runSubagent next using prep_config.enriched_prompt.',
        prep_config: prepConfig,
        warnings,
        deprecation: {
            legacy_alias_supported: compatMode === 'legacy',
            target_removal_phase: 'Phase 3',
            migration_action: 'Switch callers to prep_config + native runSubagent'
        }
    };

    if (compatMode === 'legacy') {
        output.spawn_config = prepConfig;
    }

    return successResult({
        ...output,
        note: prepConfig?.anti_spawning_injected
            ? 'Anti-spawning instructions were injected for a spoke target.'
            : 'No anti-spawning instructions needed for a hub target.'
    });
}

// ---------------------------------------------------------------------------
// Action: list_sessions — Pure MCP proxy
// ---------------------------------------------------------------------------

async function handleListSessions(
    input: SpawnAgentInput,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    const result = await ctx.mcpBridge.callTool<{ success: boolean; data?: unknown; error?: string }>(
        'memory_session',
        {
            action: 'list_sessions',
            workspace_id: input.workspace_id,
            plan_id: input.plan_id,
            status_filter: input.status_filter
        }
    );

    if (result?.error) {
        return errorResult(result.error);
    }

    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result ?? { success: false, error: 'No response' }, null, 2))
    ]);
}

// ---------------------------------------------------------------------------
// Action: get_session — Pure MCP proxy
// ---------------------------------------------------------------------------

async function handleGetSession(
    input: SpawnAgentInput,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    const result = await ctx.mcpBridge.callTool<{ success: boolean; data?: unknown; error?: string }>(
        'memory_session',
        {
            action: 'get_session',
            workspace_id: input.workspace_id,
            plan_id: input.plan_id,
            session_id: input.session_id
        }
    );

    if (result?.error) {
        return errorResult(result.error);
    }

    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result ?? { success: false, error: 'No response' }, null, 2))
    ]);
}
