/**
 * Consolidated Plan Tool - memory_plan
 * 
 * Actions: list, get, create, update, archive, import, find, add_note,
 *          delete, consolidate, set_goals, build scripts, templates, confirm,
 *          create_program, add_plan_to_program, upgrade_to_program, list_program_plans,
 *          add_risk, list_risks, auto_detect_risks, set_dependency, get_dependencies,
 *          migrate_programs
 */

import { promises as fs } from 'node:fs';
import path from 'path';
import type { 
  ToolResponse, 
  PlanState, 
  PlanStep,
  RequestCategory,
  PlanOperationResult,
  ImportPlanResult,
  RequestCategorization,
  AgentType,
  BuildScript,
  AddBuildScriptResult,
  ListBuildScriptsResult,
  RunBuildScriptResult,
  DeleteBuildScriptResult,
  GetPlanDependenciesResult,
  ClonePlanResult,
  MergePlansResult,
} from '../../types/index.js';
import type {
  FormResponse,
  FormStatus,
} from '../../types/gui-forms.types.js';
import * as planTools from '../plan/index.js';
import * as programTools from '../program/index.js';
import * as fileStore from '../../storage/db-store.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';
import { preflightValidate } from '../preflight/index.js';
import {
  maybeAttachCoordinatorHandoffInstruction,
  pausePlanAtApprovalGate,
  routeApprovalGate,
} from '../orchestration/approval-gate-routing.js';
import {
  checkGuiAvailability,
  launchFormApp,
} from '../orchestration/supervisor-client.js';
import type {
  ProgramRisk,
  ProgramDependency,
  ProgramState,
  ProgramManifest,
  RiskType,
  RiskSeverity,
  RiskStatus,
  DependencyType,
} from '../../types/program-v2.types.js';

export type PlanAction = 'list' | 'get' | 'create' | 'update' | 'archive' | 'import' | 'find' | 'add_note' | 'delete' | 'consolidate' | 'set_goals' | 'add_build_script' | 'list_build_scripts' | 'run_build_script' | 'delete_build_script' | 'create_from_template' | 'list_templates' | 'confirm' | 'summon_approval' | 'summon_cleanup_approval' | 'create_program' | 'add_plan_to_program' | 'upgrade_to_program' | 'list_program_plans' | 'export_plan' | 'link_to_program' | 'unlink_from_program' | 'set_plan_dependencies' | 'get_plan_dependencies' | 'set_plan_priority' | 'clone_plan' | 'merge_plans' | 'add_risk' | 'list_risks' | 'auto_detect_risks' | 'set_dependency' | 'get_dependencies' | 'migrate_programs' | 'pause_plan' | 'resume_plan' | 'set_workflow_mode' | 'get_workflow_mode';

export interface MemoryPlanParams {
  action: PlanAction;
  workspace_id?: string;
  workspace_path?: string;
  plan_id?: string;
  title?: string;
  description?: string;
  category?: RequestCategory;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  steps?: Omit<PlanStep, 'index'>[];
  include_archived?: boolean;
  plan_file_path?: string;
  note?: string;
  note_type?: 'info' | 'warning' | 'instruction';
  categorization?: RequestCategorization;
  confirm?: boolean;  // For delete action
  step_indices?: number[];  // For consolidate action
  consolidated_task?: string;  // For consolidate action
  // Goals and success criteria params
  goals?: string[];
  success_criteria?: string[];
  // Build script params
  script_name?: string;
  script_description?: string;
  script_command?: string;
  script_directory?: string;
  script_mcp_handle?: string;
  script_id?: string;
  // Template params
  template?: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'analysis' | 'investigation';
  // Confirmation params
  confirmation_scope?: 'phase' | 'step';
  confirm_phase?: string;
  confirm_step_index?: number;
  confirmed_by?: string;
  // Approval summon params
  approval_step_index?: number;
  approval_session_id?: string;
  // Cleanup approval summon params
  cleanup_report_path?: string;
  cleanup_form_request?: Record<string, unknown>;
  cleanup_response_mapping?: Record<string, unknown>[];
  // Program params
  program_id?: string;
  move_steps_to_child?: boolean;
  child_plan_title?: string;
  // Dependency params
  depends_on_plans?: string[];
  // Clone params
  new_title?: string;
  reset_steps?: boolean;
  link_to_same_program?: boolean;
  // Merge params
  target_plan_id?: string;
  source_plan_ids?: string[];
  archive_sources?: boolean;
  // Pause/resume params
  pause_reason?: 'rejected' | 'timeout' | 'deferred';
  pause_step_index?: number;
  pause_user_notes?: string;
  pause_session_id?: string;
  // Workflow mode params
  workflow_mode?: string;
  // Program v2 risk params
  risk_type?: RiskType;
  risk_severity?: RiskSeverity;
  risk_status?: RiskStatus;
  risk_title?: string;
  risk_description?: string;
  risk_mitigation?: string;
  risk_detected_by?: 'auto' | 'manual';
  risk_source_plan_id?: string;
  risk_id?: string;
  // Program v2 dependency params
  source_plan_id?: string;
  source_phase?: string;
  target_plan_id_dep?: string;
  target_phase?: string;
  dependency_type?: DependencyType;
}

