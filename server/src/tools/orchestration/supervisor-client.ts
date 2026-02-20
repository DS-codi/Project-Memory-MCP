/**
 * Supervisor Control Client — supervisor-client.ts
 *
 * TypeScript client that connects to the Supervisor process via Windows
 * named pipe (default) or TCP fallback. Used by the MCP server to:
 *
 * 1. Check if the Supervisor is running (ping / WhoAmI handshake)
 * 2. Query GUI app availability (brainstorm_gui, approval_gui)
 * 3. Send LaunchApp requests to spawn form-app GUI processes
 *
 * Created in Phase 4 (Hub Integration) of the Brainstorm GUI plan.
 */

import * as net from 'node:net';
import { randomUUID } from 'node:crypto';

// =========================================================================
// Types mirroring supervisor/src/control/protocol.rs
// =========================================================================

/** ControlRequest variants used by this client. */
export interface StatusRequest {
  type: 'Status';
}

export interface WhoAmIRequestPayload {
  type: 'WhoAmI';
  request_id: string;
  client: string;
  client_version: string;
}

export interface LaunchAppRequest {
  type: 'LaunchApp';
  app_name: string;
  payload: unknown;
  timeout_seconds?: number;
}

export interface ContinueAppRequest {
  type: 'ContinueApp';
  session_id: string;
  payload: unknown;
  timeout_seconds?: number;
}

export type ControlRequest = StatusRequest | WhoAmIRequestPayload | LaunchAppRequest | ContinueAppRequest;

/** Generic response envelope from the Supervisor. */
export interface ControlResponse {
  ok: boolean;
  error?: string;
  data: unknown;
}

/** WhoAmI response data. */
export interface WhoAmIResponseData {
  message?: string;
  client?: string;
  client_version?: string;
  // Full WhoAmI handshake fields (if supervisor returns them)
  server_name?: string;
  server_version?: string;
  capabilities?: string[];
}

/** FormApp launch result from LaunchApp or ContinueApp. */
export interface FormAppLaunchResult {
  app_name: string;
  success: boolean;
  response_payload?: unknown;
  error?: string;
  elapsed_ms: number;
  timed_out: boolean;
  /** True when the GUI has emitted a refinement_requested response. */
  pending_refinement?: boolean;
  /** Session token to pass to continueFormApp when pending_refinement is true. */
  session_id?: string;
}

/** Status of a single service in the supervisor registry. */
export interface ServiceState {
  service: string;
  status: string;
  backend?: string;
}

/** Result of a GUI availability check. */
export interface GuiAvailability {
  supervisor_running: boolean;
  brainstorm_gui: boolean;
  approval_gui: boolean;
  /** Specific capabilities reported by the supervisor. */
  capabilities: string[];
  /** Human-readable status message. */
  message: string;
}

// =========================================================================
// Configuration
// =========================================================================

/** Default named pipe path on Windows. */
const DEFAULT_PIPE_PATH = '\\\\.\\pipe\\project-memory-supervisor';

/** Default TCP port when using TCP transport. */
const DEFAULT_TCP_PORT = 45470;

/** Default connection timeout in ms. */
const DEFAULT_CONNECT_TIMEOUT_MS = 3000;

/** Default request timeout in ms. */
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export interface SupervisorClientOptions {
  /** Named pipe path (Windows). @default '\\\\.\\pipe\\project-memory-supervisor' */
  pipePath?: string;
  /** TCP host for fallback. @default '127.0.0.1' */
  tcpHost?: string;
  /** TCP port for fallback. @default 45470 */
  tcpPort?: number;
  /** Connection timeout in ms. @default 3000 */
  connectTimeoutMs?: number;
  /** Per-request timeout in ms. @default 10000 */
  requestTimeoutMs?: number;
  /** Force TCP transport even on Windows. @default false */
  forceTcp?: boolean;
}

// =========================================================================
// NDJSON framing helpers
// =========================================================================

function encodeNdjson(msg: unknown): string {
  return JSON.stringify(msg) + '\n';
}

// =========================================================================
// Low-level connection
// =========================================================================

/**
 * Open a connection to the supervisor via named pipe or TCP.
 *
 * On Windows, tries the named pipe first. Falls back to TCP if the pipe
 * is unavailable or `forceTcp` is set.
 */
