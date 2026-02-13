/**
 * ContainerHealthService Unit Tests
 *
 * Tests the health-polling state machine, event emission, and
 * fallback/reconnection detection without hitting real containers.
 *
 * Runs inside the VS Code extension host via mocha/tdd.
 * Module-level stubs replace probeContainer / getContainerMcpPort
 * on the cached CommonJS module so ContainerHealthService picks
 * them up at call-time.
 *
 * @see Phase 7 — Container Resilience & Auto-Mount
 */

import * as assert from 'assert';

// We import via require so we can monkey-patch the exports for testing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ContainerDetection = require('../../server/ContainerDetection');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ContainerHealthService } = require('../../services/ContainerHealthService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockProbeResult {
    detected: boolean;
    mcpHealthy: boolean;
    dashboardHealthy: boolean;
    mcpInfo?: Record<string, unknown>;
    dashboardInfo?: Record<string, unknown>;
}

const HEALTHY_RESULT: MockProbeResult = {
    detected: true,
    mcpHealthy: true,
    dashboardHealthy: true,
    mcpInfo: { status: 'ok', uptime: 120 },
};

const DEGRADED_RESULT: MockProbeResult = {
    detected: true,
    mcpHealthy: true,
    dashboardHealthy: false,
    mcpInfo: { status: 'ok', uptime: 60 },
};

const FAILED_RESULT: MockProbeResult = {
    detected: false,
    mcpHealthy: false,
    dashboardHealthy: false,
};

let currentProbeResult: MockProbeResult = HEALTHY_RESULT;

// Save originals
const origProbe = ContainerDetection.probeContainer;
const origGetPort = ContainerDetection.getContainerMcpPort;

