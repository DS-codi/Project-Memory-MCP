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
import * as crypto from 'crypto';

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
            // Workspace tools
            case 'register_workspace':
                return this.registerWorkspace(args.workspace_path as string) as Promise<T>;
            
            case 'get_workspace_info':
                return this.httpGet<T>(`/api/workspaces/${args.workspace_id}`);
            
            case 'list_workspaces':
                return this.httpGet<T>('/api/workspaces');

            // Plan tools  
            case 'create_plan':
                return this.httpPost<T>(`/api/plans/${args.workspace_id}`, {
                    title: args.title,
                    description: args.description,
                    category: args.category || 'feature',
                    priority: args.priority || 'medium'
                });

            case 'get_plan_state':
                return this.httpGet<T>(`/api/plans/${args.workspace_id}/${args.plan_id}`);

            case 'list_plans':
                const plansResult = await this.httpGet<{ plans: unknown[]; total: number }>(
                    `/api/plans/workspace/${args.workspace_id}`
                );
                // Return in expected format
                return { active_plans: plansResult.plans, total: plansResult.total } as T;

            case 'update_step':
                return this.httpPut<T>(
                    `/api/plans/${args.workspace_id}/${args.plan_id}/steps/${args.step_id}`,
                    { status: args.status, notes: args.notes }
                );

            case 'append_steps':
                return this.httpPost<T>(
                    `/api/plans/${args.workspace_id}/${args.plan_id}/steps`,
                    { steps: args.steps }
                );

            case 'add_note':
                return this.httpPost<T>(
                    `/api/plans/${args.workspace_id}/${args.plan_id}/notes`,
                    { note: args.note, type: args.type || 'info' }
                );

            // Handoff tools
            case 'handoff':
                return this.httpPost<T>(
                    `/api/plans/${args.workspace_id}/${args.plan_id}/handoff`,
                    { 
                        from_agent: args.from_agent,
                        to_agent: args.to_agent,
                        summary: args.summary,
                        artifacts: args.artifacts
                    }
                );

            case 'get_lineage':
                return this.httpGet<T>(`/api/plans/${args.workspace_id}/${args.plan_id}/lineage`);

            // Context tools
            case 'store_context':
                return this.httpPost<T>(
                    `/api/plans/${args.workspace_id}/${args.plan_id}/context`,
                    { type: args.type, data: args.data }
                );

            case 'get_context':
                return this.httpGet<T>(
                    `/api/plans/${args.workspace_id}/${args.plan_id}/context/${args.type}`
                );

            // Agent tools
            case 'initialise_agent':
                return this.httpPost<T>('/api/agents/initialise', args);

            case 'complete_agent':
                return this.httpPost<T>('/api/agents/complete', args);

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
        // First check if workspace exists
        const workspaces = await this.httpGet<{ workspaces: Array<{ id: string; path: string }> }>('/api/workspaces');
        
        // Find by path
        const existing = workspaces.workspaces.find(w => 
            w.path?.toLowerCase() === workspacePath.toLowerCase()
        );
        
        if (existing) {
            return { workspace: { workspace_id: existing.id } };
        }

        // Try to create/register the workspace
        // The dashboard server auto-discovers workspaces, so we just return based on path
        const workspaceId = this.pathToWorkspaceId(workspacePath);
        return { workspace: { workspace_id: workspaceId } };
    }

    /**
     * Convert a workspace path to a workspace ID
     */
    private pathToWorkspaceId(workspacePath: string): string {
        const folderName = workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'workspace';
        const hash = crypto.createHash('sha256').update(workspacePath).digest('hex').substring(0, 12);
        return `${folderName}-${hash}`;
    }

    /**
     * List available tools (for compatibility)
     */
    async listTools(): Promise<ToolDefinition[]> {
        // Return a list of supported tools
        return [
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