type PlanResult = 
  | { action: 'list'; data: planTools.ListPlansResult }
  | { action: 'get'; data: PlanState; migration_hint?: programTools.MigrationAdvisory }
  | { action: 'create'; data: PlanState }
  | { action: 'update'; data: PlanOperationResult }
  | { action: 'archive'; data: PlanState }
  | { action: 'import'; data: ImportPlanResult }
  | { action: 'find'; data: planTools.FindPlanResult }
  | { action: 'add_note'; data: { plan_id: string; notes_count: number } }
  | { action: 'delete'; data: { deleted: boolean; plan_id: string } }
  | { action: 'consolidate'; data: PlanOperationResult }
  | { action: 'set_goals'; data: planTools.SetGoalsResult }
  | { action: 'add_build_script'; data: AddBuildScriptResult }
  | { action: 'list_build_scripts'; data: ListBuildScriptsResult }
  | { action: 'run_build_script'; data: RunBuildScriptResult }
  | { action: 'delete_build_script'; data: DeleteBuildScriptResult }
  | { action: 'create_from_template'; data: PlanState }
  | { action: 'list_templates'; data: planTools.PlanTemplateSteps[] }
  | { action: 'confirm'; data: { plan_state: PlanState; confirmation: unknown } }
  | { action: 'summon_approval'; data: {
      plan_id: string;
      step_index: number;
      approved: boolean;
      outcome: import('../../types/gui-forms.types.js').ApprovalRoutingOutcome;
      path: 'gui' | 'fallback';
      paused: boolean;
      status: string;
      elapsed_ms: number;
      user_notes?: string;
      requires_handoff_to_coordinator?: boolean;
      handoff_instruction?: string;
      confirmation_recorded?: boolean;
      paused_at_snapshot?: import('../../types/plan.types.js').PausedAtSnapshot;
    } }
  | { action: 'summon_cleanup_approval'; data: {
      workspace_id: string;
      request_id?: string;
      session_id?: string;
      form_status: FormStatus;
      response_mapping_count: number;
      approved_action_count: number;
      no_mutation_count: number;
      elapsed_ms: number;
      approved_actions: Array<{
        question_id: string;
        plan_id?: string;
        mcp_action: 'memory_plan';
        mcp_params: Record<string, unknown>;
        notes?: string;
      }>;
      decisions: Array<{
        question_id: string;
        plan_id?: string;
        decision: 'approve' | 'reject' | 'defer' | 'no_decision';
        notes?: string;
        mapped: boolean;
      }>;
      warnings?: string[];
    } }
  | { action: 'create_program'; data: ProgramState }
  | { action: 'add_plan_to_program'; data: ProgramManifest }
  | { action: 'upgrade_to_program'; data: { program: ProgramState; manifest: ProgramManifest } }
  | { action: 'list_program_plans'; data: programTools.ProgramPlanSummary[] }
  | { action: 'export_plan'; data: planTools.ExportPlanResult }
  | { action: 'link_to_program'; data: { program: PlanState; plan: PlanState } }
  | { action: 'unlink_from_program'; data: { program: PlanState; plan: PlanState } }
  | { action: 'set_plan_dependencies'; data: { plan_id: string; depends_on_plans: string[]; message: string } }
  | { action: 'get_plan_dependencies'; data: GetPlanDependenciesResult }
  | { action: 'set_plan_priority'; data: planTools.SetPlanPriorityResult }
  | { action: 'clone_plan'; data: ClonePlanResult }
  | { action: 'merge_plans'; data: MergePlansResult }
  | { action: 'add_risk'; data: ProgramRisk }
  | { action: 'list_risks'; data: ProgramRisk[] }
  | { action: 'auto_detect_risks'; data: programTools.AutoDetectResult }
  | { action: 'set_dependency'; data: programTools.SetDependencyResult }
  | { action: 'get_dependencies'; data: ProgramDependency[] }
  | { action: 'migrate_programs'; data: programTools.MigrationReport }
  | { action: 'pause_plan'; data: { plan_id: string; status: string; paused_at_snapshot: import('../../types/plan.types.js').PausedAtSnapshot } }
  | { action: 'resume_plan'; data: { plan_id: string; status: string; step_index: number; phase: string } }
  | { action: 'set_workflow_mode'; data: planTools.SetWorkflowModeResult }
  | { action: 'get_workflow_mode'; data: planTools.GetWorkflowModeResult };

const PATH_LIKE_EXTENSIONS = new Set([
  '.ps1',
  '.sh',
  '.cmd',
  '.bat',
  '.exe',
  '.js',
  '.ts',
  '.mjs',
  '.cjs'
]);

function isPathLikeToken(token: string): boolean {
  if (!token) {
    return false;
  }

  if (path.isAbsolute(token)) {
    return true;
  }

  if (token.startsWith('./') || token.startsWith('.\\')) {
    return true;
  }

  if (token.includes('/') || token.includes('\\')) {
    return true;
  }

  const extension = path.extname(token).toLowerCase();
  return PATH_LIKE_EXTENSIONS.has(extension);
}

function resolveScriptPaths(script: BuildScript, workspaceRoot: string): BuildScript {
  const directoryPath = path.isAbsolute(script.directory)
    ? script.directory
    : path.resolve(workspaceRoot, script.directory);
  const tokens = script.command ? fileStore.parseCommandTokens(script.command) : [];
  const commandToken = tokens[0] ?? '';
  let commandPath: string | undefined;

  if (commandToken && isPathLikeToken(commandToken)) {
    commandPath = path.isAbsolute(commandToken)
      ? commandToken
      : path.resolve(directoryPath, commandToken);
  }

  return {
    ...script,
    directory_path: directoryPath,
    command_path: commandPath
  };
}

type CleanupDecision = 'approve' | 'reject' | 'defer' | 'no_decision';

interface CleanupDecisionEntry {
  decision: CleanupDecision;
  notes?: string;
}

