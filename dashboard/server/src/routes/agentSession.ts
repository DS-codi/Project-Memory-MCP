/**
 * Agent Session Route — agentSession.ts
 *
 * POST /api/agent-session/launch
 *
 * Launches an agent CLI session inside the Interactive Terminal by sending a
 * StartAgentSessionRequest over TCP NDJSON to port 3458.  If ECONNREFUSED, the
 * supervisor is asked to start the interactive_terminal service first.
 *
 * This route lives in the dashboard server and talks directly to the Interactive
 * Terminal via Node's built-in `net` module — no dependency on the MCP server.
 */

import { Router } from 'express';
import * as net from 'node:net';
import { randomUUID } from 'node:crypto';
import { getWorkspace } from '../db/queries.js';

export const agentSessionRouter = Router();

// =========================================================================
// Configuration
// =========================================================================

const IT_HOST = '127.0.0.1';
const IT_PORT = 3458;
const SUPERVISOR_PIPE = '\\\\.\\pipe\\project-memory-supervisor';
const SUPERVISOR_TCP_PORT = 45470;
const CONNECT_TIMEOUT_MS = 5_000;
const RESPONSE_TIMEOUT_MS = 30_000;
const SUPERVISOR_LAUNCH_WAIT_MS = 3_000;
const MAX_RETRIES = 2;

// =========================================================================
// Request / Response shapes
// =========================================================================

interface LaunchRequest {
  workspaceId: string;
  planId: string;
  /** 'gemini' | 'copilot' */
  provider: string;
  /** Optional phase label for context. */
  phase?: string;
  /** Optional step index for context. */
  stepIndex?: number;
  /** Optional step task text for context. */
  stepTask?: string;
  /** Override the enriched prompt sent to the agent CLI. */
  enrichedPrompt?: string;
}

// =========================================================================
// TCP helpers
// =========================================================================

