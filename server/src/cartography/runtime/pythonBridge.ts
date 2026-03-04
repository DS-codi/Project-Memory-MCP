/**
 * pythonBridge.ts
 *
 * Low-level subprocess bridge for invoking the memory_cartographer Python core.
 * Responsible for process spawning, stdin/stdout NDJSON framing, timeout
 * enforcement, and raw error surface.
 *
 * This module sits below the PythonCoreAdapter and handles the OS-level
 * subprocess contract. The adapter layer adds version negotiation and error
 * taxonomy on top.
 *
 * See: docs/architecture/memory-cartographer/runtime-boundary.md
 *      docs/architecture/memory-cartographer/implementation-boundary.md
 */

// ---------------------------------------------------------------------------
// Request / Response envelope types (wire format)
// ---------------------------------------------------------------------------

/**
 * JSON envelope written to the Python subprocess stdin (one NDJSON line).
 *
 * All fields are required unless noted. The Python core reads this envelope
 * and dispatches the requested action.
 */
export interface PythonBridgeRequest {
  /** Schema version the adapter was built against. */
  schema_version: string;
  /** Unique request identifier for correlation. */
  request_id: string;
  /** Action to dispatch: 'cartograph' | 'probe_capabilities' | 'health_check'. */
  action: string;
  /** Action-specific arguments; empty object if none. */
  args: Record<string, unknown>;
  /** Max milliseconds before adapter kills the subprocess. */
  timeout_ms: number;
  /** (Future) Cooperative cancellation token — ignored in v1. */
  cancellation_token?: string;
}

/**
 * JSON envelope received from the Python subprocess stdout (one NDJSON line).
 */
export interface PythonBridgeResponse {
  /** Schema version produced by the Python core. */
  schema_version: string;
  /** Echoed request_id for correlation. */
  request_id: string;
  /** 'ok' | 'partial' | 'error' */
  status: 'ok' | 'partial' | 'error';
  /** Full or partial result payload; null on fatal error. */
  result: unknown | null;
  /** Structured diagnostics embedded in every response. */
  diagnostics: PythonBridgeDiagnostics;
  /** Elapsed milliseconds as reported by the Python core. */
  elapsed_ms: number;
}

/**
 * Diagnostics embedded in every PythonBridgeResponse.
 */
export interface PythonBridgeDiagnostics {
  warnings: string[];
  errors: string[];
  /** Semantic markers: 'timeout' | 'partial_scan' | 'schema_version_drift' | ... */
  markers: string[];
  skipped_paths: string[];
}

// ---------------------------------------------------------------------------
// Bridge invocation function
// ---------------------------------------------------------------------------

/**
 * Invoke the Python core subprocess with the given request envelope.
 *
 * Lifecycle:
 * 1. Spawn `python -m memory_cartographer.runtime.entrypoint`.
 * 2. Write `request` as a single NDJSON line to stdin; close write channel.
 * 3. Wait for the subprocess to write one NDJSON line to stdout or for
 *    `request.timeout_ms` to elapse.
 * 4. If timeout elapses before a response: kill the subprocess and throw
 *    `CartographyBridgeTimeoutError`.
 * 5. Parse the stdout NDJSON line as `PythonBridgeResponse` and return it.
 * 6. If the subprocess exits non-zero with no stdout: throw
 *    `CartographyBridgeUnexpectedExitError` with stderr content.
 *
 * @param request - Fully constructed request envelope.
 * @param options - Optional bridge configuration overrides.
 * @returns Raw response envelope from the Python core.
 *
 * @throws {CartographyBridgeTimeoutError} if timeout_ms elapses before response.
 * @throws {CartographyBridgeSpawnError} if the subprocess cannot be started.
 * @throws {CartographyBridgeUnexpectedExitError} if subprocess exits non-zero with no response.
 * @throws {CartographyBridgeParseError} if the stdout line is not valid JSON.
 *
 * @todo subprocess invocation — use Node.js `child_process.spawn` for
 *       cross-platform process management. Requires: python executable path
 *       from config, module entry '-m memory_cartographer.runtime.entrypoint',
 *       stdin/stdout in 'pipe' mode, stderr captured for error diagnostics.
 */
export async function invokePythonCore(
  request: PythonBridgeRequest,
  options?: PythonBridgeOptions
): Promise<PythonBridgeResponse> {
  // TODO: subprocess invocation
  // TODO: stdin NDJSON serialization
  // TODO: stdout NDJSON deserialization
  // TODO: timeout enforcement with process.kill
  // TODO: stderr capture for fatal error diagnostics
  throw new Error('invokePythonCore() not yet implemented');
}

// ---------------------------------------------------------------------------
// Bridge configuration
// ---------------------------------------------------------------------------

/**
 * Configuration options for the Python bridge.
 */
export interface PythonBridgeOptions {
  /**
   * Absolute path to the Python executable.
   * Defaults to the `python` or `python3` found on PATH.
   */
  pythonExecutable?: string;
  /**
   * Additional environment variables injected into the subprocess environment.
   */
  env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Bridge error types
// ---------------------------------------------------------------------------

/** Base class for all Python bridge errors. */
export class CartographyBridgeError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'CartographyBridgeError';
  }
}

export class CartographyBridgeTimeoutError extends CartographyBridgeError {
  constructor(requestId: string, timeoutMs: number) {
    super('INVOCATION_TIMEOUT', `Python core timed out after ${timeoutMs}ms`, requestId);
    this.name = 'CartographyBridgeTimeoutError';
  }
}

export class CartographyBridgeSpawnError extends CartographyBridgeError {
  constructor(message: string) {
    super('PYTHON_SPAWN_FAILED', message);
    this.name = 'CartographyBridgeSpawnError';
  }
}

export class CartographyBridgeUnexpectedExitError extends CartographyBridgeError {
  constructor(exitCode: number | null, stderr: string) {
    super(
      'UNEXPECTED_EXIT',
      `Python core exited with code ${exitCode ?? 'null'}. stderr: ${stderr}`
    );
    this.name = 'CartographyBridgeUnexpectedExitError';
  }
}

export class CartographyBridgeParseError extends CartographyBridgeError {
  constructor(raw: string) {
    super('INVALID_RESPONSE_ENVELOPE', `Failed to parse Python core response as JSON: ${raw}`);
    this.name = 'CartographyBridgeParseError';
  }
}
