/**
 * Spawn Serialization Tests
 *
 * Tests the active-run-registry single-flight acquire/release,
 * duplicate-fingerprint debounce suppression, and reason-code contract.
 */
import * as assert from 'assert';
import {
    acquire,
    peek,
    release,
    markCancelled,
    isStale,
    type AcquireLaneResult,
    type AcquireLaneParams
} from '../../chat/orchestration/active-run-registry';
import { SPAWN_REASON_CODES, type SpawnReasonCode } from '../../chat/orchestration/spawn-reason-codes';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let counter = 0;
/** Generate unique workspace/plan IDs so each test gets an isolated lane. */
function uniqueIds(): { workspace_id: string; plan_id: string } {
    counter++;
    return {
        workspace_id: `ws_test_${counter}_${Date.now()}`,
        plan_id: `plan_test_${counter}_${Date.now()}`
    };
}

function baseParams(ids: { workspace_id: string; plan_id: string }): AcquireLaneParams {
    return {
        ...ids,
        agent_name: 'Executor',
        request_fingerprint: `fp_${ids.plan_id}`
    };
}

/* ================================================================== */
/*  SUITE: acquire / accept path                                      */
/* ================================================================== */

suite('ActiveRunRegistry — accept path', () => {
    test('acquire succeeds on an empty lane', () => {
        const ids = uniqueIds();
        const result = acquire(baseParams(ids));

        assert.strictEqual(result.accepted, true);
        assert.strictEqual(result.reason_code, SPAWN_REASON_CODES.SPAWN_ACCEPTED);
        if (result.accepted) {
            assert.ok(result.run.run_id, 'run_id should be a non-empty string');
            assert.strictEqual(result.run.status, 'active');
            assert.strictEqual(result.run.workspace_id, ids.workspace_id);
            assert.strictEqual(result.run.plan_id, ids.plan_id);
            assert.strictEqual(result.run.agent_name, 'Executor');
        }

        // cleanup
        release(ids.workspace_id, ids.plan_id);
    });

    test('peek returns lane state after acquire', () => {
        const ids = uniqueIds();
        acquire(baseParams(ids));

        const lane = peek(ids.workspace_id, ids.plan_id);
        assert.ok(lane, 'lane should exist');
        assert.ok(lane!.active, 'active record should exist');
        assert.strictEqual(lane!.active!.agent_name, 'Executor');

        release(ids.workspace_id, ids.plan_id);
    });

    test('peek returns undefined for an unknown lane', () => {
        const lane = peek('ws_nonexistent_999', 'plan_nonexistent_999');
        assert.strictEqual(lane, undefined);
    });
});

/* ================================================================== */
/*  SUITE: reject path — active lane collision                        */
/* ================================================================== */

suite('ActiveRunRegistry — reject path (active lane)', () => {
    test('second acquire with different fingerprint is rejected', () => {
        const ids = uniqueIds();
        const first = acquire(baseParams(ids));
        assert.strictEqual(first.accepted, true);

        const second = acquire({
            ...ids,
            agent_name: 'Tester',
            request_fingerprint: 'fp_different'
        });
        assert.strictEqual(second.accepted, false);
        assert.strictEqual(second.reason_code, SPAWN_REASON_CODES.SPAWN_REJECT_ACTIVE_LANE);

        if (!second.accepted) {
            assert.ok(second.active_run_id, 'should include the blocking run_id');
        }

        release(ids.workspace_id, ids.plan_id);
    });

    test('rejected result includes queue metadata', () => {
        const ids = uniqueIds();
        acquire(baseParams(ids));

        const rejected = acquire({
            ...ids,
            agent_name: 'Reviewer',
            request_fingerprint: 'fp_other'
        });
        assert.strictEqual(rejected.accepted, false);
        if (!rejected.accepted) {
            assert.strictEqual(rejected.queued, false);
            assert.strictEqual(rejected.queue_length, 0);
        }

        release(ids.workspace_id, ids.plan_id);
    });
});

/* ================================================================== */
/*  SUITE: duplicate-fingerprint debounce suppression                 */
/* ================================================================== */

