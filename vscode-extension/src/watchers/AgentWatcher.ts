/**
 * Agent Watcher
 * 
 * Watches for changes to agent template files and optionally auto-deploys.
 */

import * as vscode from 'vscode';
import * as chokidar from 'chokidar';
import * as path from 'path';

function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (config.get<boolean>('showNotifications', true)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}

export class AgentWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private agentsRoot: string;
    private autoDeploy: boolean;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingChanges: Set<string> = new Set();
    private static readonly DEBOUNCE_MS = 500;

    constructor(agentsRoot: string, autoDeploy: boolean) {
        this.agentsRoot = agentsRoot;
        this.autoDeploy = autoDeploy;
    }

    public start(): void {
        if (this.watcher) {
            return;
        }

        const pattern = path.join(this.agentsRoot, '*.agent.md');

        this.watcher = chokidar.watch(pattern, {
            persistent: true,
            ignoreInitial: true
        });

        this.watcher.on('change', (filePath) => {
            this.pendingChanges.add(filePath);
            this.scheduleFlush();
        });

        this.watcher.on('add', (filePath) => {
            const agentName = path.basename(filePath, '.agent.md');
            notify(`New agent template detected: ${agentName}`);
        });

        console.log(`Agent watcher started for: ${pattern}`);
    }

    private scheduleFlush(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => this.flushChanges(), AgentWatcher.DEBOUNCE_MS);
    }

    private async flushChanges(): Promise<void> {
        const changes = [...this.pendingChanges];
        this.pendingChanges.clear();
        this.debounceTimer = null;

        if (changes.length === 0) return;

        const names = changes.map(f => path.basename(f, '.agent.md'));
        const label = names.length === 1 ? names[0] : `${names.length} agents`;

        if (this.autoDeploy) {
            notify(`Deploying updated ${label}`);
        } else {
            const action = await notify(
                `Agent template${names.length > 1 ? 's' : ''} updated: ${label}`,
                'Deploy to All Workspaces',
                'Ignore'
            );
            if (action === 'Deploy to All Workspaces') {
                vscode.commands.executeCommand('projectMemory.deployAgents');
            }
        }
    }

    public stop(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.pendingChanges.clear();
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            console.log('Agent watcher stopped');
        }
    }

    public setAutoDeploy(enabled: boolean): void {
        this.autoDeploy = enabled;
    }
}
