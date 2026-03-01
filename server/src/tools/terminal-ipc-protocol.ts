/**
 * Unified NDJSON Wire Protocol — terminal-ipc-protocol.ts
 *
 * Canonical wire format that BOTH TypeScript (MCP server) and Rust (GUI) speak
 * over TCP/NDJSON. Field names are aligned with the Rust side (protocol.rs) to
 * minimize cross-language friction.
 *
 * Message types:
 *   - CommandRequest        — MCP server → GUI: "run this command"
 *   - CommandResponse       — GUI → MCP server: approval/decline/timeout result
 *   - Heartbeat             — bidirectional liveness probe
 *   - ReadOutputRequest     — MCP server → GUI: request output for a session
 *   - ReadOutputResponse    — GUI → MCP server: session output data
 *   - KillSessionRequest    — MCP server → GUI: kill a session/process
 *   - KillSessionResponse   — GUI → MCP server: kill result
 *
 * Created in Phase 1 (Protocol Alignment) — replaces interactive-terminal-protocol.ts.
 */

// =========================================================================
// Message Types
// =========================================================================

/** MCP server → GUI: request to run a command (may need approval). */
export interface CommandRequest {
  type: 'command_request';
  /** Unique request ID. Matches Rust's `id` field. */
  id: string;
  /** Full command string. Matches Rust's `command` field. */
  command: string;
  /** Working directory for execution. Matches Rust's `working_directory` field. */
  working_directory: string;
  /** Optional argument list (Rust: serde(default)). */
  args?: string[];
  /** Optional environment variables (Rust: serde(default)). */
  env?: Record<string, string>;
  /** Workspace ID for output-file scoping. */
  workspace_id?: string;
  /** Session ID for session reuse. Matches Rust's `session_id` field. */
  session_id?: string;
  /** Timeout in seconds. Matches Rust's `timeout_seconds` field. */
  timeout_seconds?: number;
  /** Whether the command was pre-approved by the allowlist.
   *  true  → GUI auto-executes, no approval dialog.
   *  false → GUI shows approval dialog. */
  allowlisted?: boolean;
}

/** GUI → MCP server: result of approval/execution. */
export interface CommandResponse {
  type: 'command_response';
  /** Correlates to the original CommandRequest.id. */
  id: string;
  /** Outcome of the request. */
  status: 'approved' | 'declined' | 'timeout';
  /** Captured stdout (if command ran). */
  output?: string;
  /** Process exit code (null if killed / still running). */
  exit_code?: number | null;
  /** Human-readable reason (set on decline/timeout). */
  reason?: string;
  /** Path to the JSON output file written to .projectmemory/terminal-output/. */
  output_file_path?: string;
}

/** Bidirectional liveness heartbeat. */
export interface Heartbeat {
  type: 'heartbeat';
  /** Unique heartbeat ID. */
  id: string;
  /** Epoch milliseconds when the heartbeat was emitted. */
  timestamp_ms: number;
}

/** MCP server → GUI: request the captured output for a session. */
export interface ReadOutputRequest {
  type: 'read_output_request';
  /** Unique request ID (correlates with ReadOutputResponse.id). */
  id: string;
  /** The session whose output to retrieve. */
  session_id: string;
}

/** GUI → MCP server: captured output for a session. */
export interface ReadOutputResponse {
  type: 'read_output_response';
  /** Correlates to the original ReadOutputRequest.id. */
  id: string;
  /** The session this output belongs to. */
  session_id: string;
  /** Whether the process is still running. */
  running: boolean;
  /** Process exit code (null/undefined if still running or killed). */
  exit_code?: number | null;
  /** Captured stdout. */
  stdout: string;
  /** Captured stderr. */
  stderr: string;
  /** Whether the output was truncated due to size limits. */
  truncated: boolean;
}

/** MCP server → GUI: request to kill an active session/process. */
export interface KillSessionRequest {
  type: 'kill_session_request';
  /** Unique request ID (correlates with KillSessionResponse.id). */
  id: string;
  /** The session to kill. */
  session_id: string;
}

/** GUI → MCP server: result of a kill request. */
export interface KillSessionResponse {
  type: 'kill_session_response';
  /** Correlates to the original KillSessionRequest.id. */
  id: string;
  /** The session that was targeted. */
  session_id: string;
  /** Whether the process was successfully killed. */
  killed: boolean;
  /** Human-readable message on success. */
  message?: string;
  /** Error message if kill failed. */
  error?: string;
}

/** GUI → MCP server: streaming output chunk for an active command. */
export interface OutputChunk {
  type: 'output_chunk';
  /** Correlates to the original CommandRequest.id. */
  id: string;
  /** Chunk of terminal output decoded as UTF-8 (lossy). */
  chunk: string;
}

/** Union of all wire messages. */
export type TerminalIpcMessage =
  | CommandRequest
  | CommandResponse
  | Heartbeat
  | ReadOutputRequest
  | ReadOutputResponse
  | KillSessionRequest
  | KillSessionResponse
  | OutputChunk;

// =========================================================================
// Type Guards
// =========================================================================

/** Returns true if `msg` is a CommandRequest. */
export function isCommandRequest(msg: TerminalIpcMessage): msg is CommandRequest {
  return msg.type === 'command_request';
}

/** Returns true if `msg` is a CommandResponse. */
export function isCommandResponse(msg: TerminalIpcMessage): msg is CommandResponse {
  return msg.type === 'command_response';
}

/** Returns true if `msg` is a Heartbeat. */
export function isHeartbeat(msg: TerminalIpcMessage): msg is Heartbeat {
  return msg.type === 'heartbeat';
}

/** Returns true if `msg` is a ReadOutputResponse. */
export function isReadOutputResponse(msg: TerminalIpcMessage): msg is ReadOutputResponse {
  return msg.type === 'read_output_response';
}

/** Returns true if `msg` is a KillSessionResponse. */
export function isKillSessionResponse(msg: TerminalIpcMessage): msg is KillSessionResponse {
  return msg.type === 'kill_session_response';
}

/** Returns true if `msg` is an OutputChunk. */
export function isOutputChunk(msg: TerminalIpcMessage): msg is OutputChunk {
  return msg.type === 'output_chunk';
}

// =========================================================================
// Encode / Decode
// =========================================================================

/**
 * Serialize a message to NDJSON (JSON + trailing newline).
 * Suitable for writing directly to a TCP socket.
 */
export function encodeMessage(msg: TerminalIpcMessage): string {
  return JSON.stringify(msg) + '\n';
}

/**
 * Parse one line of NDJSON into a TerminalIpcMessage.
 * Returns `null` for blank lines, invalid JSON, or unrecognised `type` fields.
 */
const KNOWN_TYPES = new Set([
  'command_request',
  'command_response',
  'heartbeat',
  'read_output_request',
  'read_output_response',
  'kill_session_request',
  'kill_session_response',
  'output_chunk',
]);

export function decodeMessage(line: string): TerminalIpcMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const { type } = parsed;
    if (typeof type !== 'string' || !KNOWN_TYPES.has(type)) {
      return null;
    }

    // Verify the mandatory `id` field exists on all message types
    if (typeof parsed.id !== 'string') return null;

    return parsed as unknown as TerminalIpcMessage;
  } catch {
    return null;
  }
}


