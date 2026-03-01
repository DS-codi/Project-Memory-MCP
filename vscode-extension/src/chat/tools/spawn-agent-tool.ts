import * as vscode from 'vscode';

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
    session_id?: string;
    status_filter?: 'active' | 'stopping' | 'completed' | 'all';
    execution?: unknown;
    orchestration?: unknown;
    lane_policy?: unknown;
    run_id?: unknown;
}

interface ToolContext {
    mcpBridge: {
        isConnected: () => boolean;
        callTool: <T = unknown>(name: string, params?: Record<string, unknown>) => Promise<T>;
    };
    ensureWorkspace: () => Promise<string>;
    setWorkspaceId: (id: string) => void;
}

interface PrepWarning {
    code: string;
    message: string;
}

const SPOKE_AGENTS = new Set(['Executor', 'Reviewer', 'Tester', 'Worker', 'Researcher', 'Architect', 'Revisionist', 'Brainstorm', 'Archivist', 'Cognition', 'SkillWriter', 'Builder', 'Migrator', 'PromptAnalyst']);

const EXECUTION_CENTRIC_INPUT_KEYS = ['execution', 'orchestration', 'lane_policy', 'run_id'] as const;

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

function hasExecutionCentricInputs(input: SpawnAgentInput): boolean {
    return EXECUTION_CENTRIC_INPUT_KEYS.some((key) => typeof input[key] !== 'undefined');
}

function resolveScopeBoundaries(input: SpawnAgentInput, warnings: PrepWarning[]) {
    if (input.prep_config?.scope_boundaries) {
        return input.prep_config.scope_boundaries;
    }

    if (input.spawn_config?.scope_boundaries) {
        warnings.push({
            code: 'SPAWN_PREP_LEGACY_ALIAS',
            message: 'Input spawn_config is deprecated; migrate to prep_config.'
        });
        return input.spawn_config.scope_boundaries;
    }

    if (input.scope_boundaries) {
        warnings.push({
            code: 'SPAWN_PREP_LEGACY_ALIAS',
            message: 'Top-level scope_boundaries is deprecated; nest under prep_config.scope_boundaries.'
        });
        return input.scope_boundaries;
    }

    return undefined;
}

function buildScopeBlock(scopeBoundaries?: {
    files_allowed?: string[];
    directories_allowed?: string[];
    scope_escalation_instruction?: string;
}): string {
    if (!scopeBoundaries) {
        return '';
    }

    const filesAllowed = (scopeBoundaries.files_allowed && scopeBoundaries.files_allowed.length > 0)
        ? scopeBoundaries.files_allowed.join(', ')
        : '(none specified)';
    const directoriesAllowed = (scopeBoundaries.directories_allowed && scopeBoundaries.directories_allowed.length > 0)
        ? scopeBoundaries.directories_allowed.join(', ')
        : '(none specified)';
    const escalation = scopeBoundaries.scope_escalation_instruction || 'Stop and handoff if additional scope is required.';

    return `

SCOPE BOUNDARIES (strictly enforced):
- ONLY modify these files: ${filesAllowed}
- ONLY create files in these directories: ${directoriesAllowed}
- Do NOT refactor, rename, or restructure code outside your scope
- Do NOT install new dependencies without explicit instruction
- Do NOT modify configuration files unless specifically tasked

SCOPE ESCALATION:
${escalation}`;
}

function buildAntiSpawningBlock(agentName: string): string {
    if (!SPOKE_AGENTS.has(agentName)) {
        return '';
    }

    return `

ANTI-SPAWNING RULE:
You are a spoke agent. Do NOT call runSubagent to spawn other agents.
Use memory_agent(action: handoff) to recommend the next agent back to the hub.`;
}

function buildGuardrailBlock(): string {
    return `

STABILITY GUARDRAIL:
- Do NOT call git changed-files tools
- Do NOT run git diff/status scans unless the user explicitly asks`;
}

function buildEnrichedPrompt(agentName: string, basePrompt: string, scopeBlock: string): string {
    return `${basePrompt}${scopeBlock}${buildAntiSpawningBlock(agentName)}${buildGuardrailBlock()}`;
}

