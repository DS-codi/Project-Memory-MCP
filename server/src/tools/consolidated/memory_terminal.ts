/**
 * Consolidated Terminal Tool — memory_terminal
 *
 * Simplified flat API with 5 actions:
 *   - run           — execute a command (with three-way authorization + GUI approval)
 *   - read_output   — get output from a session
 *   - kill          — terminate a session
 *   - get_allowlist — view the allowlist
 *   - update_allowlist — manage allowlist patterns
 *
 * Created in Phase 2 (MCP Tool Surface) — replaces memory_terminal_interactive.
 * All legacy aliases, nested envelopes, and compat metadata removed.
 */

import type { ToolResponse } from '../../types/index.js';
import {
  handleReadOutput,
  handleKill,
  handleGetAllowlist,
  handleUpdateAllowlist,
} from '../terminal.tools.js';
import {
  isDestructiveCommand,
  hasShellOperators,
  getEffectiveAllowlist,
  ensureAllowlistLoaded,
} from '../terminal-auth.js';
import type { CommandRequest, CommandResponse } from '../terminal-ipc-protocol.js';
import { TcpTerminalAdapter } from '../terminal-tcp-adapter.js';
import { getAllWorkspaces } from '../../storage/db-store.js';

// =========================================================================
// GUI Session Tracking
// =========================================================================

/**
 * Session IDs that were created by routing a command through the GUI TCP path.
 * read_output / kill for these sessions must go through TCP, not local child_process.
 */
const guiSessions = new Set<string>();

// =========================================================================
// In-Flight Session Rate Limiter
// =========================================================================

/**
 * Tracks session IDs that currently have an in-flight `run` command.
 *
 * SEQUENTIAL RULE: Each `run` call MUST receive its response before another
 * `run` targets the same session.  If a concurrent call arrives for a session
 * that is already busy, it is automatically redirected to a fresh isolated
 * terminal tab (a new unique session_id) so the two commands don't collide.
 *
 * The sentinel key '__selected__' represents the "selected / unspecified"
 * session bucket (resolvedSessionId === '').
 */
const inFlightSessions = new Set<string>();

const SELECTED_BUCKET_KEY = '__selected__';

function toSessionBucketKey(resolvedSessionId: string): string {
  return resolvedSessionId === '' ? SELECTED_BUCKET_KEY : resolvedSessionId;
}

// =========================================================================
// Public Types
// =========================================================================

export type MemoryTerminalAction =
  | 'run'
  | 'read_output'
  | 'kill'
  | 'get_allowlist'
  | 'update_allowlist';

// ─── Context-pack types ──────────────────────────────────────────────────────

/** A single file reference included in a context-pack. */
export interface RelevantFile {
  path: string;
  snippet?: string;
}

/**
 * Structured context assembled before a super-subagent launch request is
 * forwarded to the GUI approval dialog.
 *
 * Embedded into the `context` JSON string of the TCP CommandRequest under the
 * key `"context_pack"`, alongside `source`, `correlation`, and `approval`.
 */
