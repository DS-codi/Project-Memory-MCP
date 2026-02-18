/**
 * Session Intercept Registry - Tracks active subagent sessions for stop/inject interception
 * 
 * Manages session lifecycle, interrupt directives, and inject payloads.
 * Persists to VS Code workspaceState to survive extension reloads.
 */

import * as vscode from 'vscode';
import type {
    SessionEntry,
    SessionStatus,
    StopEscalationLevel,
    SerializedRegistry,
    InterruptDirective,
    InjectPayload
} from './session-types';

const STORAGE_KEY = 'sessionInterceptRegistry';
const PRUNE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Registry for tracking and managing subagent sessions
 */
export class SessionInterceptRegistry implements vscode.Disposable {
    private sessions = new Map<string, SessionEntry>();
    private storage: vscode.Memento;
    private changeEmitter = new vscode.EventEmitter<void>();

    readonly onDidChange = this.changeEmitter.event;

    constructor(storage: vscode.Memento) {
        this.storage = storage;
    }

    /**
     * Generate triple-key from components
     */
    private tripleKey(workspaceId: string, planId: string, sessionId: string): string {
        return `${workspaceId}::${planId}::${sessionId}`;
    }

    /**
     * Restore sessions from persistent storage
     */
    async restore(): Promise<void> {
        const stored = this.storage.get<SerializedRegistry>(STORAGE_KEY);
        if (!stored || stored.version !== 1) {
            return;
        }

        const now = Date.now();
        for (const [key, entry] of Object.entries(stored.sessions)) {
            // Prune entries older than 24 hours
            const age = now - new Date(entry.startedAt).getTime();
            if (age < PRUNE_AGE_MS) {
                this.sessions.set(key, entry);
            }
        }
    }

    /**
     * Persist sessions to storage
     */
    private async persist(): Promise<void> {
        const serialized: SerializedRegistry = {
            version: 1,
            sessions: Object.fromEntries(this.sessions.entries())
        };
        await this.storage.update(STORAGE_KEY, serialized);
        this.changeEmitter.fire();
    }

    /**
     * Register a new session
     */
    async register(params: {
        sessionId: string;
        workspaceId: string;
        planId: string;
        agentType: string;
        parentSessionId?: string;
        startedAt: string;
    }): Promise<void> {
        const key = this.tripleKey(params.workspaceId, params.planId, params.sessionId);
        const entry: SessionEntry = {
            ...params,
            status: 'active',
            injectQueue: [],
            stopEscalationCount: 0
        };
        this.sessions.set(key, entry);
        await this.persist();
    }

    /**
     * Get session by triple-key components
     */
    get(workspaceId: string, planId: string, sessionId: string): SessionEntry | undefined {
        const key = this.tripleKey(workspaceId, planId, sessionId);
        return this.sessions.get(key);
    }

    /**
     * Get session by session ID only (scans all entries)
     */
    getBySessionId(sessionId: string): SessionEntry | undefined {
        for (const entry of this.sessions.values()) {
            if (entry.sessionId === sessionId) {
                return entry;
            }
        }
        return undefined;
    }

    /**
     * Get all sessions for a specific plan
     */
    getByPlan(workspaceId: string, planId: string): SessionEntry[] {
        const results: SessionEntry[] = [];
        const prefix = `${workspaceId}::${planId}::`;
        for (const [key, entry] of this.sessions.entries()) {
            if (key.startsWith(prefix)) {
                results.push(entry);
            }
        }
        return results;
    }

    /**
     * Mark session as stopping
     */
    async markStopping(workspaceId: string, planId: string, sessionId: string): Promise<boolean> {
        const entry = this.get(workspaceId, planId, sessionId);
        if (!entry) return false;
        entry.status = 'stopping';
        await this.persist();
        return true;
    }

    /**
     * Mark session as completed
     */
    async markCompleted(
        workspaceId: string,
        planId: string,
        sessionId: string,
        stopReason?: string
    ): Promise<void> {
        const entry = this.get(workspaceId, planId, sessionId);
        if (!entry) return;

        entry.status = 'completed';
        await this.persist();

        // Propagate stop notification to parent if exists
        if (stopReason && entry.parentSessionId) {
            const parentEntry = this.getBySessionId(entry.parentSessionId);
            if (parentEntry && parentEntry.status === 'active') {
                const notificationText = `⚠️ SUBAGENT INTERRUPTED: Agent "${entry.agentType}" (session ${entry.sessionId}) was stopped by the user. Check plan state and decide whether to re-attempt or proceed differently.`;
                await this.queueInject(
                    parentEntry.workspaceId,
                    parentEntry.planId,
                    parentEntry.sessionId,
                    notificationText
                );
            }
        }
    }

