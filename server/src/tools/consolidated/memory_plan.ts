/**
 * Consolidated Plan Tool - memory_plan
 * 
 * Actions: list, get, create, update, archive, import, find, add_note,
 *          delete, consolidate, set_goals, build scripts, templates, confirm,
 *          create_program, add_plan_to_program, upgrade_to_program, list_program_plans
 */

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
  ProgramPlansResult,
} from '../../types/index.js';
import * as planTools from '../plan/index.js';
import * as fileStore from '../../storage/file-store.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';

export type PlanAction = 'list' | 'get' | 'create' | 'update' | 'archive' | 'import' | 'find' | 'add_note' | 'delete' | 'consolidate' | 'set_goals' | 'add_build_script' | 'list_build_scripts' | 'run_build_script' | 'delete_build_script' | 'create_from_template' | 'list_templates' | 'confirm' | 'create_program' | 'add_plan_to_program' | 'upgrade_to_program' | 'list_program_plans' | 'export_plan';

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
  // Program params
  program_id?: string;
  move_steps_to_child?: boolean;
  child_plan_title?: string;
}

type PlanResult = 
  | { action: 'list'; data: planTools.ListPlansResult }
  | { action: 'get'; data: PlanState }
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
  | { action: 'create_program'; data: PlanState }
  | { action: 'add_plan_to_program'; data: { program: PlanState; plan: PlanState } }
  | { action: 'upgrade_to_program'; data: { program: PlanState; child_plan?: PlanState } }
  | { action: 'list_program_plans'; data: ProgramPlansResult }
  | { action: 'export_plan'; data: planTools.ExportPlanResult };

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

export async function memoryPlan(params: MemoryPlanParams): Promise<ToolResponse<PlanResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates, confirm, create_program, add_plan_to_program, upgrade_to_program, list_program_plans'
    };
  }

  // Validate and resolve workspace_id (handles legacy ID redirect)
  if (params.workspace_id) {
    const validated = await validateAndResolveWorkspaceId(params.workspace_id);
    if (!validated.success) return validated.error_response as ToolResponse<PlanResult>;
    params.workspace_id = validated.workspace_id;
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
      return {
        success: true,
        data: { action: 'get', data: result.data! }
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
          return { success: false, error: result.error };
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
          return { success: false, error: result.error };
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
      const result = await planTools.createProgram({
        workspace_id: params.workspace_id,
        title: params.title,
        description: params.description,
        priority: params.priority
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
      const result = await planTools.addPlanToProgram({
        workspace_id: params.workspace_id,
        program_id: params.program_id,
        plan_id: params.plan_id
      });
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
      const result = await planTools.upgradeToProgram({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        move_steps_to_child: params.move_steps_to_child,
        child_plan_title: params.child_plan_title
      });
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
      const result = await planTools.listProgramPlans({
        workspace_id: params.workspace_id,
        program_id: params.program_id
      });
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

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates, confirm, create_program, add_plan_to_program, upgrade_to_program, list_program_plans, export_plan`
      };
  }
}
