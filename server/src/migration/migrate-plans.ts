/**
 * migration/migrate-plans.ts — Phase 3: Plan Migration
 *
 * For each workspace, scans plans/ and plans/_archived/, reads state.json,
 * and inserts rows into:
 *   plans, phases, steps, sessions, lineage, plan_notes, build_scripts,
 *   dependencies (for depends_on_plans)
 *
 * V1 plans (no schema_version):
 *   - Category normalized via migrateCategoryToV2()
 *   - Phases extracted from steps[].phase strings
 *
 * V2 plans (schema_version: '2.0'):
 *   - Phases from state.json.phases[] array
 *
 * Programs (is_program: true) are SKIPPED — handled in migrate-programs.ts.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { run, queryOne }         from '../db/query-helpers.js';
import { migrateCategoryToV2 }   from '../types/context.types.js';
import type { RequestCategory, LegacyRequestCategory } from '../types/context.types.js';
import type { ReportBuilder }    from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migratePlans(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 3: Plan Migration');

  const workspaceDirs = getWorkspaceDirs(dataRoot);

  for (const wsDir of workspaceDirs) {
    const wsId    = path.basename(wsDir);
    const planDir = path.join(wsDir, 'plans');
    if (!fs.existsSync(planDir)) continue;

    // ── Active plans ───────────────────────────────────────────────────────
    const activeDirs = fs.readdirSync(planDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '_archived')
      .map(d => d.name);

    for (const planDirName of activeDirs) {
      processPlanDir(
        path.join(planDir, planDirName),
        planDirName,
        wsId,
        false,
        report,
        dryRun
      );
    }

    // ── Archived plans ─────────────────────────────────────────────────────
    const archivedDir = path.join(planDir, '_archived');
    if (fs.existsSync(archivedDir)) {
      const archivedPlanDirs = fs.readdirSync(archivedDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const planDirName of archivedPlanDirs) {
        processPlanDir(
          path.join(archivedDir, planDirName),
          planDirName,
          wsId,
          true,
          report,
          dryRun
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Per-plan directory processing
// ---------------------------------------------------------------------------

function processPlanDir(
  planDirPath: string,
  dirName:     string,
  wsId:        string,
  isArchived:  boolean,
  report:      ReportBuilder,
  dryRun:      boolean
): void {
  const statePath = path.join(planDirPath, 'state.json');
  if (!fs.existsSync(statePath)) {
    report.error(planDirPath, 'no state.json');
    return;
  }

  let state: PlanState | null;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as PlanState | null;
  } catch (err) {
    report.error(statePath, `corrupt JSON: ${(err as Error).message}`);
    return;
  }

  if (!state) {
    report.error(statePath, 'state.json is null or empty');
    return;
  }

  // Skip V1 program containers (handled in Phase 7)
  if (state.is_program === true) {
    report.skip(planDirPath, 'is_program=true — handled in Phase 7');
    return;
  }

  const planId   = state.plan_id ?? state.id ?? dirName;
  const isV2     = state.schema_version === '2.0';
  const category = migrateCategoryToV2((state.category ?? 'feature') as RequestCategory | LegacyRequestCategory);

  // ── Warn for non-standard plan dir names ─────────────────────────────
  if (!dirName.startsWith('plan_') && dirName !== 'plan_temporary') {
    report.error(planDirPath, `non-standard directory name "${dirName}" — migrating with warning`);
  }

  // ── Build phases map ──────────────────────────────────────────────────
  // V2: use phases[] array.  V1: extract from steps[].phase strings.
  const phaseNameToId = new Map<string, string>();

  if (!dryRun) {
    migratePlan(state, planId, wsId, category, isArchived, report, phaseNameToId);
  } else {
    // Count what would be inserted
    report.increment(isArchived ? 'plans_archived' : 'plans_active');
    report.increment('steps_total',    state.steps?.length            ?? 0);
    report.increment('sessions_total', state.agent_sessions?.length   ?? 0);
    report.increment('lineage_total',  state.lineage?.length          ?? 0);
    report.increment('notes_total',    (state.notes?.length ?? 0) + (state.pending_notes?.length ?? 0));
  }
}

// ---------------------------------------------------------------------------
// Plan migration (write path)
// ---------------------------------------------------------------------------

function migratePlan(
  state:         PlanState,
  planId:        string,
  wsId:          string,
  category:      string,
  isArchived:    boolean,
  report:        ReportBuilder,
  phaseNameToId: Map<string, string>
): void {
  const now = new Date().toISOString();

  // ── Upsert plan row ──────────────────────────────────────────────────
  const existing = queryOne<{ id: string }>('SELECT id FROM plans WHERE id = ?', [planId]);

  const planStatus = deriveStatus(state, isArchived);
  const createdAt  = state.created_at ?? now;
  const updatedAt  = state.updated_at ?? createdAt;
  const completedAt = state.completed_at ?? null;

  if (existing) {
    run(
      `UPDATE plans
       SET workspace_id = ?, program_id = ?, title = ?, description = ?,
           category = ?, priority = ?, status = ?, schema_version = '2.0',
           goals = ?, success_criteria = ?, categorization = ?,
           deployment_context = ?, confirmation_state = ?,
           paused_at = ?, paused_at_snapshot = ?,
           recommended_next_agent = ?, created_at = ?, updated_at = ?, completed_at = ?
       WHERE id = ?`,
      [
        wsId,
        state.program_id              ?? null,
        state.title                   ?? planId,
        state.description             ?? '',
        category,
        state.priority                ?? 'medium',
        planStatus,
        JSON.stringify(state.goals            ?? []),
        JSON.stringify(state.success_criteria ?? []),
        state.categorization          ? JSON.stringify(state.categorization)      : null,
        state.deployment_context      ? JSON.stringify(state.deployment_context)  : null,
        state.confirmation_state      ? JSON.stringify(state.confirmation_state)  : null,
        state.paused_at_snapshot?.paused_at ?? null,
        state.paused_at_snapshot      ? JSON.stringify(state.paused_at_snapshot)  : null,
        state.recommended_next_agent  ?? null,
        createdAt,
        updatedAt,
        completedAt,
        planId,
      ]
    );
    report.increment(isArchived ? 'plans_archived_updated' : 'plans_active_updated');
  } else {
    run(
      `INSERT INTO plans
        (id, workspace_id, program_id, title, description, category, priority,
         status, schema_version, goals, success_criteria, categorization,
         deployment_context, confirmation_state,
         paused_at, paused_at_snapshot,
         recommended_next_agent, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2.0', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        planId, wsId,
        state.program_id              ?? null,
        state.title                   ?? planId,
        state.description             ?? '',
        category,
        state.priority                ?? 'medium',
        planStatus,
        JSON.stringify(state.goals            ?? []),
        JSON.stringify(state.success_criteria ?? []),
        state.categorization          ? JSON.stringify(state.categorization)      : null,
        state.deployment_context      ? JSON.stringify(state.deployment_context)  : null,
        state.confirmation_state      ? JSON.stringify(state.confirmation_state)  : null,
        state.paused_at_snapshot?.paused_at ?? null,
        state.paused_at_snapshot      ? JSON.stringify(state.paused_at_snapshot)  : null,
        state.recommended_next_agent  ?? null,
        createdAt,
        updatedAt,
        completedAt,
      ]
    );
    report.increment(isArchived ? 'plans_archived' : 'plans_active');
  }

  // ── Phases ──────────────────────────────────────────────────────────
  migratePhases(state, planId, phaseNameToId, report);

  // ── Steps ───────────────────────────────────────────────────────────
  migrateSteps(state, planId, phaseNameToId, report);

  // ── Sessions ────────────────────────────────────────────────────────
  migrateSessions(state, planId, report);

  // ── Lineage ─────────────────────────────────────────────────────────
  migrateLineage(state, planId, report);

  // ── Plan notes ──────────────────────────────────────────────────────
  migratePlanNotes(state, planId, report);

  // ── Build scripts ───────────────────────────────────────────────────
  migrateBuildScripts(state, planId, wsId, report);

  // ── depends_on_plans → dependencies ─────────────────────────────────
  migratePlanDependencies(state, planId, report);
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

function migratePhases(
  state:         PlanState,
  planId:        string,
  phaseNameToId: Map<string, string>,
  report:        ReportBuilder
): void {
  const hasV2Phases = Array.isArray(state.phases) && state.phases.length > 0;
  const now = new Date().toISOString();

  if (hasV2Phases) {
    // V2: use the phases[] array directly
    for (const phase of state.phases!) {
      const candidateId = phase.id ?? randomUUID();
      const actualId = upsertPhase(candidateId, planId, phase.title ?? phase.name ?? 'Unnamed', phase.order_index ?? 0, now);
      phaseNameToId.set(phase.title ?? phase.name ?? '', actualId);
      report.increment('phases');
    }
  } else {
    // V1: extract unique phase names in first-occurrence order
    const seen  = new Set<string>();
    const names: string[] = [];
    for (const step of state.steps ?? []) {
      const phaseName = step.phase ?? 'Unphased';
      if (!seen.has(phaseName)) {
        seen.add(phaseName);
        names.push(phaseName);
      }
    }
    if (names.length === 0) names.push('Unphased'); // guarantee at least one

    names.forEach((name, idx) => {
      const candidateId = randomUUID();
      const actualId = upsertPhase(candidateId, planId, name, idx, now);
      phaseNameToId.set(name, actualId);
      report.increment('phases');
    });
  }
}

function upsertPhase(id: string, planId: string, name: string, orderIndex: number, createdAt: string): string {
  const existing = queryOne<{ id: string }>('SELECT id FROM phases WHERE plan_id = ? AND name = ?', [planId, name]);
  if (existing) return existing.id; // idempotent — return existing phase id

  run(
    'INSERT OR IGNORE INTO phases (id, plan_id, name, order_index, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, planId, name, orderIndex, createdAt]
  );
  return id;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function migrateSteps(
  state:         PlanState,
  planId:        string,
  phaseNameToId: Map<string, string>,
  report:        ReportBuilder
): void {
  const now = new Date().toISOString();

  // First pass: insert all steps (depends_on normalised to `dependencies` table in second pass).
  // We capture stepIndex → stepId so we can resolve legacy index-based depends_on arrays.
  const stepIndexToId = new Map<number, string>();

  (state.steps ?? []).forEach((step, idx) => {
    const phaseName = step.phase ?? 'Unphased';
    const phaseId   = phaseNameToId.get(phaseName) ?? phaseNameToId.values().next().value ?? '';
    if (!phaseId) {
      report.error(`plan/${planId}/step/${idx}`, 'could not resolve phase_id');
      return;
    }

    const stepId      = step.id    ?? randomUUID();
    const orderIndex  = step.index ?? idx;
    const stepCreated = step.created_at ?? now;
    const stepUpdated = step.updated_at ?? stepCreated;

    run(
      `INSERT OR IGNORE INTO steps
        (id, phase_id, plan_id, task, type, status, assignee, notes,
         order_index, requires_confirmation, requires_user_confirmation,
         requires_validation, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stepId,
        phaseId,
        planId,
        step.task   ?? '',
        step.type   ?? 'standard',
        step.status ?? 'pending',
        step.assignee ?? null,
        step.notes    ?? null,
        orderIndex,
        step.requires_confirmation      ? 1 : 0,
        step.requires_user_confirmation ? 1 : 0,
        step.requires_validation        ? 1 : 0,
        stepCreated,
        stepUpdated,
        step.completed_at ?? null,
      ]
    );
    stepIndexToId.set(orderIndex, stepId);
    report.increment('steps');
  });

  // Second pass: normalise legacy index-based depends_on → `dependencies` table.
  (state.steps ?? []).forEach((step, idx) => {
    if (!step.depends_on?.length) return;

    const orderIndex = step.index ?? idx;
    const stepId     = stepIndexToId.get(orderIndex);
    if (!stepId) return;

    for (const depIdx of step.depends_on) {
      const depStepId = stepIndexToId.get(depIdx);
      if (!depStepId) {
        report.error(
          `plan/${planId}/step/${orderIndex}/dep/${depIdx}`,
          'could not resolve dep step ID — skipping'
        );
        continue;
      }
      // depStepId 'blocks' stepId (stepId cannot proceed until depStepId is done).
      const resolvedDepStep = (state.steps ?? [])[depIdx];
      const depDone         = resolvedDepStep?.status === 'done';
      run(
        `INSERT OR IGNORE INTO dependencies
           (source_type, source_id, target_type, target_id, dep_type, dep_status)
         VALUES ('step', ?, 'step', ?, 'blocks', ?)`,
        [depStepId, stepId, depDone ? 'satisfied' : 'pending']
      );
      report.increment('step_dependencies_normalized');
    }
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function migrateSessions(state: PlanState, planId: string, report: ReportBuilder): void {
  for (const sess of state.agent_sessions ?? []) {
    const sessId = sess.session_id ?? randomUUID();
    run(
      `INSERT OR IGNORE INTO sessions
        (id, plan_id, agent_type, started_at, completed_at, summary, artifacts, is_orphaned, context)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        sessId,
        planId,
        sess.agent_type ?? 'Unknown',
        sess.started_at ?? new Date().toISOString(),
        sess.completed_at ?? null,
        sess.summary      ?? null,
        sess.artifacts    ? JSON.stringify(sess.artifacts) : null,
        sess.context      ? JSON.stringify(sess.context)   : null,
      ]
    );
    report.increment('sessions');
  }
}

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

function migrateLineage(state: PlanState, planId: string, report: ReportBuilder): void {
  for (const entry of state.lineage ?? []) {
    const entryId = entry.id ?? randomUUID();
    run(
      `INSERT OR IGNORE INTO lineage
        (id, plan_id, from_agent, to_agent, reason, data, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entryId,
        planId,
        entry.from_agent ?? '',
        entry.to_agent   ?? '',
        entry.reason     ?? '',
        entry.data       ? JSON.stringify(entry.data) : null,
        entry.timestamp  ?? new Date().toISOString(),
      ]
    );
    report.increment('lineage_entries');
  }
}

// ---------------------------------------------------------------------------
// Plan notes
// ---------------------------------------------------------------------------

function migratePlanNotes(state: PlanState, planId: string, report: ReportBuilder): void {
  const notes = [
    ...(state.notes         ?? []).map(n => ({ ...n, pending: false })),
    ...(state.pending_notes ?? []).map(n => ({ ...n, pending: true  })),
  ];

  for (const note of notes) {
    const noteId  = randomUUID();
    const content = typeof note === 'string' ? note : (note.content ?? JSON.stringify(note));
    const noteType = note.type ?? (note.pending ? 'pending' : 'info');
    const createdAt = note.created_at ?? new Date().toISOString();

    run(
      `INSERT OR IGNORE INTO plan_notes (id, plan_id, content, note_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [noteId, planId, content, noteType, createdAt]
    );
    report.increment('plan_notes');
  }
}

// ---------------------------------------------------------------------------
// Build scripts
// ---------------------------------------------------------------------------

function migrateBuildScripts(
  state:  PlanState,
  planId: string,
  wsId:   string,
  report: ReportBuilder
): void {
  for (const script of state.build_scripts ?? []) {
    const scriptId = script.id ?? randomUUID();
    run(
      `INSERT OR IGNORE INTO build_scripts
        (id, workspace_id, plan_id, name, description, command, directory, mcp_handle, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scriptId,
        wsId,
        planId,
        script.name        ?? 'unnamed',
        script.description ?? null,
        script.command     ?? '',
        script.directory   ?? '.',
        script.mcp_handle  ?? null,
        script.created_at  ?? new Date().toISOString(),
      ]
    );
    report.increment('build_scripts');
  }
}

// ---------------------------------------------------------------------------
// Plan-level dependencies (depends_on_plans[])
// ---------------------------------------------------------------------------

function migratePlanDependencies(state: PlanState, planId: string, report: ReportBuilder): void {
  for (const depId of state.depends_on_plans ?? []) {
    run(
      `INSERT OR IGNORE INTO dependencies
        (source_type, source_id, target_type, target_id, created_at)
       VALUES ('plan', ?, 'plan', ?, datetime('now'))`,
      [planId, depId]
    );
    report.increment('plan_dependencies');
  }
}

// ---------------------------------------------------------------------------
// Status helper
// ---------------------------------------------------------------------------

function deriveStatus(state: PlanState, isArchived: boolean): string {
  if (isArchived) return state.status ?? 'archived';
  return state.status ?? 'active';
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function getWorkspaceDirs(dataRoot: string): string[] {
  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dataRoot, d.name))
    .filter(dir => fs.existsSync(path.join(dir, 'workspace.meta.json')));
}

// ---------------------------------------------------------------------------
// Loose types for file shapes
// ---------------------------------------------------------------------------

interface PhaseJson {
  id?:          string;
  title?:       string;
  name?:        string;
  order_index?: number;
  status?:      string;
  description?: string;
}

interface StepJson {
  id?:                         string;
  index?:                      number;
  phase?:                      string;
  task?:                       string;
  type?:                       string;
  status?:                     string;
  assignee?:                   string;
  notes?:                      string;
  requires_confirmation?:      boolean;
  requires_user_confirmation?: boolean;
  requires_validation?:        boolean;
  depends_on?:                 number[];
  created_at?:                 string;
  updated_at?:                 string;
  completed_at?:               string;
}

interface SessionJson {
  session_id?:  string;
  agent_type?:  string;
  started_at?:  string;
  completed_at?: string;
  summary?:     string;
  artifacts?:   string[];
  context?:     object;
}

interface LineageJson {
  id?:         string;
  from_agent?: string;
  to_agent?:   string;
  reason?:     string;
  data?:       object;
  timestamp?:  string;
}

interface NoteJson {
  content?:    string;
  type?:       string;
  pending?:    boolean;
  created_at?: string;
  [key: string]: unknown;
}

interface BuildScriptJson {
  id?:          string;
  name?:        string;
  description?: string;
  command?:     string;
  directory?:   string;
  mcp_handle?:  string;
  created_at?:  string;
}

interface PausedAtSnapshot {
  paused_at?:  string;
  [key: string]: unknown;
}

interface PlanState {
  id?:                     string;
  plan_id?:                string;
  workspace_id?:           string;
  program_id?:             string;
  is_program?:             boolean;
  title?:                  string;
  description?:            string;
  category?:               string;
  priority?:               string;
  status?:                 string;
  schema_version?:         string;
  goals?:                  string[];
  success_criteria?:       string[];
  categorization?:         object;
  deployment_context?:     object;
  confirmation_state?:     object;
  paused_at_snapshot?:     PausedAtSnapshot;
  recommended_next_agent?: string;
  created_at?:             string;
  updated_at?:             string;
  completed_at?:           string;
  phases?:                 PhaseJson[];
  steps?:                  StepJson[];
  agent_sessions?:         SessionJson[];
  lineage?:                LineageJson[];
  notes?:                  NoteJson[];
  pending_notes?:          NoteJson[];
  build_scripts?:          BuildScriptJson[];
  depends_on_plans?:       string[];
  child_plan_ids?:         string[];
}
