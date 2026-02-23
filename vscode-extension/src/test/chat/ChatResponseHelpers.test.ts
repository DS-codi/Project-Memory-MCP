import * as assert from 'assert';
import * as vscode from 'vscode';

import {
    createCommandLink,
    cancelPendingAction,
    confirmPendingAction,
    renderStepCommandLinks,
    renderPlanActionButtons,
    showConfirmation,
} from '../../chat/ChatResponseHelpers';

type MockButton = {
    command: string;
    title: string;
    arguments?: unknown[];
};

function createMockStream() {
    const markdownCalls: Array<string | vscode.MarkdownString> = [];
    const buttonCalls: MockButton[] = [];

    return {
        markdown: (value: string | vscode.MarkdownString) => { markdownCalls.push(value); },
        button: (button: MockButton) => { buttonCalls.push(button); },
        progress: (_value: string) => {},
        markdownCalls,
        buttonCalls,
    };
}

suite('ChatResponseHelpers Test Suite', () => {
    test('renderPlanActionButtons emits archive, run build, and add step buttons', () => {
        const stream = createMockStream();

        renderPlanActionButtons(stream as any, 'plan_1', {
            showArchive: true,
            showRunBuild: true,
            showAddStep: true,
            showOpenDashboard: false,
        });

        const commands = stream.buttonCalls.map((button) => button.command);
        assert.deepStrictEqual(commands, [
            'projectMemoryDev.archivePlan',
            'projectMemoryDev.runBuildScript',
            'projectMemoryDev.addStepToPlan',
        ]);
    });

    test('renderStepCommandLinks includes Start/Done links with trusted command list', () => {
        const stream = createMockStream();

        renderStepCommandLinks(
            stream as any,
            [
                { index: 0, phase: 'Phase 1', task: 'Pending task', status: 'pending' },
                { index: 1, phase: 'Phase 1', task: 'Active task', status: 'active' },
                { index: 2, phase: 'Phase 1', task: 'Done task', status: 'done' },
                { index: 3, phase: 'Phase 1', task: 'Blocked task', status: 'blocked' },
            ],
            'plan_1'
        );

        assert.strictEqual(stream.markdownCalls.length, 1);
        const markdown = stream.markdownCalls[0] as vscode.MarkdownString;

        assert.ok(markdown instanceof vscode.MarkdownString);
        assert.ok(markdown.value.includes(`[Start](${createCommandLink('projectMemoryDev.markStepActive', ['plan_1', 0])})`));
        assert.ok(markdown.value.includes(`[Done](${createCommandLink('projectMemoryDev.markStepDone', ['plan_1', 1])})`));
        assert.ok(markdown.value.includes(`[Create Dedicated Plan](${createCommandLink('projectMemoryDev.createDedicatedPlan', ['plan_1', 3])})`));
        assert.deepStrictEqual((markdown.isTrusted as { enabledCommands: string[] }).enabledCommands, [
            'projectMemoryDev.markStepActive',
            'projectMemoryDev.markStepDone',
            'projectMemoryDev.createDedicatedPlan'
        ]);
    });

    test('renderStepCommandLinks emits nothing for empty step list', () => {
        const stream = createMockStream();

        renderStepCommandLinks(stream as any, [], 'plan_1');

        assert.strictEqual(stream.markdownCalls.length, 0);
    });

    test('showConfirmation + confirmPendingAction executes pending command', async () => {
        let captured: unknown[] = [];
        const commandId = `projectMemoryDev.testConfirm.${Date.now()}`;
        const disposable = vscode.commands.registerCommand(commandId, (...args: unknown[]) => {
            captured = args;
        });

        try {
            const stream = createMockStream();
            const actionId = showConfirmation(
                stream as any,
                'archive',
                'Confirm archive?',
                commandId,
                ['plan_42']
            );

            const result = await confirmPendingAction(actionId);

            assert.strictEqual(result.executed, true);
            assert.deepStrictEqual(captured, ['plan_42']);
            assert.ok(stream.buttonCalls.some((button) => button.command === 'projectMemoryDev.confirmAction'));
            assert.ok(stream.buttonCalls.some((button) => button.command === 'projectMemoryDev.cancelAction'));
        } finally {
            disposable.dispose();
        }
    });

    test('cancelPendingAction prevents later confirmation execution', async () => {
        let executed = false;
        const commandId = `projectMemoryDev.testCancel.${Date.now()}`;
        const disposable = vscode.commands.registerCommand(commandId, () => {
            executed = true;
        });

        try {
            const stream = createMockStream();
            const actionId = showConfirmation(
                stream as any,
                'archive',
                'Confirm archive?',
                commandId,
                ['plan_77']
            );

            const cancelled = cancelPendingAction(actionId);
            const confirmResult = await confirmPendingAction(actionId);

            assert.strictEqual(cancelled.cancelled, true);
            assert.strictEqual(confirmResult.executed, false);
            assert.strictEqual(executed, false);
        } finally {
            disposable.dispose();
        }
    });
});
