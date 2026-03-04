/**
 * scopeConfig.ts
 * Scope guardrail configuration for the memory_cartographer.
 * See docs/architecture/memory-cartographer/scope-guardrails.md
 */

export interface LanguageToggleMap {
  [language: string]: string[]; // language name -> file extensions
}

export interface ScopeConfig {
  /** Glob patterns always excluded (highest-priority deny). */
  denyPatterns: string[];
  /** Glob patterns included by default. */
  allowPatterns: string[];
  /** Explicit opt-in patterns that override denyPatterns. */
  allowOverrides: string[];
  /** Maximum directory depth to traverse. Default: 15. Max: 30. */
  maxDepth: number;
  /** Emit warning at this file count. Default: 10_000. */
  fileCountWarnThreshold: number;
  /** Hard-stop at this file count. Default: 50_000. */
  fileCountHardCap: number;
  /** Language names to exclude entirely (e.g. ["rust", "cpp"]). */
  excludeLanguages: string[];
}

export const LANGUAGE_EXTENSION_MAP: LanguageToggleMap = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python:     ['.py', '.pyi'],
  rust:       ['.rs'],
  go:         ['.go'],
  csharp:     ['.cs'],
  cpp:        ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
  java:       ['.java'],
  sql:        ['.sql'],
  shell:      ['.sh', '.ps1', '.bash'],
};

export const DEFAULT_SCOPE_CONFIG: ScopeConfig = {
  denyPatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/__pycache__/**',
    '**/dist/**',
    '**/build/**',
    '**/.venv/**',
    '**/vendor/**',
    '**/.next/**',
    '**/target/**',
  ],
  allowPatterns: [
    '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    '**/*.py', '**/*.rs', '**/*.go', '**/*.cs',
    '**/*.md', '**/*.json', '**/*.yaml', '**/*.toml',
    '**/*.sql', '**/*.sh', '**/*.ps1',
  ],
  allowOverrides:          [],
  maxDepth:                15,
  fileCountWarnThreshold:  10_000,
  fileCountHardCap:        50_000,
  excludeLanguages:        [],
};

/**
 * Returns true if the given relative `filePath` should be included
 * according to the scope configuration.
 *
 * Evaluation order:
 *   1. allowOverrides (highest priority — overrides deny)
 *   2. denyPatterns
 *   3. allowPatterns
 *   4. excludeLanguages
 */
export function applyScopeFilter(filePath: string, config: ScopeConfig = DEFAULT_SCOPE_CONFIG): boolean {
  const { denyPatterns, allowPatterns, allowOverrides, excludeLanguages } = config;

  // 1. Explicit opt-in overrides
  if (allowOverrides.some(p => matchGlob(filePath, p))) return true;

  // 2. Deny-list
  if (denyPatterns.some(p => matchGlob(filePath, p))) return false;

  // 3. Excluded languages
  if (excludeLanguages.length > 0) {
    const ext = '.' + filePath.split('.').pop();
    for (const lang of excludeLanguages) {
      const exts = LANGUAGE_EXTENSION_MAP[lang.toLowerCase()] ?? [];
      if (exts.includes(ext)) return false;
    }
  }

  // 4. Allow-list
  return allowPatterns.some(p => matchGlob(filePath, p));
}

/** Minimal glob matcher (single-file use; for production use micromatch). */
function matchGlob(path: string, pattern: string): boolean {
  // Normalise separators
  const p = path.replace(/\\/g, '/');
  // Convert glob to regex
  const regex = new RegExp(
    '^' +
    pattern
      .replace(/\\/g, '/')
      .replace(/[.+^${}()|[\]]/g, '\\$&')
      .replace(/\*\*\//g, '(.*/)?')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]') +
    '$'
  );
  return regex.test(p);
}
