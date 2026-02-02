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

        this.watcher.on('change', async (filePath) => {
            const agentName = path.basename(filePath, '.agent.md');
            
            if (this.autoDeploy) {
                // Auto-deploy the agent
                notify(`Deploying updated agent: ${agentName}`);
                // TODO: Call deploy API
            } else {
                // Show notification with action
                const action = await notify(
                    `Agent template updated: ${agentName}`,
                    'Deploy to All Workspaces',
                    'Ignore'
                );

                if (action === 'Deploy to All Workspaces') {
                    vscode.commands.executeCommand('projectMemory.deployAgents');
                }
            }
        });

        this.watcher.on('add', (filePath) => {
            const agentName = path.basename(filePath, '.agent.md');
            notify(`New agent template detected: ${agentName}`);
        });

        console.log(`Agent watcher started for: ${pattern}`);
    }

    public stop(): void {
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
