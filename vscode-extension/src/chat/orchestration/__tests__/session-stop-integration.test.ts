/**
 * Integration test: Stop flow end-to-end
 *
 * Uses real SessionInterceptRegistry + real interceptToolResponse
 * (with MockMemento and mocked vscode) to verify the full stop-directive lifecycle.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => {
    class MockLanguageModelTextPart {
        value: string;
        constructor(text: string) { this.value = text; }
    }

    class MockLanguageModelToolResult {
        content: any[];
        constructor(parts: any[]) { this.content = parts; }
    }

    class MockEventEmitter {
        private listeners: Array<(...args: any[]) => void> = [];
        event = (listener: (...args: any[]) => void) => {
            this.listeners.push(listener);
            return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
        };
        fire(...args: any[]) { this.listeners.forEach(l => l(...args)); }
        dispose() { this.listeners = []; }
    }

    return {
        LanguageModelToolResult: MockLanguageModelToolResult,
        LanguageModelTextPart: MockLanguageModelTextPart,
        EventEmitter: MockEventEmitter,
    };
});

import * as vscode from 'vscode';
import { SessionInterceptRegistry } from '../session-intercept-registry';
import { interceptToolResponse } from '../tool-response-interceptor';

// ---------- Helpers ----------

class MockMemento {
    private store = new Map<string, any>();
    get<T>(key: string): T | undefined { return this.store.get(key) as T | undefined; }
    async update(key: string, value: any): Promise<void> { this.store.set(key, value); }
    keys(): readonly string[] { return [...this.store.keys()]; }
}

const WS = 'ws-integration';
const PLAN = 'plan-integration';
const HUB_SESSION = 'hub-coordinator';
const CHILD_SESSION = 'child-executor';

function makeResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(text)
    ]);
}

function extractText(result: vscode.LanguageModelToolResult): string {
    return (result.content as any[]).map((p: any) => p.value ?? '').join('');
}

// ---------- Integration: Full stop-directive escalation ----------

describe('Integration: stop flow end-to-end', () => {
    let registry: SessionInterceptRegistry;

    beforeEach(async () => {
        registry = new SessionInterceptRegistry(new MockMemento() as any);

        // 1. Register hub (Coordinator) session
        await registry.register({
            sessionId: HUB_SESSION,
            workspaceId: WS,
            planId: PLAN,
            agentType: 'Coordinator',
            startedAt: new Date().toISOString(),
        });

        // 2. Register child (Executor) session with parentSessionId
        await registry.register({
            sessionId: CHILD_SESSION,
            workspaceId: WS,
            planId: PLAN,
            agentType: 'Executor',
            parentSessionId: HUB_SESSION,
            startedAt: new Date().toISOString(),
        });
    });

    it('escalates L1 → L2 → L3 and notifies parent on termination', async () => {
        // ---- Queue interrupt on child ----
        const queued = await registry.queueInterrupt(WS, PLAN, CHILD_SESSION, 'User clicked stop');
        expect(queued).toBe(true);

        // Verify child is now stopping
        const childBefore = registry.get(WS, PLAN, CHILD_SESSION)!;
        expect(childBefore.status).toBe('stopping');
        expect(childBefore.interruptDirective!.escalationLevel).toBe(1);

        // ---- Call 1: interceptToolResponse → L1 graceful ----
        const r1 = await interceptToolResponse(
            registry, CHILD_SESSION, 'memory_steps', makeResult('step data')
        );
        const t1 = extractText(r1);
        expect(t1).toContain('⚠️ SESSION STOP');
        expect(t1).toContain('step data'); // L1 includes original

        // ---- Call 2: interceptToolResponse → L2 immediate ----
        const r2 = await interceptToolResponse(
            registry, CHILD_SESSION, 'memory_plan', makeResult('plan data')
        );
        const t2 = extractText(r2);
        expect(t2).toContain('🛑 SESSION STOP');
        expect(t2).not.toContain('plan data'); // L2 does NOT include original

        // ---- Call 3: interceptToolResponse → L3 terminated ----
        const r3 = await interceptToolResponse(
            registry, CHILD_SESSION, 'memory_agent', makeResult('agent data')
        );
        const t3 = extractText(r3);
        expect(t3).toContain('❌ SESSION TERMINATED');
        expect(t3).toContain(CHILD_SESSION);

        // ---- Verify child session marked completed ----
        const childAfter = registry.get(WS, PLAN, CHILD_SESSION)!;
        expect(childAfter.status).toBe('completed');

        // ---- Verify parent hub session has notification inject queued ----
        const parent = registry.get(WS, PLAN, HUB_SESSION)!;
        expect(parent.injectQueue).toHaveLength(1);
        expect(parent.injectQueue[0].text).toContain('SUBAGENT INTERRUPTED');
        expect(parent.injectQueue[0].text).toContain('Executor');
        expect(parent.injectQueue[0].text).toContain(CHILD_SESSION);
    });

    it('hub receives inject notification when processing its own tool call', async () => {
        // Queue interrupt + run through escalation to trigger parent notification
        await registry.queueInterrupt(WS, PLAN, CHILD_SESSION);
        await interceptToolResponse(registry, CHILD_SESSION, 'tool1', makeResult('a'));
        await interceptToolResponse(registry, CHILD_SESSION, 'tool2', makeResult('b'));
        await interceptToolResponse(registry, CHILD_SESSION, 'tool3', makeResult('c')); // L3, triggers parent inject

        // Now hub makes a tool call — should receive the inject notification
        const hubResult = await interceptToolResponse(
            registry, HUB_SESSION, 'memory_plan', makeResult('hub plan data')
        );
        const hubText = extractText(hubResult);

        expect(hubText).toContain('📝 USER GUIDANCE');
        expect(hubText).toContain('SUBAGENT INTERRUPTED');
        expect(hubText).toContain('hub plan data'); // original data included too
    });

    it('subsequent hub tool call after inject drain returns clean response', async () => {
        // Trigger the full stop flow to queue parent inject
        await registry.queueInterrupt(WS, PLAN, CHILD_SESSION);
        await interceptToolResponse(registry, CHILD_SESSION, 't1', makeResult('a'));
        await interceptToolResponse(registry, CHILD_SESSION, 't2', makeResult('b'));
        await interceptToolResponse(registry, CHILD_SESSION, 't3', makeResult('c'));

        // First hub call: drains inject
        await interceptToolResponse(registry, HUB_SESSION, 'memory_plan', makeResult('x'));

        // Second hub call: should be clean pass-through
        const r2 = await interceptToolResponse(
            registry, HUB_SESSION, 'memory_plan', makeResult('clean data')
        );
        const text = extractText(r2);
        expect(text).toBe('clean data');
    });

    it('tool call recording tracks names and counts through stop flow', async () => {
        await registry.queueInterrupt(WS, PLAN, CHILD_SESSION);

        // Three calls with same tool
        await interceptToolResponse(registry, CHILD_SESSION, 'memory_steps', makeResult('a'));
        await interceptToolResponse(registry, CHILD_SESSION, 'memory_steps', makeResult('b'));
        await interceptToolResponse(registry, CHILD_SESSION, 'memory_steps', makeResult('c'));

        const child = registry.get(WS, PLAN, CHILD_SESSION)!;
        expect(child.lastToolCall).toBeDefined();
        expect(child.lastToolCall!.toolName).toBe('memory_steps');
        expect(child.lastToolCall!.callCount).toBe(3);
    });
});