export interface ContextPack {
  step_notes?: string;
  relevant_files?: RelevantFile[];
  workspace_instructions?: string;
  custom_instructions?: string;
  requesting_agent?: string;
  plan_id?: string;
  session_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryTerminalParams {
  action: MemoryTerminalAction;
  /** Command to execute (for run). */
  command?: string;
  /** Command arguments (for run). */
  args?: string[];
  /** Working directory (for run). */
  cwd?: string;
  /** Execution timeout in milliseconds (for run). */
  timeout_ms?: number;
  /** Workspace ID. */
  workspace_id?: string;
  /** Session ID (for read_output, kill). */
  session_id?: string;
  /**
   * Session routing behavior for run action:
   * - selected (default): run in currently selected Interactive Terminal tab
   * - default: force the default tab/session
   * - specific: requires session_id
   */
  session_target?: 'selected' | 'default' | 'specific';
  /** Allowlist patterns (for update_allowlist). */
  patterns?: string[];
  /** How to modify the allowlist (for update_allowlist). */
  operation?: 'add' | 'remove' | 'set';
  /**
   * Per-request environment variables injected into the spawned process
   * (for run). Supports Gemini/Google alias auto-expansion on the
   * executor side: supplying either GEMINI_API_KEY or GOOGLE_API_KEY
   * causes both to be set.
   */
  env?: Record<string, string>;
  /**
   * Agent launch metadata for super-subagent launches (for run).
   * When present, triggers context-pack assembly and the GUI hard-gate approval
   * flow. The assembled context pack is embedded in the `context` JSON field
   * sent to the Interactive Terminal TCP adapter.
   */
  agent_launch_meta?: {
    requesting_agent?: string;
    plan_id?: string;
    session_id?: string;
    step_notes?: string;
    relevant_files?: Array<{ path: string; snippet?: string }>;
    workspace_instructions?: string;
    custom_instructions?: string;
    /**
     * Output format for the AI session.
     * "text" (default) | "json" | "stream-json".
     * Gemini supports "json" and "stream-json" natively via --output_format.
     * Copilot falls back to "text" and injects PM_REQUESTED_OUTPUT_FORMAT.
     */
    output_format?: 'text' | 'json' | 'stream-json';
    /**
     * Session lifecycle mode.
     * "new" (default) — start a fresh session.
     * "resume" — resume an existing session (Gemini only; Copilot returns an error).
     */
    session_mode?: 'new' | 'resume';
    /**
     * Session ID to resume.  Required when session_mode = "resume".
     * Ignored when session_mode = "new".
     */
    resume_session_id?: string;
  };
}

/**
 * Extra parameter provided by the MCP SDK — contains sendNotification
 * (for progress notifications) and signal (AbortSignal for cancellation).
 *
 * We use `any` for the notification parameter to stay compatible with the
 * SDK's strongly-typed ServerNotification without importing SDK internals.
 */
export interface McpToolExtra {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendNotification?: (notification: any) => Promise<void> | void;
  signal?: AbortSignal;
}

// =========================================================================
// Context-Pack Assembly (Step 9)
// =========================================================================

/**
 * Assemble a ContextPack from the `agent_launch_meta` fields of a run request.
 *
 * The returned object is serialised and embedded into the `context` JSON string
 * sent to the Interactive Terminal under the key `"context_pack"`. The GUI
 * approval dialog and the Rust application-side routing logic both read it from
 * there.
 *
 * Returns `undefined` when no launch metadata is present.
 */
export function assembleContextPack(
  params: MemoryTerminalParams,
): ContextPack | undefined {
  const meta = params.agent_launch_meta;
  if (!meta) return undefined;

  const pack: ContextPack = {};

  if (meta.requesting_agent) pack.requesting_agent = meta.requesting_agent;
  if (meta.plan_id) pack.plan_id = meta.plan_id;
  if (meta.session_id) pack.session_id = meta.session_id;
  if (meta.step_notes) pack.step_notes = meta.step_notes;
  if (meta.workspace_instructions)
    pack.workspace_instructions = meta.workspace_instructions;
  if (meta.custom_instructions)
    pack.custom_instructions = meta.custom_instructions;
  if (meta.relevant_files && meta.relevant_files.length > 0)
    pack.relevant_files = meta.relevant_files.map((f) => ({
      path: f.path,
      snippet: f.snippet,
    }));

  return pack;
}

/**
 * Build the `context` JSON string for an agent-launch `CommandRequest`.
 *
 * The format mirrors the existing context envelope expected by the QML
 * `parseContextInfo` / `syncApprovalDialog` flow:
 * ```json
 * {
 *   "source": { "launch_kind": "agent_cli_launch", "intent": "agent_launch", ... },
 *   "approval": { "provider_policy": "agent_cli_launch", ... },
 *   "context_pack": { ... }
 * }
 * ```
 */
export function buildAgentLaunchContextJson(
  params: MemoryTerminalParams,
  contextPack: ContextPack,
): string {
  const meta = params.agent_launch_meta ?? {};
  const envelope = {
    source: {
      launch_kind: 'agent_cli_launch',
      intent: 'agent_launch',
      command: params.command ?? '',
      args: params.args ?? [],
      mode: 'interactive',
      session_id: meta.session_id ?? params.session_id ?? '',
      workspace_id: params.workspace_id ?? '',
      // Step 28: output format (omit when default "text" to keep context JSON compact)
      ...(meta.output_format && meta.output_format !== 'text'
        ? { output_format: meta.output_format }
        : {}),
      // Step 27: session lifecycle (omit when default "new")
      ...(meta.session_mode && meta.session_mode !== 'new'
        ? {
            session_mode: meta.session_mode,
            ...(meta.resume_session_id
              ? { resume_session_id: meta.resume_session_id }
              : {}),
          }
        : {}),
    },
    approval: {
      provider_policy: 'agent_cli_launch',
    },
    context_pack: contextPack,
  };
  return JSON.stringify(envelope);
}

// =========================================================================
// Three-Way Authorization (Step 15)
// =========================================================================

export type TerminalAuthDecision =
  | { decision: 'blocked'; reason: string }
  | { decision: 'allowed' }
  | { decision: 'needs_approval' };

/**
 * Classify a command into one of three categories:
 *   - blocked       — destructive or contains shell operators → reject immediately
 *   - allowed       — on the allowlist → auto-execute
 *   - needs_approval — not destructive, not on allowlist → GUI shows approval dialog
 *
 * Unlike authorizeCommand() in terminal-auth.ts (which returns 'blocked' for
 * both destructive AND non-allowlisted), this provides the third
 * 'needs_approval' bucket needed for the GUI approval flow.
 */
export async function classifyCommand(
  command: string,
  args: string[],
  workspaceId?: string,
): Promise<TerminalAuthDecision> {
  const fullCommand =
    args.length > 0 ? `${command} ${args.join(' ')}` : command;

  // 1. Destructive → blocked
  const destructive = isDestructiveCommand(fullCommand);
  if (destructive.match) {
    return {
      decision: 'blocked',
      reason: `Destructive command: "${destructive.keyword}"`,
    };
  }

  // 2. Shell operators → blocked
  if (hasShellOperators(fullCommand)) {
    return {
      decision: 'blocked',
      reason: 'Shell operators not allowed',
    };
  }

  // 3. Check allowlist (async — loads from disk on first access)
  const allowlist = await getEffectiveAllowlist(workspaceId);
  const lower = fullCommand.toLowerCase();
  for (const pattern of allowlist) {
    if (
      fullCommand.startsWith(pattern) ||
      lower.startsWith(pattern.toLowerCase())
    ) {
      return { decision: 'allowed' };
    }
  }

  // 4. Not on allowlist, not destructive → needs approval from GUI
  return { decision: 'needs_approval' };
}

// =========================================================================
// Progress Heartbeat (Step 14)
// =========================================================================

let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

function startHeartbeat(extra?: McpToolExtra): void {
  if (!extra?.sendNotification) return;

  heartbeatInterval = setInterval(() => {
    try {
      extra.sendNotification!({
        method: 'notifications/progress',
        params: {
          progressToken: `terminal-${Date.now()}`,
          progress: 0,
          total: 0,
          message: 'Waiting for terminal command response...',
        },
      });
    } catch {
      // Silently ignore if notification channel is closed
    }
  }, 10_000); // Every 10 seconds
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = undefined;
  }
}

