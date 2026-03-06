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

import { spawn } from 'node:child_process';

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
  const pythonExecutable = options?.pythonExecutable?.trim() || 'python';
  const env = {
    ...process.env,
    ...(options?.env ?? {}),
  };

  let child;
  try {
    child = spawn(pythonExecutable, ['-m', 'memory_cartographer.runtime.entrypoint'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      windowsHide: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CartographyBridgeSpawnError(
      `Failed to spawn Python core process with executable "${pythonExecutable}": ${message}`
    );
  }

  const ndjsonRequestLine = `${JSON.stringify(request)}\n`;

  return await new Promise<PythonBridgeResponse>((resolve, reject) => {
    let settled = false;
    let stderrBuffer = '';
    let stdoutBuffer = '';
    let firstResponseLine: string | null = null;

    const finalize = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      callback();
    };

    const timeoutHandle = setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL');
        finalize(() => {
          reject(new CartographyBridgeTimeoutError(request.request_id, request.timeout_ms));
        });
      }
    }, request.timeout_ms);

    child.once('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      finalize(() => {
        reject(
          new CartographyBridgeSpawnError(
            `Failed to start Python core process with executable "${pythonExecutable}": ${message}`
          )
        );
      });
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();

      if (firstResponseLine !== null) {
        return;
      }

      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex >= 0) {
        firstResponseLine = stdoutBuffer.slice(0, newlineIndex).trim();
      }
    });

    child.once('close', (exitCode) => {
      if (settled) {
        return;
      }

      if (exitCode !== 0) {
        const stderr = stderrBuffer.trim();
        finalize(() => {
          reject(new CartographyBridgeUnexpectedExitError(exitCode, stderr));
        });
        return;
      }

      const rawLine = (firstResponseLine ?? stdoutBuffer.trim()).trim();
      if (!rawLine) {
        finalize(() => {
          reject(new CartographyBridgeParseError('<empty response>'));
        });
        return;
      }

      let response: PythonBridgeResponse;
      try {
        response = parsePythonBridgeResponse(rawLine);
      } catch (error) {
        finalize(() => {
          if (error instanceof CartographyBridgeError) {
            reject(error);
            return;
          }
          reject(new CartographyBridgeParseError(rawLine));
        });
        return;
      }

      if (response.request_id !== request.request_id) {
        finalize(() => {
          reject(new CartographyBridgeParseError(rawLine));
        });
        return;
      }

      finalize(() => {
        resolve(response);
      });
    });

    child.stdin.once('error', (error) => {
      if (settled) {
        return;
      }
      finalize(() => {
        reject(new CartographyBridgeUnexpectedExitError(null, `Failed to write request to stdin: ${error.message}`));
      });
    });

    child.stdin.end(ndjsonRequestLine, 'utf8');
  });
}

function parsePythonBridgeResponse(rawLine: string): PythonBridgeResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawLine);
  } catch {
    throw new CartographyBridgeParseError(rawLine);
  }

  if (!isRecord(parsed)) {
    throw new CartographyBridgeParseError(rawLine);
  }

  const schemaVersion = parsed.schema_version;
  const requestId = parsed.request_id;
  const status = parsed.status;
  const elapsedMs = parsed.elapsed_ms;

  if (typeof schemaVersion !== 'string' || typeof requestId !== 'string') {
    throw new CartographyBridgeParseError(rawLine);
  }

  if (status !== 'ok' && status !== 'partial' && status !== 'error') {
    throw new CartographyBridgeParseError(rawLine);
  }

  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs)) {
    throw new CartographyBridgeParseError(rawLine);
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, 'result')) {
    throw new CartographyBridgeParseError(rawLine);
  }

  if (!isRecord(parsed.diagnostics)) {
    throw new CartographyBridgeParseError(rawLine);
  }

  const diagnostics = parsed.diagnostics;
  if (
    !isStringArray(diagnostics.warnings) ||
    !isStringArray(diagnostics.errors) ||
    !isStringArray(diagnostics.markers) ||
    !isStringArray(diagnostics.skipped_paths)
  ) {
    throw new CartographyBridgeParseError(rawLine);
  }

  return {
    schema_version: schemaVersion,
    request_id: requestId,
    status,
    result: parsed.result as unknown | null,
    diagnostics: {
      warnings: diagnostics.warnings,
      errors: diagnostics.errors,
      markers: diagnostics.markers,
      skipped_paths: diagnostics.skipped_paths,
    },
    elapsed_ms: elapsedMs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
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
