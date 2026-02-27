/**
 * Container Detection
 * 
 * Probes for a running Project Memory container on expected ports.
 * Used by ServerManager to decide whether to spawn local processes
 * or connect to a containerized backend.
 * 
 * @see Phase 6C of infrastructure-improvement-plan.md
 */

import * as http from 'http';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContainerMode = 'auto' | 'local' | 'container';

export interface ContainerStatus {
    /** Whether a container was detected and is healthy */
    detected: boolean;
    /** MCP server health (port 3000 by default) */
    mcpHealthy: boolean;
    /** Dashboard API health (port 3001 by default) */
    dashboardHealthy: boolean;
    /** MCP server info from /health (if available) */
    mcpInfo?: Record<string, unknown>;
    /** Dashboard info from /api/health (if available) */
    dashboardInfo?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Health probes
// ---------------------------------------------------------------------------

/**
 * Probe a URL and return parsed JSON response, or null on failure.
 */
function probeEndpoint(url: string, timeoutMs = 3000): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            if (res.statusCode !== 200) {
                resolve(null);
                res.resume();
                return;
            }

            let body = '';
            res.on('data', (chunk) => { body += chunk.toString(); });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data?.status === 'ok') {
                        resolve(data);
                    } else {
                        resolve(null);
                    }
                } catch {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve(null);
        });
    });
}

/**
 * Probe for a running container on the expected ports.
 * 
 * Checks both the MCP server (/health) and Dashboard API (/api/health).
 * The container is considered "detected" if at least the MCP health check passes.
 */
export async function probeContainer(mcpPort = 3000, dashboardPort = 3001): Promise<ContainerStatus> {
    const [mcpInfo, dashboardInfo] = await Promise.all([
        probeEndpoint(`http://localhost:${mcpPort}/health`),
        probeEndpoint(`http://localhost:${dashboardPort}/api/health`),
    ]);

    return {
        detected: mcpInfo !== null && dashboardInfo !== null,
        mcpHealthy: mcpInfo !== null,
        dashboardHealthy: dashboardInfo !== null,
        mcpInfo: mcpInfo || undefined,
        dashboardInfo: dashboardInfo || undefined,
    };
}

/**
 * Read the container mode from VS Code settings.
 */
export function getContainerMode(): ContainerMode {
    const config = vscode.workspace.getConfiguration('projectMemory');
    return config.get<ContainerMode>('containerMode', 'auto');
}

/**
 * Read the container MCP port from VS Code settings.
 */
export function getContainerMcpPort(): number {
    const config = vscode.workspace.getConfiguration('projectMemory');
    return config.get<number>('containerMcpPort', 3000);
}

/**
 * Get the dashboard frontend URL, adapting to container vs local mode.
 * In container mode, the frontend is served from the dashboard API port.
 * In local mode, the Vite dev server is used.
 */
export function getDashboardFrontendUrl(): string {
    const config = vscode.workspace.getConfiguration('projectMemory');
    const mode = config.get<ContainerMode>('containerMode', 'auto');
    const dashboardPort = config.get<number>('serverPort') || config.get<number>('apiPort') || 3001;

    // In local-only mode, always use Vite dev server
    if (mode === 'local') {
        return 'http://localhost:5173';
    }

    // In container or auto mode, use the dashboard port (container serves frontend)
    return `http://localhost:${dashboardPort}`;
}

/**
 * Determine whether to use container mode based on settings and probing.
 * 
 * Returns true if the extension should connect to a container
 * instead of spawning local processes.
 */
export async function shouldUseContainer(): Promise<{ useContainer: boolean; status: ContainerStatus }> {
    const mode = getContainerMode();

    if (mode === 'local') {
        return {
            useContainer: false,
            status: { detected: false, mcpHealthy: false, dashboardHealthy: false },
        };
    }

    const mcpPort = getContainerMcpPort();
    const config = vscode.workspace.getConfiguration('projectMemory');
    const dashboardPort = config.get<number>('serverPort', 3001);

    const status = await probeContainer(mcpPort, dashboardPort);

    if (mode === 'container') {
        // Container mode forced — report status even if unhealthy
        return { useContainer: true, status };
    }

    // Auto mode — use container only if detected
    return { useContainer: status.detected, status };
}
