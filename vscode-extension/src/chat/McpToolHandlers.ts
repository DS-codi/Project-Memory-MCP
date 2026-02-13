/**
 * MCP Tool Handlers — Consolidated tool handler implementations
 *
 * Each handler processes a specific tool's action variants by delegating
 * HTTP calls through the McpHttpClient interface. Extracted from McpBridge
 * to keep each module focused on a single responsibility.
 */

// ======================================================================
// HTTP client interface
// ======================================================================

/**
 * Interface providing HTTP primitives and workspace utilities
 * that tool handlers depend on. Implemented by McpBridge.
 */
export interface McpHttpClient {
    httpGet<T>(path: string): Promise<T>;
    httpPost<T>(path: string, body: unknown): Promise<T>;
    httpPut<T>(path: string, body: unknown): Promise<T>;
    registerWorkspace(workspacePath: string): Promise<{ workspace: { workspace_id: string } }>;
}

// ======================================================================
// Plan normalization helpers
// ======================================================================

/**
 * Normalize a plan object — ensures `plan_id` and step indices are present.
 */
export function normalizePlanState(plan: unknown): unknown {
    if (!plan || typeof plan !== 'object') return plan;
    const normalized = plan as Record<string, unknown>;
    if (!normalized.plan_id && typeof normalized.id === 'string') {
        normalized.plan_id = normalized.id;
    }
    if (Array.isArray(normalized.steps)) {
        normalized.steps = normalized.steps.map((step: Record<string, unknown>, index: number) => ({
            index: typeof step.index === 'number' ? step.index : index,
            ...step
        }));
    }
    return normalized;
}

/**
 * Normalize an array of plan summaries.
 */
export function normalizePlanSummaries(plans: unknown[]): unknown[] {
    return plans.map(plan => normalizePlanState(plan));
}

/**
 * Coerce a value to a numeric step index, or return null.
 */
