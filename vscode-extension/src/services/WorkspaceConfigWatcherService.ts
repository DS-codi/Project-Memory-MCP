import * as vscode from 'vscode';
import { ConnectionManager, type WorkspaceConfigSyncReport } from '../server/ConnectionManager';
import { resolveActiveWorkspaceId } from '../commands/workspace-commands';
import { DiagnosticsService } from './DiagnosticsService';
import { NotificationService } from './NotificationService';

const WATCHER_DEBOUNCE_MS = 1500;
const WORKSPACE_CONFIG_PATTERNS = [
    '.github/agents/**/*.agent.md',
    '.github/instructions/**/*.instructions.md',
];

export class WorkspaceConfigWatcherService implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly folderWatchers: vscode.Disposable[] = [];
    private readonly outputChannel = vscode.window.createOutputChannel('Project Memory Workspace Sync');
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private checkInFlight = false;
    private rerunRequested = false;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly diagnosticsService: DiagnosticsService,
        private readonly notificationService: NotificationService,
    ) {}

    start(): void {
        this.recreateWatchers();

        this.disposables.push(
            this.outputChannel,
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.recreateWatchers();
                this.scheduleCheck('workspace-folders-changed');
            }),
        );

        this.scheduleCheck('startup');
    }

    scheduleCheck(reason: string): void {
        if (!vscode.workspace.workspaceFolders?.length) {
            return;
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            void this.runCheck(reason);
        }, WATCHER_DEBOUNCE_MS);
    }

    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        while (this.folderWatchers.length > 0) {
            this.folderWatchers.pop()?.dispose();
        }

        this.disposables.forEach((disposable) => disposable.dispose());
        this.disposables.length = 0;
    }

    private recreateWatchers(): void {
        while (this.folderWatchers.length > 0) {
            this.folderWatchers.pop()?.dispose();
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        for (const pattern of WORKSPACE_CONFIG_PATTERNS) {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, pattern));
            const schedule = () => this.scheduleCheck(`fs:${pattern}`);

            this.folderWatchers.push(
                watcher,
                watcher.onDidCreate(schedule),
                watcher.onDidChange(schedule),
                watcher.onDidDelete(schedule),
            );
        }
    }

    private async runCheck(reason: string): Promise<void> {
        if (this.checkInFlight) {
            this.rerunRequested = true;
            return;
        }

        this.checkInFlight = true;

        try {
            if (!this.connectionManager.isMcpConnected) {
                this.diagnosticsService.setWorkspaceSyncIdle(reason, 'Passive watcher is waiting for the MCP connection.');
                this.log(`Skipping passive sync check (${reason}): MCP is not connected.`);
                return;
            }

            this.diagnosticsService.beginWorkspaceSyncCheck(reason);
            const workspaceId = await resolveActiveWorkspaceId(this.connectionManager);
            if (!workspaceId) {
                this.diagnosticsService.setWorkspaceSyncIdle(reason, 'Passive watcher is waiting for workspace registration.');
                this.log(`Skipping passive sync check (${reason}): workspace is not registered.`);
                return;
            }

            this.diagnosticsService.beginWorkspaceSyncCheck(reason, workspaceId);
            const report = await this.connectionManager.checkWorkspaceConfigSync(workspaceId);
            this.diagnosticsService.updateWorkspaceSync(report, reason);
            this.notificationService.showWorkspaceSyncFindings(report);
            this.logSummary(reason, report);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.diagnosticsService.setWorkspaceSyncError(message, undefined, reason);
            this.log(`Passive sync check failed (${reason}): ${message}`);
        } finally {
            this.checkInFlight = false;

            if (this.rerunRequested) {
                this.rerunRequested = false;
                this.scheduleCheck('coalesced');
            }
        }
    }

    private logSummary(reason: string, report: WorkspaceConfigSyncReport): void {
        const actionable = report.summary.protected_drift
            + report.summary.content_mismatch
            + report.summary.local_only
            + report.summary.db_only
            + report.summary.import_candidate;

        this.log(
            `Passive sync check (${reason}) completed for ${report.workspace_id ?? 'workspace'}: `
            + `${actionable} actionable finding(s), ${report.summary.in_sync} in sync, `
            + `${report.summary.ignored_local} ignored.`
        );
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }
}