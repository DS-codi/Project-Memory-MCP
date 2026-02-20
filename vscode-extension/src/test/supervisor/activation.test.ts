/**
 * Unit tests for supervisor/activation.ts
 *
 * Exercises the full startup-mode branching of runSupervisorActivation():
 *
 *  - startupMode='off'    → 'skipped' immediately (detectSupervisor never called)
 *  - startupMode='prompt' + user picks Skip  → 'skipped'
 *  - startupMode='prompt' + user picks Start → proceeds to detection
 *  - startupMode='auto'   + already running  → 'ready'
 *  - startupMode='auto'   + spawn succeeds, becomes ready → 'ready'
 *  - startupMode='auto'   + startup timeout exceeded → 'degraded'
 *
 * All I/O-touching collaborators (detectSupervisor, spawnLauncher,
 * waitForSupervisorReady, vscode.window.showInformationMessage) are
 * monkey-patched so the tests run synchronously / without real processes.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import type { SupervisorSettings } from '../../supervisor/settings';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const detectModule = require('../../supervisor/detect');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherModule = require('../../supervisor/launcher');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const readyModule = require('../../supervisor/ready');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const activationModule = require('../../supervisor/activation');

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_SETTINGS: SupervisorSettings = {
    startupMode: 'auto',
    launcherPath: 'C:\\fake\\launcher.exe',
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
    let origSpawn: unknown;
    let origReady: unknown;
    let origShowInfo: typeof vscode.window.showInformationMessage;

    setup(() => {
        origDetect   = detectModule.detectSupervisor;
        origSpawn    = launcherModule.spawnLauncher;
        origReady    = readyModule.waitForSupervisorReady;
        origShowInfo = vscode.window.showInformationMessage;

        // Safe defaults: supervisor not running, spawn succeeds, ready resolves.
        detectModule.detectSupervisor       = async (_t: number) => false;
        launcherModule.spawnLauncher        = (_p: string) => ({ unref: () => undefined });
        readyModule.waitForSupervisorReady  = async (_t: number) => undefined;
    });

    teardown(() => {
        detectModule.detectSupervisor      = origDetect;
        launcherModule.spawnLauncher       = origSpawn;
        readyModule.waitForSupervisorReady = origReady;
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

    test("startupMode='prompt' + user picks Start proceeds with detection", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vscode.window as any).showInformationMessage = async (..._args: unknown[]) => 'Start';
        // Supervisor already running — detection succeeds immediately.
        detectModule.detectSupervisor = async (_t: number) => true;

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'prompt' })
        ) as string;

        assert.strictEqual(result, 'ready');
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

    test("startupMode='auto' + spawn succeeds, supervisor becomes ready returns 'ready'", async () => {
        let spawnCalled = false;
        detectModule.detectSupervisor       = async (_t: number) => false;
        launcherModule.spawnLauncher        = (_p: string) => { spawnCalled = true; return { unref: () => undefined }; };
        readyModule.waitForSupervisorReady  = async (_t: number) => undefined; // resolves

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'auto' })
        ) as string;

        assert.strictEqual(result, 'ready');
        assert.strictEqual(spawnCalled, true, 'spawnLauncher should have been called');
    });

    test("startupMode='auto' + startup timeout exceeded returns 'degraded'", async () => {
        detectModule.detectSupervisor      = async (_t: number) => false;
        launcherModule.spawnLauncher       = (_p: string) => ({ unref: () => undefined });
        readyModule.waitForSupervisorReady = async (_t: number): Promise<void> => {
            throw new Error('waitForSupervisorReady: Supervisor did not become ready within 5000 ms.');
        };

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'auto' })
        ) as string;

        assert.strictEqual(result, 'degraded');
    });

    test("startupMode='auto' + spawnLauncher throws still proceeds to waitForReady", async () => {
        detectModule.detectSupervisor = async (_t: number) => false;
        launcherModule.spawnLauncher  = (_p: string) => {
            throw new Error('spawnLauncher: launcher executable not found');
        };
        // Even though spawn failed, waitForSupervisorReady resolves → 'ready'.
        readyModule.waitForSupervisorReady = async (_t: number) => undefined;

        const result = await activationModule.runSupervisorActivation(
            MOCK_CONTEXT,
            settings({ startupMode: 'auto' })
        ) as string;

        // Activation swallows the spawnLauncher error and continues to ready-wait.
        assert.strictEqual(result, 'ready');
    });
});
