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
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ENTRYPOINT = 'memory_cartographer.runtime.entrypoint';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

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

export interface PythonBridgeLaunchContext {
  python_executable: string;
  module_name: string;
  cwd: string;
  workspace_path: string | null;
  module_search_paths: string[];
  pythonpath: string;
}

interface ResolvedPythonLaunch {
  env: NodeJS.ProcessEnv;
  cwd: string;
  launchContext: PythonBridgeLaunchContext;
}

function extractWorkspacePath(args: Record<string, unknown>): string | null {
  const workspacePath = args.workspace_path;
  return typeof workspacePath === 'string' && workspacePath.trim().length > 0
    ? workspacePath.trim()
    : null;
}

function isDirectory(candidatePath: string | null | undefined): candidatePath is string {
  if (!candidatePath) {
    return false;
  }

  try {
    return existsSync(candidatePath) && statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}

function normalizeForDedup(candidatePath: string): string {
  return process.platform === 'win32'
    ? candidatePath.toLowerCase()
    : candidatePath;
}

function dedupePaths(candidatePaths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const candidatePath of candidatePaths) {
    const normalized = normalizeForDedup(candidatePath);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(candidatePath);
  }

  return unique;
}

function discoverPythonCoreSearchPaths(workspacePath: string | null): string[] {
  const cwd = process.cwd();
  const candidates = [
    workspacePath ? path.resolve(workspacePath, 'python-core') : null,
    workspacePath ? path.resolve(workspacePath, 'Project-Memory-MCP', 'python-core') : null,
    path.resolve(cwd, 'python-core'),
    path.resolve(cwd, '..', 'python-core'),
    path.resolve(cwd, 'Project-Memory-MCP', 'python-core'),
    path.resolve(MODULE_DIR, '..', '..', '..', '..', 'python-core'),
    path.resolve(MODULE_DIR, '..', '..', '..', '..', 'Project-Memory-MCP', 'python-core'),
  ];

  const existing = candidates.filter((candidate): candidate is string => isDirectory(candidate));
  return dedupePaths(existing);
}

function parsePythonPathEntries(pythonPathValue: string | undefined): string[] {
  if (!pythonPathValue) {
    return [];
  }

  return pythonPathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function resolveSpawnCwd(
  preferredCwd: string | undefined,
  workspacePath: string | null,
  moduleSearchPaths: string[],
): string {
  const candidates = [
    preferredCwd,
    workspacePath,
    workspacePath ? path.resolve(workspacePath, 'Project-Memory-MCP') : null,
    moduleSearchPaths.length > 0 ? path.dirname(moduleSearchPaths[0]) : null,
    process.cwd(),
  ];

  for (const candidate of candidates) {
    if (isDirectory(candidate)) {
      return candidate;
    }
  }

  return process.cwd();
}

function resolvePythonLaunch(
  request: PythonBridgeRequest,
  options: PythonBridgeOptions | undefined,
  pythonExecutable: string,
): ResolvedPythonLaunch {
  const workspacePath = extractWorkspacePath(request.args);
  const moduleSearchPaths = discoverPythonCoreSearchPaths(workspacePath);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(options?.env ?? {}),
  };

  const existingPythonPathEntries = parsePythonPathEntries(env.PYTHONPATH);
  const pythonPathEntries = dedupePaths([...moduleSearchPaths, ...existingPythonPathEntries]);
  if (pythonPathEntries.length > 0) {
    env.PYTHONPATH = pythonPathEntries.join(path.delimiter);
  }

  const cwd = resolveSpawnCwd(options?.cwd, workspacePath, moduleSearchPaths);

  return {
    env,
    cwd,
    launchContext: {
      python_executable: pythonExecutable,
      module_name: MODULE_ENTRYPOINT,
      cwd,
      workspace_path: workspacePath,
      module_search_paths: moduleSearchPaths,
      pythonpath: env.PYTHONPATH ?? '',
    },
  };
}

