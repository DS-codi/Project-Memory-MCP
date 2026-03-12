/**
 * Reads the runtime ports manifest written by the supervisor to
 * `%APPDATA%\ProjectMemory\ports.json`.
 *
 * The supervisor writes this file after all services have started and removes
 * it on clean shutdown, so its presence also acts as a liveness signal.
 *
 * All callers should treat the result as optional and fall back to VS Code
 * settings when the file is absent or unreadable.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface PortsManifest {
    schema_version: number;
    written_at_unix: number;
    supervisor_pid: number;
    services: {
        mcp_proxy: number;
        mcp_pool_base: number;
        interactive_terminal: number;
        dashboard: number;
        fallback_api: number;
        gui_server: number;
    };
}

function getManifestPath(): string | undefined {
    const appdata = process.env['APPDATA'];
    if (!appdata) {
        return undefined;
    }
    return path.join(appdata, 'ProjectMemory', 'ports.json');
}

/**
 * Synchronously reads the ports manifest and returns it, or `undefined` when
 * the file is absent, unreadable, or does not pass basic validation.
 */
export function readPortsManifest(): PortsManifest | undefined {
    const manifestPath = getManifestPath();
    if (!manifestPath) {
        return undefined;
    }
    try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidManifest(parsed)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

function isValidManifest(value: unknown): value is PortsManifest {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const m = value as Record<string, unknown>;
    return (
        m['schema_version'] === 1 &&
        typeof m['services'] === 'object' &&
        m['services'] !== null &&
        typeof (m['services'] as Record<string, unknown>)['mcp_proxy'] === 'number' &&
        typeof (m['services'] as Record<string, unknown>)['dashboard'] === 'number'
    );
}
