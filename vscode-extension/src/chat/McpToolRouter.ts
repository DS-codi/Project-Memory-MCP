/**
 * MCP Tool Router — Maps tool names to handler functions
 *
 * Routes MCP tool calls (both consolidated and legacy names) to their
 * corresponding handler implementations via the McpHttpClient interface.
 * Extracted from McpBridge to isolate routing logic from connection management.
 */

import {
    McpHttpClient,
    handleMemoryWorkspace,
    handleMemoryPlan,
    handleMemorySteps,
    handleMemoryContext,
    handleMemoryAgent
} from './McpToolHandlers';

/**
 * Tool definition describing an available MCP tool.
 */
export interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

/**
 * Route an MCP tool call to the appropriate HTTP API handler.
 *
 * Supports both the consolidated tool names (`memory_workspace`, etc.)
 * and legacy individual tool names (`register_workspace`, `create_plan`, etc.).
 */
export async function routeToolToHttp<T>(
    client: McpHttpClient,
    toolName: string,
    args: Record<string, unknown>
): Promise<T> {
    switch (toolName) {
        // ---- Consolidated tools ----

        case 'memory_workspace':
            return handleMemoryWorkspace(client, args) as Promise<T>;

        case 'memory_plan':
            return handleMemoryPlan(client, args) as Promise<T>;

        case 'memory_steps':
            return handleMemorySteps(client, args) as Promise<T>;

        case 'memory_context':
            return handleMemoryContext(client, args) as Promise<T>;

        case 'memory_agent':
            return handleMemoryAgent(client, args) as Promise<T>;

        // ---- Legacy workspace tools ----

        case 'register_workspace': {
            const registration = await client.registerWorkspace(args.workspace_path as string);
            return { workspace: { workspace_id: registration.workspace.workspace_id } } as T;
        }

        case 'get_workspace_info':
            return handleMemoryWorkspace(client, { action: 'info', workspace_id: args.workspace_id }) as Promise<T>;

        case 'list_workspaces':
            return handleMemoryWorkspace(client, { action: 'list' }) as Promise<T>;

        // ---- Legacy plan tools ----

        case 'create_plan':
            return handleMemoryPlan(client, {
                action: 'create',
                workspace_id: args.workspace_id,
                title: args.title,
                description: args.description,
                category: args.category,
                priority: args.priority,
                goals: args.goals,
                success_criteria: args.success_criteria,
                template: args.template
            }) as Promise<T>;

        case 'get_plan_state':
            return handleMemoryPlan(client, {
                action: 'get',
                workspace_id: args.workspace_id,
                plan_id: args.plan_id
            }) as Promise<T>;

        case 'list_plans':
            return handleMemoryPlan(client, {
                action: 'list',
                workspace_id: args.workspace_id
            }) as Promise<T>;

        // ---- Legacy step tools ----

        case 'update_step':
            return handleMemorySteps(client, {
                action: 'update',
                workspace_id: args.workspace_id,
                plan_id: args.plan_id,
                step_index: args.step_index ?? args.step_id,
                status: args.status,
                notes: args.notes
            }) as Promise<T>;

        case 'append_steps':
            return handleMemorySteps(client, {
                action: 'add',
                workspace_id: args.workspace_id,
                plan_id: args.plan_id,
                steps: args.steps
            }) as Promise<T>;

        case 'add_note':
            return handleMemoryPlan(client, {
                action: 'add_note',
                workspace_id: args.workspace_id,
                plan_id: args.plan_id,
                note: args.note,
                note_type: args.type || 'info'
            }) as Promise<T>;

        // ---- Legacy handoff tools ----

        case 'handoff':
            return handleMemoryAgent(client, {
                action: 'handoff',
                workspace_id: args.workspace_id,
                plan_id: args.plan_id,
                from_agent: args.from_agent,
                to_agent: args.to_agent ?? args.target_agent,
                reason: args.reason,
                summary: args.summary,
                artifacts: args.artifacts
            }) as Promise<T>;

        case 'get_lineage':
            return client.httpGet<T>(`/api/plans/${args.workspace_id}/${args.plan_id}/lineage`);

        // ---- Legacy context tools ----

        case 'store_context':
            return handleMemoryContext(client, {
                action: 'store',
                workspace_id: args.workspace_id,
                plan_id: args.plan_id,
                type: args.type,
                data: args.data
            }) as Promise<T>;

        case 'get_context':
            return handleMemoryContext(client, {
                action: 'get',
                workspace_id: args.workspace_id,
                plan_id: args.plan_id,
                type: args.type
            }) as Promise<T>;

        // ---- Legacy agent tools ----

        case 'initialise_agent':
            return handleMemoryAgent(client, { action: 'init', ...args }) as Promise<T>;

        case 'complete_agent':
            return handleMemoryAgent(client, { action: 'complete', ...args }) as Promise<T>;

        // ---- Search ----

        case 'search':
            return client.httpGet<T>(`/api/search?q=${encodeURIComponent(args.query as string)}`);

        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}

/**
 * Return the list of all supported tool definitions.
 */
export function getToolDefinitions(): ToolDefinition[] {
    return [
        { name: 'memory_workspace', description: 'Workspace management (register, list, info, reindex)' },
        { name: 'memory_plan', description: 'Plan management (list, get, create, archive, add_note)' },
        { name: 'memory_steps', description: 'Step management (update, batch_update, add)' },
        { name: 'memory_context', description: 'Context management (store, get)' },
        { name: 'memory_agent', description: 'Agent lifecycle and handoffs' },
        { name: 'register_workspace', description: 'Register a workspace' },
        { name: 'list_workspaces', description: 'List all workspaces' },
        { name: 'get_workspace_info', description: 'Get workspace details' },
        { name: 'create_plan', description: 'Create a new plan' },
        { name: 'get_plan_state', description: 'Get plan state' },
        { name: 'list_plans', description: 'List plans for a workspace' },
        { name: 'update_step', description: 'Update a plan step' },
        { name: 'append_steps', description: 'Add steps to a plan' },
        { name: 'add_note', description: 'Add a note to a plan' },
        { name: 'handoff', description: 'Hand off between agents' },
        { name: 'get_lineage', description: 'Get handoff lineage' },
        { name: 'store_context', description: 'Store context data' },
        { name: 'get_context', description: 'Get context data' },
        { name: 'initialise_agent', description: 'Initialize an agent session' },
        { name: 'complete_agent', description: 'Complete an agent session' },
        { name: 'search', description: 'Search across workspaces' },
    ];
}
