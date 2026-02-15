import * as assert from 'assert';
import * as vscode from 'vscode';
import { DashboardPanel } from '../../ui/DashboardPanel';

type MessageHandler = (message: any) => Thenable<void> | void;

function createMockPanel(onMessage: (handler: MessageHandler) => void): vscode.WebviewPanel {
    const webview = {
        html: '',
        onDidReceiveMessage: (handler: MessageHandler) => {
            onMessage(handler);
            return { dispose: () => undefined } as vscode.Disposable;
        },
    } as unknown as vscode.Webview;

    const panel = {
        webview,
        title: '',
        iconPath: undefined,
        onDidDispose: () => ({ dispose: () => undefined } as vscode.Disposable),
        reveal: () => undefined,
        dispose: () => undefined,
    } as unknown as vscode.WebviewPanel;

    return panel;
}

suite('DashboardPanel Test Suite', () => {
    test('discussPlanInChat invokes showPlanInChat command', async () => {
        let messageHandler: MessageHandler | undefined;
        const panel = createMockPanel((handler) => { messageHandler = handler; });

        const executeCalls: Array<{ command: string; args: unknown[] }> = [];
        const originalExecute = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = async (command: string, ...args: unknown[]) => {
            executeCalls.push({ command, args });
            return undefined;
        };

        try {
            DashboardPanel.revive(panel, vscode.Uri.file('/tmp'), 'http://localhost:4173');
            assert.ok(messageHandler, 'webview message handler should be registered');

            await messageHandler?.({
                type: 'discussPlanInChat',
                data: { planId: 'plan_123' },
            });

            assert.strictEqual(executeCalls.length, 1);
            assert.strictEqual(executeCalls[0]?.command, 'projectMemory.showPlanInChat');
            assert.deepStrictEqual(executeCalls[0]?.args, ['plan_123']);
        } finally {
            (vscode.commands as any).executeCommand = originalExecute;
            DashboardPanel.currentPanel?.dispose();
        }
    });

    test('discussPlanInChat falls back to chat open flow when showPlanInChat fails', async () => {
        let messageHandler: MessageHandler | undefined;
        const panel = createMockPanel((handler) => { messageHandler = handler; });

        const executeCalls: Array<{ command: string; args: unknown[] }> = [];
        const originalExecute = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = async (command: string, ...args: unknown[]) => {
            executeCalls.push({ command, args });
            if (command === 'projectMemory.showPlanInChat') {
                throw new Error('command unavailable');
            }
            return undefined;
        };

        try {
            DashboardPanel.revive(panel, vscode.Uri.file('/tmp'), 'http://localhost:4173');
            assert.ok(messageHandler, 'webview message handler should be registered');

            await messageHandler?.({
                type: 'discussPlanInChat',
                data: { planId: 'plan_123' },
            });

            assert.strictEqual(executeCalls.length, 3);
            assert.strictEqual(executeCalls[0]?.command, 'projectMemory.showPlanInChat');
            assert.strictEqual(executeCalls[1]?.command, 'workbench.action.chat.newChat');
            assert.strictEqual(executeCalls[2]?.command, 'workbench.action.chat.open');
            assert.deepStrictEqual(executeCalls[2]?.args[0], { query: '@memory /plan show plan_123' });
        } finally {
            (vscode.commands as any).executeCommand = originalExecute;
            DashboardPanel.currentPanel?.dispose();
        }
    });

    test('discussPlanInChat ignores blank plan id', async () => {
        let messageHandler: MessageHandler | undefined;
        const panel = createMockPanel((handler) => { messageHandler = handler; });

        const executeCalls: Array<{ command: string; args: unknown[] }> = [];
        const originalExecute = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = async (command: string, ...args: unknown[]) => {
            executeCalls.push({ command, args });
            return undefined;
        };

        try {
            DashboardPanel.revive(panel, vscode.Uri.file('/tmp'), 'http://localhost:4173');
            assert.ok(messageHandler, 'webview message handler should be registered');

            await messageHandler?.({
                type: 'discussPlanInChat',
                data: { planId: '   ' },
            });

            assert.strictEqual(executeCalls.length, 0);
        } finally {
            (vscode.commands as any).executeCommand = originalExecute;
            DashboardPanel.currentPanel?.dispose();
        }
    });
});
