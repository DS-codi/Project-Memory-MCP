import { randomUUID } from 'crypto';
import { SPAWN_REASON_CODES, type SpawnReasonCode } from './spawn-reason-codes';

export type SpawnLanePolicy = 'reject' | 'queue1';

export interface ActiveRunRecord {
    run_id: string;
    workspace_id: string;
    plan_id: string;
    agent_name: string;
    request_fingerprint: string;
    status: 'active' | 'cancelled' | 'released';
    acquired_at: string;
    last_seen_at: string;
    release_reason_code?: SpawnReasonCode;
}

interface QueuedRunRecord {
    queued_at: string;
    agent_name: string;
    request_fingerprint: string;
}

interface LaneState {
    active?: ActiveRunRecord;
    queued?: QueuedRunRecord;
}

export interface AcquireLaneParams {
    workspace_id: string;
    plan_id: string;
    agent_name: string;
    request_fingerprint: string;
    policy?: SpawnLanePolicy;
    duplicate_debounce_ms?: number;
}

export type AcquireLaneResult =
    | {
        accepted: true;
        reason_code: typeof SPAWN_REASON_CODES.SPAWN_ACCEPTED;
        lane_key: string;
        run: ActiveRunRecord;
    }
    | {
        accepted: false;
        reason_code:
            | typeof SPAWN_REASON_CODES.SPAWN_REJECT_ACTIVE_LANE
            | typeof SPAWN_REASON_CODES.SPAWN_REJECT_DUPLICATE_DEBOUNCE
            | typeof SPAWN_REASON_CODES.SPAWN_QUEUED_OPTIONAL;
        lane_key: string;
        active_run_id?: string;
        queued?: boolean;
        queue_length?: number;
    };

const DEFAULT_DUPLICATE_DEBOUNCE_MS = 2500;
const DEFAULT_STALE_MS = 10 * 60 * 1000;

const lanes = new Map<string, LaneState>();

function laneKey(workspace_id: string, plan_id: string): string {
    return `${workspace_id}::${plan_id}`;
}

function nowISO(): string {
    return new Date().toISOString();
}

function ageMs(iso: string): number {
    return Date.now() - new Date(iso).getTime();
}

function isStaleRecord(record: ActiveRunRecord, staleMs: number): boolean {
    return ageMs(record.last_seen_at) > staleMs;
}

export function acquire(params: AcquireLaneParams): AcquireLaneResult {
    const policy = params.policy ?? 'reject';
    const duplicateDebounceMs = params.duplicate_debounce_ms ?? DEFAULT_DUPLICATE_DEBOUNCE_MS;
    const key = laneKey(params.workspace_id, params.plan_id);
    const current = lanes.get(key);

    if (current?.active && isStaleRecord(current.active, DEFAULT_STALE_MS)) {
        lanes.delete(key);
    }

    const lane = lanes.get(key);
    if (lane?.active) {
        if (
            lane.active.request_fingerprint === params.request_fingerprint &&
            ageMs(lane.active.last_seen_at) <= duplicateDebounceMs
        ) {
            lane.active.last_seen_at = nowISO();
            return {
                accepted: false,
                reason_code: SPAWN_REASON_CODES.SPAWN_REJECT_DUPLICATE_DEBOUNCE,
                lane_key: key,
                active_run_id: lane.active.run_id
            };
        }

        if (policy === 'queue1') {
            if (!lane.queued) {
                lane.queued = {
                    queued_at: nowISO(),
                    agent_name: params.agent_name,
                    request_fingerprint: params.request_fingerprint
                };
                return {
                    accepted: false,
                    reason_code: SPAWN_REASON_CODES.SPAWN_QUEUED_OPTIONAL,
                    lane_key: key,
                    active_run_id: lane.active.run_id,
                    queued: true,
                    queue_length: 1
                };
            }
        }

        return {
            accepted: false,
            reason_code: SPAWN_REASON_CODES.SPAWN_REJECT_ACTIVE_LANE,
            lane_key: key,
            active_run_id: lane.active.run_id,
            queued: Boolean(lane.queued),
            queue_length: lane.queued ? 1 : 0
        };
    }

    const run: ActiveRunRecord = {
        run_id: randomUUID(),
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        agent_name: params.agent_name,
        request_fingerprint: params.request_fingerprint,
        status: 'active',
        acquired_at: nowISO(),
        last_seen_at: nowISO()
    };

    lanes.set(key, { active: run });

    return {
        accepted: true,
        reason_code: SPAWN_REASON_CODES.SPAWN_ACCEPTED,
        lane_key: key,
        run
    };
}

export function peek(workspace_id: string, plan_id: string): LaneState | undefined {
    return lanes.get(laneKey(workspace_id, plan_id));
}

export function release(
    workspace_id: string,
    plan_id: string,
    run_id?: string,
    release_reason_code: SpawnReasonCode = SPAWN_REASON_CODES.SPAWN_RELEASE_COMPLETE
): { released: boolean; reason_code: SpawnReasonCode } {
    const key = laneKey(workspace_id, plan_id);
    const lane = lanes.get(key);
    if (!lane?.active) {
        return { released: false, reason_code: release_reason_code };
    }

    if (run_id && lane.active.run_id !== run_id) {
        return { released: false, reason_code: release_reason_code };
    }

    lane.active.status = 'released';
    lane.active.release_reason_code = release_reason_code;
    lane.active.last_seen_at = nowISO();
    lanes.delete(key);

    return { released: true, reason_code: release_reason_code };
}

export function markCancelled(
    workspace_id: string,
    plan_id: string,
    run_id?: string,
    reason_code: SpawnReasonCode = SPAWN_REASON_CODES.SPAWN_CANCELLED_TOKEN
): { cancelled: boolean; reason_code: SpawnReasonCode } {
    const lane = lanes.get(laneKey(workspace_id, plan_id));
    if (!lane?.active) {
        return { cancelled: false, reason_code };
    }

    if (run_id && lane.active.run_id !== run_id) {
        return { cancelled: false, reason_code };
    }

    lane.active.status = 'cancelled';
    lane.active.release_reason_code = reason_code;
    lane.active.last_seen_at = nowISO();

    return { cancelled: true, reason_code };
}

export function isStale(
    workspace_id: string,
    plan_id: string,
    stale_ms: number = DEFAULT_STALE_MS
): boolean {
    const lane = lanes.get(laneKey(workspace_id, plan_id));
    if (!lane?.active) {
        return false;
    }
    return isStaleRecord(lane.active, stale_ms);
}
