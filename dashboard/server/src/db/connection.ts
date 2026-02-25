import Database from 'better-sqlite3';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/** Singleton read-only connection */
let _db: Database.Database | null = null;

/**
 * Resolve the MCP server data root.
 *
 * Priority:
 *   1. `PM_DATA_ROOT` environment variable (canonical — matches MCP server)
 *   2. `MBS_DATA_ROOT` environment variable (legacy — set by supervisor)
 *   3. Platform app-data default — matches MCP server's own fallback:
 *        Windows : %APPDATA%\ProjectMemory\
 *        macOS   : ~/Library/Application Support/ProjectMemory/
 *        Linux   : $XDG_DATA_HOME/ProjectMemory/ (fallback: ~/.local/share/ProjectMemory/)
 */
function resolveDataRoot(): string {
  const pm = process.env.PM_DATA_ROOT;
  if (pm && pm.trim()) return pm.trim();
  const mbs = process.env.MBS_DATA_ROOT;
  if (mbs && mbs.trim()) return mbs.trim();

  if (process.platform === 'win32') {
    const appdata = process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'ProjectMemory');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'ProjectMemory');
  }
  const xdg = process.env['XDG_DATA_HOME'] ?? path.join(os.homedir(), '.local', 'share');
  return path.join(xdg, 'ProjectMemory');
}

/**
 * Return (or open) the read-only SQLite connection to `project-memory.db`.
 *
 * The dashboard is a read-only consumer — all writes happen through the MCP
 * server. Using `{ readonly: true }` prevents accidental mutations and allows
 * concurrent access alongside the MCP server's WAL-mode writer.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dataRoot = resolveDataRoot();
  const dbPath   = path.join(dataRoot, 'project-memory.db');

  _db = new Database(dbPath, { readonly: true });

  // FK enforcement is informational on read-only connections but costs nothing
  _db.pragma('foreign_keys = ON');

  console.log(`[db] Connected (read-only): ${dbPath}`);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
process.on('exit',    () => closeDb());
process.on('SIGINT',  () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
