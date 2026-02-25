/**
 * Copilot File Watcher
 * 
 * Watches for changes to Copilot-related files: agents, prompts, and instructions.
 * Provides notifications and optional auto-deploy functionality.
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
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingEvents: Map<string, { type: CopilotFileType; filePath: string; action: 'add' | 'change' | 'unlink' }> = new Map();
    private static readonly DEBOUNCE_MS = 300;

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
        // Batch events with debouncing — deduplicate by filePath
        this.pendingEvents.set(filePath, { type, filePath, action });
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => this.flushEvents(), CopilotFileWatcher.DEBOUNCE_MS);
    }

    private async flushEvents(): Promise<void> {
        const events = [...this.pendingEvents.values()];
        this.pendingEvents.clear();
        this.debounceTimer = null;

        for (const { type, filePath, action } of events) {
            await this.processFileEvent(type, filePath, action);
        }
    }

    private async processFileEvent(type: CopilotFileType, filePath: string, action: 'add' | 'change' | 'unlink'): Promise<void> {
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
            notify(`New ${label.toLowerCase()} detected: ${fileName}`);
            return;
        }

        // Handle change
        if (this.config.autoDeploy) {
            notify(`Auto-deploying updated ${label.toLowerCase()}: ${fileName}`);
            this.triggerDeploy(type);
        } else {
            const deployAction = await notify(
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
            prompt: 'projectMemory.deploySkills',
            instruction: 'projectMemory.deployInstructions'
        };
        vscode.commands.executeCommand(commands[type]);
    }

    public stop(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.pendingEvents.clear();
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
