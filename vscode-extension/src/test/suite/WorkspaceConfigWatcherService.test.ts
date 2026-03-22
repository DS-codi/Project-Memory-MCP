import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceConfigWatcherService } from '../../services/WorkspaceConfigWatcherService';
import type { WorkspaceConfigSyncReport } from '../../server/ConnectionManager';
import type { ConnectionManager } from '../../server/ConnectionManager';
import type { DiagnosticsService } from '../../services/DiagnosticsService';
import type { NotificationService } from '../../services/NotificationService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createWorkspaceSyncReport(overrides?: Partial<WorkspaceConfigSyncReport>): WorkspaceConfigSyncReport {
    return {
        workspace_id: 'test-ws-001',
        workspace_path: 'c:/workspace',
        report_mode: 'read_only',
        writes_performed: false,
        github_agents_dir: '.github/agents',
        github_instructions_dir: '.github/instructions',
        agents: [],
        instructions: [],
        summary: {
            total: 0,
            in_sync: 0,
            local_only: 0,
            db_only: 0,
            content_mismatch: 0,
            protected_drift: 0,
            ignored_local: 0,
            import_candidate: 0,
        },
        ...overrides,
    };
}

/**
 * The active workspace folder path — used so callTool mocks can return a
 * matching workspace entry for resolveActiveWorkspaceId().
 */
const WORKSPACE_FOLDER_PATH =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'c:\\fallback-test-workspace';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

interface CallToolRecord {
    name: string;
    action: string;
    args: Record<string, unknown>;
}

/**
 * Build a minimal ConnectionManager mock that:
 * - Records every callTool invocation for assertion
 * - Satisfies resolveActiveWorkspaceId() by returning the active workspace path
 * - Delegates checkWorkspaceConfigSync to the provided stub
 */
function createConnectionManagerMock(opts: {
    isMcpConnected?: boolean;
    checkWorkspaceConfigSync?: (workspaceId: string) => Promise<WorkspaceConfigSyncReport>;
    callLog?: CallToolRecord[];
}): ConnectionManager {
    const log = opts.callLog ?? [];
    return {
        isMcpConnected: opts.isMcpConnected ?? true,
        callTool: async (name: string, args: Record<string, unknown>) => {
            log.push({ name, action: String(args['action'] ?? ''), args });
            if (String(args['action']) === 'list') {
                // resolveRegisteredWorkspaceId expects a result array with path + workspace_id
                return {
                    result: [
                        {
                            workspace_id: 'test-ws-001',
                            workspace_path: WORKSPACE_FOLDER_PATH,
                        },
                    ],
                };
            }
            return {};
        },
        checkWorkspaceConfigSync:
            opts.checkWorkspaceConfigSync ??
            (async (_id: string) => createWorkspaceSyncReport()),
    } as unknown as ConnectionManager;
}

interface DiagnosticsCalls {
    updateWorkspaceSyncCount: number;
    setWorkspaceSyncErrorCount: number;
    setWorkspaceSyncIdleCount: number;
    beginWorkspaceSyncCheckCount: number;
}

function createDiagnosticsServiceMock(): DiagnosticsService & { _calls: DiagnosticsCalls } {
    const calls: DiagnosticsCalls = {
        updateWorkspaceSyncCount: 0,
        setWorkspaceSyncErrorCount: 0,
        setWorkspaceSyncIdleCount: 0,
        beginWorkspaceSyncCheckCount: 0,
    };
    return {
        _calls: calls,
        updateWorkspaceSync: (_report: WorkspaceConfigSyncReport, _reason?: string) => {
            calls.updateWorkspaceSyncCount += 1;
        },
        setWorkspaceSyncError: (_message: string, _workspaceId?: string, _reason?: string) => {
            calls.setWorkspaceSyncErrorCount += 1;
        },
        setWorkspaceSyncIdle: (_reason: string, _message: string, _workspaceId?: string) => {
            calls.setWorkspaceSyncIdleCount += 1;
        },
        beginWorkspaceSyncCheck: (_reason: string, _workspaceId?: string) => {
            calls.beginWorkspaceSyncCheckCount += 1;
        },
    } as unknown as DiagnosticsService & { _calls: DiagnosticsCalls };
}