function connectWithTimeout(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection timed out connecting to ${host}:${port}`));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.connect(port, host);
  });
}

interface NdjsonResult {
  data: Record<string, unknown> | null;
  error?: string;
}

/**
 * Send one NDJSON line and read back the first non-empty response line.
 */
function sendNdjsonAndRead(
  socket: net.Socket,
  message: unknown,
  timeoutMs: number,
): Promise<NdjsonResult> {
  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ data: null, error: 'Response timed out' });
    }, timeoutMs);

    function settle(result: NdjsonResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          socket.destroy();
          settle({ data: parsed });
          return;
        } catch {
          // skip malformed line
        }
      }
    });

    socket.once('error', (err) => {
      settle({ data: null, error: err.message });
    });

    socket.once('close', () => {
      settle({ data: null, error: 'Connection closed before response' });
    });

    const line = JSON.stringify(message) + '\n';
    socket.write(line, 'utf8');
  });
}

// =========================================================================
// Supervisor auto-launch
// =========================================================================

async function triggerSupervisorLaunch(): Promise<void> {
  const request = { type: 'Start', service: 'interactive_terminal' };
  const line = JSON.stringify(request) + '\n';

  // Try named pipe first (Windows), fall back to TCP 45470
  for (const target of [SUPERVISOR_PIPE, { host: '127.0.0.1', port: SUPERVISOR_TCP_PORT }] as const) {
    try {
      const socket = await new Promise<net.Socket>((resolve, reject) => {
        const s = new net.Socket();
        const timer = setTimeout(() => { s.destroy(); reject(new Error('timeout')); }, 2_000);
        s.once('connect', () => { clearTimeout(timer); resolve(s); });
        s.once('error', (e) => { clearTimeout(timer); reject(e); });
        if (typeof target === 'string') {
          s.connect(target);
        } else {
          s.connect(target.port, target.host);
        }
      });
      await new Promise<void>((resolve) => {
        socket.write(line, 'utf8', () => {
          socket.destroy();
          resolve();
        });
      });
      return; // sent successfully
    } catch {
      // try next transport
    }
  }
  // If both fail, proceed anyway — IT may already be starting
}

// =========================================================================
// Core: send StartAgentSessionRequest to the Interactive Terminal
// =========================================================================

async function sendStartAgentSession(
  request: Record<string, unknown>,
): Promise<{ session_id: string; accepted: boolean; state: string; error?: string }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const socket = await connectWithTimeout(IT_HOST, IT_PORT, CONNECT_TIMEOUT_MS);
      const result = await sendNdjsonAndRead(socket, request, RESPONSE_TIMEOUT_MS);

      if (!result.data) {
        throw new Error(result.error ?? 'No response from interactive terminal');
      }

      const d = result.data;
      return {
        session_id: String(d['session_id'] ?? request['session_id'] ?? ''),
        accepted: Boolean(d['accepted'] ?? false),
        state: String(d['state'] ?? 'unknown'),
        error: typeof d['error'] === 'string' ? d['error'] : undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConnRefused = msg.includes('ECONNREFUSED') || msg.includes('Connection refused');

      if (isConnRefused && attempt < MAX_RETRIES) {
        // Ask supervisor to start the interactive terminal
        await triggerSupervisorLaunch();
        // Give it a moment to come up
        await new Promise((r) => setTimeout(r, SUPERVISOR_LAUNCH_WAIT_MS));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Interactive terminal did not become reachable after supervisor launch');
}

// =========================================================================
// Route: POST /launch
// =========================================================================

agentSessionRouter.post('/launch', async (req, res) => {
  const body = req.body as Partial<LaunchRequest>;

  const workspaceId = body.workspaceId?.trim();
  const planId = body.planId?.trim();
  const provider = (body.provider?.trim() || 'gemini').toLowerCase();

  if (!workspaceId || !planId) {
    res.status(400).json({ error: 'workspaceId and planId are required' });
    return;
  }

  // Look up workspace path from DB
  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    res.status(404).json({ error: `Workspace not found: ${workspaceId}` });
    return;
  }

  const workingDirectory = workspace.path;

  // Build context summary
  const contextParts: string[] = [
    `Workspace: ${workspaceId}`,
    `Plan: ${planId}`,
  ];
  if (body.phase) contextParts.push(`Phase: ${body.phase}`);
  if (body.stepIndex !== undefined) contextParts.push(`Step: ${body.stepIndex}`);
  if (body.stepTask) contextParts.push(`Task: ${body.stepTask}`);
  // Join with ' | ' rather than '\n' — the context string ends up as the
  // --prompt-interactive argument inside a single-quoted PowerShell compound
  // one-liner.  A literal newline terminates the command early, causing the
  // shell to see the remainder (e.g. "Plan:") as a new command and error out.
  const contextStr = contextParts.join(' | ');

  const sessionId = `agent_sess_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const requestId = `req_${Date.now()}_${randomUUID().slice(0, 8)}`;

  const startRequest: Record<string, unknown> = {
    type: 'start_agent_session_request',
    id: requestId,
    session_kind: 'agent_cli_specialized',
    session_id: sessionId,
    runtime_session_id: sessionId,
    command: provider,
    working_directory: workingDirectory,
    context: contextStr,
    args: [],
    env: {
      PM_MCP_SERVER_URL: 'http://127.0.0.1:3457/mcp',
      PM_MCP_TRANSPORT: 'streamable_http',
      PM_CLI_SPAWN_SOURCE: 'dashboard_launch',
      PM_CLI_PROVIDER: provider,
      PM_PLAN_ID: planId,
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    },
    owner_client_id: 'dashboard',
    workspace_id: workspaceId,
    plan_id: planId,
    agent_type: 'Executor',
    source_mode: 'dashboard_launch',
    prompt_payload: {
      enriched_prompt: body.enrichedPrompt ?? contextStr,
      scope_boundaries: {
        files_allowed: [],
        directories_allowed: [],
      },
    },
    timeout_seconds: 86400, // 24 h — agent CLI sessions are long-running
  };

  try {
    const result = await sendStartAgentSession(startRequest);
    if (!result.accepted) {
      res.status(422).json({
        error: result.error ?? 'Session was rejected by the interactive terminal',
        accepted: false,
        state: result.state,
      });
      return;
    }
    const resolvedSessionId = result.session_id || sessionId;
    console.log(
      `[agentSession] Session launched — id=${resolvedSessionId}, workspace=${workspaceId}, plan=${planId ?? 'none'}, provider=${provider}`
    );
    res.json({
      session_id: resolvedSessionId,
      accepted: true,
      state: result.state,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isConnRefused = msg.includes('ECONNREFUSED') || msg.includes('Connection refused');
    console.error('[agentSession] Launch failed:', msg);
    res.status(isConnRefused ? 503 : 500).json({
      error: isConnRefused
        ? 'Interactive terminal is not reachable. Ensure the supervisor and interactive terminal are running.'
        : `Launch failed: ${msg}`,
    });
  }
});
