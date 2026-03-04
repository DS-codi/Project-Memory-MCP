/**
 * pythonCoreAdapter.ts
 *
 * TypeScript adapter that invokes the memory_cartographer Python core subprocess
 * and translates between the TypeScript orchestration layer and the Python schema
 * producer.
 *
 * Ownership: TypeScript server owns process lifecycle, transport framing,
 * compatibility negotiation, and error taxonomy translation.
 *
 * See: docs/architecture/memory-cartographer/implementation-boundary.md
 *      docs/architecture/memory-cartographer/runtime-boundary.md
 *      docs/architecture/memory-cartographer/compatibility-matrix.md
 */

// ---------------------------------------------------------------------------
// Request / Response envelope types (see runtime-boundary.md for full spec)
// ---------------------------------------------------------------------------

/** Envelope sent to the Python core over stdin (NDJSON). */
export interface PythonCoreRequest {
  /** Schema version this adapter was built against (semver string). */
  schema_version: string;
  /** Unique request identifier for correlation. */
  request_id: string;
  /** Action to dispatch in the Python core. */
  action: 'cartograph' | 'probe_capabilities' | 'health_check';
  /** Action-specific arguments payload. */
  args: Record<string, unknown>;
  /** Maximum elapsed milliseconds the Python process may take. */
  timeout_ms: number;
  /** Optional opaque cancellation token (future use). */
  cancellation_token?: string;
}

/** Envelope received from the Python core over stdout (NDJSON). */
export interface PythonCoreResponse {
  /** Schema version produced by the Python core. */
  schema_version: string;
  /** Echoed request identifier. */
  request_id: string;
  /** Overall request outcome. */
  status: 'ok' | 'partial' | 'error';
  /** Action result payload; null on fatal error. */
  result: unknown | null;
  /** Structured diagnostics (warnings, partial-result markers, timing). */
  diagnostics: PythonCoreDiagnostics;
  /** Elapsed milliseconds reported by the Python core. */
  elapsed_ms: number;
}

/** Diagnostic envelope embedded in every response. */
export interface PythonCoreDiagnostics {
  warnings: string[];
  errors: string[];
  /** 'timeout' | 'partial_scan' | 'schema_version_drift' | ... */
  markers: string[];
  skipped_paths: string[];
}

// ---------------------------------------------------------------------------
// Capability advertisement (returned by probe_capabilities action)
// ---------------------------------------------------------------------------

/** Capability advertisement returned by Python core on probe. */
export interface PythonCoreCapabilities {
  schema_version: string;
  supported_actions: string[];
  supported_languages: string[];
  feature_flags: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Adapter for invoking the memory_cartographer Python core subprocess.
 *
 * The adapter is responsible for:
 * - Spawning the Python process with the correct module invocation.
 * - Serializing the request envelope to stdin (NDJSON).
 * - Deserializing the response envelope from stdout (NDJSON).
 * - Enforcing the timeout declared in the request envelope.
 * - Translating Python-side errors into the TypeScript error taxonomy.
 * - Running schema_version compatibility checks before returning the result.
 */
export interface IPythonCoreAdapter {
  /**
   * Probe the Python core for its capabilities and supported schema version.
   * Used during server startup for compatibility negotiation.
   */
  probeCapabilities(): Promise<PythonCoreCapabilities>;

  /**
   * Invoke the Python core to perform a cartography action.
   * @param request - Fully constructed request envelope.
   * @returns Validated response envelope.
   * @throws {CartographyAdapterError} on transport, timeout, or version mismatch.
   */
  invoke(request: PythonCoreRequest): Promise<PythonCoreResponse>;
}

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------

/**
 * Concrete adapter implementation.
 *
 * @todo subprocess invocation — spawn Python process, pipe stdin/stdout,
 *       enforce timeout, capture stderr for fatal-error diagnostics.
 * @todo schema_version compatibility check using CompatibilityMatrix.
 * @todo structured error taxonomy translation from Python error envelopes.
 */
export class PythonCoreAdapter implements IPythonCoreAdapter {
  // TODO: inject config (python executable path, module entry, schema_version)

  async probeCapabilities(): Promise<PythonCoreCapabilities> {
    // TODO: implement subprocess invocation for probe_capabilities action
    throw new Error('PythonCoreAdapter.probeCapabilities() not yet implemented');
  }

  async invoke(request: PythonCoreRequest): Promise<PythonCoreResponse> {
    // TODO: implement subprocess invocation for cartography actions
    throw new Error('PythonCoreAdapter.invoke() not yet implemented');
  }
}
