/**
 * Unit tests for SessionInterceptRegistry
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
    EventEmitter: class MockEventEmitter {
        private listeners: Array<(...args: any[]) => void> = [];
        event = (listener: (...args: any[]) => void) => {
            this.listeners.push(listener);
            return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
        };
        fire(...args: any[]) { this.listeners.forEach(l => l(...args)); }
        dispose() { this.listeners = []; }
    }
}));

import { SessionInterceptRegistry } from '../session-intercept-registry';
import type { SessionEntry, SerializedRegistry } from '../session-types';

/**
 * Mock vscode.Memento for testing persistence
 */
class MockMemento {
    private store = new Map<string, any>();

    get<T>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
    }

    async update(key: string, value: any): Promise<void> {
        this.store.set(key, value);
    }

    keys(): readonly string[] {
        return [...this.store.keys()];
    }

    /** Test helper: read raw stored value */
    _raw<T>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
    }

    /** Test helper: set raw value for restore tests */
    _set(key: string, value: any): void {
        this.store.set(key, value);
    }
}

function makeRegistry(memento?: MockMemento): { registry: SessionInterceptRegistry; memento: MockMemento } {
    const m = memento ?? new MockMemento();
    const registry = new SessionInterceptRegistry(m as any);
    return { registry, memento: m };
}

const WS = 'ws-test';
const PLAN = 'plan-test';
const SESSION = 'sess-001';

function makeRegisterParams(overrides: Partial<Parameters<SessionInterceptRegistry['register']>[0]> = {}) {
    return {
        sessionId: SESSION,
        workspaceId: WS,
        planId: PLAN,
        agentType: 'Executor',
        startedAt: new Date().toISOString(),
        ...overrides,
    };
}

// ---------- Tests ----------