function connectToSupervisor(
  opts: SupervisorClientOptions = {},
): Promise<net.Socket> {
  const connectTimeout = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const usePipe = process.platform === 'win32' && !opts.forceTcp;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Supervisor connection timed out after ${connectTimeout}ms`));
    }, connectTimeout);

    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    });

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    if (usePipe) {
      const pipePath = opts.pipePath ?? DEFAULT_PIPE_PATH;
      socket.connect({ path: pipePath });
    } else {
      const host = opts.tcpHost ?? '127.0.0.1';
      const port = opts.tcpPort ?? DEFAULT_TCP_PORT;
      socket.connect({ host, port });
    }
  });
}

/**
 * Send an NDJSON request and wait for the first NDJSON response line.
 */
async function sendRequest(
  socket: net.Socket,
  request: ControlRequest,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<ControlResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Supervisor request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let buffer = '';

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx !== -1) {
        clearTimeout(timer);
        socket.removeListener('data', onData);
        const line = buffer.slice(0, newlineIdx).trim();
        try {
          const parsed = JSON.parse(line) as ControlResponse;
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse supervisor response: ${line}`));
        }
      }
    };

    socket.on('data', onData);

    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.write(encodeNdjson(request));
  });
}

// =========================================================================
// High-level API
// =========================================================================

/**
 * Send a single request to the supervisor and return the response.
 * Opens and closes the connection per call (stateless client).
 */
export async function supervisorRequest(
  request: ControlRequest,
  opts: SupervisorClientOptions = {},
): Promise<ControlResponse> {
  const socket = await connectToSupervisor(opts);
  try {
    const response = await sendRequest(socket, request, opts.requestTimeoutMs);
    return response;
  } finally {
    socket.destroy();
  }
}

/**
 * Check if the Supervisor is running by attempting a connection and
 * sending a Status request.
 */
export async function isSupervisorRunning(
  opts: SupervisorClientOptions = {},
): Promise<boolean> {
  try {
    const resp = await supervisorRequest({ type: 'Status' }, {
      ...opts,
      connectTimeoutMs: opts.connectTimeoutMs ?? 2000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 3000,
    });
    return resp.ok === true;
  } catch {
    return false;
  }
}

/**
 * Check availability of GUI apps by querying supervisor status.
 *
 * Returns a structured result indicating whether the supervisor is running
 * and which GUI apps are available.
 */
export async function checkGuiAvailability(
  opts: SupervisorClientOptions = {},
): Promise<GuiAvailability> {
  const unavailable: GuiAvailability = {
    supervisor_running: false,
    brainstorm_gui: false,
    approval_gui: false,
    capabilities: [],
    message: 'Supervisor is not running or unreachable',
  };

  try {
    // 1. Try to connect and get status
    const statusResp = await supervisorRequest({ type: 'Status' }, {
      ...opts,
      connectTimeoutMs: opts.connectTimeoutMs ?? 2000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 3000,
    });

    if (!statusResp.ok) {
      return { ...unavailable, message: `Supervisor returned error: ${statusResp.error}` };
    }

    // Status response data is an array of service states
    const services = Array.isArray(statusResp.data) ? statusResp.data as ServiceState[] : [];

    // 2. Check for brainstorm_gui and approval_gui in service list or
    //    infer from the LaunchApp capability.
    //    Note: form apps may not appear as services since they're on-demand.
    //    We detect their availability by successfully getting a Status response
    //    (supervisor is running) and checking if the WhoAmI response has
    //    relevant capabilities.
    let capabilities: string[] = [];
    try {
      const whoamiResp = await supervisorRequest({
        type: 'WhoAmI',
        request_id: randomUUID(),
        client: 'mcp-server',
        client_version: '1.0.0',
      }, opts);
      if (whoamiResp.ok && whoamiResp.data) {
        const d = whoamiResp.data as WhoAmIResponseData;
        capabilities = d.capabilities ?? [];
      }
    } catch {
      // WhoAmI might not return capabilities — fall back to assuming
      // form apps are available since the supervisor is running
    }

    // Form apps are typically available when the supervisor is running
    // and has them configured (not disabled).  We assume availability
    // unless there's a signal otherwise.
    const hasBrainstorm = capabilities.length === 0
      || capabilities.includes('brainstorm_gui')
      || capabilities.includes('launch_app')
      || capabilities.includes('form_apps');

    const hasApproval = capabilities.length === 0
      || capabilities.includes('approval_gui')
      || capabilities.includes('launch_app')
      || capabilities.includes('form_apps');

    const supervisorRunning = true;
    const parts: string[] = ['Supervisor running'];
    if (hasBrainstorm) parts.push('brainstorm_gui available');
    if (hasApproval) parts.push('approval_gui available');

    return {
      supervisor_running: supervisorRunning,
      brainstorm_gui: hasBrainstorm,
      approval_gui: hasApproval,
      capabilities,
      message: parts.join('; '),
    };
  } catch {
    return unavailable;
  }
}

