import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotificationService } from '../../services/NotificationService';
import type { AgentEvent, PlanEvent, StepEvent } from '../../services/EventSubscriptionService';

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

suite('NotificationService Lifecycle Idempotency', () => {
    let originalShowInformationMessage: typeof vscode.window.showInformationMessage;
    let originalShowWarningMessage: typeof vscode.window.showWarningMessage;
    let informationMessageCount = 0;

    setup(() => {
        originalShowInformationMessage = vscode.window.showInformationMessage;
        originalShowWarningMessage = vscode.window.showWarningMessage;

        informationMessageCount = 0;
        (vscode.window as any).showInformationMessage = async (..._args: unknown[]) => {
            informationMessageCount += 1;
            return undefined;
        };
        (vscode.window as any).showWarningMessage = async (..._args: unknown[]) => undefined;
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
});