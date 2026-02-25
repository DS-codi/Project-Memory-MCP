/**
 * Shared types for chat tool handlers
 */

import { McpBridge } from '../McpBridge';
import type { SessionInterceptRegistry } from '../orchestration/session-intercept-registry';

/**
 * Context object passed to all tool handlers.
 * Provides access to the MCP bridge and workspace resolution.
 */
export interface ToolContext {
    mcpBridge: McpBridge;
    ensureWorkspace: () => Promise<string>;
    setWorkspaceId: (id: string) => void;
    sessionRegistry?: SessionInterceptRegistry;
}
