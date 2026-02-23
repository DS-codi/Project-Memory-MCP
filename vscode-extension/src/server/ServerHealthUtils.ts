/**
 * Server Health Utilities
 * 
 * Pure utility functions for health checking, port probing, PID lookup,
 * and directory resolution. No state — suitable for use by both
 * ServerManager and FrontendManager.
 */

import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { exec } from 'child_process';

// ---------- Health & Port Checking ----------

/**
 * Check if the API server is healthy on the given port.
 * Sends GET /api/health and expects { status: "ok" }.
 */
export function checkHealth(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/api/health`, (res) => {
            if (res.statusCode !== 200) {
                resolve(false);
                res.resume();
                return;
            }

            let body = '';
            res.on('data', (chunk) => {
                body += chunk.toString();
            });

            res.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    resolve(payload?.status === 'ok');
                } catch {
                    resolve(false);
                }
            });
        });
        req.on('error', () => resolve(false));
        // Use a 3 s timeout — 1 s caused false negatives when the server was
        // briefly under load, triggering unnecessary bridge disconnects.
        req.setTimeout(3000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

/**
 * Check if any HTTP server is listening on the given port.
 */
export function checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
            resolve(res.statusCode !== undefined);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

/**
 * Poll until the API server's health check passes, or timeout.
 */
export async function waitForHealth(port: number, timeout: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            if (await checkHealth(port)) return true;
        } catch { /* not ready yet */ }
        await delay(500);
    }
    return false;
}

/**
 * Poll until any HTTP server is listening on the given port, or timeout.
 */
export async function waitForPort(port: number, timeout: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            if (await checkPort(port)) return true;
        } catch { /* not ready yet */ }
        await delay(500);
    }
    return false;
}

// ---------- PID Lookup ----------

/**
 * Find the PID of the process listening on the given TCP port.
 * Works on Windows (netstat) and Unix (lsof).
 */
export function getPidForPort(port: number): Promise<number | null> {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec(`netstat -ano -p tcp | findstr :${port}`, { windowsHide: true }, (error, stdout) => {
                if (error || !stdout) { resolve(null); return; }

                const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                for (const line of lines) {
                    if (!line.includes(`:${port}`)) continue;
                    if (!/LISTENING/i.test(line)) continue;
                    const match = line.match(/LISTENING\s+(\d+)/i);
                    if (match) { resolve(Number(match[1])); return; }
                }
                resolve(null);
            });
            return;
        }

        exec(`lsof -iTCP:${port} -sTCP:LISTEN -t`, (error, stdout) => {
            if (error || !stdout) { resolve(null); return; }
            const firstLine = stdout.split(/\r?\n/).find(l => l.trim().length > 0);
            if (!firstLine) { resolve(null); return; }
            const pid = Number(firstLine.trim());
            resolve(Number.isNaN(pid) ? null : pid);
        });
    });
}

// ---------- Directory Resolution ----------

/**
 * Locate the dashboard Express server directory by checking known paths.
 */
export function resolveServerDirectory(log?: (msg: string) => void): string | null {
    const extensionPath = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev')?.extensionPath;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const possiblePaths = [
        extensionPath ? path.join(extensionPath, 'server') : null,
        'c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard\\server',
        'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server',
        workspacePath ? path.join(workspacePath, 'dashboard', 'server') : null,
        extensionPath ? path.join(extensionPath, '..', 'dashboard', 'server') : null,
    ].filter(Boolean) as string[];

    const fs = require('fs');
    for (const p of possiblePaths) {
        if (fs.existsSync(path.join(p, 'package.json'))) {
            log?.(`Found server at: ${p}`);
            return p;
        }
    }
    return null;
}

/**
 * Locate the dashboard frontend directory by checking known paths.
 */
export function resolveDashboardDirectory(log?: (msg: string) => void): string | null {
    const extensionPath = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev')?.extensionPath;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const possiblePaths = [
        extensionPath ? path.join(extensionPath, 'dashboard') : null,
        'c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard',
        'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard',
        workspacePath ? path.join(workspacePath, 'dashboard') : null,
        extensionPath ? path.join(extensionPath, '..', 'dashboard') : null,
    ].filter(Boolean) as string[];

    const fs = require('fs');
    for (const p of possiblePaths) {
        if (fs.existsSync(path.join(p, 'package.json'))) {
            log?.(`Found dashboard at: ${p}`);
            return p;
        }
    }

    log?.('Could not find dashboard directory for frontend');
    return null;
}

// ---------- Performance Monitoring ----------

export interface PerformanceStats {
    apiCalls: number;
    avgResponseTime: number;
    lastCheck: number;
}

/**
 * Measure an async function call and update running performance stats.
 */
export async function measureApiCall<T>(
    fn: () => Promise<T>,
    stats: PerformanceStats
): Promise<T> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    stats.apiCalls++;
    stats.avgResponseTime =
        (stats.avgResponseTime * (stats.apiCalls - 1) + duration) / stats.apiCalls;
    stats.lastCheck = Date.now();
    return result;
}

// ---------- Internal ----------

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