const OUTPUT_SUMMARY_MAX_CHARS = 2000;

export function splitOutputIntoStreams(output: string): {
  stdout: string;
  stderr: string;
} {
  if (!output) {
    return { stdout: '', stderr: '' };
  }

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('[stderr] ')) {
      stderrLines.push(line.slice('[stderr] '.length));
    } else if (line.length > 0) {
      stdoutLines.push(line);
    }
  }

  return {
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
  };
}

export function summarizeOutput(
  text: string,
  maxChars: number = OUTPUT_SUMMARY_MAX_CHARS,
): { summary: string; truncated: boolean } {
  if (!text) {
    return { summary: '', truncated: false };
  }

  if (text.length <= maxChars) {
    return { summary: text, truncated: false };
  }

  return {
    summary: text.slice(0, maxChars),
    truncated: true,
  };
}

// =========================================================================
// Response Mapping
// =========================================================================

/**
 * Map a CommandResponse from the GUI to a ToolResponse.
 *   - approved → success with execution data
 *   - declined → failure with user decision
 *   - timeout  → failure with timeout message
 */
function mapCommandResponseToToolResponse(
  response: CommandResponse,
): ToolResponse {
  switch (response.status) {
    case 'approved': {
      const streams = splitOutputIntoStreams(response.output ?? '');
      const stdoutSummary = summarizeOutput(streams.stdout);
      const stderrSummary = summarizeOutput(streams.stderr);
      return {
        success: true,
        data: {
          session_id: response.id,
          stdout: stdoutSummary.summary,
          stderr: stderrSummary.summary,
          stdout_summary: stdoutSummary.summary,
          stderr_summary: stderrSummary.summary,
          output_summary_truncated:
            stdoutSummary.truncated || stderrSummary.truncated,
          output_streamed: true,
          output_stream_note:
            'Live output chunks were streamed via notifications/progress during execution.',
          exit_code: response.exit_code ?? null,
          output_file_path: response.output_file_path,
        },
      };
    }
    case 'declined':
      return {
        success: false,
        error: response.reason ?? 'Command declined by user',
      };
    case 'timeout':
      return {
        success: false,
        error: response.reason ?? 'Command timed out waiting for response',
      };
    default:
      return {
        success: false,
        error: `Unknown response status: ${(response as CommandResponse).status}`,
      };
  }
}