describe('SessionInterceptRegistry', () => {

    // ---- register / get / list lifecycle ----

    describe('register / get / list lifecycle', () => {
        it('registers a session and retrieves it by triple key', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            const entry = registry.get(WS, PLAN, SESSION);
            expect(entry).toBeDefined();
            expect(entry!.sessionId).toBe(SESSION);
            expect(entry!.workspaceId).toBe(WS);
            expect(entry!.planId).toBe(PLAN);
            expect(entry!.agentType).toBe('Executor');
            expect(entry!.status).toBe('active');
            expect(entry!.injectQueue).toEqual([]);
            expect(entry!.stopEscalationCount).toBe(0);
        });

        it('returns undefined for unknown triple key', () => {
            const { registry } = makeRegistry();
            expect(registry.get('x', 'y', 'z')).toBeUndefined();
        });

        it('listActive returns only active/stopping sessions', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams({ sessionId: 's1' }));
            await registry.register(makeRegisterParams({ sessionId: 's2' }));
            await registry.markCompleted(WS, PLAN, 's1');

            const active = registry.listActive();
            expect(active).toHaveLength(1);
            expect(active[0].sessionId).toBe('s2');
        });
    });

    // ---- Triple-ID isolation ----

    describe('triple-ID isolation', () => {
        it('two sessions on the same plan do not collide', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams({ sessionId: 'alpha', agentType: 'Executor' }));
            await registry.register(makeRegisterParams({ sessionId: 'beta', agentType: 'Reviewer' }));

            const alpha = registry.get(WS, PLAN, 'alpha');
            const beta = registry.get(WS, PLAN, 'beta');
            expect(alpha).toBeDefined();
            expect(beta).toBeDefined();
            expect(alpha!.agentType).toBe('Executor');
            expect(beta!.agentType).toBe('Reviewer');
        });

        it('different workspaces with same session ID do not collide', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams({ workspaceId: 'ws-a', sessionId: 'same-id' }));
            await registry.register(makeRegisterParams({ workspaceId: 'ws-b', sessionId: 'same-id' }));

            expect(registry.get('ws-a', PLAN, 'same-id')).toBeDefined();
            expect(registry.get('ws-b', PLAN, 'same-id')).toBeDefined();
        });
    });

    // ---- Persistence round-trip ----

    describe('persistence round-trip', () => {
        it('register → persist → restore yields same data', async () => {
            const memento = new MockMemento();
            const { registry: r1 } = makeRegistry(memento);

            await r1.register(makeRegisterParams());
            const before = r1.get(WS, PLAN, SESSION);

            // Create a new registry using same memento and restore
            const { registry: r2 } = makeRegistry(memento);
            await r2.restore();

            const after = r2.get(WS, PLAN, SESSION);
            expect(after).toBeDefined();
            expect(after!.sessionId).toBe(before!.sessionId);
            expect(after!.workspaceId).toBe(before!.workspaceId);
            expect(after!.planId).toBe(before!.planId);
            expect(after!.agentType).toBe(before!.agentType);
            expect(after!.status).toBe(before!.status);
        });

        it('restore prunes entries older than 24h', async () => {
            const memento = new MockMemento();
            const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago

            // Seed storage with an old entry
            const stored: SerializedRegistry = {
                version: 1,
                sessions: {
                    [`${WS}::${PLAN}::old-sess`]: {
                        sessionId: 'old-sess',
                        workspaceId: WS,
                        planId: PLAN,
                        agentType: 'Executor',
                        startedAt: oldDate,
                        status: 'active',
                        injectQueue: [],
                        stopEscalationCount: 0,
                    }
                }
            };
            memento._set('sessionInterceptRegistry', stored);

            const { registry } = makeRegistry(memento);
            await registry.restore();

            expect(registry.get(WS, PLAN, 'old-sess')).toBeUndefined();
        });
    });

    // ---- Interrupt queue ----

    describe('interrupt queue', () => {
        it('queues interrupt and sets status to stopping', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            const result = await registry.queueInterrupt(WS, PLAN, SESSION, 'user clicked stop');
            expect(result).toBe(true);

            const entry = registry.get(WS, PLAN, SESSION)!;
            expect(entry.status).toBe('stopping');
            expect(entry.interruptDirective).toBeDefined();
            expect(entry.interruptDirective!.escalationLevel).toBe(1);
            expect(entry.interruptDirective!.reason).toBe('user clicked stop');
        });

        it('dequeues interrupt directive', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());
            await registry.queueInterrupt(WS, PLAN, SESSION);

            const directive = registry.dequeueInterrupt(WS, PLAN, SESSION);
            expect(directive).toBeDefined();
            expect(directive!.escalationLevel).toBe(1);
        });

        it('returns undefined when no directive queued', () => {
            const { registry } = makeRegistry();
            expect(registry.dequeueInterrupt(WS, PLAN, 'nonexistent')).toBeUndefined();
        });

        it('escalation increments from 1 → 2 → 3 (capped)', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());
            await registry.queueInterrupt(WS, PLAN, SESSION);

            const l2 = await registry.incrementEscalation(WS, PLAN, SESSION);
            expect(l2).toBe(2);

            const l3 = await registry.incrementEscalation(WS, PLAN, SESSION);
            expect(l3).toBe(3);

            // Should cap at 3
            const still3 = await registry.incrementEscalation(WS, PLAN, SESSION);
            expect(still3).toBe(3);
        });

        it('queueInterrupt returns false for non-active session', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());
            await registry.markCompleted(WS, PLAN, SESSION);

            const result = await registry.queueInterrupt(WS, PLAN, SESSION);
            expect(result).toBe(false);
        });
    });

    // ---- Inject queue ----

    describe('inject queue', () => {
        it('queues and dequeues injects in FIFO order', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            await registry.queueInject(WS, PLAN, SESSION, 'First guidance');
            await registry.queueInject(WS, PLAN, SESSION, 'Second guidance');
            await registry.queueInject(WS, PLAN, SESSION, 'Third guidance');

            const payloads = await registry.dequeueAllInjects(WS, PLAN, SESSION);
            expect(payloads).toHaveLength(3);
            expect(payloads[0].text).toBe('First guidance');
            expect(payloads[1].text).toBe('Second guidance');
            expect(payloads[2].text).toBe('Third guidance');
        });

        it('dequeue clears the queue', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());
            await registry.queueInject(WS, PLAN, SESSION, 'Some guidance');

            await registry.dequeueAllInjects(WS, PLAN, SESSION);
            const second = await registry.dequeueAllInjects(WS, PLAN, SESSION);
            expect(second).toHaveLength(0);
        });

        it('queueInject returns false for non-active session', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());
            await registry.markCompleted(WS, PLAN, SESSION);

            const result = await registry.queueInject(WS, PLAN, SESSION, 'text');
            expect(result).toBe(false);
        });

        it('dequeueAllInjects returns empty array for unknown session', async () => {
            const { registry } = makeRegistry();
            const result = await registry.dequeueAllInjects(WS, PLAN, 'nope');
            expect(result).toEqual([]);
        });
    });

    // ---- Status transitions ----

    describe('markStopping / markCompleted status transitions', () => {
        it('markStopping sets status to stopping', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            const result = await registry.markStopping(WS, PLAN, SESSION);
            expect(result).toBe(true);
            expect(registry.get(WS, PLAN, SESSION)!.status).toBe('stopping');
        });

        it('markStopping returns false for unknown session', async () => {
            const { registry } = makeRegistry();
            const result = await registry.markStopping(WS, PLAN, 'nope');
            expect(result).toBe(false);
        });

        it('markCompleted sets status to completed', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            await registry.markCompleted(WS, PLAN, SESSION);
            expect(registry.get(WS, PLAN, SESSION)!.status).toBe('completed');
        });

        it('markCompleted propagates notification to parent session', async () => {
            const { registry } = makeRegistry();

            // Register parent (hub) session
            await registry.register(makeRegisterParams({
                sessionId: 'parent-hub',
                agentType: 'Coordinator',
            }));

            // Register child session with parent ref
            await registry.register(makeRegisterParams({
                sessionId: 'child-spoke',
                agentType: 'Executor',
                parentSessionId: 'parent-hub',
            }));

            // Complete child with stop reason
            await registry.markCompleted(WS, PLAN, 'child-spoke', 'user_stopped');

            // Parent's inject queue should have a notification
            const parent = registry.get(WS, PLAN, 'parent-hub')!;
            expect(parent.injectQueue).toHaveLength(1);
            expect(parent.injectQueue[0].text).toContain('SUBAGENT INTERRUPTED');
            expect(parent.injectQueue[0].text).toContain('Executor');
        });
    });

    // ---- onDidChange fires on every mutation ----

    describe('onDidChange event', () => {
        it('fires on register', async () => {
            const { registry } = makeRegistry();
            let fired = 0;
            registry.onDidChange(() => { fired++; });

            await registry.register(makeRegisterParams());
            expect(fired).toBe(1);
        });

        it('fires on markStopping', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            let fired = 0;
            registry.onDidChange(() => { fired++; });

            await registry.markStopping(WS, PLAN, SESSION);
            expect(fired).toBe(1);
        });

        it('fires on queueInject', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            let fired = 0;
            registry.onDidChange(() => { fired++; });

            await registry.queueInject(WS, PLAN, SESSION, 'test');
            expect(fired).toBe(1);
        });

        it('fires on queueInterrupt', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            let fired = 0;
            registry.onDidChange(() => { fired++; });

            await registry.queueInterrupt(WS, PLAN, SESSION);
            expect(fired).toBe(1);
        });
    });

    // ---- pruneCompleted ----

    describe('pruneCompleted', () => {
        it('removes completed sessions older than maxAge', async () => {
            const { registry, memento } = makeRegistry();
            const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago

            await registry.register(makeRegisterParams({
                sessionId: 'old-completed',
                startedAt: oldDate,
            }));
            await registry.markCompleted(WS, PLAN, 'old-completed');

            // Also register a recent active session
            await registry.register(makeRegisterParams({
                sessionId: 'recent-active',
            }));

            const pruned = await registry.pruneCompleted(1 * 60 * 60 * 1000); // 1h maxAge
            expect(pruned).toBe(1);

            expect(registry.get(WS, PLAN, 'old-completed')).toBeUndefined();
            expect(registry.get(WS, PLAN, 'recent-active')).toBeDefined();
        });

        it('returns 0 when nothing to prune', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            const pruned = await registry.pruneCompleted();
            expect(pruned).toBe(0);
        });
    });

    // ---- getBySessionId ----

    describe('getBySessionId', () => {
        it('finds session by session ID across all triple keys', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams({ sessionId: 'unique-id' }));

            const found = registry.getBySessionId('unique-id');
            expect(found).toBeDefined();
            expect(found!.sessionId).toBe('unique-id');
        });

        it('returns undefined for unknown session ID', () => {
            const { registry } = makeRegistry();
            expect(registry.getBySessionId('ghost')).toBeUndefined();
        });
    });

    // ---- getByPlan ----

    describe('getByPlan', () => {
        it('returns all sessions for a specific plan', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams({ sessionId: 's1' }));
            await registry.register(makeRegisterParams({ sessionId: 's2' }));
            await registry.register(makeRegisterParams({ sessionId: 's3', planId: 'other-plan' }));

            const planSessions = registry.getByPlan(WS, PLAN);
            expect(planSessions).toHaveLength(2);
            const ids = planSessions.map(s => s.sessionId).sort();
            expect(ids).toEqual(['s1', 's2']);
        });
    });

    // ---- recordToolCall ----

    describe('recordToolCall', () => {
        it('records first tool call', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            await registry.recordToolCall(WS, PLAN, SESSION, 'memory_plan');

            const entry = registry.get(WS, PLAN, SESSION)!;
            expect(entry.lastToolCall).toBeDefined();
            expect(entry.lastToolCall!.toolName).toBe('memory_plan');
            expect(entry.lastToolCall!.callCount).toBe(1);
        });

        it('increments count for same tool', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            await registry.recordToolCall(WS, PLAN, SESSION, 'memory_plan');
            await registry.recordToolCall(WS, PLAN, SESSION, 'memory_plan');
            await registry.recordToolCall(WS, PLAN, SESSION, 'memory_plan');

            const entry = registry.get(WS, PLAN, SESSION)!;
            expect(entry.lastToolCall!.callCount).toBe(3);
        });

        it('resets count when tool changes', async () => {
            const { registry } = makeRegistry();
            await registry.register(makeRegisterParams());

            await registry.recordToolCall(WS, PLAN, SESSION, 'memory_plan');
            await registry.recordToolCall(WS, PLAN, SESSION, 'memory_plan');
            await registry.recordToolCall(WS, PLAN, SESSION, 'memory_steps');

            const entry = registry.get(WS, PLAN, SESSION)!;
            expect(entry.lastToolCall!.toolName).toBe('memory_steps');
            expect(entry.lastToolCall!.callCount).toBe(1);
        });
    });

    // ---- dispose ----

    describe('dispose', () => {
        it('disposes without error', () => {
            const { registry } = makeRegistry();
            expect(() => registry.dispose()).not.toThrow();
        });
    });
});
