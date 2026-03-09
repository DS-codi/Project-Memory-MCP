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

export interface StartServiceRequest {
  type: 'Start';
  service: string;
}

export interface ContinueAppRequest {
  type: 'ContinueApp';
  session_id: string;
  payload: unknown;
  timeout_seconds?: number;
}

export interface ListMcpConnectionsRequest {
  type: 'ListMcpConnections';
}

export interface CloseMcpConnectionRequest {
  type: 'CloseMcpConnection';
  session_id: string;
}

export interface ListMcpInstancesRequest {
  type: 'ListMcpInstances';
}

export interface ScaleUpMcpRequest {
  type: 'ScaleUpMcp';
}

export interface McpRuntimeExecRequest {
  type: 'McpRuntimeExec';
  payload: McpRuntimeExecPayload;
  timeout_ms?: number;
}

export interface SetMcpRuntimePolicyRequest {
  type: 'SetMcpRuntimePolicy';
  enabled?: boolean;
  wave_cohorts?: string[];
  hard_stop_gate?: boolean;
}

export interface McpRuntimeExecPayload {
  runtime?: {
    op?: 'init' | 'execute' | 'cancel' | 'complete';
    session_id?: string;
    wave_cohort?: string;
    cohort?: string;
  };
  wave_cohort?: string;
  cohort?: string;
  [key: string]: unknown;
}

export type ControlRequest =
  | StartServiceRequest
  | StatusRequest
  | WhoAmIRequestPayload
  | LaunchAppRequest
  | ContinueAppRequest
  | ListMcpConnectionsRequest
  | CloseMcpConnectionRequest
  | ListMcpInstancesRequest
  | ScaleUpMcpRequest
  | McpRuntimeExecRequest
  | SetMcpRuntimePolicyRequest;

/** Generic response envelope from the Supervisor. */
export interface ControlResponse {
  ok: boolean;
  error?: string;
  data: unknown;
}

export interface DeprecatedPoolCommandEnvelope {
  supported: false;
  deprecated: true;
  reason: 'instance_pool_removed';
  command: string;
  runtime_mode: 'native_supervisor';
}

export interface RuntimeHardStopEnvelope {
  error_class: 'hard_stop';
  reason: 'cohort_not_enabled' | string;
  requested_cohort: string;
  allowed_cohorts: string[];
}

export interface RuntimePreconditionEnvelope {
  error_class: 'runtime_precondition';
  reason: 'runtime_disabled' | string;
  required_env: Record<string, string>;
  required_control?: {
    type: 'SetMcpRuntimePolicy';
    enabled: boolean;
    wave_cohorts: string[];
    hard_stop_gate: boolean;
  };
  wave1_validation?: {
    cohort: string;
    hard_stop_gate_required: boolean;
  };
}