function formatLaunchContext(launchContext: PythonBridgeLaunchContext): string {
  return JSON.stringify(launchContext);
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
  const launch = resolvePythonLaunch(request, options, pythonExecutable);

  let child;
  try {
    child = spawn(pythonExecutable, ['-m', MODULE_ENTRYPOINT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: launch.env,
      cwd: launch.cwd,
      windowsHide: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CartographyBridgeSpawnError(
      `Failed to spawn Python core process with executable "${pythonExecutable}": ${message}. launch_context=${formatLaunchContext(launch.launchContext)}`,
      launch.launchContext,
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
          reject(new CartographyBridgeTimeoutError(request.request_id, request.timeout_ms, launch.launchContext));
        });
      }
    }, request.timeout_ms);

    child.once('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      finalize(() => {
        reject(
          new CartographyBridgeSpawnError(
            `Failed to start Python core process with executable "${pythonExecutable}": ${message}. launch_context=${formatLaunchContext(launch.launchContext)}`,
            launch.launchContext,
          )
        );
      });
    });

    child.stderr.on('data', (chunk) => {
      const chunkText = chunk.toString();
      stderrBuffer += chunkText;
      if (options?.debug_output) {
        process.stderr.write(chunkText);
      }
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
          reject(new CartographyBridgeUnexpectedExitError(exitCode, stderr, launch.launchContext));
        });
        return;
      }

      const rawLine = (firstResponseLine ?? stdoutBuffer.trim()).trim();
      if (!rawLine) {
        finalize(() => {
          reject(new CartographyBridgeParseError('<empty response>', launch.launchContext));
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
          reject(new CartographyBridgeParseError(rawLine, launch.launchContext));
        });
        return;
      }

      if (response.request_id !== request.request_id) {
        finalize(() => {
          reject(new CartographyBridgeParseError(rawLine, launch.launchContext));
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
        reject(new CartographyBridgeUnexpectedExitError(null, `Failed to write request to stdin: ${error.message}`, launch.launchContext));
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
  /**
   * Optional cwd override for Python subprocess launch.
   */
  cwd?: string;
  /**
   * When true, forward Python subprocess stderr in real-time to
   * process.stderr so it is visible in the supervisor / interactive terminal.
   * Useful for diagnosing hangs, scan failures, and import errors.
   */
  debug_output?: boolean;
}

// ---------------------------------------------------------------------------
// Bridge error types
// ---------------------------------------------------------------------------

/** Base class for all Python bridge errors. */
export class CartographyBridgeError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly requestId?: string,
    public readonly launchContext?: PythonBridgeLaunchContext,
  ) {
    super(message);
    this.name = 'CartographyBridgeError';
  }
}

export class CartographyBridgeTimeoutError extends CartographyBridgeError {
  constructor(requestId: string, timeoutMs: number, launchContext?: PythonBridgeLaunchContext) {
    super(
      'INVOCATION_TIMEOUT',
      `Python core timed out after ${timeoutMs}ms. launch_context=${launchContext ? formatLaunchContext(launchContext) : '{}'}`,
      requestId,
      launchContext,
    );
    this.name = 'CartographyBridgeTimeoutError';
  }
}

export class CartographyBridgeSpawnError extends CartographyBridgeError {
  constructor(message: string, launchContext?: PythonBridgeLaunchContext) {
    super('PYTHON_SPAWN_FAILED', message, undefined, launchContext);
    this.name = 'CartographyBridgeSpawnError';
  }
}

export class CartographyBridgeUnexpectedExitError extends CartographyBridgeError {
  constructor(exitCode: number | null, stderr: string, launchContext?: PythonBridgeLaunchContext) {
    super(
      'UNEXPECTED_EXIT',
      `Python core exited with code ${exitCode ?? 'null'}. stderr: ${stderr}. launch_context=${launchContext ? formatLaunchContext(launchContext) : '{}'}`,
      undefined,
      launchContext,
    );
    this.name = 'CartographyBridgeUnexpectedExitError';
  }
}

export class CartographyBridgeParseError extends CartographyBridgeError {
  constructor(raw: string, launchContext?: PythonBridgeLaunchContext) {
    super(
      'INVALID_RESPONSE_ENVELOPE',
      `Failed to parse Python core response as JSON: ${raw}. launch_context=${launchContext ? formatLaunchContext(launchContext) : '{}'}`,
      undefined,
      launchContext,
    );
    this.name = 'CartographyBridgeParseError';
  }
}
