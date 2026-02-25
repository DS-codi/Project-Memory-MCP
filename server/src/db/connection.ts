/**
 * SQLite connection manager.
 *
 * Opens the database once as a singleton, applies required PRAGMAs,
 * and exports `getDb()` for use across all DB modules.
 *
 * The database file is located at `{DATA_ROOT}/project-memory.db`.
 *
 * DATA_ROOT resolution order:
 *   1. `PM_DATA_ROOT` environment variable  (for tests / container overrides)
 *   2. Platform app-data directory — matches the supervisor config convention:
 *        Windows : %APPDATA%\ProjectMemory\
 *        macOS   : ~/Library/Application Support/ProjectMemory/
 *        Linux   : $XDG_DATA_HOME/ProjectMemory/  (fallback: ~/.local/share/ProjectMemory/)
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Resolve data root
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Return the platform-appropriate app-data base directory.
 *
 *   Windows : %APPDATA%  (e.g. C:\Users\Alice\AppData\Roaming)
 *   macOS   : ~/Library/Application Support
 *   Linux   : $XDG_DATA_HOME  (fallback: ~/.local/share)
 */
function platformDataDir(): string {
  if (process.platform === 'win32') {
    return process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  // Linux / other POSIX
  return process.env['XDG_DATA_HOME'] ?? path.join(os.homedir(), '.local', 'share');
}

/**
 * Determine the data root directory.
 *
 * Priority order:
 *   1. `PM_DATA_ROOT` environment variable
 *   2. Platform app-data:  <appDataDir>/ProjectMemory/
 */
function resolveDataRoot(): string {
  if (process.env['PM_DATA_ROOT']) {
    return process.env['PM_DATA_ROOT'];
  }
  return path.join(platformDataDir(), 'ProjectMemory');
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

/**
 * Open (or return the existing) database connection.
 *
 * On first call:
 *  - Creates the data directory if it does not exist.
 *  - Opens the SQLite file.
 *  - Enables WAL journal mode, FK enforcement, and a 5 s busy timeout.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  // Resolve the data root lazily so PM_DATA_ROOT can be set in tests before
  // the first call to getDb().
  const dataRoot = resolveDataRoot();
  _dbPath = path.join(dataRoot, 'project-memory.db');

  // Ensure the data directory exists
  fs.mkdirSync(dataRoot, { recursive: true });

  _db = new Database(_dbPath);

  // Enable WAL mode (concurrent reads while writing, no file-lock contention)
  _db.pragma('journal_mode = WAL');
  // Enforce foreign key constraints
  _db.pragma('foreign_keys = ON');
  // Wait up to 5 s if another writer holds the lock
  _db.pragma('busy_timeout = 5000');

  return _db;
}

/**
 * Close the database connection gracefully.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _dbPath = null;
  }
}

/**
 * Return the resolved path to the database file (useful for diagnostics).
 * Returns null if the DB has not been opened yet.
 */
export function getDbPath(): string | null {
  return _dbPath;
}

/**
 * Reset the singleton — for use in tests only.
 * Closes any open connection so the next `getDb()` call re-resolves
 * the path from the current PM_DATA_ROOT environment variable.
 *
 * @internal Not for production use.
 */
export function _resetConnectionForTesting(): void {
  closeDb();
}

// ---------------------------------------------------------------------------
// Graceful shutdown hooks
// ---------------------------------------------------------------------------

function onExit(): void {
  closeDb();
}

process.on('exit',    onExit);
process.on('SIGINT',  () => { onExit(); process.exit(0); });
process.on('SIGTERM', () => { onExit(); process.exit(0); });
