/**
 * Container Proxy - Transparent MCP forwarding to a container instance
 *
 * When a container instance of project-memory is running (detected via
 * health check), this module creates a proxy McpServer that forwards
 * all tool calls to the container via StreamableHTTP, with a fallback
 * to SSE transport.
 *
 * This eliminates the need for separate "project-memory" and
 * "project-memory-container" MCP server entries in .vscode/mcp.json.
 *
 * Detection order:
 *  1. MBS_CONTAINER_URL env var (explicit override)
 *  2. Probe http://localhost:3000/health (default container port)
 *
 * Session resilience:
 *  - If the container restarts, StreamableHTTP sessions are invalidated.
 *  - The proxy detects session errors ("No valid session ID", connection
 *    refused, etc.) and automatically reconnects before retrying the
 *    failed tool call once.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// ---------------------------------------------------------------------------
// Container detection
// ---------------------------------------------------------------------------

export interface ContainerInfo {
  url: string;
  version: string;
  transport: string;
}

/**
 * Probe a URL for a running project-memory container.
 * Returns container info if found, null otherwise.
 */
export async function detectContainer(
  baseUrl: string = 'http://localhost:3000'
): Promise<ContainerInfo | null> {
  const healthUrl = `${baseUrl.replace(/\/+$/, '')}/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json() as Record<string, unknown>;

    // Verify it's actually our MCP server
    if (data.server !== 'project-memory-mcp' && data.status !== 'ok') {
      return null;
    }

    return {
      url: baseUrl.replace(/\/+$/, ''),
      version: (data.version as string) || 'unknown',
      transport: (data.transport as string) || 'http',
    };
  } catch {
    return null;
  }
}

/**
 * Determine the container URL to probe.
 * Priority: MBS_CONTAINER_URL env var → default localhost:3000
 */
export function getContainerUrl(): string {
  return process.env.MBS_CONTAINER_URL || 'http://localhost:3000';
}

// ---------------------------------------------------------------------------
// Resilient connection manager
// ---------------------------------------------------------------------------

/** Check if an error indicates an invalid/expired session or lost connection */
function isSessionOrConnectionError(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes('No valid session ID') ||
    msg.includes('Bad Request') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('socket hang up')
  );
}

/**
 * Manages a reconnectable MCP Client connection to a container.
 *
 * When the container restarts, its in-memory session map is cleared and
 * StreamableHTTP requests with the old Mcp-Session-Id header fail with
 * "Bad Request: No valid session ID". This class detects those errors
 * and transparently reconnects (new Client + new transport + new
 * initialize handshake) before retrying the failed operation.
 */
export class ContainerConnection {
  private _client: Client | null = null;
  private _baseUrl: string;
  /** Deduplicates concurrent reconnect attempts */
  private _connecting: Promise<Client> | null = null;

  constructor(baseUrl: string) {
    this._baseUrl = baseUrl;
  }

  /** Get the current client, connecting if needed. */
  async getClient(): Promise<Client> {
    if (this._client) return this._client;
    return this.reconnect();
  }

  /** Force a fresh connection (e.g. after session invalidation). */
  async reconnect(): Promise<Client> {
    // Deduplicate concurrent reconnect attempts
    if (this._connecting) return this._connecting;

    this._connecting = this._doConnect();
    try {
      const client = await this._connecting;
      this._client = client;
      return client;
    } finally {
      this._connecting = null;
    }
  }

  /** Close the current connection gracefully. */
  async close(): Promise<void> {
    if (this._client) {
      try {
        await this._client.close();
      } catch {
        // ignore close errors on stale connections
      }
      this._client = null;
    }
  }

  /** Invalidate current client so the next call triggers reconnection. */
  invalidate(): void {
    this._client = null;
  }

  /**
   * Execute an operation against the container client.
   * On session/connection errors, reconnects and retries once.
   */
  async withRetry<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      return await operation(client);
    } catch (err) {
      if (isSessionOrConnectionError(err)) {
        console.error(
          `[proxy] Session/connection error detected, reconnecting: ${(err as Error).message}`
        );
        this.invalidate();
        const freshClient = await this.reconnect();
        // Retry exactly once with the fresh connection
        return await operation(freshClient);
      }
      throw err;
    }
  }

  // -- internal --

  private async _doConnect(): Promise<Client> {
    // Tear down any dead connection first
    await this.close();

    const client = new Client(
      { name: 'project-memory-proxy', version: '1.0.0' },
      { capabilities: {} }
    );

    // Try StreamableHTTP first (/mcp endpoint)
    const mcpUrl = new URL('/mcp', this._baseUrl);
    try {
      const transport = new StreamableHTTPClientTransport(mcpUrl);
      await client.connect(transport);
      console.error(`[proxy] Connected to container via StreamableHTTP at ${mcpUrl}`);
      return client;
    } catch {
      // StreamableHTTP failed, try SSE
    }

    // Fall back to SSE (/sse endpoint)
    const sseUrl = new URL('/sse', this._baseUrl);
    try {
      const transport = new SSEClientTransport(sseUrl);
      await client.connect(transport);
      console.error(`[proxy] Connected to container via SSE at ${sseUrl}`);
      return client;
    } catch (err) {
      throw new Error(
        `Failed to connect to container at ${this._baseUrl}: ${(err as Error).message}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Proxy server factory
// ---------------------------------------------------------------------------

/**
 * Register forwarding handlers on the given Server that proxy all
 * tool list/call requests through the ContainerConnection.
 *
 * The handlers use `connection.withRetry()` so stale sessions are
 * transparently re-established before retrying the failed request.
 *
 * Returns the initial set of tool names for logging.
 */
export async function registerProxyTools(
  connection: ContainerConnection,
  // We use the low-level Server because McpServer.tool() requires zod schemas,
  // but container tools have JSON Schema (not zod). The low-level Server lets
  // us set raw request handlers for tools/list and tools/call.
  server: import('@modelcontextprotocol/sdk/server/index.js').Server
): Promise<string[]> {
  const { ListToolsRequestSchema, CallToolRequestSchema } =
    await import('@modelcontextprotocol/sdk/types.js');

  // Forward tools/list → container (with auto-reconnect)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return connection.withRetry(async (client) => {
      const result = await client.listTools();
      return { tools: result.tools };
    });
  });

  // Forward tools/call → container (with auto-reconnect)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await connection.withRetry(async (client) => {
        return await client.callTool({ name, arguments: args });
      });
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Container tool call failed: ${(err as Error).message}\n\nThe container may be down. Restart it or remove MBS_CONTAINER_URL to use local mode.`,
          },
        ],
        isError: true,
      };
    }
  });

  // Fetch initial tool list for logging
  try {
    const result = await connection.withRetry((c) => c.listTools());
    return result.tools.map((t) => t.name);
  } catch {
    return [];
  }
}

/**
 * Create a low-level Server configured for proxy mode.
 * This is used instead of createMcpServer() when a container is detected.
 */
export async function createProxyServer(containerUrl: string): Promise<{
  server: import('@modelcontextprotocol/sdk/server/index.js').Server;
  connection: ContainerConnection;
  toolNames: string[];
}> {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');

  const server = new Server(
    { name: 'project-memory', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const connection = new ContainerConnection(containerUrl);
  await connection.getClient(); // establish initial connection
  const toolNames = await registerProxyTools(connection, server);

  return { server, connection, toolNames };
}
