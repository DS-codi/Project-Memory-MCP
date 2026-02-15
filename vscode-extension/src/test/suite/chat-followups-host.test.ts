import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChatParticipant, McpBridge } from '../../chat';

suite('Chat Followups (Extension Host)', () => {
    let bridge: McpBridge;
    let participant: ChatParticipant;

    setup(() => {
        bridge = new McpBridge({ serverMode: 'bundled' });
        participant = new ChatParticipant(bridge, { registerWithVscode: false });
    });

    teardown(() => {
        participant.dispose();
        bridge.dispose();
    });

    function provide(metadata: Record<string, unknown>): vscode.ChatFollowup[] {
        const result = { metadata } as vscode.ChatResult;
        const cancellation = new vscode.CancellationTokenSource();
        try {
            return ((participant as unknown as { provideFollowups: Function }).provideFollowups(
                result,
                {} as vscode.ChatContext,
                cancellation.token
            ) ?? []) as vscode.ChatFollowup[];
        } finally {
            cancellation.dispose();
        }
    }

    test('plan/show includes archive, add-step, and recommended launch followups', () => {
        const followups = provide({
            command: 'plan',
            action: 'show',
            planId: 'plan_123',
            recommendedAgent: 'Tester'
        });

        const labels = followups.map(f => f.label);
        assert.ok(labels.includes('Archive Plan'));
        assert.ok(labels.includes('Add Step'));
        assert.ok(labels.includes('Launch Tester'));

        const handoffPrompts = followups
            .filter((followup) => followup.command === 'handoff')
            .map((followup) => followup.prompt);
        assert.ok(handoffPrompts.every((prompt) => !prompt.startsWith('/handoff ')));
    });

    test('plan/show falls back to Revisionist launch when blocked steps exist', () => {
        const followups = provide({
            command: 'plan',
            action: 'show',
            planId: 'plan_blocked',
            stepCounts: { blocked: 1 }
        });

        const labels = followups.map(f => f.label);
        assert.ok(labels.includes('Launch Revisionist'));
    });

    test('plan/create includes view details and assign architect followups', () => {
        const followups = provide({
            command: 'plan',
            action: 'create',
            planId: 'plan_new'
        });

        const labels = followups.map(f => f.label);
        assert.ok(labels.includes('View plan details'));
        assert.ok(labels.includes('Assign Architect'));

        const architectFollowup = followups.find((followup) => followup.label === 'Assign Architect');
        assert.ok(architectFollowup);
        assert.strictEqual(architectFollowup?.command, 'handoff');
        assert.ok(!(architectFollowup?.prompt ?? '').startsWith('/handoff '));
    });

    test('unknown plan metadata falls back to status followup', () => {
        const followups = provide({ command: 'plan' });

        assert.strictEqual(followups.length, 1);
        assert.strictEqual(followups[0].label, 'Check status');
        assert.strictEqual(followups[0].command, 'status');
    });
});