interface CleanupApprovalBatchPayload {
  formRequest: Record<string, unknown>;
  responseMapping: Record<string, unknown>[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseCleanupDecision(rawDecision: string | undefined): CleanupDecision | undefined {
  if (!rawDecision) {
    return undefined;
  }
  if (rawDecision === 'approve' || rawDecision === 'reject' || rawDecision === 'defer' || rawDecision === 'no_decision') {
    return rawDecision;
  }
  return undefined;
}

function decisionPriority(decision: CleanupDecision): number {
  switch (decision) {
    case 'approve':
      return 4;
    case 'reject':
      return 3;
    case 'defer':
      return 2;
    case 'no_decision':
    default:
      return 1;
  }
}

function upsertCleanupDecision(
  decisions: Map<string, CleanupDecisionEntry>,
  questionId: string,
  incoming: CleanupDecisionEntry,
): void {
  const existing = decisions.get(questionId);
  if (!existing) {
    decisions.set(questionId, incoming);
    return;
  }

  if (decisionPriority(incoming.decision) > decisionPriority(existing.decision)) {
    decisions.set(questionId, incoming);
    return;
  }

  if (!existing.notes && incoming.notes) {
    decisions.set(questionId, { ...existing, notes: incoming.notes });
  }
}

function defaultDecisionForFormStatus(status: FormStatus): CleanupDecision {
  switch (status) {
    case 'timed_out':
    case 'deferred':
    case 'refinement_requested':
      return 'defer';
    case 'cancelled':
      return 'reject';
    case 'completed':
    default:
      return 'no_decision';
  }
}

function extractCleanupDecisions(response: FormResponse): Map<string, CleanupDecisionEntry> {
  const decisions = new Map<string, CleanupDecisionEntry>();
  const answers = Array.isArray(response.answers) ? response.answers as unknown[] : [];

  for (const rawAnswer of answers) {
    if (!isObjectRecord(rawAnswer)) {
      continue;
    }

    const questionId = readStringField(rawAnswer, 'question_id');
    const value = rawAnswer.value;
    if (!isObjectRecord(value)) {
      continue;
    }

    const valueType = readStringField(value, 'type');
    if ((valueType === 'confirm_reject_answer' || valueType === 'confirm_reject') && questionId) {
      const action = readStringField(value, 'action');
      const notes = readStringField(value, 'notes');
      const decision = action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : undefined;
      if (decision) {
        upsertCleanupDecision(decisions, questionId, { decision, notes });
      }
      continue;
    }

    const parseMultiSessionDecisions = (rawDecisions: unknown, topLevelNotes?: string): void => {
      if (!Array.isArray(rawDecisions)) {
        return;
      }

      for (const rawDecisionEntry of rawDecisions) {
        if (!isObjectRecord(rawDecisionEntry)) {
          continue;
        }
        const itemId = readStringField(rawDecisionEntry, 'item_id');
        const decision = parseCleanupDecision(readStringField(rawDecisionEntry, 'decision'));
        const notes = readStringField(rawDecisionEntry, 'notes') ?? topLevelNotes;
        if (itemId && decision) {
          upsertCleanupDecision(decisions, itemId, { decision, notes });
        }
      }
    };

    if (valueType === 'approval_decision_v2') {
      const decisionPayload = value.decision;
      if (!isObjectRecord(decisionPayload)) {
        continue;
      }

      const mode = readStringField(decisionPayload, 'mode');
      const topLevelNotes = readStringField(decisionPayload, 'notes');

      if (mode === 'binary' && questionId) {
        const action = readStringField(decisionPayload, 'action');
        const decision = action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : undefined;
        if (decision) {
          upsertCleanupDecision(decisions, questionId, { decision, notes: topLevelNotes });
        }
        continue;
      }

      if (mode === 'multiple_choice' && questionId) {
        const selected = readStringField(decisionPayload, 'selected');
        if (selected && selected.trim().length > 0) {
          upsertCleanupDecision(decisions, questionId, { decision: 'approve', notes: topLevelNotes });
        }
        continue;
      }

      if (mode === 'multi_approval_session') {
        parseMultiSessionDecisions(decisionPayload.decisions, topLevelNotes);
      }
      continue;
    }

    if (valueType === 'approval_session_submission_v2') {
      parseMultiSessionDecisions(value.decisions, readStringField(value, 'notes'));
    }
  }

  return decisions;
}

async function resolveCleanupApprovalBatch(
  params: MemoryPlanParams,
): Promise<{ batch?: CleanupApprovalBatchPayload; error?: string }> {
  if (params.cleanup_form_request || params.cleanup_response_mapping) {
    if (!params.cleanup_form_request || !params.cleanup_response_mapping) {
      return {
        error: 'cleanup_form_request and cleanup_response_mapping must be provided together for action: summon_cleanup_approval',
      };
    }

    return {
      batch: {
        formRequest: params.cleanup_form_request,
        responseMapping: params.cleanup_response_mapping,
      },
    };
  }

  if (!params.cleanup_report_path) {
    return {
      error: 'cleanup_report_path is required (or provide cleanup_form_request + cleanup_response_mapping) for action: summon_cleanup_approval',
    };
  }

  const resolvedReportPath = path.isAbsolute(params.cleanup_report_path)
    ? params.cleanup_report_path
    : path.resolve(process.cwd(), params.cleanup_report_path);

  try {
    const content = await fs.readFile(resolvedReportPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!isObjectRecord(parsed)) {
      return { error: `Cleanup report payload is not an object: ${resolvedReportPath}` };
    }

    const batch = parsed.approval_gui_batch;
    if (!isObjectRecord(batch)) {
      return { error: `cleanup report is missing approval_gui_batch: ${resolvedReportPath}` };
    }

    const formRequest = batch.form_request;
    const responseMapping = batch.response_mapping;
    if (!isObjectRecord(formRequest)) {
      return { error: `cleanup report approval_gui_batch.form_request is invalid: ${resolvedReportPath}` };
    }
    if (!Array.isArray(responseMapping)) {
      return { error: `cleanup report approval_gui_batch.response_mapping is invalid: ${resolvedReportPath}` };
    }

    return {
      batch: {
        formRequest,
        responseMapping: responseMapping.filter(isObjectRecord),
      },
    };
  } catch (error) {
    return {
      error: `Failed to load cleanup report at ${resolvedReportPath}: ${(error as Error).message}`,
    };
  }
}

export async function memoryPlan(params: MemoryPlanParams): Promise<ToolResponse<PlanResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates, confirm, summon_approval, summon_cleanup_approval, create_program, add_plan_to_program, upgrade_to_program, list_program_plans, link_to_program, unlink_from_program, set_plan_dependencies, get_plan_dependencies, set_plan_priority, clone_plan, merge_plans, add_risk, list_risks, auto_detect_risks, set_dependency, get_dependencies, migrate_programs'
    };
  }

  // Validate and resolve workspace_id (handles legacy ID redirect)
  if (params.workspace_id) {
    const validated = await validateAndResolveWorkspaceId(params.workspace_id);
    if (!validated.success) return validated.error_response as ToolResponse<PlanResult>;
    params.workspace_id = validated.workspace_id;
  }

  // Preflight validation — catch missing required fields early
  const preflight = preflightValidate('memory_plan', action, params as unknown as Record<string, unknown>);
  if (!preflight.valid) {
    return { success: false, error: preflight.message, preflight_failure: preflight } as ToolResponse<PlanResult>;
  }

  switch (action) {
    case 'list': {
      if (!params.workspace_id && !params.workspace_path) {
        return {
          success: false,
          error: 'workspace_id or workspace_path is required for action: list'
        };
      }
      const result = await planTools.listPlans({
        workspace_id: params.workspace_id,
        workspace_path: params.workspace_path
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'list', data: result.data! }
      };
    }

    case 'get': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: get'
        };
      }
      const result = await planTools.getPlanState({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      const advisory = programTools.detectSinglePlanAdvisory(result.data!);
      return {
        success: true,
        data: {
          action: 'get',
          data: result.data!,
          ...(advisory !== null ? { migration_hint: advisory } : {})
        }
      };
    }

    case 'create': {
      if (!params.workspace_id || !params.title || !params.description || !params.category) {
        return {
          success: false,
          error: 'workspace_id, title, description, and category are required for action: create'
        };
      }
      const result = await planTools.createPlan({
        workspace_id: params.workspace_id,
        title: params.title,
        description: params.description,
        category: params.category,
        priority: params.priority,
        categorization: params.categorization,
        goals: params.goals,
        success_criteria: params.success_criteria
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'create', data: result.data! }
      };
    }

    case 'update': {
      if (!params.workspace_id || !params.plan_id || !params.steps) {
        return {
          success: false,
          error: 'workspace_id, plan_id, and steps are required for action: update'
        };
      }
      const result = await planTools.modifyPlan({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        new_steps: params.steps
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'update', data: result.data! }
      };
    }

    case 'archive': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: archive'
        };
      }
      const result = await planTools.archivePlan({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'archive', data: result.data! }
      };
    }

    case 'import': {
      if (!params.workspace_id || !params.plan_file_path || !params.category) {
        return {
          success: false,
          error: 'workspace_id, plan_file_path, and category are required for action: import'
        };
      }
      const result = await planTools.importPlan({
        workspace_id: params.workspace_id,
        plan_file_path: params.plan_file_path,
        title: params.title,
        category: params.category,
        priority: params.priority,
        categorization: params.categorization
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'import', data: result.data! }
      };
    }

    case 'find': {
      if (!params.plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: find'
        };
      }
      const result = await planTools.findPlan({ plan_id: params.plan_id });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'find', data: result.data! }
      };
    }

    case 'add_note': {
      if (!params.workspace_id || !params.plan_id || !params.note) {
        return {
          success: false,
          error: 'workspace_id, plan_id, and note are required for action: add_note'
        };
      }
      const result = await planTools.addPlanNote({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        note: params.note,
        type: params.note_type
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'add_note', data: result.data! }
      };
    }

    case 'delete': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: delete'
        };
      }
      if (params.confirm !== true) {
        return {
          success: false,
          error: 'confirm=true is required for plan deletion. This action cannot be undone.'
        };
      }
      const result = await planTools.deletePlan({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        confirm: params.confirm
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'delete', data: result.data! }
      };
    }

    case 'consolidate': {
      if (!params.workspace_id || !params.plan_id || !params.step_indices || !params.consolidated_task) {
        return {
          success: false,
          error: 'workspace_id, plan_id, step_indices, and consolidated_task are required for action: consolidate'
        };
      }
      const result = await planTools.consolidateSteps({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        step_indices: params.step_indices,
        consolidated_task: params.consolidated_task
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'consolidate', data: result.data! }
      };
    }

    case 'add_build_script': {
      if (!params.workspace_id || !params.script_name || !params.script_command || !params.script_directory) {
        return {
          success: false,
          error: 'workspace_id, script_name, script_command, and script_directory are required for action: add_build_script'
        };
      }
      const scriptData = {
        name: params.script_name,
        description: params.script_description || '',
        command: params.script_command,
        directory: params.script_directory,
        mcp_handle: params.script_mcp_handle
      };
      const script = await fileStore.addBuildScript(
        params.workspace_id,
        scriptData,
        params.plan_id
      );
      return {
        success: true,
        data: { action: 'add_build_script', data: { script } }
      };
    }

    case 'list_build_scripts': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: list_build_scripts'
        };
      }
      const workspace = await fileStore.getWorkspace(params.workspace_id);
      const workspaceRoot = workspace?.workspace_path ?? workspace?.path;
      const scripts = await fileStore.getBuildScripts(params.workspace_id, params.plan_id);
      const scriptsWithPaths = workspaceRoot
        ? scripts.map(script => resolveScriptPaths(script, workspaceRoot))
        : scripts;
      return {
        success: true,
        data: { action: 'list_build_scripts', data: { scripts: scriptsWithPaths } }
      };
    }

    case 'run_build_script': {
      if (!params.workspace_id || !params.script_id) {
        return {
          success: false,
          error: 'workspace_id and script_id are required for action: run_build_script'
        };
      }
      const script = await fileStore.findBuildScript(
        params.workspace_id,
        params.script_id,
        params.plan_id
      );
      if (!script) {
        return {
          success: false,
          error: `Script ${params.script_id} not found`
        };
      }
      const workspaceForScript = await fileStore.getWorkspace(params.workspace_id);
      const scriptRoot = workspaceForScript?.path ?? '';
      const resolved = resolveScriptPaths(script, scriptRoot);
      return {
        success: true,
        data: {
          action: 'run_build_script',
          data: {
            script_id: resolved.id,
            script_name: resolved.name,
            command: resolved.command,
            directory: resolved.directory,
            directory_path: resolved.directory_path ?? resolved.directory,
            command_path: resolved.command_path,
            message: `Run this command in your terminal: ${resolved.command} (working directory: ${resolved.directory_path ?? resolved.directory})`
          }
        }
      };
    }

    case 'delete_build_script': {
      if (!params.workspace_id || !params.script_id) {
        return {
          success: false,
          error: 'workspace_id and script_id are required for action: delete_build_script'
        };
      }
      const deleted = await fileStore.deleteBuildScript(
        params.workspace_id,
        params.script_id,
        params.plan_id
      );
      return {
        success: true,
        data: { action: 'delete_build_script', data: { deleted, script_id: params.script_id } }
      };
    }

    case 'set_goals': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: set_goals'
        };
      }
      if (!params.goals && !params.success_criteria) {
        return {
          success: false,
          error: 'At least one of goals or success_criteria is required for action: set_goals'
        };
      }
      const result = await planTools.setGoals({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        goals: params.goals,
        success_criteria: params.success_criteria
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'set_goals', data: result.data! }
      };
    }

    case 'create_from_template': {
      if (!params.workspace_id || !params.template || !params.title || !params.description) {
        return {
          success: false,
          error: 'workspace_id, template, title, and description are required for action: create_from_template'
        };
      }
      const result = await planTools.createPlanFromTemplate({
        workspace_id: params.workspace_id,
        template: params.template,
        title: params.title,
        description: params.description,
        priority: params.priority
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'create_from_template', data: result.data! }
      };
    }

    case 'list_templates': {
      const templates = planTools.getTemplates();
      return {
        success: true,
        data: { action: 'list_templates', data: templates }
      };
    }

    case 'confirm': {
      if (!params.workspace_id || !params.plan_id || !params.confirmation_scope) {
        return {
          success: false,
          error: 'workspace_id, plan_id, and confirmation_scope are required for action: confirm'
        };
      }

      if (params.confirmation_scope === 'phase') {
        if (!params.confirm_phase) {
          return {
            success: false,
            error: 'confirm_phase is required when confirmation_scope is phase'
          };
        }
        const result = await planTools.confirmPhase({
          workspace_id: params.workspace_id,
          plan_id: params.plan_id,
          phase: params.confirm_phase,
          confirmed_by: params.confirmed_by
        });
        if (!result.success) {
          const baseError = result.error ?? 'Failed to confirm phase';
          return {
            success: false,
            error: maybeAttachCoordinatorHandoffInstruction(baseError, {
              workspace_id: params.workspace_id,
              plan_id: params.plan_id,
            }),
          };
        }
        return {
          success: true,
          data: { action: 'confirm', data: result.data! }
        };
      }

      if (params.confirmation_scope === 'step') {
        if (params.confirm_step_index === undefined) {
          return {
            success: false,
            error: 'confirm_step_index is required when confirmation_scope is step'
          };
        }
        const result = await planTools.confirmStep({
          workspace_id: params.workspace_id,
          plan_id: params.plan_id,
          step_index: params.confirm_step_index,
          confirmed_by: params.confirmed_by
        });
        if (!result.success) {
          const baseError = result.error ?? 'Failed to confirm step';
          return {
            success: false,
            error: maybeAttachCoordinatorHandoffInstruction(baseError, {
              workspace_id: params.workspace_id,
              plan_id: params.plan_id,
              step_index: params.confirm_step_index,
            }),
          };
        }
        return {
          success: true,
          data: { action: 'confirm', data: result.data! }
        };
      }

      return {
        success: false,
        error: `Unknown confirmation_scope: ${params.confirmation_scope}`
      };
    }

    case 'summon_approval': {
      if (!params.workspace_id || !params.plan_id || params.approval_step_index === undefined) {
        return {
          success: false,
          error: 'workspace_id, plan_id, and approval_step_index are required for action: summon_approval'
        };
      }

      const state = await fileStore.getPlanState(params.workspace_id, params.plan_id);
      if (!state) {
        return {
          success: false,
          error: `Plan not found: ${params.plan_id}`
        };
      }

      const targetStep = state.steps.find((step) => step.index === params.approval_step_index);
      if (!targetStep) {
        return {
          success: false,
          error: `Step not found: ${params.approval_step_index}`
        };
      }

      const approvalSessionId = params.approval_session_id && params.approval_session_id.trim().length > 0
        ? params.approval_session_id
        : `approval_gate_${params.plan_id}_${params.approval_step_index}_${Date.now()}`;

      const gateResult = await routeApprovalGate(
        state,
        params.approval_step_index,
        approvalSessionId,
      );

      if (gateResult.approved) {
        const confirmResult = await planTools.confirmStep({
          workspace_id: params.workspace_id,
          plan_id: params.plan_id,
          step_index: params.approval_step_index,
          confirmed_by: 'approval_gui',
        });

        if (!confirmResult.success) {
          return {
            success: false,
            error: confirmResult.error ?? 'Approval succeeded, but step confirmation could not be recorded',
          };
        }

        return {
          success: true,
          data: {
            action: 'summon_approval',
            data: {
              plan_id: params.plan_id,
              step_index: params.approval_step_index,
              approved: true,
              outcome: gateResult.outcome,
              path: gateResult.path,
              paused: false,
              status: confirmResult.data?.plan_state.status ?? state.status,
              elapsed_ms: gateResult.elapsed_ms,
              confirmation_recorded: true,
            }
          }
        };
      }

      let pausedState: PlanState | null = null;
      if (gateResult.paused_snapshot) {
        pausedState = await pausePlanAtApprovalGate(
          params.workspace_id,
          params.plan_id,
          gateResult.paused_snapshot,
        );
        if (!pausedState) {
          return {
            success: false,
            error: `Failed to pause plan at approval gate: ${params.plan_id}`,
          };
        }
      }

      if (gateResult.outcome === 'fallback_to_chat' || gateResult.outcome === 'error') {
        return {
          success: false,
          error: gateResult.error ?? `Approval gate failed with outcome: ${gateResult.outcome}`,
        };
      }

      return {
        success: true,
        data: {
          action: 'summon_approval',
          data: {
            plan_id: params.plan_id,
            step_index: params.approval_step_index,
            approved: false,
            outcome: gateResult.outcome,
            path: gateResult.path,
            paused: pausedState?.status === 'paused',
            status: pausedState?.status ?? state.status,
            elapsed_ms: gateResult.elapsed_ms,
            user_notes: gateResult.user_notes,
            requires_handoff_to_coordinator: gateResult.requires_handoff_to_coordinator,
            handoff_instruction: gateResult.handoff_instruction,
            paused_at_snapshot: gateResult.paused_snapshot,
          }
        }
      };
    }

    case 'summon_cleanup_approval': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: summon_cleanup_approval'
        };
      }

      const batchResult = await resolveCleanupApprovalBatch(params);
      if (!batchResult.batch) {
        return {
          success: false,
          error: batchResult.error ?? 'Failed to resolve cleanup approval payload',
        };
      }

      const { formRequest, responseMapping } = batchResult.batch;
      const metadata = isObjectRecord(formRequest.metadata)
        ? formRequest.metadata
        : undefined;
      const formWorkspaceId = metadata
        ? readStringField(metadata, 'workspace_id')
        : undefined;

      if (formWorkspaceId && formWorkspaceId !== params.workspace_id) {
        return {
          success: false,
          error: `cleanup approval payload workspace mismatch: form_request.workspace_id=${formWorkspaceId}, tool workspace_id=${params.workspace_id}`,
        };
      }

      const timeoutConfig = isObjectRecord(formRequest.timeout)
        ? formRequest.timeout
        : undefined;
      const timeoutSeconds = timeoutConfig
        ? readNumberField(timeoutConfig, 'duration_seconds')
        : undefined;

      const availability = await checkGuiAvailability();
      if (!availability.supervisor_running || !availability.approval_gui) {
        return {
          success: false,
          error: `Cleanup approval GUI unavailable: ${availability.message}`,
        };
      }

      const launchResult = await launchFormApp(
        'approval_gui',
        formRequest,
        timeoutSeconds,
      );

      const diagnosticText = (launchResult.diagnostics ?? [])
        .map((diag) => `${diag.kind}: ${diag.message}`)
        .join('; ');

      if (!launchResult.success) {
        const suffix = diagnosticText ? ` (${diagnosticText})` : '';
        return {
          success: false,
          error: `Failed to launch cleanup approval GUI: ${launchResult.error ?? 'unknown error'}${suffix}`,
        };
      }

      if (!isObjectRecord(launchResult.response_payload)) {
        return {
          success: false,
          error: 'Cleanup approval GUI returned no response payload',
        };
      }

      const formResponse = launchResult.response_payload as unknown as FormResponse;
      const formStatus = formResponse.status;
      const defaultDecision = defaultDecisionForFormStatus(formStatus);
      const decisionMap = extractCleanupDecisions(formResponse);

      const approvedActions: Array<{
        question_id: string;
        plan_id?: string;
        mcp_action: 'memory_plan';
        mcp_params: Record<string, unknown>;
        notes?: string;
      }> = [];
      const decisions: Array<{
        question_id: string;
        plan_id?: string;
        decision: 'approve' | 'reject' | 'defer' | 'no_decision';
        notes?: string;
        mapped: boolean;
      }> = [];
      const warnings: string[] = [];

      for (const rawMapping of responseMapping) {
        const questionId = readStringField(rawMapping, 'question_id');
        if (!questionId) {
          warnings.push('cleanup response_mapping entry is missing question_id; skipping entry');
          continue;
        }

        const planId = readStringField(rawMapping, 'plan_id');
        const pickedDecision = decisionMap.get(questionId);
        const decision = pickedDecision?.decision ?? defaultDecision;
        const notes = pickedDecision?.notes;
        let mapped = false;

        if (decision === 'approve') {
          const onApprove = rawMapping.on_approve;
          if (!isObjectRecord(onApprove)) {
            warnings.push(`question_id "${questionId}" approved, but on_approve mapping is missing`);
          } else {
            const mappedAction = readStringField(onApprove, 'mcp_action');
            const mappedParams = onApprove.mcp_params;
            if (mappedAction === 'memory_plan' && isObjectRecord(mappedParams)) {
              approvedActions.push({
                question_id: questionId,
                ...(planId ? { plan_id: planId } : {}),
                mcp_action: 'memory_plan',
                mcp_params: mappedParams,
                ...(notes ? { notes } : {}),
              });
              mapped = true;
            } else {
              warnings.push(`question_id "${questionId}" approved, but on_approve must map to memory_plan with object mcp_params`);
            }
          }
        } else {
          mapped = isObjectRecord(rawMapping.on_reject);
        }

        decisions.push({
          question_id: questionId,
          ...(planId ? { plan_id: planId } : {}),
          decision,
          ...(notes ? { notes } : {}),
          mapped,
        });
      }

      return {
        success: true,
        data: {
          action: 'summon_cleanup_approval',
          data: {
            workspace_id: params.workspace_id,
            request_id: readStringField(formRequest, 'request_id'),
            session_id: metadata ? readStringField(metadata, 'session_id') : undefined,
            form_status: formStatus,
            response_mapping_count: responseMapping.length,
            approved_action_count: approvedActions.length,
            no_mutation_count: decisions.length - approvedActions.length,
            elapsed_ms: launchResult.elapsed_ms,
            approved_actions: approvedActions,
            decisions,
            ...(warnings.length > 0 ? { warnings } : {}),
          },
        },
      };
    }

    // =========================================================================
    // Program Actions
    // =========================================================================

    case 'create_program': {
      if (!params.workspace_id || !params.title || !params.description) {
        return {
          success: false,
          error: 'workspace_id, title, and description are required for action: create_program'
        };
      }
      const result = await programTools.createProgram({
        workspace_id: params.workspace_id,
        title: params.title,
        description: params.description,
        priority: params.priority,
        category: params.category
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'create_program', data: result.data! }
      };
    }

    case 'add_plan_to_program': {
      if (!params.workspace_id || !params.program_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id, program_id, and plan_id are required for action: add_plan_to_program'
        };
      }
      const result = await programTools.addPlanToProgram(
        params.workspace_id,
        params.program_id,
        params.plan_id
      );
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'add_plan_to_program', data: result.data! }
      };
    }

    case 'upgrade_to_program': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: upgrade_to_program'
        };
      }
      const result = await programTools.upgradeToProgram(
        params.workspace_id,
        params.plan_id
      );
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'upgrade_to_program', data: result.data! }
      };
    }

    case 'list_program_plans': {
      if (!params.workspace_id || !params.program_id) {
        return {
          success: false,
          error: 'workspace_id and program_id are required for action: list_program_plans'
        };
      }
      const result = await programTools.listProgramPlans(
        params.workspace_id,
        params.program_id
      );
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'list_program_plans', data: result.data! }
      };
    }

    case 'export_plan': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: export_plan'
        };
      }
      const result = await planTools.exportPlan({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        workspace_path: params.workspace_path,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'export_plan', data: result.data! }
      };
    }

    // =========================================================================
    // New Plan Management Actions
    // =========================================================================

    case 'link_to_program': {
      if (!params.workspace_id || !params.program_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id, program_id, and plan_id are required for action: link_to_program'
        };
      }
      const result = await planTools.linkToProgram({
        workspace_id: params.workspace_id,
        program_id: params.program_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'link_to_program', data: result.data! }
      };
    }

    case 'unlink_from_program': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: unlink_from_program'
        };
      }
      const result = await planTools.unlinkFromProgram({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'unlink_from_program', data: result.data! }
      };
    }

    case 'set_plan_dependencies': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: set_plan_dependencies'
        };
      }
      const result = await planTools.setPlanDependencies({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        depends_on_plans: params.depends_on_plans || []
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'set_plan_dependencies', data: result.data! }
      };
    }

    case 'get_plan_dependencies': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: get_plan_dependencies'
        };
      }
      const result = await planTools.getPlanDependencies({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'get_plan_dependencies', data: result.data! }
      };
    }

    case 'set_plan_priority': {
      if (!params.workspace_id || !params.plan_id || !params.priority) {
        return {
          success: false,
          error: 'workspace_id, plan_id, and priority are required for action: set_plan_priority'
        };
      }
      const result = await planTools.setPlanPriority({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        priority: params.priority
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'set_plan_priority', data: result.data! }
      };
    }

    case 'clone_plan': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: clone_plan'
        };
      }
      const result = await planTools.clonePlan({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        new_title: params.new_title,
        reset_steps: params.reset_steps,
        link_to_same_program: params.link_to_same_program
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'clone_plan', data: result.data! }
      };
    }

    case 'merge_plans': {
      if (!params.workspace_id || !params.target_plan_id || !params.source_plan_ids) {
        return {
          success: false,
          error: 'workspace_id, target_plan_id, and source_plan_ids are required for action: merge_plans'
        };
      }
      const result = await planTools.mergePlans({
        workspace_id: params.workspace_id,
        target_plan_id: params.target_plan_id,
        source_plan_ids: params.source_plan_ids,
        archive_sources: params.archive_sources
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'merge_plans', data: result.data! }
      };
    }

    // =========================================================================
    // Program V2 Actions (risks, dependencies, migration)
    // =========================================================================

    case 'add_risk': {
      if (!params.workspace_id || !params.program_id || !params.risk_title) {
        return {
          success: false,
          error: 'workspace_id, program_id, and risk_title are required for action: add_risk'
        };
      }
      try {
        const risk = await programTools.addRisk(
          params.workspace_id,
          params.program_id,
          {
            program_id: params.program_id,
            type: params.risk_type ?? 'dependency_risk',
            severity: params.risk_severity ?? 'medium',
            status: params.risk_status ?? 'identified',
            title: params.risk_title,
            description: params.risk_description ?? '',
            mitigation: params.risk_mitigation,
            detected_by: params.risk_detected_by ?? 'manual',
            source_plan_id: params.risk_source_plan_id,
          }
        );
        return {
          success: true,
          data: { action: 'add_risk', data: risk }
        };
      } catch (error) {
        return { success: false, error: `Failed to add risk: ${(error as Error).message}` };
      }
    }

    case 'list_risks': {
      if (!params.workspace_id || !params.program_id) {
        return {
          success: false,
          error: 'workspace_id and program_id are required for action: list_risks'
        };
      }
      try {
        const risks = await programTools.listRisks(
          params.workspace_id,
          params.program_id,
          {
            severity: params.risk_severity,
            status: params.risk_status,
            type: params.risk_type,
          }
        );
        return {
          success: true,
          data: { action: 'list_risks', data: risks }
        };
      } catch (error) {
        return { success: false, error: `Failed to list risks: ${(error as Error).message}` };
      }
    }

    case 'auto_detect_risks': {
      if (!params.workspace_id || !params.program_id) {
        return {
          success: false,
          error: 'workspace_id and program_id are required for action: auto_detect_risks'
        };
      }
      try {
        const result = await programTools.autoDetectRisks(
          params.workspace_id,
          params.program_id
        );
        return {
          success: true,
          data: { action: 'auto_detect_risks', data: result }
        };
      } catch (error) {
        return { success: false, error: `Failed to auto-detect risks: ${(error as Error).message}` };
      }
    }

    case 'set_dependency': {
      if (!params.workspace_id || !params.program_id || !params.source_plan_id || !params.target_plan_id_dep) {
        return {
          success: false,
          error: 'workspace_id, program_id, source_plan_id, and target_plan_id_dep are required for action: set_dependency'
        };
      }
      try {
        const result = await programTools.setDependency(
          params.workspace_id,
          params.program_id,
          {
            source_plan_id: params.source_plan_id,
            source_phase: params.source_phase,
            target_plan_id: params.target_plan_id_dep,
            target_phase: params.target_phase,
            type: params.dependency_type ?? 'blocks',
          }
        );
        return {
          success: true,
          data: { action: 'set_dependency', data: result }
        };
      } catch (error) {
        return { success: false, error: `Failed to set dependency: ${(error as Error).message}` };
      }
    }

    case 'get_dependencies': {
      if (!params.workspace_id || !params.program_id) {
        return {
          success: false,
          error: 'workspace_id and program_id are required for action: get_dependencies'
        };
      }
      try {
        const deps = await programTools.getDependencies(
          params.workspace_id,
          params.program_id
        );
        return {
          success: true,
          data: { action: 'get_dependencies', data: deps }
        };
      } catch (error) {
        return { success: false, error: `Failed to get dependencies: ${(error as Error).message}` };
      }
    }

    case 'migrate_programs': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: migrate_programs'
        };
      }
      try {
        const report = await programTools.migratePrograms(params.workspace_id);
        return {
          success: true,
          data: { action: 'migrate_programs', data: report }
        };
      } catch (error) {
        return { success: false, error: `Failed to migrate programs: ${(error as Error).message}` };
      }
    }

    case 'pause_plan': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: pause_plan'
        };
      }
      if (!params.pause_reason) {
        return {
          success: false,
          error: 'pause_reason is required for action: pause_plan (rejected | timeout | deferred)'
        };
      }
      try {
        const state = await fileStore.getPlanState(params.workspace_id, params.plan_id);
        if (!state) {
          return { success: false, error: `Plan not found: ${params.plan_id}` };
        }

        const stepIndex = params.pause_step_index ?? 0;
        const step = state.steps[stepIndex];

        const snapshot: import('../../types/plan.types.js').PausedAtSnapshot = {
          paused_at: new Date().toISOString(),
          step_index: stepIndex,
          phase: step?.phase ?? state.current_phase,
          step_task: step?.task ?? 'Unknown',
          reason: params.pause_reason,
          user_notes: params.pause_user_notes,
          session_id: params.pause_session_id,
        };

        state.paused_at_snapshot = snapshot;
        state.status = 'paused';
        state.updated_at = new Date().toISOString();

        await fileStore.savePlanState(state);
        await fileStore.generatePlanMd(state);

        return {
          success: true,
          data: { action: 'pause_plan', data: { plan_id: params.plan_id, status: 'paused', paused_at_snapshot: snapshot } }
        };
      } catch (error) {
        return { success: false, error: `Failed to pause plan: ${(error as Error).message}` };
      }
    }

    case 'resume_plan': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: resume_plan'
        };
      }
      try {
        const state = await fileStore.getPlanState(params.workspace_id, params.plan_id);
        if (!state) {
          return { success: false, error: `Plan not found: ${params.plan_id}` };
        }
        if (state.status !== 'paused') {
          return { success: false, error: `Plan is not paused (status: ${state.status})` };
        }
        if (!state.paused_at_snapshot) {
          return { success: false, error: 'Plan has no paused_at_snapshot to resume from' };
        }

        const { step_index, phase } = state.paused_at_snapshot;

        state.paused_at_snapshot = undefined;
        state.status = 'active';
        state.updated_at = new Date().toISOString();

        await fileStore.savePlanState(state);
        await fileStore.generatePlanMd(state);

        return {
          success: true,
          data: { action: 'resume_plan', data: { plan_id: params.plan_id, status: 'active', step_index, phase } }
        };
      } catch (error) {
        return { success: false, error: `Failed to resume plan: ${(error as Error).message}` };
      }
    }

    case 'set_workflow_mode': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: set_workflow_mode'
        };
      }
      const result = await planTools.setWorkflowModeAction({
        workspace_id: params.workspace_id,
        plan_id:      params.plan_id,
        workflow_mode: params.workflow_mode ?? '',
      });
      if (!result.success) {
        return {
          success: false,
          error: result.error ?? 'Failed to set workflow mode',
        };
      }
      return { success: true, data: { action: 'set_workflow_mode', data: result.data! } };
    }

    case 'get_workflow_mode': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: get_workflow_mode'
        };
      }
      const result = await planTools.getWorkflowModeAction({
        workspace_id: params.workspace_id,
        plan_id:      params.plan_id,
      });
      if (!result.success) {
        return {
          success: false,
          error: result.error ?? 'Failed to get workflow mode',
        };
      }
      return { success: true, data: { action: 'get_workflow_mode', data: result.data! } };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates, confirm, summon_approval, summon_cleanup_approval, create_program, add_plan_to_program, upgrade_to_program, list_program_plans, export_plan, link_to_program, unlink_from_program, set_plan_dependencies, get_plan_dependencies, set_plan_priority, clone_plan, merge_plans, add_risk, list_risks, auto_detect_risks, set_dependency, get_dependencies, migrate_programs, pause_plan, resume_plan, set_workflow_mode, get_workflow_mode`
      };
  }
}
