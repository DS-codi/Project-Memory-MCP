/**
 * DbRef mode configuration — controls how artifact references are
 * included in MCP tool responses and dashboard API responses.
 *
 * - `compat` (default): Both `_ref` and legacy path fields are present.
 * - `strict`: Only `_ref` is present; legacy path fields are omitted.
 *
 * Set via environment variable: PM_DBREF_MODE=compat|strict
 *
 * Stage 2 implementation will wire these helpers into response builders.
 * See docs/dbref-rollout-plan.md for the full migration timeline.
 */

export type DbRefMode = 'compat' | 'strict';

const VALID_MODES: ReadonlySet<string> = new Set(['compat', 'strict']);

/**
 * Read the current DbRef mode from the environment.
 *
 * Defaults to `'compat'` if the env var is unset or contains an
 * unrecognised value (fail-open to avoid breaking existing consumers).
 */
export function getDbRefMode(): DbRefMode {
  const raw = process.env.PM_DBREF_MODE;
  if (raw && VALID_MODES.has(raw)) {
    return raw as DbRefMode;
  }
  return 'compat';
}

/**
 * Convenience check — returns `true` when strict mode is active.
 *
 * In strict mode, response builders should omit legacy `path` fields
 * and return only the typed `_ref` reference.
 */
export function isDbRefStrictMode(): boolean {
  return getDbRefMode() === 'strict';
}
