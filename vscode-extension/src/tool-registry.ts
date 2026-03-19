/**
 * ToolRegistry
 *
 * Tracks session-scoped state (e.g. focused workspace mode) and propagates
 * it to the ConnectionManager so downstream consumers (StatusBarManager,
 * spawn-agent-tool) can react without a circular dependency on this class.
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './server/ConnectionManager';

export class ToolRegistry implements vscode.Disposable {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly _context: vscode.ExtensionContext
    ) {}

    setFocusedWorkspaceMode(active: boolean): void {
        this.connectionManager.setFocusedWorkspaceMode(active);
    }

    dispose(): void {
        // Nothing to clean up beyond what ConnectionManager manages.
    }
}
