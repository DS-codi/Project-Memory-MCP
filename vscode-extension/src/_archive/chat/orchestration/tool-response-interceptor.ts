/**
 * Tool Response Interceptor - Intercepts tool responses to deliver stop/inject directives
 * 
 * Processes session-tracked tool calls and modifies responses with:
 * - Stop directives (3-level escalation)
 * - Injected user guidance
 * - Session tracking
 */

import * as vscode from 'vscode';
import type { SessionInterceptRegistry } from './session-intercept-registry';

/**
 * Intercept tool response and apply stop/inject logic
 */
export async function interceptToolResponse(
    registry: SessionInterceptRegistry,
    sessionId: string,
    toolName: string,
    originalResult: vscode.LanguageModelToolResult
): Promise<vscode.LanguageModelToolResult> {
    // Look up session
    const session = registry.getBySessionId(sessionId);
    if (!session) {
        // Session not found - pass through unchanged
        return originalResult;
    }

    // Record tool call
    await registry.recordToolCall(
        session.workspaceId,
        session.planId,
        session.sessionId,
        toolName
    );

    // Extract original text from result
    const originalText = extractTextFromResult(originalResult);

    // Check for stop directive (takes precedence)
    if (session.interruptDirective && session.status === 'stopping') {
        const level = session.interruptDirective.escalationLevel;
        const directiveText = generateStopDirective(level, session.sessionId, originalText);
        
        // Increment escalation for next call
        await registry.incrementEscalation(
            session.workspaceId,
            session.planId,
            session.sessionId
        );

        // At level 3, mark session as stopped
        if (level >= 3) {
            await registry.markCompleted(
                session.workspaceId,
                session.planId,
                session.sessionId,
                'user_stopped'
            );
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(directiveText)
        ]);
    }

    // Check for inject queue
    if (session.injectQueue.length > 0) {
        const injects = await registry.dequeueAllInjects(
            session.workspaceId,
            session.planId,
            session.sessionId
        );
        
        if (injects.length > 0) {
            const injectTexts = injects.map(i => validateInjectText(i.text).sanitized);
            const prependText = generateInjectPrepend(injectTexts, originalText);
            
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(prependText)
            ]);
        }
    }

    // No interception needed - pass through
    return originalResult;
}

/**
 * Extract text from LanguageModelToolResult
 */
function extractTextFromResult(result: vscode.LanguageModelToolResult): string {
    const parts = result.content;
    if (!Array.isArray(parts)) return '';
    
    return parts
        .map(part => {
            if (part instanceof vscode.LanguageModelTextPart) {
                return part.value;
            }
            return '';
        })
        .join('');
}

/**
 * Generate stop directive text based on escalation level
 */
function generateStopDirective(level: 1 | 2 | 3, sessionId: string, originalText: string): string {
    if (level === 1) {
        return `⚠️ SESSION STOP REQUESTED
The user has requested that you stop your current work.
Please call memory_agent(action: handoff) to Coordinator with reason "User requested stop", then call memory_agent(action: complete).
Complete your current tool call normally, then stop.

--- ORIGINAL RESPONSE ---
${originalText}`;
    }
    
    if (level === 2) {
        return `🛑 SESSION STOP — IMMEDIATE
You MUST stop immediately. Do NOT continue with any more work.
Call memory_agent(action: handoff) to Coordinator with reason "User forced stop", then memory_agent(action: complete).
Do not process any more steps.`;
    }
    
    // Level 3 - terminated
    return `❌ SESSION TERMINATED
This session has been terminated by the user. All further tool calls will return this error. Session ID: ${sessionId}`;
}

/**
 * Generate inject prepend text
 */
function generateInjectPrepend(injectTexts: string[], originalText: string): string {
    const combined = injectTexts.join('\n');
    return `📝 USER GUIDANCE (injected by user):
${combined}

--- TOOL RESPONSE ---
${originalText}`;
}

/**
 * Validate and sanitize inject text
 */
export function validateInjectText(text: string): { valid: boolean; sanitized: string; warnings: string[] } {
    const warnings: string[] = [];
    let sanitized = text;
    
    // Max 500 chars
    if (sanitized.length > 500) {
        sanitized = sanitized.slice(0, 500);
        warnings.push('Text truncated to 500 characters');
    }
    
    // Strip JSON tool-call-like patterns
    const toolCallPattern = /\{"action":|"tool":/gi;
    if (toolCallPattern.test(sanitized)) {
        sanitized = sanitized.replace(toolCallPattern, '[REMOVED]');
        warnings.push('Removed tool-call-like JSON patterns');
    }
    
    // Strip system prompt manipulation patterns
    const systemPromptPattern = /you are now|ignore previous|system:/gi;
    if (systemPromptPattern.test(sanitized)) {
        sanitized = sanitized.replace(systemPromptPattern, '[REMOVED]');
        warnings.push('Removed system prompt manipulation patterns');
    }
    
    return {
        valid: warnings.length === 0,
        sanitized,
        warnings
    };
}
