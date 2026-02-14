/**
 * Spawn Agent Tool Handler — memory_spawn_agent language model tool
 *
 * Prepares context-rich spawn payloads only.
 * Does not execute spawns, validate spawned-agent existence, or manage spawn lanes.
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';
import { SPAWN_REASON_CODES } from '../orchestration/spawn-reason-codes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpawnAgentInput {
    agent_name: string;
    prompt: string;
    workspace_id?: string;
    plan_id?: string;
    compat_mode?: 'legacy' | 'strict';
    prep_config?: {
        scope_boundaries?: {
            files_allowed?: string[];
            directories_allowed?: string[];
            scope_escalation_instruction?: string;
        };
    };
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
    execution?: unknown;
    orchestration?: unknown;
    lane_policy?: unknown;
    run_id?: unknown;
}

interface AgentPrepResult {
    agent_name: string;
    enriched_prompt: string;
    mode: 'context-prep-only';
    compat_mode: 'legacy' | 'strict';
    execution: {
        spawn_executed: false;
    };
    context_sources_partial: boolean;
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
}

interface PrepWarning {
    code: string;
    message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hub agents that ARE allowed to spawn subagents */
const HUB_AGENTS = ['Coordinator', 'Analyst', 'Runner', 'TDDDriver'] as const;

const EXECUTION_CENTRIC_INPUT_KEYS = ['execution', 'orchestration', 'lane_policy', 'run_id'] as const;

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const ANTI_SPAWNING_TEMPLATE = `
You are a spoke agent. Do NOT call runSubagent or memory_spawn_agent to spawn other agents.
Use memory_agent(action: handoff) to recommend the next agent back to the Coordinator.
`;

const GIT_STABILITY_GUARD_TEMPLATE = `
STABILITY GUARDRAIL:
- Do NOT call git changed-files tools (for example: get_changed_files) during startup or routine execution.
- Do NOT run git diff/status scans unless the user explicitly asks for git-state diagnostics.
- Begin with plan/context/file reads first; only use git inspection tools when strictly required by the current task.
`;

function buildScopeBoundariesBlock(boundaries?: SpawnAgentInput['scope_boundaries']): string {
    if (!boundaries) return '';

    const lines: string[] = ['', 'SCOPE BOUNDARIES (strictly enforced):'];

    if (boundaries.files_allowed?.length) {
        lines.push(`- ONLY modify these files: ${boundaries.files_allowed.join(', ')}`);
    }

    if (boundaries.directories_allowed?.length) {
        lines.push(`- ONLY create files in these directories: ${boundaries.directories_allowed.join(', ')}`);
    }

    if (boundaries.scope_escalation_instruction) {
        lines.push(`- ${boundaries.scope_escalation_instruction}`);
    } else {
        lines.push(
            '- If your task requires changes beyond this scope, STOP and use ' +
            'memory_agent(action: handoff) to report back. Do NOT expand scope yourself.'
        );
    }

    lines.push('');
    return lines.join('\n');
}

function isHubAgent(name: string): boolean {
    return HUB_AGENTS.includes(name as typeof HUB_AGENTS[number]);
}

function hasExecutionCentricInputs(input: SpawnAgentInput): boolean {
    return EXECUTION_CENTRIC_INPUT_KEYS.some(key => typeof input[key] !== 'undefined');
}

