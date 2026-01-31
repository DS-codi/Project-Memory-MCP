/**
 * Copilot File Watcher
 * 
 * Watches for changes to Copilot-related files: agents, prompts, and instructions.
 * Provides notifications and optional auto-deploy functionality.
 */

import * as vscode from 'vscode';
import * as chokidar from 'chokidar';
import * as path from 'path';

export type CopilotFileType = 'agent' | 'prompt' | 'instruction';

interface WatcherConfig {
    agentsRoot: string;
    promptsRoot?: string;
    instructionsRoot?: string;
    autoDeploy: boolean;
}

export class CopilotFileWatcher {
    private watchers: Map<CopilotFileType, chokidar.FSWatcher> = new Map();
    private config: WatcherConfig;
    private onFileChange?: (type: CopilotFileType, filePath: string, action: 'add' | 'change' | 'unlink') => void;

    constructor(config: WatcherConfig) {
        this.config = config;
    }

    public start(): void {
        // Watch agents
        if (this.config.agentsRoot) {
            this.startWatcher('agent', this.config.agentsRoot, '*.agent.md');
        }

        // Watch prompts
        if (this.config.promptsRoot) {
            this.startWatcher('prompt', this.config.promptsRoot, '*.prompt.md');
        }

        // Watch instructions
        if (this.config.instructionsRoot) {
            this.startWatcher('instruction', this.config.instructionsRoot, '*.instructions.md');
        }
    }

    private startWatcher(type: CopilotFileType, rootPath: string, pattern: string): void {
        if (this.watchers.has(type)) {
            return;
        }

        const fullPattern = path.join(rootPath, pattern);

        const watcher = chokidar.watch(fullPattern, {
            persistent: true,
            ignoreInitial: true
        });

        watcher.on('change', async (filePath) => {
            this.handleFileEvent(type, filePath, 'change');
        });

        watcher.on('add', (filePath) => {
            this.handleFileEvent(type, filePath, 'add');
        });

        watcher.on('unlink', (filePath) => {
            this.handleFileEvent(type, filePath, 'unlink');
        });

        this.watchers.set(type, watcher);
        console.log(`${type} watcher started for: ${fullPattern}`);
    }

    private async handleFileEvent(type: CopilotFileType, filePath: string, action: 'add' | 'change' | 'unlink'): Promise<void> {
        const fileName = path.basename(filePath);
        const typeLabels = {
            agent: 'Agent template',
            prompt: 'Prompt file',
            instruction: 'Instruction file'
        };
        const label = typeLabels[type];

        // Emit event for external handlers
        if (this.onFileChange) {
            this.onFileChange(type, filePath, action);
        }

        if (action === 'unlink') {
            vscode.window.showWarningMessage(`${label} deleted: ${fileName}`);
            return;
        }

        if (action === 'add') {
            vscode.window.showInformationMessage(`New ${label.toLowerCase()} detected: ${fileName}`);
            return;
        }

        // Handle change
        if (this.config.autoDeploy) {
            vscode.window.showInformationMessage(`Auto-deploying updated ${label.toLowerCase()}: ${fileName}`);
            this.triggerDeploy(type);
        } else {
            const deployAction = await vscode.window.showInformationMessage(
                `${label} updated: ${fileName}`,
                'Deploy to All Workspaces',
                'Ignore'
            );

            if (deployAction === 'Deploy to All Workspaces') {
                this.triggerDeploy(type);
            }
        }
    }

    private triggerDeploy(type: CopilotFileType): void {
        const commands = {
            agent: 'projectMemory.deployAgents',
            prompt: 'projectMemory.deployPrompts',
            instruction: 'projectMemory.deployInstructions'
        };
        vscode.commands.executeCommand(commands[type]);
    }

    public stop(): void {
        for (const [type, watcher] of this.watchers) {
            watcher.close();
            console.log(`${type} watcher stopped`);
        }
        this.watchers.clear();
    }

    public updateConfig(config: Partial<WatcherConfig>): void {
        // Stop existing watchers
        this.stop();

        // Update config
        this.config = { ...this.config, ...config };

        // Restart with new config
        this.start();
    }

    public setAutoDeploy(enabled: boolean): void {
        this.config.autoDeploy = enabled;
    }

    public onFileChanged(handler: (type: CopilotFileType, filePath: string, action: 'add' | 'change' | 'unlink') => void): void {
        this.onFileChange = handler;
    }

    public getWatchedPaths(): { type: CopilotFileType; path: string }[] {
        const paths: { type: CopilotFileType; path: string }[] = [];
        
        if (this.config.agentsRoot) {
            paths.push({ type: 'agent', path: this.config.agentsRoot });
        }
        if (this.config.promptsRoot) {
            paths.push({ type: 'prompt', path: this.config.promptsRoot });
        }
        if (this.config.instructionsRoot) {
            paths.push({ type: 'instruction', path: this.config.instructionsRoot });
        }

        return paths;
    }
}