    /**
     * List all active sessions
     */
    listActive(): SessionEntry[] {
        return Array.from(this.sessions.values()).filter(
            entry => entry.status === 'active' || entry.status === 'stopping'
        );
    }

    /**
     * Queue an interrupt directive
     */
    async queueInterrupt(
        workspaceId: string,
        planId: string,
        sessionId: string,
        reason?: string
    ): Promise<boolean> {
        const entry = this.get(workspaceId, planId, sessionId);
        if (!entry || entry.status !== 'active') return false;

        entry.interruptDirective = {
            requestedAt: new Date().toISOString(),
            escalationLevel: 1,
            reason
        };
        entry.stopEscalationCount = 1;  // Sync with initial escalation level
        entry.status = 'stopping';
        await this.persist();
        return true;
    }

    /**
     * Dequeue and return interrupt directive
     */
    dequeueInterrupt(
        workspaceId: string,
        planId: string,
        sessionId: string
    ): InterruptDirective | undefined {
        const entry = this.get(workspaceId, planId, sessionId);
        if (!entry || !entry.interruptDirective) return undefined;
        return entry.interruptDirective;
    }

    /**
     * Increment escalation level (1→2→3, capped at 3)
     */
    async incrementEscalation(
        workspaceId: string,
        planId: string,
        sessionId: string
    ): Promise<StopEscalationLevel> {
        const entry = this.get(workspaceId, planId, sessionId);
        if (!entry) return 1;

        entry.stopEscalationCount = Math.min(entry.stopEscalationCount + 1, 3);
        const newLevel = Math.min(entry.stopEscalationCount, 3) as StopEscalationLevel;
        
        if (entry.interruptDirective) {
            entry.interruptDirective.escalationLevel = newLevel;
        }
        
        await this.persist();
        return newLevel;
    }

    /**
     * Queue inject payload
     */
    async queueInject(
        workspaceId: string,
        planId: string,
        sessionId: string,
        text: string
    ): Promise<boolean> {
        const entry = this.get(workspaceId, planId, sessionId);
        if (!entry || entry.status !== 'active') return false;

        entry.injectQueue.push({
            text,
            queuedAt: new Date().toISOString()
        });
        await this.persist();
        return true;
    }

    /**
     * Dequeue all inject payloads (FIFO order)
     */
    async dequeueAllInjects(
        workspaceId: string,
        planId: string,
        sessionId: string
    ): Promise<InjectPayload[]> {
        const entry = this.get(workspaceId, planId, sessionId);
        if (!entry) return [];

        const payloads = [...entry.injectQueue];
        entry.injectQueue = [];
        await this.persist();
        return payloads;
    }

    /**
     * Record a tool call
     */
    async recordToolCall(
        workspaceId: string,
        planId: string,
        sessionId: string,
        toolName: string
    ): Promise<void> {
        const entry = this.get(workspaceId, planId, sessionId);
        if (!entry) return;

        if (entry.lastToolCall?.toolName === toolName) {
            entry.lastToolCall.callCount++;
        } else {
            entry.lastToolCall = {
                toolName,
                timestamp: new Date().toISOString(),
                callCount: 1
            };
        }
        await this.persist();
    }

    /**
     * Prune completed sessions older than maxAge
     */
    async pruneCompleted(maxAge: number = PRUNE_AGE_MS): Promise<number> {
        const now = Date.now();
        let pruned = 0;

        for (const [key, entry] of this.sessions.entries()) {
            if (entry.status === 'completed' || entry.status === 'stopped') {
                const age = now - new Date(entry.startedAt).getTime();
                if (age > maxAge) {
                    this.sessions.delete(key);
                    pruned++;
                }
            }
        }

        if (pruned > 0) {
            await this.persist();
        }
        return pruned;
    }

    dispose(): void {
        this.changeEmitter.dispose();
    }
}
