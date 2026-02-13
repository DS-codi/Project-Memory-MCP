/**
 * ContainerStatusBar Unit Tests
 *
 * Verifies that ContainerStatusBar renders the correct icon, label,
 * and tooltip text for each ContainerHealthState.
 *
 * Runs inside the VS Code extension host via mocha/tdd so the real
 * `vscode` module is available.
 *
 * @see Phase 7 — Container Resilience & Auto-Mount
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ContainerStatusBar } from '../../ui/ContainerStatusBar';
import { ContainerHealthService, ContainerHealthSnapshot, ContainerHealthState } from '../../services/ContainerHealthService';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal mock that emulates the parts of ContainerHealthService
 * consumed by ContainerStatusBar (event emission + snapshot).
 */
class MockHealthService extends EventEmitter {
    public mockSnapshot: ContainerHealthSnapshot | null = null;

    get snapshot(): ContainerHealthSnapshot | null {
        return this.mockSnapshot;
    }

    /** Fire a stateChanged event with the given state. */
    fireState(state: ContainerHealthState, extras?: Partial<ContainerHealthSnapshot>): void {
        const snap: ContainerHealthSnapshot = {
            state,
            mcpHealthy: state === 'connected' || state === 'reconnected' || state === 'degraded',
            dashboardHealthy: state === 'connected' || state === 'reconnected',
            lastCheck: Date.now(),
            consecutiveFailures: state === 'disconnected' ? 3 : 0,
            ...extras,
        };
        this.mockSnapshot = snap;
        this.emit('stateChanged', snap);
    }
}

// ---------------------------------------------------------------------------
// State → expected display mapping
// ---------------------------------------------------------------------------

const EXPECTED_ICONS: Record<string, string> = {
    connected:    '$(cloud)',
    reconnected:  '$(cloud)',
    degraded:     '$(warning)',
    disconnected: '$(cloud-offline)',
    unknown:      '$(question)',
    local:        '$(desktop-download)',
};

const EXPECTED_LABELS: Record<string, string> = {
    connected:    'Container',
    reconnected:  'Container (reconnected)',
    degraded:     'Container (degraded)',
    disconnected: 'Container (offline)',
    unknown:      'Container (?)',
    local:        'Local',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('ContainerStatusBar Test Suite', () => {
    let bar: ContainerStatusBar;

    setup(() => {
        bar = new ContainerStatusBar();
    });

    teardown(() => {
        bar.dispose();
    });

    // ---- Initial state ----

    test('defaults to local mode display', () => {
        // Access the underlying status-bar item via any-cast since it's private
        const item = (bar as unknown as { _statusBarItem: vscode.StatusBarItem })._statusBarItem;
        assert.ok(item.text.includes('$(desktop-download)'), `Expected local icon, got: ${item.text}`);
        assert.ok(item.text.includes('Local'), `Expected "Local" label, got: ${item.text}`);
    });

    // ---- Bind with null ----

    test('bind(null) shows local mode', () => {
        bar.bind(null, false);
        const item = (bar as unknown as { _statusBarItem: vscode.StatusBarItem })._statusBarItem;
        assert.ok(item.text.includes('Local'), `Expected "Local", got: ${item.text}`);
    });

    // ---- State-dependent display via mock service ----

    for (const state of ['connected', 'reconnected', 'degraded', 'disconnected'] as ContainerHealthState[]) {
        test(`displays correct icon/label for "${state}" state`, () => {
            const mock = new MockHealthService();
            // Bind with initial snapshot set to 'unknown'
            mock.mockSnapshot = {
                state: 'unknown',
                mcpHealthy: false,
                dashboardHealthy: false,
                lastCheck: Date.now(),
                consecutiveFailures: 0,
            };
            bar.bind(mock as unknown as ContainerHealthService, true);

            // Simulate state transition
            mock.fireState(state);

            const item = (bar as unknown as { _statusBarItem: vscode.StatusBarItem })._statusBarItem;
            const expectedIcon = EXPECTED_ICONS[state];
            const expectedLabel = EXPECTED_LABELS[state];

            assert.ok(
                item.text.includes(expectedIcon),
                `State "${state}": expected icon "${expectedIcon}" in "${item.text}"`,
            );
            assert.ok(
                item.text.includes(expectedLabel),
                `State "${state}": expected label "${expectedLabel}" in "${item.text}"`,
            );
        });
    }

    // ---- Tooltip includes uptime when available ----

    test('tooltip includes uptime when present in snapshot', () => {
        const mock = new MockHealthService();
        mock.mockSnapshot = {
            state: 'unknown',
            mcpHealthy: false,
            dashboardHealthy: false,
            lastCheck: Date.now(),
            consecutiveFailures: 0,
        };
        bar.bind(mock as unknown as ContainerHealthService, true);

        mock.fireState('connected', { uptimeSeconds: 3661 });

        const item = (bar as unknown as { _statusBarItem: vscode.StatusBarItem })._statusBarItem;
        const tooltip = typeof item.tooltip === 'string' ? item.tooltip : '';
        assert.ok(tooltip.includes('Uptime'), `Expected "Uptime" in tooltip, got: "${tooltip}"`);
    });

    // ---- Tooltip includes consecutive failures ----

    test('tooltip includes failure count when > 0', () => {
        const mock = new MockHealthService();
        mock.mockSnapshot = {
            state: 'unknown',
            mcpHealthy: false,
            dashboardHealthy: false,
            lastCheck: Date.now(),
            consecutiveFailures: 0,
        };
        bar.bind(mock as unknown as ContainerHealthService, true);

        mock.fireState('disconnected', { consecutiveFailures: 3 });

        const item = (bar as unknown as { _statusBarItem: vscode.StatusBarItem })._statusBarItem;
        const tooltip = typeof item.tooltip === 'string' ? item.tooltip : '';
        assert.ok(
            tooltip.includes('Consecutive failures'),
            `Expected "Consecutive failures" in tooltip, got: "${tooltip}"`,
        );
    });

    // ---- Dispose cleans up ----

    test('dispose removes stateChanged listener from service', () => {
        const mock = new MockHealthService();
        mock.mockSnapshot = {
            state: 'connected',
            mcpHealthy: true,
            dashboardHealthy: true,
            lastCheck: Date.now(),
            consecutiveFailures: 0,
        };
        bar.bind(mock as unknown as ContainerHealthService, true);

        assert.ok(mock.listenerCount('stateChanged') > 0, 'Should have stateChanged listener');
        bar.dispose();
        assert.strictEqual(mock.listenerCount('stateChanged'), 0, 'Listener should be removed after dispose');
    });
});
