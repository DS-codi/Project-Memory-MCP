/**
 * Unit tests for supervisor/degraded.ts
 *
 * Verifies the status-bar lifecycle of enterDegradedMode() / exitDegradedMode():
 *  - enterDegradedMode() creates an item with the correct text, tooltip,
 *    command, and pushes it onto context.subscriptions
 *  - A second call to enterDegradedMode() disposes the previous item first
 *    (no duplicates)
 *  - exitDegradedMode() disposes the current item
 *  - exitDegradedMode() is a no-op when no item is active
 *
 * vscode.window.createStatusBarItem is monkey-patched to return a lightweight
 * mock so the tests don't require a real VS Code UI.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const degradedModule = require('../../supervisor/degraded');

// ---------------------------------------------------------------------------
// Mock status bar item
// ---------------------------------------------------------------------------

interface MockStatusBarItem {
    text: string;
    tooltip: string | vscode.MarkdownString | undefined;
    command: string | vscode.Command | undefined;
    backgroundColor: vscode.ThemeColor | undefined;
    disposed: boolean;
    show(): void;
    dispose(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockContext(subscriptions: { dispose(): void }[] = []): vscode.ExtensionContext {
    return { subscriptions } as unknown as vscode.ExtensionContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('degraded mode', () => {
    let originalCreateStatusBarItem: typeof vscode.window.createStatusBarItem;
    let createdItems: MockStatusBarItem[];

    function makeMockItem(): MockStatusBarItem {
        const item: MockStatusBarItem = {
            text: '',
            tooltip: undefined,
            command: undefined,
            backgroundColor: undefined,
            disposed: false,
            show(): void { /* no-op */ },
            dispose(): void { this.disposed = true; },
        };
        createdItems.push(item);
        return item;
    }

    setup(() => {
        createdItems = [];
        originalCreateStatusBarItem = vscode.window.createStatusBarItem;

        // Replace createStatusBarItem with a factory that returns mock items.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vscode.window as any).createStatusBarItem = (
            _alignment?: vscode.StatusBarAlignment,
            _priority?: number
        ) => makeMockItem() as unknown as vscode.StatusBarItem;

        // Ensure module-level state is clean before each test.
        degradedModule.exitDegradedMode();
    });

    teardown(() => {
        // Clean up any item the test may have left active.
        degradedModule.exitDegradedMode();
        vscode.window.createStatusBarItem = originalCreateStatusBarItem;
    });

    // ---- enterDegradedMode ----

    test('creates a status bar item with correct properties', () => {
        const subscriptions: { dispose(): void }[] = [];
        const ctx = makeMockContext(subscriptions);

        degradedModule.enterDegradedMode(ctx, 'Supervisor startup timed out');

        assert.strictEqual(createdItems.length, 1, 'Exactly one item should be created');
        const item = createdItems[0];

        assert.ok(
            typeof item.text === 'string' && item.text.includes('Supervisor Unavailable'),
            `Expected text to contain "Supervisor Unavailable"; got: "${item.text}"`
        );
        assert.strictEqual(item.tooltip, 'Supervisor startup timed out');
        assert.strictEqual(item.command, 'project-memory.startSupervisor');
        assert.ok(item.backgroundColor !== undefined, 'backgroundColor should be set');
        assert.ok(
            subscriptions.length > 0,
            'Item should have been pushed onto context.subscriptions'
        );
    });

    test('calling enterDegradedMode twice does not create duplicate items', () => {
        const ctx = makeMockContext();

        degradedModule.enterDegradedMode(ctx, 'first reason');
        const firstItem = createdItems[0];

        degradedModule.enterDegradedMode(ctx, 'second reason');

        // Two items were produced, but the first must have been disposed.
        assert.strictEqual(createdItems.length, 2, 'Two items should have been created in total');
        assert.strictEqual(firstItem.disposed, true, 'First item should be disposed before creating the second');
        assert.strictEqual(createdItems[1].disposed, false, 'Second item should still be active');
    });

    test('second enterDegradedMode call shows the new reason', () => {
        const ctx = makeMockContext();

        degradedModule.enterDegradedMode(ctx, 'old reason');
        degradedModule.enterDegradedMode(ctx, 'new reason');

        const lastItem = createdItems[createdItems.length - 1];
        assert.strictEqual(lastItem.tooltip, 'new reason');
    });

    // ---- exitDegradedMode ----

    test('exitDegradedMode disposes the status bar item when it exists', () => {
        const ctx = makeMockContext();
        degradedModule.enterDegradedMode(ctx, 'test');

        const item = createdItems[0];
        assert.strictEqual(item.disposed, false, 'Item should not yet be disposed');

        degradedModule.exitDegradedMode();
        assert.strictEqual(item.disposed, true, 'Item should be disposed after exitDegradedMode');
    });

    test('exitDegradedMode is a no-op when no item exists', () => {
        // No item created — calling exit should not throw.
        assert.doesNotThrow(() => degradedModule.exitDegradedMode());
    });

    test('exitDegradedMode calling twice is safe', () => {
        const ctx = makeMockContext();
        degradedModule.enterDegradedMode(ctx, 'test');

        degradedModule.exitDegradedMode();
        // Calling again when already cleared should also be fine.
        assert.doesNotThrow(() => degradedModule.exitDegradedMode());
    });
});