function resolveCompatMode(input?: string): 'legacy' | 'strict' {
    return input === 'strict' ? 'strict' : 'legacy';
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

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export async function handleSpawnAgentTool(
    options: vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
    token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        const { agent_name, prompt, workspace_id, plan_id } = options.input;
        const warnings: PrepWarning[] = [
            {
                code: SPAWN_REASON_CODES.SPAWN_PREP_ONLY,
                message: 'memory_spawn_agent no longer executes spawns; call runSubagent next.'
            }
        ];

        const compatMode = resolveCompatMode(options.input.compat_mode);
        const scope_boundaries = resolveScopeBoundaries(options.input, warnings);
        const hasDeprecatedExecutionInputs = hasExecutionCentricInputs(options.input);

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

        let contextSourcesPartial = false;
        let workspaceContext: AgentPrepResult['workspace_context'];
        let planContext: AgentPrepResult['plan_context'];

        if (workspace_id && ctx.mcpBridge.isConnected()) {
            try {
                const wsResult = await ctx.mcpBridge.callTool<{
                    success: boolean;
                    data?: { data?: { workspace?: { path?: string } } };
                }>('memory_workspace', { action: 'info', workspace_id });

                if (wsResult?.data?.data?.workspace) {
                    workspaceContext = {
                        workspace_id,
                        workspace_path: wsResult.data.data.workspace.path
                    };
                } else {
                    workspaceContext = { workspace_id };
                }
            } catch {
                contextSourcesPartial = true;
                workspaceContext = { workspace_id };
            }
        }

        if (workspace_id && plan_id && ctx.mcpBridge.isConnected()) {
            try {
                const planResult = await ctx.mcpBridge.callTool<{
                    success: boolean;
                    data?: { data?: { title?: string; current_phase?: string } };
                }>('memory_plan', { action: 'get', workspace_id, plan_id });

                if (planResult?.data?.data) {
                    planContext = {
                        plan_id,
                        title: planResult.data.data.title,
                        current_phase: planResult.data.data.current_phase
                    };
                } else {
                    planContext = { plan_id };
                }
            } catch {
                contextSourcesPartial = true;
                planContext = { plan_id };
            }
        }

        if (contextSourcesPartial) {
            warnings.push({
                code: SPAWN_REASON_CODES.SPAWN_PREP_CONTEXT_PARTIAL,
                message: 'Some workspace or plan context could not be retrieved; returning partial context payload.'
            });
        }

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
                if (planContext.title) {
                    promptParts.push(`Title: ${planContext.title}`);
                }
                if (planContext.current_phase) {
                    promptParts.push(`Phase: ${planContext.current_phase}`);
                }
            }
            promptParts.push('--- END CONTEXT ---\n');
        }

        let scopeBoundariesInjected = false;
        if (scope_boundaries) {
            const boundariesBlock = buildScopeBoundariesBlock(scope_boundaries);
            if (boundariesBlock) {
                promptParts.push(boundariesBlock);
                scopeBoundariesInjected = true;
            }
        }

        let antiSpawningInjected = false;
        if (!isHubAgent(agent_name)) {
            promptParts.push(ANTI_SPAWNING_TEMPLATE);
            antiSpawningInjected = true;
        }

        promptParts.push(GIT_STABILITY_GUARD_TEMPLATE);

        promptParts.push(prompt);

        const enrichedPrompt = promptParts.join('\n');

        const prepResult: AgentPrepResult = {
            agent_name,
            enriched_prompt: enrichedPrompt,
            mode: 'context-prep-only',
            compat_mode: compatMode,
            execution: {
                spawn_executed: false
            },
            context_sources_partial: contextSourcesPartial,
            workspace_context: workspaceContext,
            plan_context: planContext,
            scope_boundaries_injected: scopeBoundariesInjected,
            anti_spawning_injected: antiSpawningInjected
        };

        const output: Record<string, unknown> = {
            accepted: true,
            mode: 'context-prep-only',
            reason_code: SPAWN_REASON_CODES.SPAWN_PREP_ONLY,
            message: 'Spawn context prepared. Call runSubagent next using prep_config.enriched_prompt.',
            prep_config: prepResult,
            warnings,
            deprecation: {
                legacy_alias_supported: compatMode === 'legacy',
                target_removal_phase: 'Phase 3',
                migration_action: 'Switch callers to prep_config + native runSubagent'
            }
        };

        if (compatMode === 'legacy') {
            output.spawn_config = prepResult;
            warnings.push({
                code: SPAWN_REASON_CODES.SPAWN_PREP_LEGACY_ALIAS,
                message: 'spawn_config is deprecated; migrate to prep_config.'
            });
        }

        return successResult({
            ...output,
            note: antiSpawningInjected
                ? 'Anti-spawning instructions were injected for a spoke target.'
                : 'No anti-spawning instructions needed for a hub target.'
        });

    } catch (error) {
        return errorResult(error);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