export interface RuntimePolicyState {
  runtime_enabled: boolean;
  wave_cohorts: string[];
  hard_stop_gate: boolean;
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

export type SummonabilityDiagnosticKind =
  | 'supervisor-unavailable'
  | 'approval_gui-unavailable'
  | 'brainstorm_gui-unavailable'
  | 'launch-failed'
  | 'response-shape-error';

export interface SummonabilityDiagnostic {
  kind: SummonabilityDiagnosticKind;
  message: string;
  source: 'control' | 'http' | 'client';
  app_name?: string;
  details?: Record<string, unknown>;
}

export interface LaunchModeSessionMetadata {
  mode?: string;
  session_id?: string;
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
  /** Additive summonability diagnostics for downstream routing. */
  diagnostics?: SummonabilityDiagnostic[];
  /** Additive mode/session metadata extracted from request/response payloads. */
  metadata?: LaunchModeSessionMetadata;
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
  /** Additive summonability diagnostics for downstream routing. */
  diagnostics?: SummonabilityDiagnostic[];
}

// =========================================================================
// Configuration
// =========================================================================

/** Default named pipe path on Windows. */
const DEFAULT_PIPE_PATH = '\\\\.\\pipe\\project-memory-supervisor';

/** Optional override used by isolated validation shells. */
const ENV_PIPE_PATH = process.env.PM_ORCHESTRATION_SUPERVISOR_PIPE_PATH?.trim();

/** Default TCP port when using TCP transport. */
const DEFAULT_TCP_PORT = 45470;

/** Default port for the GUI HTTP launcher server (supervisor/src/gui_server.rs). */
const DEFAULT_GUI_HTTP_PORT = 3464;

/**
 * Resolve the base URL for the supervisor GUI HTTP server.
 *
 * Resolution order:
 *   1. PM_SUPERVISOR_GUI_HTTP_URL (full URL override)
 *   2. PM_SUPERVISOR_GUI_HTTP_HOST + PM_SUPERVISOR_GUI_HTTP_PORT
 *   3. Container mode (PM_RUNNING_IN_CONTAINER=true) → host.containers.internal
 *   4. Native → 127.0.0.1
 */
export function resolveGuiHttpUrl(): string {
  const fullUrlOverride = process.env.PM_SUPERVISOR_GUI_HTTP_URL?.trim();
  if (fullUrlOverride) return fullUrlOverride.replace(/\/$/, '');

  const portRaw = process.env.PM_SUPERVISOR_GUI_HTTP_PORT?.trim();
  const port = portRaw ? (parseInt(portRaw, 10) || DEFAULT_GUI_HTTP_PORT) : DEFAULT_GUI_HTTP_PORT;

  const hostOverride = process.env.PM_SUPERVISOR_GUI_HTTP_HOST?.trim();
  if (hostOverride) return `http://${hostOverride}:${port}`;

  if (process.env.PM_RUNNING_IN_CONTAINER === 'true') {
    const gateway = process.env.PM_SUPERVISOR_GUI_HTTP_GATEWAY?.trim()
      || process.env.PM_INTERACTIVE_TERMINAL_HOST_GATEWAY?.trim()
      || 'host.containers.internal';
    return `http://${gateway}:${port}`;
  }

  return `http://127.0.0.1:${port}`;
}

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

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readStringFromObject(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  return readString(value[key]);
}

interface LaunchRequestMetadata {
  workspace_id?: string;
  session_id?: string;
  agent?: string;
  mode?: string;
}

function extractLaunchRequestMetadata(payload: unknown): LaunchRequestMetadata {
  if (!isRecord(payload)) return {};

  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  const context = isRecord(payload.context) ? payload.context : undefined;
  const approvalContract = context && isRecord(context.approval_contract_v2)
    ? context.approval_contract_v2
    : undefined;

  return {
    workspace_id: readString(metadata?.workspace_id),
    session_id: readString(metadata?.session_id),
    agent: readString(metadata?.agent),
    mode: readString(approvalContract?.mode),
  };
}

function extractLaunchMetadata(
  requestMetadata: LaunchRequestMetadata,
  responsePayload: unknown,
  launchData: Record<string, unknown>,
): LaunchModeSessionMetadata | undefined {
  const responseRoot = isRecord(responsePayload) ? responsePayload : undefined;
  const responseMetadata = responseRoot && isRecord(responseRoot.metadata)
    ? responseRoot.metadata
    : undefined;

  let responseMode = readStringFromObject(launchData, 'mode');
  if (!responseMode) {
    const answers = responseRoot?.answers;
    if (Array.isArray(answers)) {
      for (const answer of answers) {
        if (!isRecord(answer)) continue;
        const value = isRecord(answer.value) ? answer.value : undefined;
        if (!value || readString(value.type) !== 'approval_decision_v2') continue;
        const decision = isRecord(value.decision) ? value.decision : undefined;
        const candidateMode = readString(decision?.mode);
        if (candidateMode) {
          responseMode = candidateMode;
          break;
        }
      }
    }
  }

  let responseSessionId = readStringFromObject(launchData, 'session_id')
    ?? readString(responseMetadata?.session_id);

  if (!responseSessionId) {
    const answers = responseRoot?.answers;
    if (Array.isArray(answers)) {
      for (const answer of answers) {
        if (!isRecord(answer)) continue;
        const value = isRecord(answer.value) ? answer.value : undefined;
        if (!value || readString(value.type) !== 'approval_decision_v2') continue;
        const decision = isRecord(value.decision) ? value.decision : undefined;
        const candidateSessionId = readString(decision?.session_id);
        if (candidateSessionId) {
          responseSessionId = candidateSessionId;
          break;
        }
      }
    }
  }

  const mode = responseMode ?? requestMetadata.mode;
  const sessionId = responseSessionId ?? requestMetadata.session_id;
  if (!mode && !sessionId) return undefined;

  return {
    ...(mode ? { mode } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
  };
}

function classifyUnavailableKind(appName: string): SummonabilityDiagnosticKind {
  if (appName === 'approval_gui') return 'approval_gui-unavailable';
  if (appName === 'brainstorm_gui') return 'brainstorm_gui-unavailable';
  return 'launch-failed';
}

function classifyLaunchFailureKind(
  appName: string,
  errorMessage?: string,
): SummonabilityDiagnosticKind {
  const message = (errorMessage ?? '').toLowerCase();
  if (
    message.includes('disabled')
    || message.includes('unknown form app')
    || message.includes('not registered')
    || message.includes('unavailable')
    || message.includes('missing command')
    || message.includes('unresolved executable path')
  ) {
    return classifyUnavailableKind(appName);
  }
  return 'launch-failed';
}

function buildLaunchFailureResult(
  appName: string,
  kind: SummonabilityDiagnosticKind,
  message: string,
  source: SummonabilityDiagnostic['source'],
  requestMetadata: LaunchRequestMetadata,
  details?: Record<string, unknown>,
): FormAppLaunchResult {
  const metadata = extractLaunchMetadata(requestMetadata, undefined, {});
  return {
    app_name: appName,
    success: false,
    error: message,
    elapsed_ms: 0,
    timed_out: false,
    diagnostics: [{
      kind,
      message,
      source,
      app_name: appName,
      ...(details ? { details } : {}),
    }],
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeLaunchResult(
  appName: string,
  rawData: unknown,
  source: SummonabilityDiagnostic['source'],
  requestMetadata: LaunchRequestMetadata,
): FormAppLaunchResult {
  if (!isRecord(rawData)) {
    return buildLaunchFailureResult(
      appName,
      'response-shape-error',
      'Launch response data is not an object',
      source,
      requestMetadata,
      { received_type: rawData === null ? 'null' : typeof rawData },
    );
  }

  if (typeof rawData.success !== 'boolean') {
    return buildLaunchFailureResult(
      appName,
      'response-shape-error',
      'Launch response is missing boolean success field',
      source,
      requestMetadata,
      { keys: Object.keys(rawData) },
    );
  }

  const metadata = extractLaunchMetadata(requestMetadata, rawData.response_payload, rawData);
  const error = readString(rawData.error);
  const result: FormAppLaunchResult = {
    app_name: readString(rawData.app_name) ?? appName,
    success: rawData.success,
    response_payload: rawData.response_payload,
    error,
    elapsed_ms: typeof rawData.elapsed_ms === 'number' && Number.isFinite(rawData.elapsed_ms)
      ? rawData.elapsed_ms
      : 0,
    timed_out: typeof rawData.timed_out === 'boolean' ? rawData.timed_out : false,
    pending_refinement: typeof rawData.pending_refinement === 'boolean'
      ? rawData.pending_refinement
      : false,
    session_id: readString(rawData.session_id),
    ...(metadata ? { metadata } : {}),
  };

  if (!result.success) {
    const failureMessage = error ?? `Launch failed for ${appName}`;
    result.diagnostics = [{
      kind: classifyLaunchFailureKind(appName, failureMessage),
      message: failureMessage,
      source,
      app_name: appName,
    }];
  }

  return result;
}

function createUnavailableAvailability(
  source: SummonabilityDiagnostic['source'],
  message: string,
): GuiAvailability {
  return {
    supervisor_running: false,
    brainstorm_gui: false,
    approval_gui: false,
    capabilities: [],
    message,
    diagnostics: [{
      kind: 'supervisor-unavailable',
      message,
      source,
    }],
  };
}

function attachCapabilityDiagnostics(result: GuiAvailability): GuiAvailability {
  const diagnostics: SummonabilityDiagnostic[] = [...(result.diagnostics ?? [])];
  if (!result.approval_gui) {
    diagnostics.push({
      kind: 'approval_gui-unavailable',
      message: 'approval_gui capability is unavailable',
      source: 'client',
      app_name: 'approval_gui',
    });
  }
  if (!result.brainstorm_gui) {
    diagnostics.push({
      kind: 'brainstorm_gui-unavailable',
      message: 'brainstorm_gui capability is unavailable',
      source: 'client',
      app_name: 'brainstorm_gui',
    });
  }
  return diagnostics.length > 0 ? { ...result, diagnostics } : result;
}

function connectViaPipe(
  pipePath: string,
  connectTimeout: number,
): Promise<net.Socket> {
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

    socket.connect({ path: pipePath });
  });
}

function connectViaTcp(
  host: string,
  port: number,
  connectTimeout: number,
): Promise<net.Socket> {
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

    socket.connect({ host, port });
  });
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
  const host = opts.tcpHost ?? '127.0.0.1';
  const port = opts.tcpPort ?? DEFAULT_TCP_PORT;
  const usePipe = process.platform === 'win32' && !opts.forceTcp;

