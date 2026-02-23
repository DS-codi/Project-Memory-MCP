/**
 * MCP Bridge - Connects VS Code Chat to the shared Project Memory server
 *
 * Uses HTTP calls to the existing dashboard server on port 3001 instead of
 * spawning separate MCP stdio processes. This ensures:
 * - All workspaces share the same server
 * - No port or data conflicts
 * - Works from any workspace (not just Project Memory MCP)
 *
 * Tool routing and handler logic are split into McpToolRouter and
 * McpToolHandlers respectively.
 */

import * as vscode from 'vscode';
import * as http from 'http';
import { resolveWorkspaceIdentity, computeFallbackWorkspaceId } from '../utils/workspace-identity';
import { McpHttpClient } from './McpToolHandlers';
import { routeToolToHttp, getToolDefinitions, ToolDefinition } from './McpToolRouter';

// Re-export types so the public API of this module stays unchanged
export { ToolDefinition } from './McpToolRouter';

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
 * HTTP-based MCP Bridge that connects to the shared dashboard server.
 *
 * Implements {@link McpHttpClient} so that extracted tool handlers and
 * the router can call back into the bridge for HTTP and workspace helpers.
 */
export class McpBridge implements vscode.Disposable, McpHttpClient {
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
        const vsConfig = vscode.workspace.getConfiguration('projectMemoryDev');
        this.serverPort = vsConfig.get<number>('serverPort') || 3001;
    }

    // ==================================================================
    // Connection lifecycle
    // ==================================================================

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

    getServerMode(): McpBridgeConfig['serverMode'] {
        return this.config.serverMode;
    }

    /**
     * Attempt to reconnect to the server
     */
    async reconnect(): Promise<void> {
        this.connected = false;
        this._onConnectionChange.fire(false);
        await this.connect();
    }

    // ==================================================================
    // Public tool API
    // ==================================================================

    /**
     * Call a tool by name - maps MCP tool names to HTTP API calls
     */
    async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
        if (!this.connected) {
            throw new Error('Not connected to Project Memory server');
        }

        this.log(`Calling tool: ${name} with args: ${JSON.stringify(args)}`);

        try {
            const result = await routeToolToHttp<T>(this, name, args);
            this.log(`Tool ${name} result: ${JSON.stringify(result).substring(0, 200)}...`);
            return result;
        } catch (error) {
            this.log(`Tool ${name} error: ${error}`);
            throw error;
        }
    }

    /**
     * List available tools (for compatibility)
     */
    async listTools(): Promise<ToolDefinition[]> {
        return getToolDefinitions();
    }

    // ==================================================================
    // McpHttpClient implementation (used by handlers & router)
    // ==================================================================

    /**
     * Register a workspace - creates workspace entry if needed
     */
    async registerWorkspace(workspacePath: string): Promise<{ workspace: { workspace_id: string } }> {
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

    // ==================================================================
    // Utility
    // ==================================================================

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

    // ==================================================================
    // HTTP helpers (exposed via McpHttpClient interface)
    // ==================================================================

    /**
     * Make an HTTP GET request
     */
    httpGet<T>(path: string): Promise<T> {
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
    httpPost<T>(path: string, body: unknown): Promise<T> {
        return this.httpRequest<T>('POST', path, body);
    }

    /**
     * Make an HTTP PUT request
     */
    httpPut<T>(path: string, body: unknown): Promise<T> {
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
