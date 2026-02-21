/**
 * Unit tests for supervisor/activation.ts
 *
 * Exercises the startup-mode branching of runSupervisorActivation().
 * The Supervisor is always externally managed; activation only probes
 * whether one is already reachable.
 *
 *  - startupMode='off'    → 'skipped' immediately (detectSupervisor never called)
 *  - startupMode='prompt' + user picks Skip    → 'skipped'
 *  - startupMode='prompt' + user dismisses     → 'skipped'
 *  - startupMode='prompt' + user picks Check   → proceeds to detection
 *  - startupMode='auto'   + already running    → 'ready'
 *  - startupMode='auto'   + not running        → 'degraded'
 *
 * detectSupervisor is monkey-patched so tests run without real network I/O.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import type { SupervisorSettings } from '../../supervisor/settings';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const detectModule = require('../../supervisor/detect');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const activationModule = require('../../supervisor/activation');

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_SETTINGS: SupervisorSettings = {
    startupMode: 'auto',
    launcherPath: '',
    detectTimeoutMs: 1000,
    startupTimeoutMs: 5000,
};

/** Activation does not use context directly — pass an empty shell. */
const MOCK_CONTEXT = {} as vscode.ExtensionContext;

/** Convenience: build settings with a single override. */
function settings(overrides: Partial<SupervisorSettings>): SupervisorSettings {
    return { ...BASE_SETTINGS, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('runSupervisorActivation', () => {
    let origDetect: unknown;
    let origShowInfo: typeof vscode.window.showInformationMessage;

    setup(() => {
        origDetect   = detectModule.detectSupervisor;
        origShowInfo = vscode.window.showInformationMessage;

        // Safe default: supervisor not running.
        detectModule.detectSupervisor = async (_t: number) => false;
    });

    teardown(() => {
        detectModule.detectSupervisor        = origDetect;
        vscode.window.showInformationMessage = origShowInfo;
    });

    // ---- startupMode = 'off' ----

    test("startupMode='off' returns 'skipped' without calling detectSupervisor", async () => {
        let detectCalled = false;
        detectModule.detectSupervisor = async (_t: number) => {
            detectCalled = true;
            return false;
        };

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'off' })
        ) as string;

        assert.strictEqual(result, 'skipped');
        assert.strictEqual(detectCalled, false, 'detectSupervisor should not be called');
    });

    // ---- startupMode = 'prompt' ----

    test("startupMode='prompt' + user picks Skip returns 'skipped'", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vscode.window as any).showInformationMessage = async (..._args: unknown[]) => 'Skip';

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'prompt' })
        ) as string;

        assert.strictEqual(result, 'skipped');
    });

    test("startupMode='prompt' + user dismisses (undefined) returns 'skipped'", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vscode.window as any).showInformationMessage = async (..._args: unknown[]) => undefined;

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'prompt' })
        ) as string;

        assert.strictEqual(result, 'skipped');
    });

    test("startupMode='prompt' + user picks Check proceeds with detection → 'ready'", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vscode.window as any).showInformationMessage = async (..._args: unknown[]) => 'Check';
        detectModule.detectSupervisor = async (_t: number) => true;

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'prompt' })
        ) as string;

        assert.strictEqual(result, 'ready');
    });

    test("startupMode='prompt' + user picks Check + not running → 'degraded'", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vscode.window as any).showInformationMessage = async (..._args: unknown[]) => 'Check';
        detectModule.detectSupervisor = async (_t: number) => false;

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'prompt' })
        ) as string;

        assert.strictEqual(result, 'degraded');
    });

    // ---- startupMode = 'auto' ----

    test("startupMode='auto' + supervisor already running returns 'ready'", async () => {
        detectModule.detectSupervisor = async (_t: number) => true;

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'auto' })
        ) as string;

        assert.strictEqual(result, 'ready');
    });

    test("startupMode='auto' + supervisor not running returns 'degraded'", async () => {
        detectModule.detectSupervisor = async (_t: number) => false;

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'auto' })
        ) as string;

        assert.strictEqual(result, 'degraded');
    });
});
