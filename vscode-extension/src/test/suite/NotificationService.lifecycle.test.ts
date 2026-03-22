import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotificationService } from '../../services/NotificationService';
import type { AgentEvent, PlanEvent, StepEvent } from '../../services/EventSubscriptionService';
import type { WorkspaceConfigSyncReport } from '../../server/ConnectionManager';

class MockEventSubscriptionService {
    private agentListeners: Array<(event: AgentEvent) => void> = [];
    private planListeners: Array<(event: PlanEvent) => void> = [];
    private stepListeners: Array<(event: StepEvent) => void> = [];

    onAgentEvent(listener: (event: AgentEvent) => void): vscode.Disposable {
        this.agentListeners.push(listener);
        return {
            dispose: () => {
                this.agentListeners = this.agentListeners.filter((candidate) => candidate !== listener);
            },
        };
    }

    onPlanEvent(listener: (event: PlanEvent) => void): vscode.Disposable {
        this.planListeners.push(listener);
        return {
            dispose: () => {
                this.planListeners = this.planListeners.filter((candidate) => candidate !== listener);
            },
        };
    }

    onStepEvent(listener: (event: StepEvent) => void): vscode.Disposable {
        this.stepListeners.push(listener);
        return {
            dispose: () => {
                this.stepListeners = this.stepListeners.filter((candidate) => candidate !== listener);
            },
        };
    }

    emitAgentHandoff(): void {
        const event = {
            id: 'evt-agent-1',
            type: 'handoff_completed',
            timestamp: new Date().toISOString(),
            workspace_id: 'ws-1',
            plan_id: 'plan-1',
            data: {
                from_agent: 'Worker',
                to_agent: 'Reviewer',
                plan_title: 'Plan 1',
            },
        } as AgentEvent;

        for (const listener of this.agentListeners) {
            listener(event);
        }
    }
}

function createWorkspaceSyncReport(overrides?: Partial<WorkspaceConfigSyncReport>): WorkspaceConfigSyncReport {
    return {
        workspace_id: 'ws-1',
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

suite('NotificationService Lifecycle Idempotency', () => {
    let originalShowInformationMessage: typeof vscode.window.showInformationMessage;
    let originalShowWarningMessage: typeof vscode.window.showWarningMessage;
    let informationMessageCount = 0;
    let warningMessageCount = 0;

    setup(() => {
        originalShowInformationMessage = vscode.window.showInformationMessage;
        originalShowWarningMessage = vscode.window.showWarningMessage;

        informationMessageCount = 0;
        warningMessageCount = 0;
        (vscode.window as any).showInformationMessage = async (..._args: unknown[]) => {
            informationMessageCount += 1;
            return undefined;
        };
        (vscode.window as any).showWarningMessage = async (..._args: unknown[]) => {
            warningMessageCount += 1;
            return undefined;
        };
    });

    teardown(() => {
        (vscode.window as any).showInformationMessage = originalShowInformationMessage;
        (vscode.window as any).showWarningMessage = originalShowWarningMessage;
    });

    test('attach called repeatedly does not duplicate lifecycle listeners', async () => {
        const events = new MockEventSubscriptionService();
        const service = new NotificationService();

        service.attach(events as any);
        service.attach(events as any);

        events.emitAgentHandoff();
        await new Promise(resolve => setTimeout(resolve, 0));

        assert.strictEqual(informationMessageCount, 1, 'Expected a single lifecycle notification after repeated attach');

        service.dispose();
    });

    test('dispose is idempotent and detaches listeners', async () => {
        const events = new MockEventSubscriptionService();
        const service = new NotificationService();

        service.attach(events as any);
        service.dispose();
        service.dispose();

        events.emitAgentHandoff();
        await new Promise(resolve => setTimeout(resolve, 0));

        assert.strictEqual(informationMessageCount, 0, 'No notifications should be emitted after dispose');
    });

    test('workspace sync notifications are debounced for identical findings', async () => {
        const service = new NotificationService();
        const report = createWorkspaceSyncReport();

        service.showWorkspaceSyncFindings(report);
        service.showWorkspaceSyncFindings(report);
        await new Promise(resolve => setTimeout(resolve, 0));

        assert.strictEqual(warningMessageCount, 1, 'Expected a single warning notification for identical workspace sync findings');

        service.dispose();
    });

    test('workspace sync notifications are skipped when there are no actionable findings', async () => {
        const service = new NotificationService();
        const report = createWorkspaceSyncReport({
            agents: [],
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

        service.showWorkspaceSyncFindings(report);
        await new Promise(resolve => setTimeout(resolve, 0));

        assert.strictEqual(warningMessageCount, 0, 'Expected no workspace sync warning when all files are in sync');

        service.dispose();
    });
});