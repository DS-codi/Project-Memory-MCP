import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getDb } from './connection.js';

export interface ReproPackageMeta {
  schema_version: '1.0';
  exported_at: string;
  exported_by: 'reproducibility-package';
  workspace_filter?: string[];
  plan_filter?: string[];
}

export interface ReproTableSnapshot {
  table: string;
  row_count: number;
  checksum: string;
  rows: Record<string, unknown>[];
}

export interface ReproPackage {
  meta: ReproPackageMeta;
  tables: ReproTableSnapshot[];
}

export interface ExportReproPackageInput {
  output_path: string;
  workspace_ids?: string[];
  plan_ids?: string[];
}

export interface ImportReproPackageInput {
  package_path: string;
  clear_existing?: boolean;
}

export interface ReproParityDiff {
  table: string;
  expected_count: number;
  actual_count: number;
  expected_checksum: string;
  actual_checksum: string;
}

export interface ReproParityResult {
  match: boolean;
  differences: ReproParityDiff[];
}

const REPRO_TABLES = [
  'workspaces',
  'programs',
  'program_plans',
  'plans',
  'phases',
  'steps',
  'sessions',
  'lineage',
  'context_items',
  'research_documents',
  'knowledge_files',
  'agent_definitions',
  'deployable_agent_profiles',
  'category_workflow_definitions',
  'instruction_files',
  'skill_definitions',
  'gui_routing_contracts',
  'dependencies',
  'build_scripts',
] as const;

function stableStringify(input: unknown): string {
  if (Array.isArray(input)) {
    return `[${input.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${stableStringify(value)}`).join(',')}}`;
  }

  return JSON.stringify(input);
}

function checksumRows(rows: Record<string, unknown>[]): string {
  const hash = createHash('sha256');
  hash.update(stableStringify(rows));
  return hash.digest('hex');
}

function selectRowsForTable(table: string): Record<string, unknown>[] {
  const db = getDb();
  const statement = db.prepare(`SELECT * FROM ${table}`);
  const rows = statement.all() as Record<string, unknown>[];

  return rows
    .map((row) => Object.keys(row)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = row[key];
        return accumulator;
      }, {}))
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function insertRows(table: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;

  const db = getDb();
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const statement = db.prepare(
    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
  );

  for (const row of rows) {
    const values = columns.map((column) => row[column]);
    statement.run(values);
  }
}

export async function exportReproPackage(input: ExportReproPackageInput): Promise<ReproPackage> {
  const snapshots: ReproTableSnapshot[] = REPRO_TABLES.map((table) => {
    const rows = selectRowsForTable(table);
    return {
      table,
      row_count: rows.length,
      checksum: checksumRows(rows),
      rows,
    };
  });

  const payload: ReproPackage = {
    meta: {
      schema_version: '1.0',
      exported_at: new Date().toISOString(),
      exported_by: 'reproducibility-package',
      workspace_filter: input.workspace_ids,
      plan_filter: input.plan_ids,
    },
    tables: snapshots,
  };

  await fs.mkdir(path.dirname(input.output_path), { recursive: true });
  await fs.writeFile(input.output_path, JSON.stringify(payload, null, 2), 'utf-8');

  return payload;
}

export async function importReproPackage(input: ImportReproPackageInput): Promise<ReproPackage> {
  const raw = await fs.readFile(input.package_path, 'utf-8');
  const parsed = JSON.parse(raw) as ReproPackage;

  const db = getDb();
  const tableMap = new Map(parsed.tables.map((snapshot) => [snapshot.table, snapshot]));

  const transaction = db.transaction(() => {
    db.exec('PRAGMA foreign_keys = OFF');

    if (input.clear_existing === true) {
      for (const table of [...REPRO_TABLES].reverse()) {
        db.exec(`DELETE FROM ${table}`);
      }
    }

    for (const table of REPRO_TABLES) {
      const snapshot = tableMap.get(table);
      if (!snapshot) continue;
      insertRows(table, snapshot.rows);
    }

    db.exec('PRAGMA foreign_keys = ON');
  });

  transaction();
  return parsed;
}

export function compareReproPackages(expected: ReproPackage, actual: ReproPackage): ReproParityResult {
  const expectedMap = new Map(expected.tables.map((snapshot) => [snapshot.table, snapshot]));
  const actualMap = new Map(actual.tables.map((snapshot) => [snapshot.table, snapshot]));
  const tableNames = Array.from(new Set([...expectedMap.keys(), ...actualMap.keys()])).sort();

  const differences: ReproParityDiff[] = [];
  for (const table of tableNames) {
    const expectedSnapshot = expectedMap.get(table);
    const actualSnapshot = actualMap.get(table);

    if (!expectedSnapshot || !actualSnapshot) {
      differences.push({
        table,
        expected_count: expectedSnapshot?.row_count ?? 0,
        actual_count: actualSnapshot?.row_count ?? 0,
        expected_checksum: expectedSnapshot?.checksum ?? '',
        actual_checksum: actualSnapshot?.checksum ?? '',
      });
      continue;
    }

    if (
      expectedSnapshot.row_count !== actualSnapshot.row_count
      || expectedSnapshot.checksum !== actualSnapshot.checksum
    ) {
      differences.push({
        table,
        expected_count: expectedSnapshot.row_count,
        actual_count: actualSnapshot.row_count,
        expected_checksum: expectedSnapshot.checksum,
        actual_checksum: actualSnapshot.checksum,
      });
    }
  }

  return {
    match: differences.length === 0,
    differences,
  };
}

async function runCli(): Promise<void> {
  const [, , command, ...args] = process.argv;

  const arg = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  if (command === 'export') {
    const outputPath = arg('--out');
    if (!outputPath) {
      throw new Error('Missing --out for export command.');
    }

    const exported = await exportReproPackage({ output_path: outputPath });
    console.log(JSON.stringify({
      command: 'export',
      output_path: outputPath,
      tables: exported.tables.map((table) => ({
        table: table.table,
        row_count: table.row_count,
        checksum: table.checksum,
      })),
    }, null, 2));
    return;
  }

  if (command === 'import') {
    const packagePath = arg('--in');
    if (!packagePath) {
      throw new Error('Missing --in for import command.');
    }

    const clearExisting = args.includes('--clear');
    const imported = await importReproPackage({ package_path: packagePath, clear_existing: clearExisting });
    console.log(JSON.stringify({
      command: 'import',
      package_path: packagePath,
      clear_existing: clearExisting,
      table_count: imported.tables.length,
    }, null, 2));
    return;
  }

  throw new Error('Unsupported command. Use: export --out <path> | import --in <path> [--clear]');
}

const isMain = process.argv[1]
  && (process.argv[1].endsWith('reproducibility-package.ts') || process.argv[1].endsWith('reproducibility-package.js'));

if (isMain) {
  runCli().catch((error) => {
    console.error(`[reproducibility-package] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
