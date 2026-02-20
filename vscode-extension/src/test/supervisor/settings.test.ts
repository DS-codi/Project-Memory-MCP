/**
 * Unit tests for supervisor/settings.ts
 *
 * Verifies that readSupervisorSettings() returns correct defaults and reads
 * values from VS Code workspace configuration.
 *
 * Runs inside the VS Code extension host via mocha/tdd so the real `vscode`
 * module is available. The workspace.getConfiguration API is monkey-patched
 * per-test to simulate various config states.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const settingsModule = require('../../supervisor/settings');

// ---------------------------------------------------------------------------
// Helper: build a minimal WorkspaceConfiguration mock
// ---------------------------------------------------------------------------

function makeConfig(values: Record<string, unknown>): vscode.WorkspaceConfiguration {
    return {
        get<T>(key: string, defaultValue?: T): T {
            return (key in values ? values[key] : defaultValue) as T;
        },
        has: (_key: string) => (_key in values),
        inspect: (_key: string) => undefined,
        update: (_key: string, _value: unknown): Thenable<void> => Promise.resolve(),
    } as unknown as vscode.WorkspaceConfiguration;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('readSupervisorSettings', () => {
    let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

    setup(() => {
        originalGetConfiguration = vscode.workspace.getConfiguration;
    });

    teardown(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    test('returns correct defaults when no config is set', () => {
        // Provide an empty config so every get() call falls through to its default.
        vscode.workspace.getConfiguration = (_section?: string) => makeConfig({});

        const settings = settingsModule.readSupervisorSettings();

        assert.strictEqual(settings.startupMode, 'auto');
        assert.strictEqual(settings.launcherPath, '');
        assert.strictEqual(settings.detectTimeoutMs, 1000);
        assert.strictEqual(settings.startupTimeoutMs, 15000);
    });

    test('reads values from VS Code configuration', () => {
        const mockValues: Record<string, unknown> = {
            startupMode: 'off',
            launcherPath: 'C:\\tools\\pm-supervisor-launcher.exe',
            detectTimeoutMs: 500,
            startupTimeoutMs: 8000,
        };

        vscode.workspace.getConfiguration = (_section?: string) => makeConfig(mockValues);

        const settings = settingsModule.readSupervisorSettings();

        assert.strictEqual(settings.startupMode, 'off');
        assert.strictEqual(settings.launcherPath, 'C:\\tools\\pm-supervisor-launcher.exe');
        assert.strictEqual(settings.detectTimeoutMs, 500);
        assert.strictEqual(settings.startupTimeoutMs, 8000);
    });

    test("reads 'prompt' as a valid startupMode", () => {
        vscode.workspace.getConfiguration = (_section?: string) =>
            makeConfig({ startupMode: 'prompt' });

        const settings = settingsModule.readSupervisorSettings();

        assert.strictEqual(settings.startupMode, 'prompt');
    });
});
