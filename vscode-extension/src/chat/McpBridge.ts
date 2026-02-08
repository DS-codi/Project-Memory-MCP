/**
 * MCP Bridge - Connects VS Code Chat to the shared Project Memory server
 * 
 * Uses HTTP calls to the existing dashboard server on port 3001 instead of
 * spawning separate MCP stdio processes. This ensures:
 * - All workspaces share the same server
 * - No port or data conflicts
 * - Works from any workspace (not just Project Memory MCP)
 */

import * as vscode from 'vscode';
import * as http from 'http';
import { resolveWorkspaceIdentity, computeFallbackWorkspaceId } from '../utils/workspace-identity';

/**
 * Tool definition (for compatibility with existing interfaces)
 */
export interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

/**
 * MCP Bridge configuration
 */
export interface McpBridgeConfig {
    serverMode: 'bundled' | 'podman' | 'external';
    podmanImage?: string;
    externalServerPath?: string;
    dataRoot?: string;
}

/**
 * HTTP-based MCP Bridge that connects to the shared dashboard server
 */
export class McpBridge implements vscode.Disposable {
    private connected = false;
    private serverPort: number = 3001;
    private serverHost: string = 'localhost';
    private outputChannel: vscode.OutputChannel;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;
    private reconnectDelay = 1000;
    private config: McpBridgeConfig;

    private readonly _onConnectionChange = new vscode.EventEmitter<boolean>();
    public readonly onConnectionChange = this._onConnectionChange.event;

    constructor(config: McpBridgeConfig) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel('Project Memory MCP Bridge');
        
