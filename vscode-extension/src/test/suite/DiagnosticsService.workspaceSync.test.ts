import * as assert from 'assert';
import { DiagnosticsService } from '../../services/DiagnosticsService';
import type { WorkspaceConfigSyncReport } from '../../server/ConnectionManager';

function createConnectionManagerMock() {
    return {
        isDashboardConnected: true,
        isMcpConnected: true,
        dashboardPort: 3459,
        mcpPort: 3457,
        detectAndConnect: async () => true,
    };
}

function createWorkspaceSyncReport(overrides?: Partial<WorkspaceConfigSyncReport>): WorkspaceConfigSyncReport {
    return {
        workspace_id: 'workspace-1',
        workspace_path: 'c:/workspace',
        report_mode: 'read_only',
        writes_performed: false,
        github_agents_dir: '.github/agents',
        github_instructions_dir: '.github/instructions',
        agents: [
            {
                kind: 'agent',
                filename: 'executor.agent.md',
                relative_path: '.github/agents/executor.agent.md',
                canonical_name: 'executor',
                canonical_filename: 'executor.agent.md',
                status: 'protected_drift',
                remediation: 'report only',
                comparison_basis: 'local_db_seed',
                policy: {
                    sync_managed: true,
                    controlled: true,
                    import_mode: 'never',
                    canonical_source: 'database_seed_resources',
                    canonical_path: 'database-seed-resources/agents/core/executor.agent.md',
                    required_workspace_copy: true,
                    legacy_mandatory: false,
                    validation_errors: [],
                },
            },
        ],
        instructions: [],
        summary: {
            total: 1,
            in_sync: 0,
            local_only: 0,
            db_only: 0,
            content_mismatch: 0,
            protected_drift: 1,
            ignored_local: 0,
            import_candidate: 0,
        },
        ...overrides,
    };
}

suite('DiagnosticsService Workspace Sync', () => {
    test('reports actionable workspace sync findings when ready', () => {
        const service = new DiagnosticsService(createConnectionManagerMock() as any);

        service.updateWorkspaceSync(createWorkspaceSyncReport(), 'startup');
        const report = service.getReport();

        assert.strictEqual(report.workspaceSync.status, 'ready');
        assert.ok(
            report.issues.some((issue) => issue.includes('Workspace config drift: 1 PM-controlled file(s) out of parity')),
            'expected protected drift issue in diagnostics report',
        );
        assert.match(service.getWorkspaceSyncStatusSummary(report), /1 actionable finding/);

        service.dispose();
    });

    test('suppresses stale workspace sync issues when watcher is idle', () => {
        const service = new DiagnosticsService(createConnectionManagerMock() as any);

        service.updateWorkspaceSync(createWorkspaceSyncReport(), 'startup');
        service.setWorkspaceSyncIdle('waiting-for-mcp', 'Passive watcher is waiting for the MCP connection.');
        const report = service.getReport();

        assert.strictEqual(report.workspaceSync.status, 'idle');
        assert.ok(
            !report.issues.some((issue) => issue.includes('Workspace config drift:')),
            'idle state should not keep prior actionable findings as active issues',
        );
        assert.strictEqual(
            service.getWorkspaceSyncStatusSummary(report),
            'Workspace sync: Passive watcher is waiting for the MCP connection.',
        );

        service.dispose();
    });
});