suite('ActiveRunRegistry — duplicate debounce', () => {
    test('same fingerprint within debounce window returns SPAWN_REJECT_DUPLICATE_DEBOUNCE', () => {
        const ids = uniqueIds();
        const fp = 'fp_duplicate_test';

        // First acquire succeeds
        const first = acquire({ ...ids, agent_name: 'Executor', request_fingerprint: fp });
        assert.strictEqual(first.accepted, true);

        // Immediate second acquire with same fingerprint is debounced
        const second = acquire({
            ...ids,
            agent_name: 'Executor',
            request_fingerprint: fp,
            duplicate_debounce_ms: 60_000 // generous window to avoid timing issues
        });

        assert.strictEqual(second.accepted, false);
        assert.strictEqual(second.reason_code, SPAWN_REASON_CODES.SPAWN_REJECT_DUPLICATE_DEBOUNCE);
        if (!second.accepted) {
            assert.ok(second.active_run_id, 'should reference the existing run');
        }

        release(ids.workspace_id, ids.plan_id);
    });

    test('same fingerprint outside debounce window falls through to normal reject', () => {
        const ids = uniqueIds();
        const fp = 'fp_expired_debounce';

        acquire({ ...ids, agent_name: 'Executor', request_fingerprint: fp });

        // Push last_seen_at into the past so the debounce window is expired
        const lane = peek(ids.workspace_id, ids.plan_id);
        if (lane?.active) {
            lane.active.last_seen_at = new Date(Date.now() - 5000).toISOString();
        }

        const second = acquire({
            ...ids,
            agent_name: 'Executor',
            request_fingerprint: fp,
            duplicate_debounce_ms: 2500 // default window — but last_seen_at is 5s ago
        });

        // Outside debounce window → normal REJECT_ACTIVE_LANE (not debounce)
        assert.strictEqual(second.accepted, false);
        assert.strictEqual(second.reason_code, SPAWN_REASON_CODES.SPAWN_REJECT_ACTIVE_LANE);

        release(ids.workspace_id, ids.plan_id);
    });
});

/* ================================================================== */
/*  SUITE: queue-off path (policy=queue1)                             */
/* ================================================================== */

suite('ActiveRunRegistry — queue1 policy', () => {
    test('queue1 policy queues one request behind the active lane', () => {
        const ids = uniqueIds();
        acquire({ ...ids, agent_name: 'Executor', request_fingerprint: 'fp_active' });

        const queued = acquire({
            ...ids,
            agent_name: 'Tester',
            request_fingerprint: 'fp_queued',
            policy: 'queue1'
        });

        assert.strictEqual(queued.accepted, false);
        assert.strictEqual(queued.reason_code, SPAWN_REASON_CODES.SPAWN_QUEUED_OPTIONAL);
        if (!queued.accepted) {
            assert.strictEqual(queued.queued, true);
            assert.strictEqual(queued.queue_length, 1);
        }

        release(ids.workspace_id, ids.plan_id);
    });

    test('queue1 policy rejects when queue is already full', () => {
        const ids = uniqueIds();
        acquire({ ...ids, agent_name: 'Executor', request_fingerprint: 'fp_active' });

        // First queue → accepted into queue
        const q1 = acquire({
            ...ids,
            agent_name: 'Tester',
            request_fingerprint: 'fp_q1',
            policy: 'queue1'
        });
        assert.strictEqual(q1.reason_code, SPAWN_REASON_CODES.SPAWN_QUEUED_OPTIONAL);

        // Second queue → rejected (queue full)
        const q2 = acquire({
            ...ids,
            agent_name: 'Reviewer',
            request_fingerprint: 'fp_q2',
            policy: 'queue1'
        });
        assert.strictEqual(q2.accepted, false);
        assert.strictEqual(q2.reason_code, SPAWN_REASON_CODES.SPAWN_REJECT_ACTIVE_LANE);
        if (!q2.accepted) {
            assert.strictEqual(q2.queued, true);   // queue exists (from q1)
            assert.strictEqual(q2.queue_length, 1); // but it's full
        }

        release(ids.workspace_id, ids.plan_id);
    });

    test('default policy is reject (no queuing)', () => {
        const ids = uniqueIds();
        acquire({ ...ids, agent_name: 'Executor', request_fingerprint: 'fp_a' });

        const rejected = acquire({
            ...ids,
            agent_name: 'Tester',
            request_fingerprint: 'fp_b'
            // policy defaults to 'reject'
        });
        assert.strictEqual(rejected.accepted, false);
        assert.strictEqual(rejected.reason_code, SPAWN_REASON_CODES.SPAWN_REJECT_ACTIVE_LANE);

        // Verify nothing was queued
        const lane = peek(ids.workspace_id, ids.plan_id);
        assert.strictEqual(lane?.queued, undefined);

        release(ids.workspace_id, ids.plan_id);
    });
});

