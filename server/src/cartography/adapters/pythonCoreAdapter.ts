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

import { randomUUID } from 'node:crypto';

import { invokePythonCore } from '../runtime/pythonBridge.js';
import {
  ADAPTER_SCHEMA_VERSION,
  CartographyCompatibilityErrorCode,
  MAX_SUPPORTED_SCHEMA_MAJOR,
  MIN_SUPPORTED_SCHEMA_MAJOR,
} from '../contracts/version.js';
import type {
  SemVer,
  VersionCompatibility,
} from '../contracts/version.js';

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
  private static readonly DEFAULT_TIMEOUT_MS = 15_000;

  async probeCapabilities(): Promise<PythonCoreCapabilities> {
    const requestId = this.buildRequestId('probe_capabilities');
    const response = await invokePythonCore({
      schema_version: ADAPTER_SCHEMA_VERSION,
      request_id: requestId,
      action: 'probe_capabilities',
      args: {},
      timeout_ms: PythonCoreAdapter.DEFAULT_TIMEOUT_MS,
    });

    this.assertSchemaCompatibility(response.schema_version, response.request_id);

    if (response.status !== 'ok') {
      throw new CartographyAdapterError(
        CartographyCompatibilityErrorCode.PYTHON_CORE_UNAVAILABLE,
        `Capability probe failed with status '${response.status}'`,
        response.request_id,
      );
    }

    return this.parseCapabilities(response.result, response.request_id);
  }

  async invoke(request: PythonCoreRequest): Promise<PythonCoreResponse> {
    const response = await invokePythonCore(request);
    this.assertSchemaCompatibility(response.schema_version, response.request_id);

    // Preserve the runtime envelope exactly as produced by pythonBridge.
    return response;
  }

  private buildRequestId(action: PythonCoreRequest['action']): string {
    return `${action}_${randomUUID()}`;
  }

  private parseCapabilities(result: unknown, requestId: string): PythonCoreCapabilities {
    if (!isRecord(result)) {
      throw new CartographyAdapterError(
        CartographyCompatibilityErrorCode.CAPABILITY_MISSING,
        'Capability payload missing or not an object',
        requestId,
      );
    }

    const schemaVersion = result.schema_version;
    const supportedActions = result.supported_actions;
    const supportedLanguages = result.supported_languages;
    const featureFlags = result.feature_flags;

    if (
      typeof schemaVersion !== 'string' ||
      !isStringArray(supportedActions) ||
      !isStringArray(supportedLanguages) ||
      !isBooleanRecord(featureFlags)
    ) {
      throw new CartographyAdapterError(
        CartographyCompatibilityErrorCode.CAPABILITY_MISSING,
        'Capability payload did not match expected shape',
        requestId,
      );
    }

    this.assertSchemaCompatibility(schemaVersion, requestId);

    return {
      schema_version: schemaVersion,
      supported_actions: supportedActions,
      supported_languages: supportedLanguages,
      feature_flags: featureFlags,
    };
  }

  private assertSchemaCompatibility(schemaVersion: string, requestId: string): VersionCompatibility {
    const compatibility = evaluateVersionCompatibility(schemaVersion);
    if (compatibility.compatible) {
      return compatibility;
    }

    const errorCode = compatibilityReasonToErrorCode(compatibility.reason);
    throw new CartographyAdapterError(
      errorCode,
      `Python core schema version '${compatibility.raw}' is not compatible with adapter schema '${ADAPTER_SCHEMA_VERSION}'`,
      requestId,
    );
  }
}

export class CartographyAdapterError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'CartographyAdapterError';
  }
}

function evaluateVersionCompatibility(schemaVersion: string): VersionCompatibility {
  const parsed = parseSemVer(schemaVersion);
  if (!parsed) {
    return {
      compatible: false,
      reason: 'malformed',
      raw: schemaVersion,
    };
  }

  if (parsed.major < MIN_SUPPORTED_SCHEMA_MAJOR) {
    return {
      compatible: false,
      reason: 'too_old',
      raw: schemaVersion,
    };
  }

  if (parsed.major > MAX_SUPPORTED_SCHEMA_MAJOR) {
    return {
      compatible: false,
      reason: 'too_new',
      raw: schemaVersion,
    };
  }

  const adapterVersion = parseSemVer(ADAPTER_SCHEMA_VERSION);
  if (!adapterVersion) {
    return {
      compatible: true,
      drift: 'none',
    };
  }

  if (parsed.minor !== adapterVersion.minor) {
    return {
      compatible: true,
      drift: 'minor',
    };
  }

  if (parsed.patch !== adapterVersion.patch) {
    return {
      compatible: true,
      drift: 'patch',
    };
  }

  return {
    compatible: true,
    drift: 'none',
  };
}

function parseSemVer(version: string): SemVer | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }

  return {
    major,
    minor,
    patch,
    raw: version,
  };
}

function compatibilityReasonToErrorCode(
  reason: Extract<VersionCompatibility, { compatible: false }>['reason'],
): CartographyCompatibilityErrorCode {
  if (reason === 'too_old') {
    return CartographyCompatibilityErrorCode.SCHEMA_VERSION_TOO_OLD;
  }
  if (reason === 'too_new') {
    return CartographyCompatibilityErrorCode.SCHEMA_VERSION_TOO_NEW;
  }
  return CartographyCompatibilityErrorCode.SCHEMA_VERSION_MALFORMED;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'boolean');
}