/**
 * Launch a form-app GUI process via the supervisor.
 *
 * Sends a `LaunchApp` control request which causes the supervisor to
 * spawn the GUI binary, pipe the payload on stdin, and return the
 * response from stdout.
 *
 * @param appName - Registered app name: 'brainstorm_gui' or 'approval_gui'
 * @param payload - The FormRequest JSON payload
 * @param timeoutSeconds - Optional per-request timeout override
 * @param opts - Connection options
 */
export async function launchFormApp(
  appName: string,
  payload: unknown,
  timeoutSeconds?: number,
  opts: SupervisorClientOptions = {},
): Promise<FormAppLaunchResult> {
  // LaunchApp can take a long time — use a generous request timeout
  const requestTimeout = timeoutSeconds
    ? (timeoutSeconds + 10) * 1000 // Add 10s buffer over GUI timeout
    : 310_000; // Default: 5 min + 10s

  const resp = await supervisorRequest(
    {
      type: 'LaunchApp',
      app_name: appName,
      payload,
      ...(timeoutSeconds != null ? { timeout_seconds: timeoutSeconds } : {}),
    },
    {
      ...opts,
      requestTimeoutMs: requestTimeout,
    },
  );

  if (!resp.ok) {
    return {
      app_name: appName,
      success: false,
      error: resp.error ?? 'Unknown supervisor error',
      elapsed_ms: 0,
      timed_out: false,
    };
  }

  // Parse the FormAppResponse from the data field
  const data = resp.data as FormAppLaunchResult;
  return {
    app_name: data.app_name ?? appName,
    success: data.success ?? false,
    response_payload: data.response_payload,
    error: data.error,
    elapsed_ms: data.elapsed_ms ?? 0,
    timed_out: data.timed_out ?? false,
    pending_refinement: data.pending_refinement ?? false,
    session_id: data.session_id,
  };
}

/**
 * Continue a paused refinement session by piping a FormRefinementResponse
 * into the GUI's stdin and reading the next FormResponse.
 *
 * @param sessionId - The session token from a previous FormAppLaunchResult
 * @param payload - The FormRefinementResponse JSON payload
 * @param timeoutSeconds - Optional per-request timeout override
 * @param opts - Connection options
 */
export async function continueFormApp(
  sessionId: string,
  payload: unknown,
  timeoutSeconds?: number,
  opts: SupervisorClientOptions = {},
): Promise<FormAppLaunchResult> {
  const requestTimeout = timeoutSeconds
    ? (timeoutSeconds + 10) * 1000
    : 310_000;

  const resp = await supervisorRequest(
    {
      type: 'ContinueApp',
      session_id: sessionId,
      payload,
      ...(timeoutSeconds != null ? { timeout_seconds: timeoutSeconds } : {}),
    },
    {
      ...opts,
      requestTimeoutMs: requestTimeout,
    },
  );

  if (!resp.ok) {
    return {
      app_name: 'brainstorm_gui',
      success: false,
      error: resp.error ?? 'Unknown supervisor error',
      elapsed_ms: 0,
      timed_out: false,
    };
  }

  const data = resp.data as FormAppLaunchResult;
  return {
    app_name: data.app_name ?? 'brainstorm_gui',
    success: data.success ?? false,
    response_payload: data.response_payload,
    error: data.error,
    elapsed_ms: data.elapsed_ms ?? 0,
    timed_out: data.timed_out ?? false,
    pending_refinement: data.pending_refinement ?? false,
    session_id: data.session_id,
  };
}