// =========================================================================
// Action Handlers
// =========================================================================

/**
 * Handle the `run` action for the memory_terminal tool.
 *
 * ## Approval-dialog lifecycle (IMPORTANT for agent callers)
 *
 * When the target command is not on the allowlist, this call **blocks** until
 * the human user either approves or declines the command in the GUI approval
 * dialog.  The call resolves as soon as a response arrives **or** after the
 * `RESPONSE_TIMEOUT_MS` deadline (60 000 ms ≈ 60 s) elapses.
 *
 * ### Blocking behavior
 * `sendAndAwait` opens a TCP connection to the interactive-terminal GUI and
 * waits for a `CommandResponse` message.  The call does **not** return until
 * the GUI sends that response (approved / declined / timeout).  From the
 * agent's perspective, the `run` call can take up to 60 seconds.
 *
 * ### Modal one-shot
 * The interactive-terminal GUI is a **single-client, sequential** TCP server.
 * Only one command at a time can be pending approval on a given session.
 * Agents MUST NOT send additional `run` calls for the same session while one
 * is still pending.  Doing so triggers the rate-limiter (see below), which
 * opens a new terminal tab — this is almost never the desired behavior for an
 * agent session.
 *
 * ### Timeout behavior
 * If the user does not approve or decline within 60 s, `sendAndAwait` rejects
 * with a timeout error and this function returns `{ success: false, error: "…" }`.
 * The pending command remains in the GUI queue; the agent should not retry
 * automatically without user intervention.
 *
 * ### Parallel / concurrent call behavior (`inFlightSessions` rate limiter)
 * Each session bucket may have at most **one** in-flight `run` call at a time.
 * If a second `run` arrives for a session that is already busy, it is
 * automatically redirected to a fresh terminal tab (a new `session_id`).  The
 * response will include a `rate_limit_note` field warning the agent.  This
 * leads to **tab proliferation** and should be avoided — agents must always
 * wait for the previous `run` response before issuing the next one.
 *
 * ### Agent CLI session use pattern
 * For agent CLI launches (Gemini, Copilot, etc.) via `agent_launch_meta`:
 *   1. Send **one** `run` call and wait for the `CommandResponse`.
 *   2. The response carries the `session_id` for subsequent `read_output` /
 *      `kill` calls (`response.id` is added to `guiSessions`).
 *   3. Do NOT send further `run` calls until the first one has returned.
 */