/* ================================================================== */
/*  SUITE: release                                                    */
/* ================================================================== */

suite('ActiveRunRegistry — release', () => {
    test('release frees a lane for a new acquire', () => {
        const ids = uniqueIds();
        const first = acquire(baseParams(ids));
        assert.strictEqual(first.accepted, true);

        const rel = release(ids.workspace_id, ids.plan_id);
        assert.strictEqual(rel.released, true);
        assert.strictEqual(rel.reason_code, SPAWN_REASON_CODES.SPAWN_RELEASE_COMPLETE);

        // Lane is now free
        const second = acquire(baseParams(ids));
        assert.strictEqual(second.accepted, true);

        release(ids.workspace_id, ids.plan_id);
    });

    test('release with matching run_id succeeds', () => {
        const ids = uniqueIds();
        const result = acquire(baseParams(ids));
        assert.strictEqual(result.accepted, true);
        const runId = result.accepted ? result.run.run_id : '';

        const rel = release(ids.workspace_id, ids.plan_id, runId);
        assert.strictEqual(rel.released, true);
    });

    test('release with mismatched run_id is a no-op', () => {
        const ids = uniqueIds();
        acquire(baseParams(ids));

        const rel = release(ids.workspace_id, ids.plan_id, 'wrong-run-id');
        assert.strictEqual(rel.released, false);

        // Lane is still occupied
        const retry = acquire({ ...ids, agent_name: 'Tester', request_fingerprint: 'fp_x' });
        assert.strictEqual(retry.accepted, false);

        release(ids.workspace_id, ids.plan_id);
    });

    test('release on empty lane returns released=false', () => {
        const ids = uniqueIds();
        const rel = release(ids.workspace_id, ids.plan_id);
        assert.strictEqual(rel.released, false);
    });

    test('release accepts a custom reason code', () => {
        const ids = uniqueIds();
        acquire(baseParams(ids));

        const rel = release(
            ids.workspace_id,
            ids.plan_id,
            undefined,
            SPAWN_REASON_CODES.SPAWN_RELEASE_HANDOFF
        );
        assert.strictEqual(rel.released, true);
        assert.strictEqual(rel.reason_code, SPAWN_REASON_CODES.SPAWN_RELEASE_HANDOFF);
    });
});

/* ================================================================== */
/*  SUITE: markCancelled                                              */
/* ================================================================== */

suite('ActiveRunRegistry — markCancelled', () => {
    test('markCancelled sets run status to cancelled', () => {
        const ids = uniqueIds();
        const acq = acquire(baseParams(ids));
        assert.strictEqual(acq.accepted, true);

        const cancel = markCancelled(ids.workspace_id, ids.plan_id);
        assert.strictEqual(cancel.cancelled, true);
        assert.strictEqual(cancel.reason_code, SPAWN_REASON_CODES.SPAWN_CANCELLED_TOKEN);

        // Lane still exists but run is cancelled
        const lane = peek(ids.workspace_id, ids.plan_id);
        assert.ok(lane?.active);
        assert.strictEqual(lane!.active!.status, 'cancelled');

        release(ids.workspace_id, ids.plan_id);
    });

    test('markCancelled with mismatched run_id is a no-op', () => {
        const ids = uniqueIds();
        acquire(baseParams(ids));

        const cancel = markCancelled(ids.workspace_id, ids.plan_id, 'wrong-id');
        assert.strictEqual(cancel.cancelled, false);

        release(ids.workspace_id, ids.plan_id);
    });

    test('markCancelled on empty lane returns cancelled=false', () => {
        const ids = uniqueIds();
        const cancel = markCancelled(ids.workspace_id, ids.plan_id);
        assert.strictEqual(cancel.cancelled, false);
    });

    test('markCancelled accepts a custom reason code', () => {
        const ids = uniqueIds();
        acquire(baseParams(ids));

        const cancel = markCancelled(
            ids.workspace_id,
            ids.plan_id,
            undefined,
            SPAWN_REASON_CODES.SPAWN_RELEASE_ERROR_PATH
        );
        assert.strictEqual(cancel.cancelled, true);
        assert.strictEqual(cancel.reason_code, SPAWN_REASON_CODES.SPAWN_RELEASE_ERROR_PATH);

        release(ids.workspace_id, ids.plan_id);
    });
});

/* ================================================================== */
/*  SUITE: isStale                                                    */
/* ================================================================== */