suite('ContainerHealthService Test Suite', () => {
    let service: InstanceType<typeof ContainerHealthService>;

    setup(() => {
        // Install stubs
        ContainerDetection.probeContainer = async () => currentProbeResult;
        ContainerDetection.getContainerMcpPort = () => 3000;

        service = new ContainerHealthService({ pollIntervalMs: 100_000 });
        currentProbeResult = HEALTHY_RESULT;
    });

    teardown(() => {
        service.dispose();
        // Restore originals
        ContainerDetection.probeContainer = origProbe;
        ContainerDetection.getContainerMcpPort = origGetPort;
    });

    // ---- Initial state ----

    test('initial state is unknown', () => {
        assert.strictEqual(service.state, 'unknown');
        assert.strictEqual(service.isConnected, false);
        assert.strictEqual(service.snapshot, null);
    });

    test('isPolling is false before startPolling', () => {
        assert.strictEqual(service.isPolling, false);
    });

    // ---- State transitions: unknown → connected ----

    test('transitions to connected on first healthy poll', async () => {
        currentProbeResult = HEALTHY_RESULT;
        await service.poll();
        assert.strictEqual(service.state, 'connected');
        assert.strictEqual(service.isConnected, true);
    });

    // ---- State transitions: connected → degraded ----

    test('transitions to degraded when dashboard is down', async () => {
        currentProbeResult = HEALTHY_RESULT;
        await service.poll();
        assert.strictEqual(service.state, 'connected');

        currentProbeResult = DEGRADED_RESULT;
        await service.poll();
        assert.strictEqual(service.state, 'degraded');
        assert.strictEqual(service.isConnected, false);
    });

    // ---- State transitions: connected → disconnected (after consecutive failures) ----

    test('transitions to disconnected after 3 consecutive failures', async () => {
        currentProbeResult = HEALTHY_RESULT;
        await service.poll();
        assert.strictEqual(service.state, 'connected');

        currentProbeResult = FAILED_RESULT;
        // First two failures keep current state (transient)
        await service.poll();
        assert.strictEqual(service.state, 'connected');
        await service.poll();
        assert.strictEqual(service.state, 'connected');
        // Third failure triggers disconnected
        await service.poll();
        assert.strictEqual(service.state, 'disconnected');
    });

    // ---- State transitions: disconnected → reconnected ----

    test('transitions to reconnected after being disconnected', async () => {
        // Get to connected
        currentProbeResult = HEALTHY_RESULT;
        await service.poll();
        assert.strictEqual(service.state, 'connected');

        // Get to disconnected
        currentProbeResult = FAILED_RESULT;
        await service.poll();
        await service.poll();
        await service.poll();
        assert.strictEqual(service.state, 'disconnected');

        // Recover
        currentProbeResult = HEALTHY_RESULT;
        await service.poll();
        assert.strictEqual(service.state, 'reconnected');
        assert.strictEqual(service.isConnected, true);
    });

    // ---- State transitions: degraded → reconnected ----

    test('transitions to reconnected from degraded', async () => {
        currentProbeResult = HEALTHY_RESULT;
        await service.poll();

        currentProbeResult = DEGRADED_RESULT;
        await service.poll();
        assert.strictEqual(service.state, 'degraded');

        currentProbeResult = HEALTHY_RESULT;
        await service.poll();
        assert.strictEqual(service.state, 'reconnected');
    });

    // ---- Consecutive failures counter resets on success ----

    test('consecutive failures reset on healthy probe', async () => {
        currentProbeResult = HEALTHY_RESULT;
        await service.poll();

        currentProbeResult = FAILED_RESULT;
        await service.poll();
        await service.poll();
        assert.ok(service.snapshot!.consecutiveFailures === 2);

        currentProbeResult = HEALTHY_RESULT;
        await service.poll();
        assert.strictEqual(service.snapshot!.consecutiveFailures, 0);
    });

    // ---- Event emission ----

    test('emits state-specific event on transition', async () => {
        const events: string[] = [];
        service.on('connected', () => events.push('connected'));
        service.on('degraded', () => events.push('degraded'));
        service.on('disconnected', () => events.push('disconnected'));
        service.on('reconnected', () => events.push('reconnected'));

        currentProbeResult = HEALTHY_RESULT;
        await service.poll(); // → connected
        assert.deepStrictEqual(events, ['connected']);

        currentProbeResult = DEGRADED_RESULT;
        await service.poll(); // → degraded
        assert.deepStrictEqual(events, ['connected', 'degraded']);
    });

    test('emits stateChanged on every transition', async () => {
        let changeCount = 0;
        service.on('stateChanged', () => changeCount++);

        currentProbeResult = HEALTHY_RESULT;
        await service.poll(); // unknown → connected
        assert.strictEqual(changeCount, 1);

        // Same state → no event
        await service.poll();
        assert.strictEqual(changeCount, 1);

        currentProbeResult = DEGRADED_RESULT;
        await service.poll(); // connected → degraded
        assert.strictEqual(changeCount, 2);
    });

    test('does not emit when state stays the same', async () => {
        let changeCount = 0;
        service.on('stateChanged', () => changeCount++);

        currentProbeResult = HEALTHY_RESULT;
        await service.poll(); // unknown → connected (fires)
        await service.poll(); // connected → connected (no fire)
        await service.poll(); // connected → connected (no fire)
        assert.strictEqual(changeCount, 1);
    });

    // ---- Snapshot data ----

    test('snapshot contains expected fields', async () => {
        currentProbeResult = HEALTHY_RESULT;
        const snap = await service.poll();

        assert.strictEqual(snap.state, 'connected');
        assert.strictEqual(snap.mcpHealthy, true);
        assert.strictEqual(snap.dashboardHealthy, true);
        assert.strictEqual(snap.consecutiveFailures, 0);
        assert.ok(snap.lastCheck > 0);
        assert.strictEqual(snap.uptimeSeconds, 120);
    });

    test('snapshot reflects degraded probe', async () => {
        currentProbeResult = HEALTHY_RESULT;
        await service.poll();

        currentProbeResult = DEGRADED_RESULT;
        const snap = await service.poll();

        assert.strictEqual(snap.mcpHealthy, true);
        assert.strictEqual(snap.dashboardHealthy, false);
        assert.strictEqual(snap.state, 'degraded');
    });

    // ---- Polling lifecycle ----

    test('startPolling sets isPolling to true', async () => {
        await service.startPolling();
        assert.strictEqual(service.isPolling, true);
        service.stopPolling();
    });

    test('stopPolling sets isPolling to false', async () => {
        await service.startPolling();
        service.stopPolling();
        assert.strictEqual(service.isPolling, false);
    });

    test('dispose stops polling and removes listeners', async () => {
        let eventCount = 0;
        service.on('stateChanged', () => eventCount++);

        await service.startPolling();
        service.dispose();

        assert.strictEqual(service.isPolling, false);
        // After dispose, emitting should not invoke our handler
        // (removeAllListeners was called)
        assert.strictEqual(service.listenerCount('stateChanged'), 0);
    });

    // ---- Edge: unknown → disconnected (first probe fails) ----

    test('unknown transitions to disconnected on first failure', async () => {
        currentProbeResult = FAILED_RESULT;
        await service.poll(); // unknown → disconnected (first failure, state was unknown)
        assert.strictEqual(service.state, 'disconnected');
    });
});
