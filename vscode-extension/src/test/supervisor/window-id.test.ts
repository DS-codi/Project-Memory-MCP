import * as assert from 'assert';
import { buildSupervisorWindowId } from '../../supervisor/window-id';

suite('buildSupervisorWindowId', () => {
    test('uses workspace, machine, pid, and explicit nonce', () => {
        const id = buildSupervisorWindowId({
            workspacePath: 'C:\\repo\\workspace',
            machineId: 'machine-1',
            processId: 4242,
            sessionNonce: 'nonce-123',
        });

        assert.strictEqual(id, 'C:\\repo\\workspace|machine-1|pid:4242|nonce-123');
    });

    test('falls back to no-workspace token', () => {
        const id = buildSupervisorWindowId({
            machineId: 'machine-2',
            processId: 99,
            sessionNonce: 'nonce-xyz',
        });

        assert.strictEqual(id, 'no-workspace|machine-2|pid:99|nonce-xyz');
    });

    test('generates unique IDs when nonce is omitted', () => {
        const first = buildSupervisorWindowId({
            workspacePath: 'C:\\repo\\workspace',
            machineId: 'machine-3',
            processId: 1,
        });
        const second = buildSupervisorWindowId({
            workspacePath: 'C:\\repo\\workspace',
            machineId: 'machine-3',
            processId: 1,
        });

        assert.notStrictEqual(first, second);
    });
});