        // Get port from settings if available
        const vsConfig = vscode.workspace.getConfiguration('projectMemory');
        this.serverPort = vsConfig.get<number>('serverPort') || 3001;
    }

    /**
     * Connect to the shared server (verify it's running)
     */
    async connect(): Promise<void> {
        if (this.connected) {
            this.log('Already connected');
            return;
        }

        try {
            // Check if server is running via health endpoint
            const health = await this.httpGet<{ status: string; dataRoot: string }>('/api/health');
            if (health.status === 'ok') {
                this.connected = true;
                this.reconnectAttempts = 0;
                this._onConnectionChange.fire(true);
                this.log(`Connected to shared server at localhost:${this.serverPort}`);
                this.log(`Data root: ${health.dataRoot}`);
            } else {
                throw new Error('Server health check failed');
            }
        } catch (error) {
            this.log(`Connection failed: ${error}`);
            this.connected = false;
            this._onConnectionChange.fire(false);
            throw new Error(
                'Could not connect to Project Memory server.\n' +
                'Please ensure the server is running (check PM Server status bar item).'
            );
        }
    }

    /**
     * Disconnect from the server
     */
    async disconnect(): Promise<void> {
        if (!this.connected) {
            return;
        }
        this.connected = false;
        this._onConnectionChange.fire(false);
        this.log('Disconnected from server');
    }

    /**
     * Check if connected to the server
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Attempt to reconnect to the server
     */
    async reconnect(): Promise<void> {
        this.connected = false;
        this._onConnectionChange.fire(false);
        await this.connect();
    }

    /**
     * Call a tool by name - maps MCP tool names to HTTP API calls
     */
    async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
        if (!this.connected) {
            throw new Error('Not connected to Project Memory server');
        }

        this.log(`Calling tool: ${name} with args: ${JSON.stringify(args)}`);

        try {
            const result = await this.mapToolToHttp<T>(name, args);
            this.log(`Tool ${name} result: ${JSON.stringify(result).substring(0, 200)}...`);
            return result;
        } catch (error) {
            this.log(`Tool ${name} error: ${error}`);
            throw error;
        }
    }

    /**
     * Map MCP tool names to HTTP API calls
     */
    private async mapToolToHttp<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
        switch (toolName) {
            // Consolidated tools
            case 'memory_workspace':
                return this.handleMemoryWorkspace(args) as Promise<T>;

            case 'memory_plan':
                return this.handleMemoryPlan(args) as Promise<T>;

            case 'memory_steps':
                return this.handleMemorySteps(args) as Promise<T>;

            case 'memory_context':
                return this.handleMemoryContext(args) as Promise<T>;

            case 'memory_agent':
                return this.handleMemoryAgent(args) as Promise<T>;

            // Workspace tools
            case 'register_workspace':
                const registration = await this.registerWorkspace(args.workspace_path as string);
                return { workspace: { workspace_id: registration.workspace.workspace_id } } as T;
            
            case 'get_workspace_info':
                return this.handleMemoryWorkspace({ action: 'info', workspace_id: args.workspace_id }) as Promise<T>;
            
            case 'list_workspaces':
                return this.handleMemoryWorkspace({ action: 'list' }) as Promise<T>;

            // Plan tools  
            case 'create_plan':
                return this.handleMemoryPlan({
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
                return this.handleMemoryPlan({
                    action: 'get',
                    workspace_id: args.workspace_id,
                    plan_id: args.plan_id
                }) as Promise<T>;

            case 'list_plans':
                return this.handleMemoryPlan({
                    action: 'list',
                    workspace_id: args.workspace_id
                }) as Promise<T>;

            case 'update_step':
                return this.handleMemorySteps({
                    action: 'update',
                    workspace_id: args.workspace_id,
                    plan_id: args.plan_id,
                    step_index: args.step_index ?? args.step_id,
                    status: args.status,
                    notes: args.notes
                }) as Promise<T>;

            case 'append_steps':
                return this.handleMemorySteps({
                    action: 'add',
                    workspace_id: args.workspace_id,
                    plan_id: args.plan_id,
                    steps: args.steps
                }) as Promise<T>;

            case 'add_note':
                return this.handleMemoryPlan({
                    action: 'add_note',
                    workspace_id: args.workspace_id,
                    plan_id: args.plan_id,
                    note: args.note,
                    note_type: args.type || 'info'
                }) as Promise<T>;

            // Handoff tools
            case 'handoff':
                return this.handleMemoryAgent({
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
                return this.httpGet<T>(`/api/plans/${args.workspace_id}/${args.plan_id}/lineage`);

            // Context tools
            case 'store_context':
                return this.handleMemoryContext({
                    action: 'store',
                    workspace_id: args.workspace_id,
                    plan_id: args.plan_id,
                    type: args.type,
                    data: args.data
                }) as Promise<T>;

            case 'get_context':
                return this.handleMemoryContext({
                    action: 'get',
                    workspace_id: args.workspace_id,
                    plan_id: args.plan_id,
                    type: args.type
                }) as Promise<T>;

            // Agent tools
            case 'initialise_agent':
                return this.handleMemoryAgent({ action: 'init', ...args }) as Promise<T>;

            case 'complete_agent':
                return this.handleMemoryAgent({ action: 'complete', ...args }) as Promise<T>;

            // Search
            case 'search':
                return this.httpGet<T>(`/api/search?q=${encodeURIComponent(args.query as string)}`);

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Register a workspace - creates workspace entry if needed
     */
    private async registerWorkspace(workspacePath: string): Promise<{ workspace: { workspace_id: string } }> {
        // Check identity file first to get the correct project path
        const identity = resolveWorkspaceIdentity(workspacePath);
        const effectivePath = identity ? identity.projectPath : workspacePath;

        // First check if workspace exists
        const workspaces = await this.httpGet<{ workspaces: Array<{ id: string; path: string }> }>('/api/workspaces');
        
        // Find by path
        const existing = workspaces.workspaces.find(w => 
            w.path?.toLowerCase() === effectivePath.toLowerCase()
        );
        
        if (existing) {
            return { workspace: { workspace_id: existing.id } };
        }

        // Try to create/register the workspace
        // The dashboard server auto-discovers workspaces, so we just return based on path
        const workspaceId = identity ? identity.workspaceId : computeFallbackWorkspaceId(effectivePath);
        return { workspace: { workspace_id: workspaceId } };
    }

    /**
     * Convert a workspace path to a workspace ID
     */
    private pathToWorkspaceId(workspacePath: string): string {
        const identity = resolveWorkspaceIdentity(workspacePath);
        if (identity) {
            return identity.workspaceId;
        }
        return computeFallbackWorkspaceId(workspacePath);
    }

    /**
     * List available tools (for compatibility)
     */
    async listTools(): Promise<ToolDefinition[]> {
        // Return a list of supported tools
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

    // ======================================================================
    // Consolidated tool handlers
    // ======================================================================

    private async handleMemoryWorkspace(args: Record<string, unknown>): Promise<unknown> {
        const action = args.action as string | undefined;

        switch (action) {
            case 'register': {
                const registration = await this.registerWorkspace(args.workspace_path as string);
                return { workspace_id: registration.workspace.workspace_id };
            }

            case 'list':
                return this.httpGet('/api/workspaces');

            case 'info':
                return this.httpGet(`/api/workspaces/${args.workspace_id}`);

            case 'reindex':
                throw new Error('Workspace reindex is not available via the HTTP bridge.');

            default:
                throw new Error(`Unknown memory_workspace action: ${action}`);
        }
    }

    private async handleMemoryPlan(args: Record<string, unknown>): Promise<unknown> {
        const action = args.action as string | undefined;
        const workspaceId = args.workspace_id as string | undefined;
        const planId = args.plan_id as string | undefined;

        if (!workspaceId) {
            throw new Error('workspace_id is required');
        }

        switch (action) {
            case 'list': {
                const plansResult = await this.httpGet<{ plans: unknown[]; total: number }>(
                    `/api/plans/workspace/${workspaceId}`
                );
                return {
                    active_plans: this.normalizePlanSummaries(plansResult.plans || []),
                    total: plansResult.total
                };
            }

            case 'get': {
                if (!planId) throw new Error('plan_id is required');
                const plan = await this.httpGet(`/api/plans/${workspaceId}/${planId}`);
                return this.normalizePlanState(plan);
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
                    ? await this.httpPost(`/api/plans/${workspaceId}/template`, { ...payload, template })
                    : await this.httpPost(`/api/plans/${workspaceId}`, payload);

                if (createResult && typeof createResult === 'object' && 'plan' in createResult) {
                    const resultObj = createResult as { plan?: unknown; plan_id?: string };
                    if (resultObj.plan) {
                        return this.normalizePlanState(resultObj.plan);
                    }
                }

                return this.normalizePlanState(createResult);
            }

            case 'archive': {
                if (!planId) throw new Error('plan_id is required');
                return this.httpPost(`/api/plans/${workspaceId}/${planId}/archive`, {});
            }

            case 'add_note': {
                if (!planId) throw new Error('plan_id is required');
                return this.httpPost(`/api/plans/${workspaceId}/${planId}/notes`, {
                    note: args.note,
                    type: args.note_type || 'info'
                });
            }

            default:
                throw new Error(`Unknown memory_plan action: ${action}`);
        }
    }

    private async handleMemorySteps(args: Record<string, unknown>): Promise<unknown> {
        const action = args.action as string | undefined;
        const workspaceId = args.workspace_id as string | undefined;
        const planId = args.plan_id as string | undefined;

        if (!workspaceId || !planId) {
            throw new Error('workspace_id and plan_id are required');
        }

        const plan = await this.getPlanState(workspaceId, planId);
        const steps = Array.isArray(plan.steps) ? [...plan.steps] : [];

        switch (action) {
            case 'update': {
                const stepIndex = this.toStepIndex(args.step_index);
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
                return this.updatePlanSteps(workspaceId, planId, steps);
            }

            case 'batch_update': {
                const updates = args.updates as Array<{ step_index: number; status?: string; notes?: string }> | undefined;
                if (!updates || updates.length === 0) {
                    throw new Error('updates array is required');
                }
                for (const update of updates) {
                    const index = this.toStepIndex(update.step_index);
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
                return this.updatePlanSteps(workspaceId, planId, steps);
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
                return this.updatePlanSteps(workspaceId, planId, updatedSteps);
            }

            default:
                throw new Error(`Unknown memory_steps action: ${action}`);
        }
    }

    private async handleMemoryContext(args: Record<string, unknown>): Promise<unknown> {
        const action = args.action as string | undefined;
        const workspaceId = args.workspace_id as string | undefined;
        const planId = args.plan_id as string | undefined;

        if (!workspaceId || !planId) {
            throw new Error('workspace_id and plan_id are required');
        }

        switch (action) {
            case 'store': {
                return this.httpPost(`/api/plans/${workspaceId}/${planId}/context`, {
                    type: args.type,
                    data: args.data
                });
            }

            case 'get': {
                if (!args.type) {
                    throw new Error('type is required for context get');
                }
                return this.httpGet(`/api/plans/${workspaceId}/${planId}/context/${args.type}`);
            }

            case 'store_initial': {
                return this.httpPost(`/api/plans/${workspaceId}/${planId}/context/initial`, {
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
                const result = await this.httpGet<{ context?: string[] }>(
                    `/api/plans/${workspaceId}/${planId}/context`
                );
                return result.context || [];
            }

            case 'list_research': {
                const result = await this.httpGet<{ notes?: string[] }>(
                    `/api/plans/${workspaceId}/${planId}/context/research`
                );
                return result.notes || [];
            }

            case 'append_research': {
                return this.httpPost(`/api/plans/${workspaceId}/${planId}/research`, {
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
                    const result = await this.httpPost(`/api/plans/${workspaceId}/${planId}/context`, {
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

    private async handleMemoryAgent(args: Record<string, unknown>): Promise<unknown> {
        const action = args.action as string | undefined;
        const workspaceId = args.workspace_id as string | undefined;
        const planId = args.plan_id as string | undefined;

        switch (action) {
            case 'get_briefing': {
                if (!workspaceId || !planId) {
                    throw new Error('workspace_id and plan_id are required');
                }
                const plan = await this.getPlanState(workspaceId, planId);
                const lineage = await this.httpGet(`/api/plans/${workspaceId}/${planId}/lineage`);
                return { plan: this.normalizePlanState(plan), lineage };
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
                return this.httpPost(`/api/plans/${workspaceId}/${planId}/handoff`, {
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

    private async getPlanState(workspaceId: string, planId: string): Promise<Record<string, unknown>> {
        const plan = await this.httpGet<Record<string, unknown>>(`/api/plans/${workspaceId}/${planId}`);
        return this.normalizePlanState(plan) as Record<string, unknown>;
    }

    private async updatePlanSteps(workspaceId: string, planId: string, steps: unknown[]): Promise<unknown> {
        return this.httpPut(`/api/plans/${workspaceId}/${planId}/steps`, { steps });
    }

    private normalizePlanState(plan: unknown): unknown {
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

    private normalizePlanSummaries(plans: unknown[]): unknown[] {
        return plans.map(plan => this.normalizePlanState(plan));
    }

    private toStepIndex(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return null;
    }

    /**
     * Show logs output channel
     */
    showLogs(): void {
        this.outputChannel.show();
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.disconnect();
        this._onConnectionChange.dispose();
        this.outputChannel.dispose();
    }

    /**
     * Log message to output channel
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
        console.log(`[MCP Bridge] ${message}`);
    }

    // ==========================================================================
    // HTTP Helpers
    // ==========================================================================

    /**
     * Make an HTTP GET request
     */
    private httpGet<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const url = `http://${this.serverHost}:${this.serverPort}${path}`;
            this.log(`GET ${url}`);

            const req = http.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 400) {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            return;
                        }
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    /**
     * Make an HTTP POST request
     */
    private httpPost<T>(path: string, body: unknown): Promise<T> {
        return this.httpRequest<T>('POST', path, body);
    }

    /**
     * Make an HTTP PUT request
     */
    private httpPut<T>(path: string, body: unknown): Promise<T> {
        return this.httpRequest<T>('PUT', path, body);
    }

    /**
     * Make an HTTP request with body
     */
    private httpRequest<T>(method: string, path: string, body: unknown): Promise<T> {
        return new Promise((resolve, reject) => {
            const jsonBody = JSON.stringify(body);
            const url = `http://${this.serverHost}:${this.serverPort}${path}`;
            this.log(`${method} ${url}`);

            const options = {
                hostname: this.serverHost,
                port: this.serverPort,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(jsonBody)
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 400) {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            return;
                        }
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(jsonBody);
            req.end();
        });
    }
}
