/**
 * Unit tests for supervisor/ready.ts
 *
 * Verifies the poll-with-backoff behaviour of waitForSupervisorReady():
 *  - resolves immediately when detectSupervisor succeeds on the first attempt
 *  - resolves after multiple retries once detectSupervisor starts returning true
 *  - rejects with a descriptive error message when timeoutMs is exceeded
 *
 * The `detectSupervisor` export on the detect module is monkey-patched so that
 * tests run without real named-pipe connections. Because TypeScript compiles
 * `import { detectSupervisor } from './detect'` to an access on the cached
 * require object, patching that object's property is picked up by ready.ts.
 */

import * as assert from 'assert';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const detectModule = require('../../supervisor/detect');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const readyModule = require('../../supervisor/ready');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('waitForSupervisorReady', () => {
    let originalDetectSupervisor: unknown;

    setup(() => {
        originalDetectSupervisor = detectModule.detectSupervisor;
    });

    teardown(() => {
        detectModule.detectSupervisor = originalDetectSupervisor;
    });

    test('resolves when detectSupervisor succeeds on the first attempt', async () => {
        detectModule.detectSupervisor = async (_timeoutMs: number): Promise<boolean> => true;

        // Should resolve without throwing.
        await assert.doesNotReject(
            () => readyModule.waitForSupervisorReady(3000) as Promise<void>
        );
    });

    test('resolves after a few retries', async () => {
        let callCount = 0;

        // Fail twice, then succeed on the third call.
        detectModule.detectSupervisor = async (_timeoutMs: number): Promise<boolean> => {
            callCount += 1;
            return callCount >= 3;
        };

        await assert.doesNotReject(
            () => readyModule.waitForSupervisorReady(5000) as Promise<void>
        );

        assert.ok(
            callCount >= 3,
            `Expected detectSupervisor to be called at least 3 times; got ${callCount}`
        );
    });

    test('rejects with descriptive error when timeout is exceeded', async () => {
        // Always report not ready.
        detectModule.detectSupervisor = async (_timeoutMs: number): Promise<boolean> => false;

        // timeoutMs = 0 → the elapsed check fires immediately.
        await assert.rejects(
            () => readyModule.waitForSupervisorReady(0) as Promise<void>,
            (err: unknown) => {
                assert.ok(err instanceof Error, 'Should reject with an Error');
                assert.ok(
                    err.message.includes('Supervisor did not become ready'),
                    `Unexpected error message: "${err.message}"`
                );
                return true;
            }
        );
    });

    test('rejects with message containing the timeout value', async () => {
        detectModule.detectSupervisor = async (_timeoutMs: number): Promise<boolean> => false;

        await assert.rejects(
            () => readyModule.waitForSupervisorReady(0) as Promise<void>,
            (err: unknown) => {
                assert.ok(err instanceof Error);
                // The message should embed the ms figure passed in.
                assert.ok(
                    err.message.includes('0 ms'),
                    `Expected '0 ms' in error message; got: "${err.message}"`
                );
                return true;
            }
        );
    });
});
