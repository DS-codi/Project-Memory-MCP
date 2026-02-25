/**
 * migration/migrate-programs.ts — Phase 7: Program Migration
 *
 * ⚠️ MUST run BEFORE migrate-plans.ts — plans reference program_id as FK.
 *
 * Handles two program sources per workspace:
 *   1. V2 programs:  programs/{id}/ directories with program.json, manifest.json,
 *                    dependencies.json, risks.json
 *   2. V1 program containers: plans/{id}/state.json with is_program: true
 */

import fs   from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { getDb }          from '../db/connection.js';
import { run, queryOne }  from '../db/query-helpers.js';
import { migrateCategoryToV2 } from '../types/context.types.js';
import type { RequestCategory, LegacyRequestCategory } from '../types/context.types.js';
import type { ReportBuilder }  from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migratePrograms(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 7: Program Migration');

  const workspaceDirs = getWorkspaceDirs(dataRoot);

  for (const wsDir of workspaceDirs) {
    const wsId = path.basename(wsDir);

    // ── V2 programs: programs/{id}/ ───────────────────────────────────────
    const programsDir = path.join(wsDir, 'programs');
    if (fs.existsSync(programsDir)) {
      const programIds = fs.readdirSync(programsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const progId of programIds) {
        migrateV2Program(path.join(programsDir, progId), progId, wsId, report, dryRun);
      }
    }

    // ── V1 program containers: plans/{id}/state.json with is_program:true ─
    const plansDir = path.join(wsDir, 'plans');
    if (fs.existsSync(plansDir)) {
      const planDirs = fs.readdirSync(plansDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== '_archived')
        .map(d => d.name);

      for (const planDir of planDirs) {
        const statePath = path.join(plansDir, planDir, 'state.json');
        if (!fs.existsSync(statePath)) continue;

        let state: PlanState | null;
        try {
          state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as PlanState | null;
        } catch {
          continue; // errors handled in migrate-plans
        }

        if (!state) continue; // null / empty state.json — skip

        if (state.is_program === true) {
          migrateV1ProgramContainer(state, wsId, report, dryRun);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// V2 program migration
// ---------------------------------------------------------------------------

function migrateV2Program(
  progDir: string,
  progId:  string,
  wsId:    string,
  report:  ReportBuilder,
  dryRun:  boolean
): void {
  const programJsonPath = path.join(progDir, 'program.json');
  if (!fs.existsSync(programJsonPath)) {
    report.skip(progDir, 'no program.json');
    return;
  }

  let prog: ProgramJson;
  try {
    prog = JSON.parse(fs.readFileSync(programJsonPath, 'utf-8')) as ProgramJson;
  } catch (err) {
    report.error(programJsonPath, `corrupt JSON: ${(err as Error).message}`);
    return;
  }

  if (!dryRun) {
    upsertProgram({
      id:               progId,
      workspace_id:     wsId,
      title:            prog.title ?? progId,
      description:      prog.description ?? '',
      category:         migrateCategoryToV2((prog.category ?? 'feature') as RequestCategory | LegacyRequestCategory),
      priority:         prog.priority ?? 'medium',
      status:           prog.status   ?? 'active',
      goals:            JSON.stringify(prog.goals            ?? []),
      success_criteria: JSON.stringify(prog.success_criteria ?? []),
      source:           'v2',
      created_at:       prog.created_at ?? new Date().toISOString(),
      updated_at:       prog.updated_at ?? prog.created_at ?? new Date().toISOString(),
    });
  }
  report.increment('programs_v2');

  // ── manifest.json → program_plans ─────────────────────────────────────
  const manifestPath = path.join(progDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ProgramManifest;
      const childIds  = manifest.child_plan_ids ?? [];
      if (!dryRun) {
        childIds.forEach((planId, idx) => {
          insertProgramPlan(progId, planId, idx);
        });
      }
      report.increment('program_plan_links', childIds.length);
    } catch (err) {
      report.error(manifestPath, `corrupt JSON: ${(err as Error).message}`);
    }
  }

  // ── dependencies.json → dependencies ──────────────────────────────────
  const depsPath = path.join(progDir, 'dependencies.json');
  if (fs.existsSync(depsPath)) {
    try {
      const deps = JSON.parse(fs.readFileSync(depsPath, 'utf-8')) as DependenciesJson;
      const edges = deps.dependencies ?? deps.edges ?? [];
      if (!dryRun) {
        for (const dep of edges) {
          insertDependencyEdge(dep);
        }
      }
      report.increment('dependency_edges', edges.length);
    } catch (err) {
      report.error(depsPath, `corrupt JSON: ${(err as Error).message}`);
    }
  }

  // ── risks.json → program_risks ────────────────────────────────────────
  const risksPath = path.join(progDir, 'risks.json');
  if (fs.existsSync(risksPath)) {
    try {
      const risksData = JSON.parse(fs.readFileSync(risksPath, 'utf-8')) as RisksJson;
      const risks     = risksData.risks ?? [];
      if (!dryRun) {
        for (const risk of risks) {
          insertProgramRisk(progId, risk);
        }
      }
      report.increment('program_risks', risks.length);
    } catch (err) {
      report.error(risksPath, `corrupt JSON: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// V1 program container migration
// ---------------------------------------------------------------------------

function migrateV1ProgramContainer(
  state:  PlanState,
  wsId:   string,
  report: ReportBuilder,
  dryRun: boolean
): void {
  const progId = state.plan_id ?? state.id ?? '';
  if (!progId) {
    report.error('v1_program_container', 'no id in state.json');
    return;
  }

  if (!dryRun) {
    upsertProgram({
      id:               progId,
      workspace_id:     wsId,
      title:            state.title            ?? progId,
      description:      state.description      ?? '',
      category:         migrateCategoryToV2((state.category ?? 'feature') as RequestCategory | LegacyRequestCategory),
      priority:         state.priority         ?? 'medium',
      status:           state.status           ?? 'active',
      goals:            JSON.stringify(state.goals            ?? []),
      success_criteria: JSON.stringify(state.success_criteria ?? []),
      source:           'v1_migrated',
      created_at:       state.created_at ?? new Date().toISOString(),
      updated_at:       state.updated_at ?? state.created_at ?? new Date().toISOString(),
    });

    // child_plan_ids → program_plans
    const childIds = state.child_plan_ids ?? [];
    childIds.forEach((planId, idx) => {
      insertProgramPlan(progId, planId, idx);
    });

    // Warn if this v1 container had steps (unusual)
    if (state.steps?.length) {
      report.error(
        `v1_program/${progId}`,
        `V1 program container has ${state.steps.length} steps (unexpected) — stored as program context`
      );
    }
  }

  report.increment('programs_v1_migrated');
}

// ---------------------------------------------------------------------------
// Database helpers (raw SQL for explicit timestamp control)
// ---------------------------------------------------------------------------

interface UpsertProgramData {
  id:               string;
  workspace_id:     string;
  title:            string;
  description:      string;
  category:         string;
  priority:         string;
  status:           string;
  goals:            string;
  success_criteria: string;
  source:           'v2' | 'v1_migrated';
  created_at:       string;
  updated_at:       string;
}

function upsertProgram(d: UpsertProgramData): void {
  const existing = queryOne<{ id: string }>('SELECT id FROM programs WHERE id = ?', [d.id]);
  if (existing) {
    run(
      `UPDATE programs
       SET workspace_id = ?, title = ?, description = ?, category = ?, priority = ?,
           status = ?, schema_version = '2.0', goals = ?, success_criteria = ?,
           source = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
      [d.workspace_id, d.title, d.description, d.category, d.priority,
       d.status, d.goals, d.success_criteria, d.source, d.created_at, d.updated_at, d.id]
    );
  } else {
    run(
      `INSERT INTO programs
        (id, workspace_id, title, description, category, priority, status,
         schema_version, goals, success_criteria, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '2.0', ?, ?, ?, ?, ?)`,
      [d.id, d.workspace_id, d.title, d.description, d.category, d.priority,
       d.status, d.goals, d.success_criteria, d.source, d.created_at, d.updated_at]
    );
  }
}

function insertProgramPlan(programId: string, planId: string, orderIndex: number): void {
  run(
    `INSERT OR IGNORE INTO program_plans (program_id, plan_id, order_index, added_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [programId, planId, orderIndex]
  );
}

function insertDependencyEdge(dep: DependencyEdge): void {
  run(
    `INSERT OR IGNORE INTO dependencies
      (source_type, source_id, target_type, target_id, created_at)
     VALUES ('plan', ?, 'plan', ?, datetime('now'))`,
    [dep.source_plan_id, dep.target_plan_id]
  );
}

function insertProgramRisk(programId: string, risk: RiskEntry): void {
  run(
    `INSERT OR IGNORE INTO program_risks
      (id, program_id, risk_type, severity, description, affected_plan_ids, mitigation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      risk.id ?? randomUUID(),
      programId,
      risk.risk_type,
      risk.severity,
      risk.description,
      JSON.stringify(risk.affected_plan_ids ?? []),
      risk.mitigation ?? null,
    ]
  );
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function getWorkspaceDirs(dataRoot: string): string[] {
  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dataRoot, d.name))
    .filter(dir => {
      const meta = path.join(dir, 'workspace.meta.json');
      return fs.existsSync(meta);
    });
}

// ---------------------------------------------------------------------------
// Loose types for file shapes
// ---------------------------------------------------------------------------

interface PlanState {
  id?:              string;
  plan_id?:         string;
  is_program?:      boolean;
  title?:           string;
  description?:     string;
  category?:        string;
  priority?:        string;
  status?:          string;
  goals?:           string[];
  success_criteria?: string[];
  child_plan_ids?:  string[];
  steps?:           unknown[];
  created_at?:      string;
  updated_at?:      string;
}

interface ProgramJson {
  id?:              string;
  title?:           string;
  description?:     string;
  category?:        string;
  priority?:        string;
  status?:          string;
  goals?:           string[];
  success_criteria?: string[];
  created_at?:      string;
  updated_at?:      string;
}

interface ProgramManifest {
  child_plan_ids?: string[];
}

interface DependencyEdge {
  source_plan_id: string;
  target_plan_id: string;
  type?:          string;
  status?:        string;
}

interface DependenciesJson {
  dependencies?: DependencyEdge[];
  edges?:        DependencyEdge[];
}

interface RiskEntry {
  id?:               string;
  risk_type:         string;
  severity:          string;
  description:       string;
  affected_plan_ids?: string[];
  mitigation?:       string;
}

interface RisksJson {
  risks?: RiskEntry[];
}