function createNotificationServiceMock(): NotificationService {
    return {
        showWorkspaceSyncFindings: (_report: WorkspaceConfigSyncReport) => {},
    } as unknown as NotificationService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('WorkspaceConfigWatcherService', () => {
    let watcher: WorkspaceConfigWatcherService | null = null;

    teardown(() => {
        watcher?.dispose();
        watcher = null;
    });

    // -----------------------------------------------------------------------
    // 1. Debounce: rapid changes produce only one check
    // -----------------------------------------------------------------------
    test('debounce: three rapid scheduleCheck calls result in a single check', async function () {
        // The debounce window is 1500ms; allow generous wait time.
        this.timeout(4000);

        let checkCount = 0;
        const conn = createConnectionManagerMock({
            checkWorkspaceConfigSync: async (_id) => {
                checkCount += 1;
                return createWorkspaceSyncReport();
            },
        });
        const diag = createDiagnosticsServiceMock();
        const notif = createNotificationServiceMock();

        watcher = new WorkspaceConfigWatcherService(conn, diag, notif);

        // Three back-to-back schedule calls — only the last debounce window fires
        watcher.scheduleCheck('rapid-1');
        watcher.scheduleCheck('rapid-2');
        watcher.scheduleCheck('rapid-3');

        // Wait longer than the 1500ms debounce to let the timer fire
        await sleep(1700);

        if (!vscode.workspace.workspaceFolders?.length) {
            // scheduleCheck returns early when no workspace is open — skip assertion
            return;
        }

        // At most one batch of checks should have fired; debounce prevents extra calls
        assert.ok(checkCount <= 1, `Expected at most 1 check for 3 rapid calls, got ${checkCount}`);
    });

    // -----------------------------------------------------------------------
    // 2. Non-blocking: no write actions via callTool
    // -----------------------------------------------------------------------
    test('non-blocking: watcher never calls callTool with a write action', async function () {
        this.timeout(4000);

        const callLog: CallToolRecord[] = [];
        const conn = createConnectionManagerMock({ callLog });
        const diag = createDiagnosticsServiceMock();
        const notif = createNotificationServiceMock();

        watcher = new WorkspaceConfigWatcherService(conn, diag, notif);
        watcher.scheduleCheck('write-guard-check');

        await sleep(1700);

        const writeActions = [
            'import_context_file',
            'register',
            'reindex',
            'merge',
            'migrate',
            'set_display_name',
        ];

        const offendingCalls = callLog.filter((c) =>
            writeActions.includes(c.action),
        );

        assert.strictEqual(
            offendingCalls.length,
            0,
            `Passive watcher must not invoke write actions. Found: ${JSON.stringify(offendingCalls)}`,
        );

        // The only memory_workspace action performed should be 'list' (from resolveActiveWorkspaceId)
        const workspaceCalls = callLog.filter((c) => c.name === 'memory_workspace');
        for (const call of workspaceCalls) {
            assert.ok(
                call.action === 'list' || call.action === 'check_context_sync',
                `Unexpected memory_workspace action: ${call.action}`,
            );
        }
    });

    // -----------------------------------------------------------------------
    // 3. Error path: setWorkspaceSyncError is called when check throws
    // -----------------------------------------------------------------------
    test('error path: setWorkspaceSyncError is called when checkWorkspaceConfigSync throws', async function () {
        this.timeout(4000);

        const conn = createConnectionManagerMock({
            checkWorkspaceConfigSync: async (_id) => {
                throw new Error('MCP connection refused');
            },
        });
        const diag = createDiagnosticsServiceMock();
        const notif = createNotificationServiceMock();

        watcher = new WorkspaceConfigWatcherService(conn, diag, notif);
        watcher.scheduleCheck('error-trigger');

        await sleep(1700);

        if (!vscode.workspace.workspaceFolders?.length) {
            return;
        }

        assert.ok(
            diag._calls.setWorkspaceSyncErrorCount >= 1,
            'Expected setWorkspaceSyncError to be called when the check throws',
        );
        assert.strictEqual(
            diag._calls.updateWorkspaceSyncCount,
            0,
            'updateWorkspaceSync must not be called when the check throws',
        );
    });

    // -----------------------------------------------------------------------
    // 4. Idle path: setWorkspaceSyncIdle is called when MCP is disconnected
    // -----------------------------------------------------------------------
    test('idle path: setWorkspaceSyncIdle is called when MCP is not connected', async function () {
        this.timeout(4000);

        const conn = createConnectionManagerMock({ isMcpConnected: false });
        const diag = createDiagnosticsServiceMock();
        const notif = createNotificationServiceMock();

        watcher = new WorkspaceConfigWatcherService(conn, diag, notif);
        watcher.scheduleCheck('mcp-offline');

        await sleep(1700);

        if (!vscode.workspace.workspaceFolders?.length) {
            return;
        }

        assert.ok(
            diag._calls.setWorkspaceSyncIdleCount >= 1,
            'Expected setWorkspaceSyncIdle to be called when MCP is disconnected',
        );
        assert.strictEqual(
            diag._calls.updateWorkspaceSyncCount,
            0,
            'updateWorkspaceSync must not be called when MCP is disconnected',
        );
    });

    // -----------------------------------------------------------------------
    // 5. Success path: updateWorkspaceSync is called with the report
    // -----------------------------------------------------------------------
    test('success path: updateWorkspaceSync is called on the diagnostics service', async function () {
        this.timeout(4000);

        const expectedReport = createWorkspaceSyncReport({
            summary: {
                total: 1,
                in_sync: 1,
                local_only: 0,
                db_only: 0,
                content_mismatch: 0,
                protected_drift: 0,
                ignored_local: 0,
                import_candidate: 0,
            },
        });

        const conn = createConnectionManagerMock({
            checkWorkspaceConfigSync: async (_id) => expectedReport,
        });
        const diag = createDiagnosticsServiceMock();
        const notif = createNotificationServiceMock();

        watcher = new WorkspaceConfigWatcherService(conn, diag, notif);
        watcher.scheduleCheck('success-test');

        await sleep(1700);

        if (!vscode.workspace.workspaceFolders?.length) {
            return;
        }

        assert.ok(
            diag._calls.updateWorkspaceSyncCount >= 1,
            'Expected updateWorkspaceSync to be called after a successful check',
        );
        assert.strictEqual(
            diag._calls.setWorkspaceSyncErrorCount,
            0,
            'setWorkspaceSyncError must not be called on success',
        );
    });
});
