import * as assert from 'assert';
import * as vscode from 'vscode';
import { handleSpawnAgentTool, type SpawnAgentInput } from '../../chat/tools/spawn-agent-tool';

function parseToolResult(result: vscode.LanguageModelToolResult): Record<string, unknown> {
    const part = result.content[0] as unknown as { value?: string; text?: string };
    const raw = part.value ?? part.text ?? '{}';
    return JSON.parse(raw) as Record<string, unknown>;
}

function createToolContext() {
    return {
        mcpBridge: {
            isConnected: () => false
        },
        ensureWorkspace: async () => 'workspace-test',
        setWorkspaceId: () => undefined
    } as unknown as Parameters<typeof handleSpawnAgentTool>[2];
}

function createConnectedToolContext(callNames: string[] = []) {
    return {
        mcpBridge: {
            isConnected: () => true,
            callTool: async (name: string) => {
                callNames.push(name);

                if (name === 'memory_workspace') {
                    return {
                        success: true,
                        data: {
                            data: {
                                workspace: {
                                    path: 'c:/workspace'
                                }
                            }
                        }
                    };
                }

                if (name === 'memory_plan') {
                    return {
                        success: true,
                        data: {
                            data: {
                                title: 'Test Plan',
                                current_phase: 'Phase 3: Verification'
                            }
                        }
                    };
                }

                throw new Error(`Unexpected tool call: ${name}`);
            }
        },
        ensureWorkspace: async () => 'workspace-test',
        setWorkspaceId: () => undefined
    } as unknown as Parameters<typeof handleSpawnAgentTool>[2];
}

suite('SpawnAgentTool Test Suite', () => {
    const token = new vscode.CancellationTokenSource().token;

    test('returns prep-only invariant with legacy alias by default', async () => {
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Executor',
                    prompt: 'Implement feature'
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createToolContext()
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, true);
        assert.strictEqual(parsed.mode, 'context-prep-only');
        assert.ok(parsed.prep_config);
        assert.ok(parsed.spawn_config);

        const prepConfig = parsed.prep_config as Record<string, unknown>;
        const execution = prepConfig.execution as Record<string, unknown>;
        assert.strictEqual(execution.spawn_executed, false);
    });

    test('strict mode omits deprecated spawn_config alias', async () => {
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Executor',
                    prompt: 'Implement feature',
                    compat_mode: 'strict'
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createToolContext()
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, true);
        assert.ok(parsed.prep_config);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed, 'spawn_config'), false);
    });

    test('strict mode rejects execution-centric legacy inputs', async () => {
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Executor',
                    prompt: 'Implement feature',
                    compat_mode: 'strict',
                    execution: { spawn_executed: true }
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createToolContext()
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, false);
        const error = String(parsed.error ?? '');
        assert.ok(error.includes('compat_mode "strict"'));
    });

    test('legacy mode ignores execution-centric inputs with warning', async () => {
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Executor',
                    prompt: 'Implement feature',
                    execution: { spawn_executed: true }
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createToolContext()
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, true);

        const warnings = parsed.warnings as Array<{ code: string }>;
        const warningCodes = warnings.map(w => w.code);
        assert.ok(warningCodes.includes('SPAWN_PREP_DEPRECATED_INPUT_IGNORED'));
        assert.ok(warningCodes.includes('SPAWN_PREP_ONLY'));
    });

    test('legacy alias shim maps input spawn_config scope boundaries into prep_config output', async () => {
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Executor',
                    prompt: 'Implement feature',
                    spawn_config: {
                        scope_boundaries: {
                            files_allowed: ['src/a.ts'],
                            directories_allowed: ['src/test'],
                            scope_escalation_instruction: 'Escalate if out of scope.'
                        }
                    }
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createToolContext()
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, true);

        const prepConfig = parsed.prep_config as Record<string, unknown>;
        const enrichedPrompt = String(prepConfig.enriched_prompt ?? '');
        assert.ok(enrichedPrompt.includes('SCOPE BOUNDARIES (strictly enforced):'));
        assert.ok(enrichedPrompt.includes('ONLY modify these files: src/a.ts'));

        const warnings = parsed.warnings as Array<{ code: string; message: string }>;
        const legacyAliasWarnings = warnings.filter(w => w.code === 'SPAWN_PREP_LEGACY_ALIAS');
        assert.ok(legacyAliasWarnings.length >= 1);
    });

    test('strict compatibility includes prep-only warning envelope and deprecation metadata', async () => {
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Executor',
                    prompt: 'Implement feature',
                    compat_mode: 'strict'
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createToolContext()
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, true);

        const deprecation = parsed.deprecation as Record<string, unknown>;
        assert.strictEqual(deprecation.legacy_alias_supported, false);

        const warnings = parsed.warnings as Array<{ code: string }>;
        const warningCodes = warnings.map(w => w.code);
        assert.ok(warningCodes.includes('SPAWN_PREP_ONLY'));
    });

    test('preparation path never attempts custom spawn execution', async () => {
        const callNames: string[] = [];
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Executor',
                    prompt: 'Implement feature',
                    workspace_id: 'ws_123',
                    plan_id: 'plan_123'
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createConnectedToolContext(callNames)
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, true);

        const prepConfig = parsed.prep_config as Record<string, unknown>;
        const execution = prepConfig.execution as Record<string, unknown>;
        assert.strictEqual(execution.spawn_executed, false);

        assert.ok(callNames.includes('memory_workspace'));
        assert.ok(callNames.includes('memory_plan'));
        assert.strictEqual(callNames.includes('memory_agent'), false);

        const message = String(parsed.message ?? '');
        assert.strictEqual(message.includes('Read changed files in the active git repository'), false);
    });

    test('injects git stability guardrail into enriched prompt', async () => {
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Executor',
                    prompt: 'Implement feature'
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createToolContext()
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, true);

        const prepConfig = parsed.prep_config as Record<string, unknown>;
        const enrichedPrompt = String(prepConfig.enriched_prompt ?? '');
        assert.ok(enrichedPrompt.includes('STABILITY GUARDRAIL:'));
        assert.ok(enrichedPrompt.includes('Do NOT call git changed-files tools'));
        assert.ok(enrichedPrompt.includes('Do NOT run git diff/status scans unless the user explicitly asks'));
    });

    test('injects git stability guardrail for hub targets too', async () => {
        const result = await handleSpawnAgentTool(
            {
                input: {
                    agent_name: 'Coordinator',
                    prompt: 'Orchestrate next step'
                } as SpawnAgentInput
            } as vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
            token,
            createToolContext()
        );

        const parsed = parseToolResult(result);
        assert.strictEqual(parsed.success, true);

        const prepConfig = parsed.prep_config as Record<string, unknown>;
        const enrichedPrompt = String(prepConfig.enriched_prompt ?? '');
        assert.ok(enrichedPrompt.includes('STABILITY GUARDRAIL:'));
        assert.ok(enrichedPrompt.includes('Do NOT call git changed-files tools'));
    });
});
