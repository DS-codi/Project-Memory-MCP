/**
 * Unified NDJSON Wire Protocol — terminal-ipc-protocol.ts
 *
 * Canonical wire format that BOTH TypeScript (MCP server) and Rust (GUI) speak
 * over TCP/NDJSON. Field names are aligned with the Rust side (protocol.rs) to
 * minimize cross-language friction.
 *
 * Three message types:
 *   - CommandRequest  — MCP server → GUI: "run this command"
 *   - CommandResponse — GUI → MCP server: approval/decline/timeout result
 *   - Heartbeat       — bidirectional liveness probe
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

/** Union of all wire messages. */
export type TerminalIpcMessage = CommandRequest | CommandResponse | Heartbeat;

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
export function decodeMessage(line: string): TerminalIpcMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const { type } = parsed;
    if (type !== 'command_request' && type !== 'command_response' && type !== 'heartbeat') {
      return null;
    }

    // Verify the mandatory `id` field exists on all message types
    if (typeof parsed.id !== 'string') return null;

    return parsed as unknown as TerminalIpcMessage;
  } catch {
    return null;
  }
}


