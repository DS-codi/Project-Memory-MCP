/**
 * Schema migration runner.
 *
 * Reads SQL files from the `migrations/` directory adjacent to this file,
 * tracks which ones have been applied in a `_migrations` table, and runs
 * only the unapplied ones — in filename order — inside a single transaction.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './connection.js';

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

/**
 * Ensure the `_migrations` tracking table exists.
 */
function ensureMigrationsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Return the set of migration filenames that have already been applied.
 */
function appliedMigrations(): Set<string> {
  const db = getDb();
  const rows = db.prepare('SELECT filename FROM _migrations').all() as Array<{ filename: string }>;
  return new Set(rows.map(r => r.filename));
}

/**
 * Return all `.sql` migration files sorted by name.
 */
function pendingMigrationFiles(applied: Set<string>): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => !applied.has(f));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

// ---------------------------------------------------------------------------
// Statement splitter & helpers
// ---------------------------------------------------------------------------

/**
 * Strip leading `--` single-line comments and blank lines from a statement
 * chunk so the actual SQL keyword is at the start of the returned string.
 * Block comments at the head are also removed.
 */
function stripLeadingComments(s: string): string {
  let result = s;
  // Repeatedly strip a leading comment line or block comment
  let prev: string;
  do {
    prev = result;
    result = result
      .trimStart()
      .replace(/^--[^\n]*\n?/, '')          // single-line --comment
      .replace(/^\/\*[\s\S]*?\*\/\s*/, ''); // block /* comment */
  } while (result !== prev);
  return result.trimStart();
}

/**
 * Split a SQL file into individual, runnable statements.
 *
 * We split on `;` at the end of a non-whitespace content block so each
 * element is a single SQL statement (potentially with a leading comment
 * block that should be preserved for `db.exec` but ignored when classifying
 * the statement type).
 */
function splitStatements(sql: string): string[] {
  // Normalise Windows (CRLF) line endings so all subsequent regexes use \n
  const normalised = sql.replace(/\r\n/g, '\n');
  // Use non-capturing group to avoid interleaved captures in split result
  const parts = normalised.split(/;[ \t]*(?:\n|$)/);
  return parts
    .map(s => s.trim())
    .filter(s => {
      // Drop empty and comment-only chunks
      const noComments = s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      return noComments.trim().length > 0;
    });
}

/**
 * Return the leading SQL keyword of a statement, ignoring any comment lines
 * that precede the actual SQL.
 */
function statementKeyword(stmt: string): string {
  const cleaned = stripLeadingComments(stmt);
  const m = cleaned.match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : '';
}

/** Extract the table name from `DROP TABLE [IF EXISTS] <name>` */
function dropTableName(stmt: string): string | undefined {
  const cleaned = stripLeadingComments(stmt);
  const m = cleaned.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"\[]?[\w]+[`"\]]?)/i);
  return m ? m[1].replace(/[`"[\]]/g, '') : undefined;
}

/** Extract the destination table name from `ALTER TABLE <src> RENAME TO <dest>` */
function renameToName(stmt: string): string | undefined {
  const cleaned = stripLeadingComments(stmt);
  const m = cleaned.match(/^ALTER\s+TABLE\s+\S+\s+RENAME\s+TO\s+([`"\[]?[\w]+[`"\]]?)/i);
  return m ? m[1].replace(/[`"[\]]/g, '') : undefined;
}



/**
 * Run all unapplied migrations in order.
 *
 * Each migration file is executed statement-by-statement inside a single
 * transaction.  If a DML statement (INSERT / SELECT) fails with
 * "no such column" it is treated as a soft skip — this handles the case
 * where a migration was written to upgrade an old schema that the current
 * `001-initial-schema.sql` already incorporates (e.g. on fresh test DBs).
 * Subsequent DROP TABLE / ALTER TABLE RENAME that target the same table are
 * also skipped so they don't destroy the already-correct schema.
 *
 * Any other error causes the transaction to roll back and is re-thrown.
 *
 * @returns Summary of applied and skipped migration filenames.
 */
export function runMigrations(): MigrationResult {
  const db = getDb();

  ensureMigrationsTable();

  const applied  = appliedMigrations();
  const pending  = pendingMigrationFiles(applied);
  const skipped  = Array.from(applied);
  const ranNow:  string[] = [];

  for (const filename of pending) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    const sql      = fs.readFileSync(filePath, 'utf8');
    const stmts    = splitStatements(sql);

    // Tables whose data migration was skipped (no such column).
    // Used to also skip the subsequent DROP TABLE / RENAME for those tables.
    const skipDdlForTables = new Set<string>();

    const applyMigration = db.transaction(() => {
      for (const stmt of stmts) {
        const keyword = statementKeyword(stmt);

        // Check whether this DROP or RENAME should be skipped because the
        // preceding data-migration INSERT was soft-skipped.
        if (keyword === 'DROP') {
          const tbl = dropTableName(stmt);
          if (tbl && skipDdlForTables.has(tbl)) {
            continue; // skip: the data was never migrated into v2
          }
        }
        if (keyword === 'ALTER') {
          const tbl = renameToName(stmt);
          if (tbl && skipDdlForTables.has(tbl)) {
            continue; // skip: v2 was never populated
          }
        }

        try {
          db.exec(stmt);
        } catch (err) {
          const msg  = (err as Error).message ?? '';
          const isDml = keyword === 'INSERT' || keyword === 'SELECT' ||
                        keyword === 'UPDATE'  || keyword === 'DELETE';

          const isDdlColDrop = keyword === 'ALTER' && /DROP\s+COLUMN/i.test(stmt);

          if ((isDml || isDdlColDrop) && msg.includes('no such column')) {
            // Soft skip: column was already removed by an updated schema.
            // Record destination table so the cleanup DDL is also skipped.
            const destMatch = stmt.match(
              /INTO\s+([`"\[]?[\w]+[`"\]]?)/i
            );
            if (destMatch) {
              const dest = destMatch[1].replace(/[`"[\]]/g, '');
              // The "real" table name is the one we'd have renamed dest to.
              // Typically: INSERT INTO research_documents_v2 → drop & rename
              // to research_documents.  We guard by the dest table itself and
              // the source table of SELECT.
              skipDdlForTables.add(dest);
              // Also guard the source table that dest was going to replace
              const renameTarget = dest.replace(/_v2$/, '');
              if (renameTarget !== dest) skipDdlForTables.add(renameTarget);
            }
            continue;
          }

          // Any other error is fatal for this migration
          throw err;
        }
      }

      db
        .prepare('INSERT INTO _migrations (filename) VALUES (?)')
        .run(filename);
    });

    try {
      applyMigration();
      ranNow.push(filename);
    } catch (err) {
      throw new Error(
        `Migration "${filename}" failed: ${(err as Error).message}`
      );
    }
  }

  return { applied: ranNow, skipped };
}

/**
 * Return the list of all migration files, their applied status, and
 * (if applied) when they were applied.
 */
export function migrationStatus(): Array<{
  filename: string;
  applied:  boolean;
  appliedAt?: string;
}> {
  const db = getDb();
  ensureMigrationsTable();

  const appliedRows = db.prepare(
    'SELECT filename, applied_at FROM _migrations ORDER BY id'
  ).all() as Array<{ filename: string; applied_at: string }>;

  const appliedMap = new Map(appliedRows.map(r => [r.filename, r.applied_at]));

  const allFiles = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    : [];

  return allFiles.map(filename => ({
    filename,
    applied:   appliedMap.has(filename),
    appliedAt: appliedMap.get(filename),
  }));
}
