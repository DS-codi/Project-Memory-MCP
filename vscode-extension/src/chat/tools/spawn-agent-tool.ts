/**
 * Spawn Agent Tool Handler — memory_spawn_agent language model tool
 *
 * Spawns subagents with plan-aware orchestration. Enforces hub-and-spoke model:
 * only hub agents (Coordinator, Analyst, Runner, TDDDriver) can spawn subagents.
 * Spoke agents receive anti-spawning instructions in their enriched prompts.
 *
 * Features:
 * - Validates target agent exists
 * - Injects workspace/plan context into prompts
 * - Enforces anti-spawning rules for spoke agents
 * - Supports scope boundary injection
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpawnAgentInput {
    agent_name: string;
    prompt: string;
    workspace_id?: string;
    plan_id?: string;
    scope_boundaries?: {
        files_allowed?: string[];
        directories_allowed?: string[];
        scope_escalation_instruction?: string;
    };
}

interface AgentSpawnResult {
    agent_name: string;
    enriched_prompt: string;
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hub agents that ARE allowed to spawn subagents */
const HUB_AGENTS = ['Coordinator', 'Analyst', 'Runner', 'TDDDriver'] as const;

/** All known agent types for validation */
const KNOWN_AGENTS = [
    'Coordinator',
    'Researcher',
    'Architect',
    'Executor',
    'Reviewer',
    'Tester',
    'Revisionist',
    'Archivist',
    'Analyst',
    'Brainstorm',
    'Runner',
    'SkillWriter',
    'Worker',
    'TDDDriver',
    'Cognition'
] as const;

type AgentName = typeof KNOWN_AGENTS[number];

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const ANTI_SPAWNING_TEMPLATE = `
You are a spoke agent. Do NOT call runSubagent or memory_spawn_agent to spawn other agents.
Use memory_agent(action: handoff) to recommend the next agent back to the Coordinator.
`;

function buildScopeBoundariesBlock(boundaries: SpawnAgentInput['scope_boundaries']): string {
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isKnownAgent(name: string): name is AgentName {
    return KNOWN_AGENTS.includes(name as AgentName);
}

function isHubAgent(name: string): boolean {
    return HUB_AGENTS.includes(name as typeof HUB_AGENTS[number]);
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export async function handleSpawnAgentTool(
    options: vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        const { agent_name, prompt, workspace_id, plan_id, scope_boundaries } = options.input;

        // 1. Validate required params
        if (!agent_name) {
            return errorResult('agent_name is required');
        }
        if (!prompt) {
            return errorResult('prompt is required');
        }

        // 2. Validate agent_name is a known agent type
        if (!isKnownAgent(agent_name)) {
            return errorResult(
                `Unknown agent: "${agent_name}". ` +
                `Known agents: ${KNOWN_AGENTS.join(', ')}`
            );
        }

        // 3. Build context to inject
        let workspaceContext: AgentSpawnResult['workspace_context'];
        let planContext: AgentSpawnResult['plan_context'];

        // Fetch workspace context via MCP bridge if workspace_id provided
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
                // Non-fatal - proceed without workspace details
                workspaceContext = { workspace_id };
            }
        }

        // Fetch plan context via MCP bridge if plan_id provided
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
                // Non-fatal - proceed without plan details
                planContext = { plan_id };
            }
        }

        // 4. Build enriched prompt
        const promptParts: string[] = [];

        // Add context header
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

        // Add scope boundaries if provided
        let scopeBoundariesInjected = false;
        if (scope_boundaries) {
            const boundariesBlock = buildScopeBoundariesBlock(scope_boundaries);
            if (boundariesBlock) {
                promptParts.push(boundariesBlock);
                scopeBoundariesInjected = true;
            }
        }

        // Add anti-spawning instructions for spoke agents (not hub agents)
        let antiSpawningInjected = false;
        if (!isHubAgent(agent_name)) {
            promptParts.push(ANTI_SPAWNING_TEMPLATE);
            antiSpawningInjected = true;
        }

        // Add the original prompt
        promptParts.push(prompt);

        const enrichedPrompt = promptParts.join('\n');

        // 5. Return spawn configuration
        const result: AgentSpawnResult = {
            agent_name,
            enriched_prompt: enrichedPrompt,
            workspace_context: workspaceContext,
            plan_context: planContext,
            scope_boundaries_injected: scopeBoundariesInjected,
            anti_spawning_injected: antiSpawningInjected
        };

        return successResult({
            message: `Agent "${agent_name}" spawn configuration ready`,
            spawn_config: result,
            note: antiSpawningInjected
                ? 'Anti-spawning instructions were injected (spoke agent).'
                : 'No anti-spawning instructions needed (hub agent).'
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
