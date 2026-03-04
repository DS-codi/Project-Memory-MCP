/**
 * version.ts
 *
 * Schema version constants and capability registry types for the
 * memory_cartographer TypeScript adapter layer.
 *
 * Ownership: TypeScript server — reads and validates schema versions produced
 * by the Python core; never produces or mutates schema_version values.
 *
 * See: docs/architecture/memory-cartographer/compatibility-matrix.md
 */

// ---------------------------------------------------------------------------
// Schema version constants
// ---------------------------------------------------------------------------

/**
 * The schema_version string this adapter was built and tested against.
 * Format: "MAJOR.MINOR.PATCH" (semver).
 */
export const ADAPTER_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The minimum schema MAJOR version the adapter will accept from Python core.
 * Responses with a lower MAJOR are hard-rejected.
 */
export const MIN_SUPPORTED_SCHEMA_MAJOR = 1 as const;

/**
 * The maximum schema MAJOR version the adapter will accept from Python core.
 * Responses with a higher MAJOR are hard-rejected as "too new".
 */
export const MAX_SUPPORTED_SCHEMA_MAJOR = 1 as const;

// ---------------------------------------------------------------------------
// Version negotiation types
// ---------------------------------------------------------------------------

/**
 * Parsed representation of a semver string for comparison logic.
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * Result of evaluating a schema_version from a Python core response against
 * the adapter's supported range.
 */
export type VersionCompatibility =
  | { compatible: true; drift: 'none' | 'minor' | 'patch' }
  | { compatible: false; reason: 'too_old' | 'too_new' | 'malformed'; raw: string };

// ---------------------------------------------------------------------------
// Capability registry types
// ---------------------------------------------------------------------------

/**
 * Feature flags advertised by the Python core via probe_capabilities.
 * All flags are optional (absent = false / not supported).
 */
export interface PythonCoreFeatureFlags {
  /** Whether database cartography is supported by this Python core build. */
  database_cartography?: boolean;
  /** Whether incremental (delta) scan mode is supported. */
  incremental_scan?: boolean;
  /** Whether partial-result streaming is supported. */
  partial_results?: boolean;
  /** Extensible: future flags may appear in newer MINOR versions. */
  [key: string]: boolean | undefined;
}

/**
 * Full capability advertisement returned by the Python core on probe_capabilities.
 */
export interface PythonCoreCapabilityAdvertisement {
  schema_version: string;
  supported_actions: string[];
  supported_languages: string[];
  feature_flags: PythonCoreFeatureFlags;
}

/**
 * Resolved capability set after adapter-side capability check.
 * Adapter normalizes absent flags to `false` and records negotiation outcome.
 */
export interface ResolvedCapabilities {
  schema_version: SemVer;
  compatibility: VersionCompatibility;
  feature_flags: Required<PythonCoreFeatureFlags>;
  unsupported_required_features: string[];
  negotiated_at: string; // ISO 8601 timestamp
}

// ---------------------------------------------------------------------------
// Error codes for version/capability failures
// ---------------------------------------------------------------------------

/**
 * Error codes emitted by the adapter when version or capability negotiation fails.
 */
export enum CartographyCompatibilityErrorCode {
  SCHEMA_VERSION_TOO_OLD = 'SCHEMA_VERSION_TOO_OLD',
  SCHEMA_VERSION_TOO_NEW = 'SCHEMA_VERSION_TOO_NEW',
  SCHEMA_VERSION_MALFORMED = 'SCHEMA_VERSION_MALFORMED',
  PYTHON_CORE_UNAVAILABLE = 'PYTHON_CORE_UNAVAILABLE',
  CAPABILITY_MISSING = 'CAPABILITY_MISSING',
}