async function callWorkspaceAndPlanIfConnected(input: SpawnAgentInput, ctx: ToolContext): Promise<void> {
    if (!ctx.mcpBridge.isConnected()) {
        return;
    }

    if (input.workspace_id) {
        await ctx.mcpBridge.callTool('memory_workspace', {
            action: 'info',
            workspace_id: input.workspace_id,
        });
    }

    if (input.workspace_id && input.plan_id) {
        await ctx.mcpBridge.callTool('memory_plan', {
            action: 'get',
            workspace_id: input.workspace_id,
            plan_id: input.plan_id,
        });
    }
}

async function handlePrep(
    input: SpawnAgentInput,
    token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    const warnings: PrepWarning[] = [
        {
            code: 'SPAWN_PREP_ONLY',
            message: 'memory_spawn_agent is prep-only; call runSubagent next.'
        }
    ];

    if (!input.agent_name) {
        return errorResult('agent_name is required');
    }
    if (!input.prompt) {
        return errorResult('prompt is required');
    }

    const compatMode = input.compat_mode === 'strict' ? 'strict' : 'legacy';
    const hasDeprecatedExecutionInputs = hasExecutionCentricInputs(input);

    if (compatMode === 'strict' && hasDeprecatedExecutionInputs) {
        return errorResult('compat_mode "strict" does not allow execution-centric inputs (execution, orchestration, lane_policy, run_id).');
    }

    if (hasDeprecatedExecutionInputs) {
        warnings.push({
            code: 'SPAWN_PREP_DEPRECATED_INPUT_IGNORED',
            message: 'Deprecated execution-centric inputs were ignored.'
        });
    }

    if (token.isCancellationRequested) {
        return successResult({
            accepted: false,
            reason_code: 'SPAWN_CANCELLED_TOKEN',
            message: 'Spawn preparation cancelled before execution.'
        });
    }

    const scopeBoundaries = resolveScopeBoundaries(input, warnings);
    const scopeBlock = buildScopeBlock(scopeBoundaries);
    const enrichedPrompt = buildEnrichedPrompt(input.agent_name, input.prompt, scopeBlock);

    await callWorkspaceAndPlanIfConnected(input, ctx);

    const prepConfig: Record<string, unknown> = {
        agent_name: input.agent_name,
        session_id: `prep_${Date.now()}`,
        enriched_prompt: enrichedPrompt,
        parent_session_id: input.parent_session_id,
        workspace_id: input.workspace_id,
        plan_id: input.plan_id,
        anti_spawning_injected: SPOKE_AGENTS.has(input.agent_name),
        prep_config: scopeBoundaries ? { scope_boundaries: scopeBoundaries } : {},
        execution: {
            spawn_executed: false,
        },
    };

    const output: Record<string, unknown> = {
        accepted: true,
        mode: 'context-prep-only',
        reason_code: 'SPAWN_PREP_ONLY',
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

    return successResult(output);
}

async function handleListSessions(input: SpawnAgentInput, ctx: ToolContext): Promise<vscode.LanguageModelToolResult> {
    if (!ctx.mcpBridge.isConnected()) {
        return successResult({ data: { sessions: [] } });
    }

    const result = await ctx.mcpBridge.callTool('memory_session', {
        action: 'list_sessions',
        workspace_id: input.workspace_id,
        plan_id: input.plan_id,
        status_filter: input.status_filter,
    });

    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result ?? { success: false, error: 'No response' }, null, 2))
    ]);
}

async function handleGetSession(input: SpawnAgentInput, ctx: ToolContext): Promise<vscode.LanguageModelToolResult> {
    if (!ctx.mcpBridge.isConnected()) {
        return successResult({ data: null });
    }

    const result = await ctx.mcpBridge.callTool('memory_session', {
        action: 'get_session',
        workspace_id: input.workspace_id,
        plan_id: input.plan_id,
        session_id: input.session_id,
    });

    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result ?? { success: false, error: 'No response' }, null, 2))
    ]);
}

export async function handleSpawnAgentTool(
    options: vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
    token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
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