async function handleRun(
  params: MemoryTerminalParams,
  extra?: McpToolExtra,
): Promise<ToolResponse> {
  if (!params.command) {
    return { success: false, error: 'command is required for action: run' };
  }

  const command = params.command;
  const args = params.args ?? [];

  // Ensure allowlist is loaded from disk before classification
  if (params.workspace_id) {
    await ensureAllowlistLoaded(params.workspace_id);
  }

  // Three-way authorization
  const auth = await classifyCommand(command, args, params.workspace_id);

  if (auth.decision === 'blocked') {
    return {
      success: false,
      error: `Command blocked: ${auth.reason}`,
    };
  }

  const sessionTarget = params.session_target ?? 'selected';
  let resolvedSessionId: string | undefined;

  if (sessionTarget === 'specific') {
    if (!params.session_id?.trim()) {
      return {
        success: false,
        error: 'session_id is required when session_target is specific',
      };
    }
    resolvedSessionId = params.session_id.trim();
  } else if (sessionTarget === 'default') {
    resolvedSessionId = 'default';
  } else if (params.session_id?.trim()) {
    resolvedSessionId = params.session_id.trim();
  } else {
    resolvedSessionId = '';
  }

  // ── Rate Limiter ────────────────────────────────────────────────────────
  // If the target session already has an in-flight command, redirect this
  // request to a new isolated terminal tab (new session_id) so the two
  // commands don't collide on the same PTY session.
  // Agents MUST wait for each run response before issuing the next call.
  let sessionBucket = toSessionBucketKey(resolvedSessionId);
  let rateRedirected = false;
  if (inFlightSessions.has(sessionBucket)) {
    resolvedSessionId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionBucket = resolvedSessionId;
    rateRedirected = true;
  }
  inFlightSessions.add(sessionBucket);

  // ── Context-Pack Assembly ────────────────────────────────────────────────
  // When the caller supplies agent_launch_meta, assemble a structured context
  // pack and embed it in the context JSON string.  The GUI approval dialog and
  // the Rust hard-gate / routing logic both read from this field.
  let contextJson: string | undefined;
  const contextPack = assembleContextPack(params);
  if (contextPack) {
    contextJson = buildAgentLaunchContextJson(params, contextPack);
  }

  // Build CommandRequest for the TCP wire protocol
  const request: CommandRequest = {
    type: 'command_request',
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    command,
    working_directory: params.cwd ?? process.cwd(),
    args: args.length > 0 ? args : undefined,
    workspace_id: params.workspace_id,
    session_id: resolvedSessionId,
    timeout_seconds: params.timeout_ms
      ? Math.ceil(params.timeout_ms / 1000)
      : undefined,
    allowlisted: auth.decision === 'allowed',
    env: params.env && Object.keys(params.env).length > 0 ? params.env : undefined,
    context: contextJson,
  };

  // Create a fresh TCP adapter for this request.
  // Forward heartbeats from the GUI as MCP progress notifications.
  const adapter = new TcpTerminalAdapter({
    progressCallback: (event) => {
      if (extra?.sendNotification) {
        try {
          if ((event as { type?: string }).type === 'output_chunk') {
            const chunk = (event as { chunk?: string }).chunk ?? '';
            if (!chunk) {
              return;
            }
            extra.sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken: `terminal-out-${Date.now()}`,
                progress: 0,
                total: 0,
                message: chunk,
              },
            });
            return;
          }

          const heartbeat = event as { id: string; timestamp_ms: number };
          extra.sendNotification({
            method: 'notifications/progress',
            params: {
              progressToken: `terminal-hb-${heartbeat.id}`,
              progress: 0,
              total: 0,
              message: `GUI heartbeat at ${heartbeat.timestamp_ms}`,
            },
          });
        } catch {
          // Silently ignore if notification channel is closed
        }
      }
    },
  });

  // Start heartbeat to prevent MCP client timeout while waiting for GUI
  startHeartbeat(extra);

  // Clean up TCP connection on abort signal
  if (extra?.signal) {
    extra.signal.addEventListener(
      'abort',
      () => {
        stopHeartbeat();
        adapter.close();
      },
      { once: true },
    );
  }

  try {
    await adapter.connect();

    // Push registered workspace paths so the interactive terminal's
    // workspace/venv pickers are populated from the DB, not from ephemeral
    // session state alone.
    try {
      const workspaces = await getAllWorkspaces();
      adapter.sendWorkspaceList(
        workspaces
          .filter((w) => !!w.path)
          .map((w) => ({ id: w.workspace_id, path: w.path, name: w.name }))
      );
    } catch {
      // Non-fatal — workspace list is a UX convenience, not required for execution.
    }

    const response: CommandResponse = await adapter.sendAndAwait(request);

    stopHeartbeat();
    adapter.close();

    // Track this session as a GUI session so read_output/kill routes through TCP
    if (response.status === 'approved') {
      guiSessions.add(response.id);
    }

    const result = mapCommandResponseToToolResponse(response);

    // If we redirected due to rate limiting, surface a warning so the agent
    // knows it must not fire concurrent run calls.
    if (rateRedirected && result.success && result.data) {
      (result.data as Record<string, unknown>).rate_limit_note =
        'RATE LIMIT: The requested session already had an in-flight command. ' +
        'This command was automatically routed to a new terminal tab. ' +
        'RULE: Wait for each run response before issuing the next run call.';
    }

    return result;
  } catch (err) {
    stopHeartbeat();
    adapter.close();
    return {
      success: false,
      error: `Terminal run error: ${(err as Error).message}`,
    };
  } finally {
    // Always release the in-flight slot so future calls can proceed normally.
    inFlightSessions.delete(sessionBucket);
  }
}

