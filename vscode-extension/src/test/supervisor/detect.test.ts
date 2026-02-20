/**
 * Unit tests for supervisor/detect.ts
 *
 * Verifies the named-pipe connection behaviour of detectSupervisor():
 *  - returns true  when the server accepts the connection
 *  - returns false when the server refuses / is absent (error event)
 *  - returns false when the connection hangs beyond timeoutMs
 *
 * The Node.js `net` module is monkey-patched so tests never touch real pipes.
 */

import * as assert from 'assert';
import { EventEmitter } from 'events';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const netModule = require('net');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const detectModule = require('../../supervisor/detect');

// ---------------------------------------------------------------------------
// Minimal mock socket
// ---------------------------------------------------------------------------

class MockSocket extends EventEmitter {
    public destroyed = false;

    /** Mirrors net.Socket.destroy() */
    destroy(): void {
        this.destroyed = true;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('detectSupervisor', () => {
    let originalCreateConnection: unknown;

    setup(() => {
        originalCreateConnection = netModule.createConnection;
    });

    teardown(() => {
        netModule.createConnection = originalCreateConnection;
    });

    test('returns true when a server is listening on the named pipe', async () => {
        netModule.createConnection = (_opts: unknown) => {
            const socket = new MockSocket();
            // Simulate an async connection establishment.
            setImmediate(() => socket.emit('connect'));
            return socket;
        };

        const result: boolean = await detectModule.detectSupervisor(2000);
        assert.strictEqual(result, true);
    });

    test('returns false when nothing is listening (ENOENT / ECONNREFUSED)', async () => {
        netModule.createConnection = (_opts: unknown) => {
            const socket = new MockSocket();
            // Simulate OS rejecting the connection attempt.
            const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
            setImmediate(() => socket.emit('error', err));
            return socket;
        };

        const result: boolean = await detectModule.detectSupervisor(2000);
        assert.strictEqual(result, false);
    });

    test('returns false when connection exceeds timeoutMs', async () => {
        netModule.createConnection = (_opts: unknown) => {
            const socket = new MockSocket();
            // The socket hangs — it never emits 'connect' or 'error'.
            // The implementation's internal timer should fire and settle false.
            return socket;
        };

        // Use a short timeout so the test completes quickly.
        const result: boolean = await detectModule.detectSupervisor(60);
        assert.strictEqual(result, false);
    });

    test('socket is destroyed after settlement', async () => {
        let capturedSocket: MockSocket | undefined;

        netModule.createConnection = (_opts: unknown) => {
            capturedSocket = new MockSocket();
            setImmediate(() => capturedSocket!.emit('connect'));
            return capturedSocket;
        };

        await detectModule.detectSupervisor(2000);
        assert.strictEqual(capturedSocket?.destroyed, true, 'Socket should be destroyed after settlement');
    });
});
