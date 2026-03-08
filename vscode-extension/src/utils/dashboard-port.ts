import * as vscode from 'vscode';

const DEFAULT_DASHBOARD_PORT = 3459;
let warnedLegacyApiPort = false;

function isValidPort(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function readExplicitServerPort(config: vscode.WorkspaceConfiguration): number | undefined {
    const inspected = config.inspect<number>('serverPort');
    const candidates = [
        inspected?.workspaceFolderValue,
        inspected?.workspaceValue,
        inspected?.globalValue,
    ];

    return candidates.find(isValidPort);
}

function warnLegacyApiPortOnce(): void {
    if (warnedLegacyApiPort) {
        return;
    }

    warnedLegacyApiPort = true;
    console.warn(
        '[ProjectMemory] Setting "projectMemory.apiPort" is deprecated. Use "projectMemory.serverPort" instead.'
    );
}

export function resolveDashboardPort(
    config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('projectMemory')
): number {
    const explicitServerPort = readExplicitServerPort(config);
    if (explicitServerPort !== undefined) {
        return explicitServerPort;
    }

    const legacyApiPort = config.get<number>('apiPort');
    if (isValidPort(legacyApiPort)) {
        warnLegacyApiPortOnce();
        return legacyApiPort;
    }

    const defaultServerPort = config.inspect<number>('serverPort')?.defaultValue;
    if (isValidPort(defaultServerPort)) {
        return defaultServerPort;
    }

    return DEFAULT_DASHBOARD_PORT;
}

export function __resetResolveDashboardPortTestState(): void {
    warnedLegacyApiPort = false;
}