"use strict";
/**
 * Container Detection
 *
 * Probes for a running Project Memory container on expected ports.
 * Used by ServerManager to decide whether to spawn local processes
 * or connect to a containerized backend.
 *
 * @see Phase 6C of infrastructure-improvement-plan.md
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.probeContainer = probeContainer;
exports.getContainerMode = getContainerMode;
exports.getContainerMcpPort = getContainerMcpPort;
exports.getDashboardFrontendUrl = getDashboardFrontendUrl;
exports.shouldUseContainer = shouldUseContainer;
const http = __importStar(require("http"));
const vscode = __importStar(require("vscode"));
// ---------------------------------------------------------------------------
// Health probes
// ---------------------------------------------------------------------------
/**
 * Probe a URL and return parsed JSON response, or null on failure.
 */
function probeEndpoint(url, timeoutMs = 3000) {
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
                    }
                    else {
                        resolve(null);
                    }
                }
                catch {
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
async function probeContainer(mcpPort = 3000, dashboardPort = 3001) {
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
function getContainerMode() {
    const config = vscode.workspace.getConfiguration('projectMemory');
    return config.get('containerMode', 'auto');
}
/**
 * Read the container MCP port from VS Code settings.
 */
function getContainerMcpPort() {
    const config = vscode.workspace.getConfiguration('projectMemory');
    return config.get('containerMcpPort', 3000);
}
/**
 * Get the dashboard frontend URL, adapting to container vs local mode.
 * In container mode, the frontend is served from the dashboard API port.
 * In local mode, the Vite dev server is used.
 */
function getDashboardFrontendUrl() {
    const config = vscode.workspace.getConfiguration('projectMemory');
    const mode = config.get('containerMode', 'auto');
    const dashboardPort = config.get('serverPort') || config.get('apiPort') || 3001;
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
async function shouldUseContainer() {
    const mode = getContainerMode();
    if (mode === 'local') {
        return {
            useContainer: false,
            status: { detected: false, mcpHealthy: false, dashboardHealthy: false },
        };
    }
    const mcpPort = getContainerMcpPort();
    const config = vscode.workspace.getConfiguration('projectMemory');
    const dashboardPort = config.get('serverPort', 3001);
    const status = await probeContainer(mcpPort, dashboardPort);
    if (mode === 'container') {
        // Container mode forced — report status even if unhealthy
        return { useContainer: true, status };
    }
    // Auto mode — use container only if detected
    return { useContainer: status.detected, status };
}
//# sourceMappingURL=ContainerDetection.js.map