suite('ActiveRunRegistry — isStale', () => {
    test('isStale returns false for a fresh run', () => {
        const ids = uniqueIds();
        acquire(baseParams(ids));

        assert.strictEqual(isStale(ids.workspace_id, ids.plan_id), false);

        release(ids.workspace_id, ids.plan_id);
    });

    test('isStale returns false when no lane exists', () => {
        assert.strictEqual(isStale('ws_no_lane', 'plan_no_lane'), false);
    });

    test('isStale returns true when last_seen_at is beyond the threshold', () => {
        const ids = uniqueIds();
        acquire(baseParams(ids));

        // Push last_seen_at into the past so it exceeds the stale threshold
        const lane = peek(ids.workspace_id, ids.plan_id);
        if (lane?.active) {
            lane.active.last_seen_at = new Date(Date.now() - 5000).toISOString();
        }

        // 1000ms threshold, but last_seen_at is 5s ago → stale
        assert.strictEqual(isStale(ids.workspace_id, ids.plan_id, 1000), true);

        release(ids.workspace_id, ids.plan_id);
    });
});

/* ================================================================== */
/*  SUITE: stale auto-eviction                                        */
/* ================================================================== */

suite('ActiveRunRegistry — stale auto-eviction on acquire', () => {
    test('stale active run is evicted and new acquire succeeds', () => {
        const ids = uniqueIds();

        // Acquire a run normally
        const first = acquire(baseParams(ids));
        assert.strictEqual(first.accepted, true);

        // Manipulate the run's last_seen_at to make it appear stale.
        // peek gives us the lane; we can mutate the record since it's the same object.
        const lane = peek(ids.workspace_id, ids.plan_id);
        if (lane?.active) {
            // Set last_seen_at to 20 minutes ago (beyond DEFAULT_STALE_MS of 10 min)
            lane.active.last_seen_at = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        }

        // New acquire should evict the stale run and succeed
        const second = acquire({
            ...ids,
            agent_name: 'Tester',
            request_fingerprint: 'fp_new'
        });
        assert.strictEqual(second.accepted, true);
        assert.strictEqual(second.reason_code, SPAWN_REASON_CODES.SPAWN_ACCEPTED);
        if (second.accepted) {
            assert.strictEqual(second.run.agent_name, 'Tester');
        }

        release(ids.workspace_id, ids.plan_id);
    });
});

/* ================================================================== */
/*  SUITE: reason code contract                                       */
/* ================================================================== */

suite('SpawnReasonCodes — contract', () => {
    const expectedCodes: string[] = [
        'SPAWN_ACCEPTED',
        'SPAWN_REJECT_ACTIVE_LANE',
        'SPAWN_REJECT_DUPLICATE_DEBOUNCE',
        'SPAWN_QUEUED_OPTIONAL',
        'SPAWN_CANCELLED_TOKEN',
        'SPAWN_RELEASE_COMPLETE',
        'SPAWN_RELEASE_HANDOFF',
        'SPAWN_RELEASE_ERROR_PATH',
        'SPAWN_STALE_RECOVERY',
        'SPAWN_PREP_ONLY',
        'SPAWN_PREP_LEGACY_ALIAS',
        'SPAWN_PREP_DEPRECATED_INPUT_IGNORED',
        'SPAWN_PREP_CONTEXT_PARTIAL'
    ];

    test('all expected reason codes are defined', () => {
        for (const code of expectedCodes) {
            assert.ok(
                Object.prototype.hasOwnProperty.call(SPAWN_REASON_CODES, code),
                `SPAWN_REASON_CODES should have key "${code}"`
            );
        }
    });

    test('reason code values match their key names', () => {
        for (const [key, value] of Object.entries(SPAWN_REASON_CODES)) {
            assert.strictEqual(
                key,
                value,
                `SPAWN_REASON_CODES.${key} should equal "${key}" but got "${value}"`
            );
        }
    });

    test('code count matches expected (no unexpected additions)', () => {
        assert.strictEqual(
            Object.keys(SPAWN_REASON_CODES).length,
            expectedCodes.length,
            `Expected ${expectedCodes.length} reason codes, got ${Object.keys(SPAWN_REASON_CODES).length}`
        );
    });

    test('all codes are non-empty strings', () => {
        for (const [key, value] of Object.entries(SPAWN_REASON_CODES)) {
            assert.strictEqual(typeof value, 'string', `${key} should be a string`);
            assert.ok(value.length > 0, `${key} should be non-empty`);
        }
    });
});