  if (!usePipe) {
    return connectViaTcp(host, port, connectTimeout);
  }

  const pipePath = opts.pipePath ?? ENV_PIPE_PATH ?? DEFAULT_PIPE_PATH;

  return connectViaPipe(pipePath, connectTimeout).catch(async (pipeError) => {
    try {
      return await connectViaTcp(host, port, connectTimeout);
    } catch (tcpError) {
      throw new Error(
        `Supervisor connection failed via named pipe (${pipePath}) and TCP (${host}:${port}): pipe=${asErrorMessage(pipeError)}; tcp=${asErrorMessage(tcpError)}`,
      );
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

export async function startSupervisorService(
  service: string,
  opts: SupervisorClientOptions = {},
): Promise<{ ok: boolean; service: string; status?: string; error?: string; data?: unknown }> {
  const response = await supervisorRequest({ type: 'Start', service }, opts);
  const payload = (response.data ?? {}) as { status?: string };
  return {
    ok: response.ok === true,
    service,
    status: payload.status,
    error: response.error,
    data: response.data,
  };
}

/**
 * Update runtime execution policy in the currently-running Supervisor process.
 * This is single-instance safe and avoids restart/multi-instance flows.
 */
export async function setMcpRuntimePolicy(
  policy: {
    enabled?: boolean;
    wave_cohorts?: string[];
    hard_stop_gate?: boolean;
  },
  opts: SupervisorClientOptions = {},
): Promise<{ ok: boolean; policy?: RuntimePolicyState; error?: string; data?: unknown }> {
  const resp = await supervisorRequest(
    {
      type: 'SetMcpRuntimePolicy',
      enabled: policy.enabled,
      wave_cohorts: policy.wave_cohorts,
      hard_stop_gate: policy.hard_stop_gate,
    },
    {
      ...opts,
      connectTimeoutMs: opts.connectTimeoutMs ?? 3000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 10_000,
    },
  );

  const envelope = (resp.data ?? {}) as { policy?: RuntimePolicyState };
  return {
    ok: resp.ok === true,
    policy: envelope.policy,
    error: resp.error,
    data: resp.data,
  };
}

/**
 * Execute one MCP runtime payload through the Supervisor-native runtime.
 */
export async function executeMcpRuntime(
  payload: McpRuntimeExecPayload,
  timeoutMs?: number,
  opts: SupervisorClientOptions = {},
): Promise<ControlResponse> {
  return supervisorRequest(
    {
      type: 'McpRuntimeExec',
      payload,
      ...(timeoutMs != null ? { timeout_ms: timeoutMs } : {}),
    },
    {
      ...opts,
      connectTimeoutMs: opts.connectTimeoutMs ?? 3000,
      requestTimeoutMs: opts.requestTimeoutMs ?? Math.max((timeoutMs ?? 10_000) + 3_000, 10_000),
    },
  );
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
  const unavailable = createUnavailableAvailability(
    'control',
    'Supervisor is not running or unreachable',
  );

  // In container mode the named pipe is inaccessible — go straight to HTTP.
  if (process.env.PM_RUNNING_IN_CONTAINER === 'true') {
    return checkGuiAvailabilityHttp(undefined, opts.connectTimeoutMs ?? 3000);
  }

  try {
    // 1. Try to connect and get status via named pipe / TCP control plane.
    const statusResp = await supervisorRequest({ type: 'Status' }, {
      ...opts,
      connectTimeoutMs: opts.connectTimeoutMs ?? 2000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 3000,
    });

    if (!statusResp.ok) {
      return { ...unavailable, message: `Supervisor returned error: ${statusResp.error}` };
    }

    // Status response data is an array of service states.
    const _services = Array.isArray(statusResp.data) ? statusResp.data as ServiceState[] : [];

    // 2. Prefer WhoAmI capability signals when available on control transport.
    try {
      const whoAmIResp = await supervisorRequest(
        {
          type: 'WhoAmI',
          request_id: randomUUID(),
          client: 'mcp-server',
          client_version: '1.0.0',
        },
        {
          ...opts,
          connectTimeoutMs: opts.connectTimeoutMs ?? 2000,
          requestTimeoutMs: opts.requestTimeoutMs ?? 3000,
        },
      );

      if (whoAmIResp.ok && isRecord(whoAmIResp.data)) {
        const capabilitiesRaw = whoAmIResp.data.capabilities;
        const capabilities = Array.isArray(capabilitiesRaw)
          ? capabilitiesRaw.filter((entry): entry is string => typeof entry === 'string')
          : [];

        if (capabilities.length > 0) {
          return attachCapabilityDiagnostics({
            supervisor_running: true,
            brainstorm_gui: capabilities.includes('brainstorm_gui'),
            approval_gui: capabilities.includes('approval_gui'),
            capabilities,
            message: `Supervisor running (control capability check); apps: ${capabilities.join(', ')}`,
          });
        }
      }
    } catch {
      // Capability handshake is best-effort; availability may still be checked via HTTP.
    }

    // 3. Confirm via the GUI HTTP server that the GUI launcher is also up.
    //    This is the single source of truth for which form apps are enabled.
    const httpAvail = await checkGuiAvailabilityHttp(undefined, 2000);
    if (httpAvail.supervisor_running) {
      return {
        ...httpAvail,
        message: `Supervisor running (pipe ok); ${httpAvail.message}`,
      };
    }

    // GUI HTTP server not yet answering (e.g. first startup) — assume
    // both form apps are available if we reached the supervisor at all.
    return attachCapabilityDiagnostics({
      supervisor_running: true,
      brainstorm_gui: true,
      approval_gui: true,
      capabilities: [],
      message: 'Supervisor running (pipe ok); GUI HTTP server not yet ready',
    });
  } catch {
    // Named-pipe / TCP control plane failed — try HTTP as last resort.
    return checkGuiAvailabilityHttp(undefined, opts.connectTimeoutMs ?? 3000);
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
  const requestMetadata = extractLaunchRequestMetadata(payload);

  // In container mode go straight to the GUI HTTP server.
  if (process.env.PM_RUNNING_IN_CONTAINER === 'true') {
    return launchFormAppHttp(appName, payload, {
      timeoutSeconds,
      workspaceId: requestMetadata.workspace_id,
      sessionId: requestMetadata.session_id,
      agent: requestMetadata.agent,
    });
  }

  // LaunchApp can take a long time — use a generous request timeout
  const requestTimeout = timeoutSeconds
    ? (timeoutSeconds + 10) * 1000 // Add 10s buffer over GUI timeout
    : 310_000; // Default: 5 min + 10s

  try {
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
      // Named-pipe request failed — try HTTP fallback.
      const fallback = await launchFormAppHttp(appName, payload, {
        timeoutSeconds,
        workspaceId: requestMetadata.workspace_id,
        sessionId: requestMetadata.session_id,
        agent: requestMetadata.agent,
      });
      if (!fallback.success) {
        const controlError = readString(resp.error) ?? 'LaunchApp request returned ok=false';
        const combinedDiagnostics: SummonabilityDiagnostic[] = [
          {
            kind: classifyLaunchFailureKind(appName, controlError),
            message: controlError,
            source: 'control',
            app_name: appName,
          },
          ...(fallback.diagnostics ?? []),
        ];
        return {
          ...fallback,
          diagnostics: combinedDiagnostics,
        };
      }
      return fallback;
    }

    return normalizeLaunchResult(appName, resp.data, 'control', requestMetadata);
  } catch (error) {
    // Named-pipe connection failed — try HTTP fallback.
    const fallback = await launchFormAppHttp(appName, payload, {
      timeoutSeconds,
      workspaceId: requestMetadata.workspace_id,
      sessionId: requestMetadata.session_id,
      agent: requestMetadata.agent,
    });
    if (!fallback.success) {
      const transportError = asErrorMessage(error);
      const diagnostics: SummonabilityDiagnostic[] = [
        {
          kind: 'supervisor-unavailable',
          message: `Control transport unavailable: ${transportError}`,
          source: 'control',
        },
        ...(fallback.diagnostics ?? []),
      ];
      return {
        ...fallback,
        diagnostics,
      };
    }
    return fallback;
  }
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
  // In container mode go straight to the GUI HTTP server.
  if (process.env.PM_RUNNING_IN_CONTAINER === 'true') {
    return continueFormAppHttp(sessionId, payload, { timeoutSeconds });
  }

  const requestTimeout = timeoutSeconds
    ? (timeoutSeconds + 10) * 1000
    : 310_000;

  try {
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
      // Named-pipe request failed — try HTTP fallback.
      return continueFormAppHttp(sessionId, payload, { timeoutSeconds });
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
  } catch {
    // Named-pipe connection failed — try HTTP fallback.
    return continueFormAppHttp(sessionId, payload, { timeoutSeconds });
  }
}

// =========================================================================
// GUI HTTP server helpers  (supervisor/src/gui_server.rs — port 3464)
// =========================================================================

/**
 * Check GUI availability via the dedicated HTTP launcher server.
 * This works from inside a container where the named pipe is not accessible.
 */
export async function checkGuiAvailabilityHttp(
  baseUrl?: string,
  timeoutMs = 3000,
): Promise<GuiAvailability> {
  const url = `${baseUrl ?? resolveGuiHttpUrl()}/gui/ping`;
  const unavailable = createUnavailableAvailability(
    'http',
    `GUI HTTP server unreachable at ${url}`,
  );

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ...unavailable,
        message: `GUI HTTP server returned ${res.status} at ${url}`,
      };
    }

    const body = await res.json() as { available?: boolean; apps?: string[] };
    if (!body.available) {
      return {
        ...unavailable,
        message: `GUI HTTP server reported unavailable at ${url}`,
      };
    }

    const apps = body.apps ?? [];
    return attachCapabilityDiagnostics({
      supervisor_running: true,
      brainstorm_gui: apps.includes('brainstorm_gui'),
      approval_gui: apps.includes('approval_gui'),
      capabilities: apps.map(a => a),
      message: `GUI HTTP server available; apps: ${apps.join(', ')}`,
    });
  } catch {
    return unavailable;
  }
}

/**
 * Launch a form-app via the GUI HTTP server.
 * Used as a fallback (or primary path in container mode) instead of the
 * NDJSON named-pipe LaunchApp control request.
 */
export async function launchFormAppHttp(
  appName: string,
  payload: unknown,
  opts: {
    timeoutSeconds?: number;
    baseUrl?: string;
    workspaceId?: string;
    sessionId?: string;
    agent?: string;
  } = {},
): Promise<FormAppLaunchResult> {
  const requestMetadata: LaunchRequestMetadata = {
    ...extractLaunchRequestMetadata(payload),
    ...(opts.workspaceId ? { workspace_id: opts.workspaceId } : {}),
    ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
    ...(opts.agent ? { agent: opts.agent } : {}),
  };
  const base = opts.baseUrl ?? resolveGuiHttpUrl();
  const url = `${base}/gui/launch`;
  const requestTimeoutMs = opts.timeoutSeconds
    ? (opts.timeoutSeconds + 10) * 1000
    : 310_000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: appName,
        payload,
        ...(opts.timeoutSeconds != null ? { timeout_seconds: opts.timeoutSeconds } : {}),
        ...(opts.workspaceId ? { workspace_id: opts.workspaceId } : {}),
        ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
        ...(opts.agent ? { agent: opts.agent } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const envelope = await res.json() as unknown;
    if (!isRecord(envelope) || typeof envelope.ok !== 'boolean') {
      return buildLaunchFailureResult(
        appName,
        'response-shape-error',
        'GUI HTTP launch returned invalid response envelope',
        'http',
        requestMetadata,
        { received_type: envelope === null ? 'null' : typeof envelope },
      );
    }

    if (!envelope.ok) {
      const errorMessage = readString(envelope.error) ?? 'GUI HTTP server returned not-ok';
      return buildLaunchFailureResult(
        appName,
        classifyLaunchFailureKind(appName, errorMessage),
        errorMessage,
        'http',
        requestMetadata,
      );
    }

    return normalizeLaunchResult(appName, envelope.data, 'http', requestMetadata);
  } catch (err) {
    const message = `GUI HTTP launch error: ${err instanceof Error ? err.message : String(err)}`;
    return buildLaunchFailureResult(
      appName,
      'supervisor-unavailable',
      message,
      'http',
      requestMetadata,
    );
  }
}

/**
 * Continue a paused refinement session via the GUI HTTP server.
 */
export async function continueFormAppHttp(
  sessionId: string,
  payload: unknown,
  opts: { timeoutSeconds?: number; baseUrl?: string } = {},
): Promise<FormAppLaunchResult> {
  const base = opts.baseUrl ?? resolveGuiHttpUrl();
  const url = `${base}/gui/continue`;
  const requestTimeoutMs = opts.timeoutSeconds
    ? (opts.timeoutSeconds + 10) * 1000
    : 310_000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        payload,
        ...(opts.timeoutSeconds != null ? { timeout_seconds: opts.timeoutSeconds } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const envelope = await res.json() as { ok: boolean; data?: FormAppLaunchResult; error?: string };
    if (!envelope.ok || !envelope.data) {
      return {
        app_name: 'brainstorm_gui',
        success: false,
        error: envelope.error ?? 'GUI HTTP server returned not-ok on continue',
        elapsed_ms: 0,
        timed_out: false,
      };
    }
    const d = envelope.data;
    return {
      app_name: d.app_name ?? 'brainstorm_gui',
      success: d.success ?? false,
      response_payload: d.response_payload,
      error: d.error,
      elapsed_ms: d.elapsed_ms ?? 0,
      timed_out: d.timed_out ?? false,
      pending_refinement: d.pending_refinement ?? false,
      session_id: d.session_id,
    };
  } catch (err) {
    return {
      app_name: 'brainstorm_gui',
      success: false,
      error: `GUI HTTP continue error: ${err instanceof Error ? err.message : String(err)}`,
      elapsed_ms: 0,
      timed_out: false,
    };
  }
}
