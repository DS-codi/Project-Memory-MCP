import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const WINDOWS_ABSOLUTE_PATH_RE = /^[a-zA-Z]:[\\/]/;

function getProxyBaseUrl(): string | null {
  const url = process.env.MBS_HOST_MCP_URL || process.env.MBS_WRITE_PROXY_MCP_URL;
  return url ? url.replace(/\/+$/, '') : null;
}

export function shouldProxyFilePath(filePath: string): boolean {
  return process.platform !== 'win32' && WINDOWS_ABSOLUTE_PATH_RE.test(filePath);
}

function getPathDir(filePath: string): string {
  return WINDOWS_ABSOLUTE_PATH_RE.test(filePath)
    ? path.win32.dirname(filePath)
    : path.dirname(filePath);
}

class HostMcpClient {
  private client: Client | null = null;

  private async connect(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    const baseUrl = getProxyBaseUrl();
    if (!baseUrl) {
      throw new Error('Host MCP proxy URL is not configured. Set MBS_HOST_MCP_URL.');
    }

    const client = new Client(
      { name: 'project-memory-host-file-proxy', version: '1.0.0' },
      { capabilities: {} }
    );

    try {
      const streamable = new StreamableHTTPClientTransport(new URL('/mcp', baseUrl));
      await client.connect(streamable);
      this.client = client;
      return client;
    } catch {
      const sse = new SSEClientTransport(new URL('/sse', baseUrl));
      await client.connect(sse);
      this.client = client;
      return client;
    }
  }

  private async callToolAny(
    names: string[],
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = await this.connect();
    let lastError: Error | null = null;

    for (const name of names) {
      try {
        const result = await client.callTool({ name, arguments: args });
        return result;
      } catch (err) {
        lastError = err as Error;
      }
    }

    throw new Error(
      `None of the candidate MCP tools succeeded: ${names.join(', ')}. ` +
      `Last error: ${lastError?.message || 'unknown error'}`
    );
  }

  async writeJson(filePath: string, jsonContent: string): Promise<void> {
    const dirPath = getPathDir(filePath);

    try {
      await this.callToolAny(
        ['mcp_filesystem_create_directory', 'filesystem_create_directory'],
        { path: dirPath }
      );
    } catch {
      // continue: write may still succeed if directory already exists
    }

    await this.callToolAny(
      ['mcp_filesystem_write_file', 'filesystem_write_file'],
      { path: filePath, content: jsonContent }
    );
  }

  async readJson<T>(filePath: string): Promise<T | null> {
    const result = await this.callToolAny(
      ['mcp_filesystem_read_text_file', 'filesystem_read_text_file', 'mcp_filesystem_read_file', 'filesystem_read_file'],
      { path: filePath }
    );

    const contentText = extractTextResult(result);
    if (!contentText) {
      return null;
    }

    return JSON.parse(contentText) as T;
  }
}

function extractTextResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const maybe = result as {
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
  };

  if (maybe.structuredContent && typeof maybe.structuredContent === 'object') {
    const sc = maybe.structuredContent as Record<string, unknown>;
    if (typeof sc.content === 'string') {
      return sc.content;
    }
    if (typeof sc.text === 'string') {
      return sc.text;
    }
  }

  if (Array.isArray(maybe.content)) {
    for (const item of maybe.content) {
      if (item?.type === 'text' && typeof item.text === 'string') {
        const text = item.text;
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (typeof parsed.content === 'string') {
            return parsed.content;
          }
          if (typeof parsed.text === 'string') {
            return parsed.text;
          }
        } catch {
          return text;
        }
      }
    }
  }

  return null;
}

const sharedHostClient = new HostMcpClient();

export async function writeJsonViaHostProxy(
  filePath: string,
  jsonContent: string
): Promise<void> {
  await sharedHostClient.writeJson(filePath, jsonContent);
}

export async function readJsonViaHostProxy<T>(filePath: string): Promise<T | null> {
  return sharedHostClient.readJson<T>(filePath);
}