export function toStepIndex(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

/**
 * Fetch and normalize a plan state from the server.
 */
export async function getPlanState(
    client: McpHttpClient,
    workspaceId: string,
    planId: string
): Promise<Record<string, unknown>> {
    const plan = await client.httpGet<Record<string, unknown>>(`/api/plans/${workspaceId}/${planId}`);
    return normalizePlanState(plan) as Record<string, unknown>;
}

/**
 * Update the steps array for a plan.
 */
export async function updatePlanSteps(
    client: McpHttpClient,
    workspaceId: string,
    planId: string,
    steps: unknown[]
): Promise<unknown> {
    return client.httpPut(`/api/plans/${workspaceId}/${planId}/steps`, { steps });
}

// ======================================================================
// Consolidated tool handlers
// ======================================================================

/**
 * Handle `memory_workspace` actions (register, list, info, reindex).
 */
export async function handleMemoryWorkspace(
    client: McpHttpClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const action = args.action as string | undefined;

    switch (action) {
        case 'register': {
            const registration = await client.registerWorkspace(args.workspace_path as string);
            return { workspace_id: registration.workspace.workspace_id };
        }

        case 'list':
            return client.httpGet('/api/workspaces');

        case 'info':
            return client.httpGet(`/api/workspaces/${args.workspace_id}`);

        case 'reindex':
            throw new Error('Workspace reindex is not available via the HTTP bridge.');

        default:
            throw new Error(`Unknown memory_workspace action: ${action}`);
    }
}

/**
 * Handle `memory_plan` actions (list, get, create, archive, add_note).
 */
export async function handleMemoryPlan(
    client: McpHttpClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const action = args.action as string | undefined;
    const workspaceId = args.workspace_id as string | undefined;
    const planId = args.plan_id as string | undefined;

    if (!workspaceId) {
        throw new Error('workspace_id is required');
    }

    switch (action) {
        case 'list': {
            const plansResult = await client.httpGet<{ plans: unknown[]; total: number }>(
                `/api/plans/workspace/${workspaceId}`
            );
            return {
                active_plans: normalizePlanSummaries(plansResult.plans || []),
                total: plansResult.total
            };
        }

        case 'get': {
            if (!planId) throw new Error('plan_id is required');
            const plan = await client.httpGet(`/api/plans/${workspaceId}/${planId}`);
            return normalizePlanState(plan);
        }

        case 'create': {
            const title = args.title as string | undefined;
            const description = args.description as string | undefined;
            if (!title || !description) {
                throw new Error('title and description are required');
            }

            const template = args.template as string | undefined;
            const payload = {
                title,
                description,
                category: (args.category as string) || 'feature',
                priority: (args.priority as string) || 'medium',
                goals: args.goals,
                success_criteria: args.success_criteria
            };

            const createResult = template
                ? await client.httpPost(`/api/plans/${workspaceId}/template`, { ...payload, template })
                : await client.httpPost(`/api/plans/${workspaceId}`, payload);

            if (createResult && typeof createResult === 'object' && 'plan' in createResult) {
                const resultObj = createResult as { plan?: unknown; plan_id?: string };
                if (resultObj.plan) {
                    return normalizePlanState(resultObj.plan);
                }
            }

            return normalizePlanState(createResult);
        }

        case 'archive': {
            if (!planId) throw new Error('plan_id is required');
            return client.httpPost(`/api/plans/${workspaceId}/${planId}/archive`, {});
        }

        case 'add_note': {
            if (!planId) throw new Error('plan_id is required');
            return client.httpPost(`/api/plans/${workspaceId}/${planId}/notes`, {
                note: args.note,
                type: args.note_type || 'info'
            });
        }

        default:
            throw new Error(`Unknown memory_plan action: ${action}`);
    }
}

/**
 * Handle `memory_steps` actions (update, batch_update, add).
 */
export async function handleMemorySteps(
    client: McpHttpClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const action = args.action as string | undefined;
    const workspaceId = args.workspace_id as string | undefined;
    const planId = args.plan_id as string | undefined;

    if (!workspaceId || !planId) {
        throw new Error('workspace_id and plan_id are required');
    }

    const plan = await getPlanState(client, workspaceId, planId);
    const steps = Array.isArray(plan.steps) ? [...plan.steps] : [];

    switch (action) {
        case 'update': {
            const stepIndex = toStepIndex(args.step_index);
            if (stepIndex === null) {
                throw new Error('step_index is required');
            }
            if (!steps[stepIndex]) {
                throw new Error(`Step index out of range: ${stepIndex}`);
            }
            if (args.status) {
                steps[stepIndex].status = args.status as string;
            }
            if (args.notes) {
                steps[stepIndex].notes = args.notes as string;
            }
            return updatePlanSteps(client, workspaceId, planId, steps);
        }

        case 'batch_update': {
            const updates = args.updates as Array<{ step_index: number; status?: string; notes?: string }> | undefined;
            if (!updates || updates.length === 0) {
                throw new Error('updates array is required');
            }
            for (const update of updates) {
                const index = toStepIndex(update.step_index);
                if (index === null || !steps[index]) {
                    throw new Error(`Step index out of range: ${update.step_index}`);
                }
                if (update.status) {
                    steps[index].status = update.status;
                }
                if (update.notes) {
                    steps[index].notes = update.notes;
                }
            }
            return updatePlanSteps(client, workspaceId, planId, steps);
        }

        case 'add': {
            const newSteps = (args.steps as Array<Record<string, unknown>> | undefined) || [];
            if (newSteps.length === 0) {
                throw new Error('steps array is required');
            }
            const nextIndex = steps.length;
            const appended = newSteps.map((step, idx) => ({
                index: nextIndex + idx,
                phase: step.phase,
                task: step.task,
                status: step.status || 'pending',
                type: step.type,
                assignee: step.assignee,
                requires_validation: step.requires_validation,
                notes: step.notes
            }));
            const updatedSteps = steps.concat(appended);
            return updatePlanSteps(client, workspaceId, planId, updatedSteps);
        }

        default:
            throw new Error(`Unknown memory_steps action: ${action}`);
    }
}

/**
 * Handle `memory_context` actions (store, get, store_initial, list, etc.).
 */
export async function handleMemoryContext(
    client: McpHttpClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const action = args.action as string | undefined;
    const workspaceId = args.workspace_id as string | undefined;
    const planId = args.plan_id as string | undefined;

    if (!workspaceId || !planId) {
        throw new Error('workspace_id and plan_id are required');
    }

    switch (action) {
        case 'store': {
            return client.httpPost(`/api/plans/${workspaceId}/${planId}/context`, {
                type: args.type,
                data: args.data
            });
        }

        case 'get': {
            if (!args.type) {
                throw new Error('type is required for context get');
            }
            return client.httpGet(`/api/plans/${workspaceId}/${planId}/context/${args.type}`);
        }

        case 'store_initial': {
            return client.httpPost(`/api/plans/${workspaceId}/${planId}/context/initial`, {
                user_request: args.user_request,
                files_mentioned: args.files_mentioned,
                file_contents: args.file_contents,
                requirements: args.requirements,
                constraints: args.constraints,
                examples: args.examples,
                conversation_context: args.conversation_context,
                additional_notes: args.additional_notes
            });
        }

        case 'list': {
            const result = await client.httpGet<{ context?: string[] }>(
                `/api/plans/${workspaceId}/${planId}/context`
            );
            return result.context || [];
        }

        case 'list_research': {
            const result = await client.httpGet<{ notes?: string[] }>(
                `/api/plans/${workspaceId}/${planId}/context/research`
            );
            return result.notes || [];
        }

        case 'append_research': {
            return client.httpPost(`/api/plans/${workspaceId}/${planId}/research`, {
                filename: args.filename,
                content: args.content
            });
        }

        case 'batch_store': {
            const items = Array.isArray(args.items) ? args.items : [];
            if (items.length === 0) {
                throw new Error('items array is required for batch_store');
            }
            const stored = [] as Array<{ type?: string; result: unknown }>;
            for (const item of items) {
                const result = await client.httpPost(`/api/plans/${workspaceId}/${planId}/context`, {
                    type: item.type,
                    data: (item as { data?: unknown }).data
                });
                stored.push({ type: item.type, result });
            }
            return { stored };
        }

        case 'generate_instructions':
            throw new Error('generate_instructions is not available via the HTTP bridge.');

        default:
            throw new Error(`Unknown memory_context action: ${action}`);
    }
}

/**
 * Handle `memory_agent` actions (get_briefing, handoff, init, complete).
 */
export async function handleMemoryAgent(
    client: McpHttpClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const action = args.action as string | undefined;
    const workspaceId = args.workspace_id as string | undefined;
    const planId = args.plan_id as string | undefined;

    switch (action) {
        case 'get_briefing': {
            if (!workspaceId || !planId) {
                throw new Error('workspace_id and plan_id are required');
            }
            const plan = await getPlanState(client, workspaceId, planId);
            const lineage = await client.httpGet(`/api/plans/${workspaceId}/${planId}/lineage`);
            return { plan: normalizePlanState(plan), lineage };
        }

        case 'handoff': {
            if (!workspaceId || !planId) {
                throw new Error('workspace_id and plan_id are required');
            }
            const toAgent = (args.to_agent as string | undefined) || (args.target_agent as string | undefined);
            if (!toAgent) {
                throw new Error('to_agent is required');
            }
            const summary = (args.summary as string | undefined) || (args.reason as string | undefined) || 'Handoff requested';
            return client.httpPost(`/api/plans/${workspaceId}/${planId}/handoff`, {
                from_agent: args.from_agent || args.agent_type || 'Unknown',
                to_agent: toAgent,
                reason: args.reason || summary,
                summary,
                artifacts: args.artifacts
            });
        }

        case 'init':
        case 'complete':
            throw new Error('Agent sessions are not available via the HTTP bridge.');

        default:
            throw new Error(`Unknown memory_agent action: ${action}`);
    }
}