async function handleReadOutputAction(
  params: MemoryTerminalParams,
): Promise<ToolResponse> {
  if (!params.session_id) {
    return {
      success: false,
      error: 'session_id is required for action: read_output',
    };
  }

  // Route through TCP for sessions that were created via the GUI
  if (guiSessions.has(params.session_id)) {
    return handleReadOutputViaTcp(params.session_id);
  }

  return handleReadOutput({ session_id: params.session_id });
}

async function handleKillAction(
  params: MemoryTerminalParams,
): Promise<ToolResponse> {
  if (!params.session_id) {
    return {
      success: false,
      error: 'session_id is required for action: kill',
    };
  }

  // Route through TCP for sessions that were created via the GUI
  if (guiSessions.has(params.session_id)) {
    return handleKillViaTcp(params.session_id);
  }

  return handleKill({ session_id: params.session_id });
}

// =========================================================================
// GUI TCP Routing (read_output / kill)
// =========================================================================

/**
 * Read output for a GUI session over TCP.
 * Creates a fresh adapter, sends ReadOutputRequest, returns mapped response.
 */
async function handleReadOutputViaTcp(sessionId: string): Promise<ToolResponse> {
  const adapter = new TcpTerminalAdapter();
  try {
    await adapter.connect();
    const response = await adapter.sendReadOutput(sessionId);
    adapter.close();

    // If the session is no longer running, we can stop tracking it
    if (!response.running) {
      guiSessions.delete(sessionId);
    }

    return {
      success: true,
      data: {
        session_id: response.session_id,
        running: response.running,
        exit_code: response.exit_code ?? null,
        stdout: response.stdout,
        stderr: response.stderr,
        truncated: response.truncated,
      },
    };
  } catch (err) {
    adapter.close();
    return {
      success: false,
      error: `read_output via GUI failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Kill a GUI session over TCP.
 * Creates a fresh adapter, sends KillSessionRequest, returns mapped response.
 */
async function handleKillViaTcp(sessionId: string): Promise<ToolResponse> {
  const adapter = new TcpTerminalAdapter();
  try {
    await adapter.connect();
    const response = await adapter.sendKill(sessionId);
    adapter.close();

    // Remove from tracking regardless of kill result
    guiSessions.delete(sessionId);

    if (response.killed) {
      return {
        success: true,
        data: {
          session_id: response.session_id,
          killed: true,
          message: response.message ?? 'Process killed',
        },
      };
    } else {
      return {
        success: false,
        error: response.error ?? 'Kill failed — process may have already exited',
      };
    }
  } catch (err) {
    adapter.close();
    return {
      success: false,
      error: `kill via GUI failed: ${(err as Error).message}`,
    };
  }
}

async function handleGetAllowlistAction(
  params: MemoryTerminalParams,
): Promise<ToolResponse> {
  return handleGetAllowlist({ workspace_id: params.workspace_id });
}

async function handleUpdateAllowlistAction(
  params: MemoryTerminalParams,
): Promise<ToolResponse> {
  if (!params.patterns || !params.operation) {
    return {
      success: false,
      error: 'patterns and operation are required for action: update_allowlist',
    };
  }
  return handleUpdateAllowlist({
    workspace_id: params.workspace_id,
    patterns: params.patterns,
    operation: params.operation,
  });
}

// =========================================================================
// Main Entry Point
// =========================================================================

/**
 * Consolidated memory_terminal tool handler.
 *
 * @param params  Flat params — action determines which fields are required
 * @param extra   MCP SDK extra — sendNotification for heartbeat, signal for abort
 */
export async function memoryTerminal(
  params: MemoryTerminalParams,
  extra?: McpToolExtra,
): Promise<ToolResponse> {
  switch (params.action) {
    case 'run':
      return handleRun(params, extra);
    case 'read_output':
      return handleReadOutputAction(params);
    case 'kill':
      return handleKillAction(params);
    case 'get_allowlist':
      return handleGetAllowlistAction(params);
    case 'update_allowlist':
      return handleUpdateAllowlistAction(params);
    default:
      return {
        success: false,
        error: `Unknown action: "${(params as { action: string }).action}". Valid actions: run, read_output, kill, get_allowlist, update_allowlist`,
      };
  }
}
