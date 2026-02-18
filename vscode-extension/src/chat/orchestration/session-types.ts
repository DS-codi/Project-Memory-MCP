/**
 * Session Types - Type definitions for session interception system
 * 
 * Defines all types for the subagent session interruption & injection system.
 * This file contains ONLY type definitions - no runtime code.
 */

/**
 * Session lifecycle status
 */
export type SessionStatus = 'active' | 'stopping' | 'stopped' | 'completed';

/**
 * Stop escalation level (1=graceful, 2=immediate, 3=terminated)
 */
export type StopEscalationLevel = 1 | 2 | 3;

/**
 * Triple-key identifier for sessions (workspace_id + plan_id + session_id)
 */
export interface SessionTripleKey {
    workspaceId: string;
    planId: string;
    sessionId: string;
}

/**
 * Interrupt directive for stop requests
 */
export interface InterruptDirective {
    requestedAt: string;
    escalationLevel: StopEscalationLevel;
    reason?: string;
}

/**
 * Inject payload for user guidance
 */
export interface InjectPayload {
    text: string;
    queuedAt: string;
}

/**
 * Information about the last tool call
 */
export interface LastToolCallInfo {
    toolName: string;
    timestamp: string;
    callCount: number;
}

/**
 * Complete session entry stored in registry
 */
export interface SessionEntry {
    sessionId: string;
    workspaceId: string;
    planId: string;
    agentType: string;
    parentSessionId?: string;
    startedAt: string;
    status: SessionStatus;
    lastToolCall?: LastToolCallInfo;
    interruptDirective?: InterruptDirective;
    injectQueue: InjectPayload[];
    stopEscalationCount: number;
}

/**
 * Serialized registry format for persistence (workspaceState)
 */
export interface SerializedRegistry {
    version: 1;
    sessions: Record<string, SessionEntry>;
}
