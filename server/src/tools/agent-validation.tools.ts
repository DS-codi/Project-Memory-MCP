/**
 * Agent Validation Tools - Per-agent validation that MUST be called after initialise_agent
 * 
 * Each agent has a dedicated validation tool that:
 * 1. Verifies this is the correct agent for the current phase/task
 * 2. Returns role boundaries and constraints
 * 3. Directs the agent to switch if they're not appropriate for the work
 * 
 * The validation uses:
 * - Current phase from plan state
 * - Request categorization from coordinator
 * - Task keywords to match agent specialties
 */

import type {
  AgentType,
  PlanState,
  ToolResponse,
  AgentRoleBoundaries,
  PlanStep
} from '../types/index.js';
import { AGENT_BOUNDARIES } from '../types/index.js';
import * as store from '../storage/db-store.js';

// =============================================================================
// Phase to Agent Mapping - Which agents handle which phases
// =============================================================================

const PHASE_AGENT_MAP: Record<string, AgentType[]> = {
  // Planning phases
  'planning': ['Coordinator', 'Architect'],
  'categorization': ['Coordinator'],
  'analysis': ['Analyst', 'Coordinator', 'Researcher'],
  'audit': ['Researcher', 'Coordinator'],
  'research': ['Analyst', 'Researcher'],  // Analyst can do research phases directly
  'brainstorm': ['Brainstorm'],
  'ideation': ['Brainstorm'],
  'exploration': ['Brainstorm'],
  
  // Investigation phases (Analyst-specific)
  'investigation': ['Analyst'],
  'reconnaissance': ['Analyst'],
  'structure_discovery': ['Analyst'],
  'content_decoding': ['Analyst'],
  'hypothesis': ['Analyst'],
  'experiment': ['Analyst'],
  'discovery': ['Analyst'],
  'schema_exploration': ['Analyst'],
  'data_mapping': ['Analyst'],
  'format_analysis': ['Analyst'],
  
  // Design phases
  'design': ['Architect'],
  'architecture': ['Architect'],
  'specification': ['Architect'],
  
  // Implementation phases
  'implementation': ['Executor'],
  'coding': ['Executor'],
  'development': ['Executor'],
  'building': ['Executor'],
  'creation': ['Executor'],

  // Build phases
  'build': ['Reviewer'],
  'compilation': ['Reviewer'],
  'compile': ['Reviewer'],
  
  // Testing phases
  'testing': ['Tester', 'Analyst'],  // Analyst can handle comparison/validation testing
  'verification': ['Tester', 'Analyst'],
  'validation': ['Tester', 'Analyst'],
  'test': ['Tester'],
  'comparison': ['Analyst'],
  'ground_truth': ['Analyst'],
  'tdd': ['TDDDriver'],
  'test-driven': ['TDDDriver'],
  
  // Review phases
  'review': ['Reviewer'],
  'code-review': ['Reviewer'],
  'quality': ['Reviewer'],

  // Quick execution phases (Runner)
  'runner': ['Runner'],
  'ad hoc': ['Runner'],
  'ad-hoc': ['Runner'],
  'quick': ['Runner'],
  'hotfix': ['Runner'],

  // Worker phases (delegated sub-tasks)
  'worker': ['Worker'],
  'sub-task': ['Worker'],
  'subtask': ['Worker'],
  
  // Pivot phases
  'revision': ['Revisionist'],
  'pivot': ['Revisionist'],
  'adjustment': ['Revisionist'],
  
  // Completion phases
  'documentation': ['Archivist'],
  'archival': ['Archivist'],
  'complete': ['Archivist'],
  'finalization': ['Archivist'],

  // Cognition phases (read-only reasoning)
  'cognition': ['Cognition'],
  'reasoning': ['Cognition'],
  'critique': ['Cognition']
};

// Task keywords that indicate which agent should handle
const TASK_KEYWORDS: Record<AgentType, string[]> = {
  Coordinator: ['categorize', 'analyze request', 'create plan', 'delegate', 'coordinate'],
  Analyst: ['investigate', 'decode', 'reverse engineer', 'analyze binary', 'hypothesis', 'experiment', 'parse format', 'discover structure', 'interpret bytes', 'compare with ground truth', 'compare output', 'validate against', 'analyze differences', 'verify data'],
  Brainstorm: ['brainstorm', 'ideate', 'explore options', 'compare approaches', 'trade-offs', 'alternatives', 'pros and cons'],
  Runner: ['quick fix', 'ad hoc', 'one-off', 'small change', 'fast', 'urgent', 'hotfix'],
  Researcher: ['research', 'gather', 'document findings', 'explore', 'understand'],
  Architect: ['design', 'specify', 'architecture', 'structure', 'plan implementation', 'define'],
  Executor: ['implement', 'create', 'build', 'code', 'develop', 'write', 'add', 'modify code'],
  Reviewer: ['review', 'check', 'verify code', 'quality', 'assess', 'evaluate', 'compile', 'run build', 'execute script', 'verify build', 'build error', 'compilation'],
  Tester: ['test', 'verify', 'validate', 'run tests', 'check functionality'],
  Revisionist: ['revise', 'adjust', 'pivot', 'change approach', 'modify plan'],
  Archivist: ['archive', 'document', 'finalize', 'complete', 'summarize', 'close'],
  SkillWriter: ['generate skill', 'create skill', 'skill file', 'analyze patterns', 'codebase conventions', 'SKILL.md'],
  Worker: ['sub-task', 'delegated task', 'scoped work', 'worker task'],
  TDDDriver: ['tdd', 'test-driven', 'red green refactor', 'test first', 'failing test', 'tdd cycle'],
  Cognition: ['reason', 'analyze plan', 'critique', 'ideate', 'evaluate approach', 'assess risk', 'read-only analysis'],
  Migrator: ['migrate', 'migration', 'upgrade schema', 'convert program', 'migrate program', 'schema migration', 'program migration']
};

// =============================================================================
// Validation Result Types
// =============================================================================

export interface TodoItem {
  id: number;
  title: string;
  status: 'not-started' | 'in-progress' | 'completed';
}

export interface AgentValidationResult {
  action: 'continue' | 'switch';
  current_agent: AgentType;
  role_boundaries: AgentRoleBoundaries;
  current_phase: string;
  current_step?: PlanStep;
  
  // TODO LIST - Agent should populate this using manage_todo_list tool
  todo_list: TodoItem[];
  todo_instruction: string;
  
  // If action is 'continue'
  instructions?: string;
  allowed_tools?: string[];
  
  // If action is 'switch'
  switch_to?: AgentType;
  switch_reason?: string;
  
  // Warnings
  warnings?: string[];
}

export interface ValidateAgentParams {
  workspace_id: string;
  plan_id: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine which agent should handle the current phase and task
 */
function getExpectedAgent(state: PlanState): { agent: AgentType; reason: string } {
  const phase = state.current_phase.toLowerCase();
  const currentStep = state.steps.find(s => s.status === 'active' || s.status === 'pending');
  const taskText = currentStep?.task.toLowerCase() || '';
  
  // First check phase mapping
  for (const [phaseKey, agents] of Object.entries(PHASE_AGENT_MAP)) {
    if (phase.includes(phaseKey)) {
      return { agent: agents[0], reason: `Phase "${state.current_phase}" is handled by ${agents[0]}` };
    }
  }
  
  // Then check task keywords
  for (const [agent, keywords] of Object.entries(TASK_KEYWORDS)) {
    for (const keyword of keywords) {
      if (taskText.includes(keyword)) {
        return { 
          agent: agent as AgentType, 
          reason: `Task "${currentStep?.task}" contains "${keyword}" which is ${agent}'s specialty` 
        };
      }
    }
  }
  
  // Check categorization suggested workflow
  if (state.categorization?.suggested_workflow && state.categorization.suggested_workflow.length > 0) {
    // Find which agent in the workflow hasn't completed yet
    const completedAgents = state.agent_sessions
      .filter(s => s.completed_at)
      .map(s => s.agent_type);
    
    for (const agent of state.categorization.suggested_workflow) {
      if (!completedAgents.includes(agent)) {
        return { 
          agent, 
          reason: `Next agent in suggested workflow: ${state.categorization.suggested_workflow.join(' → ')}` 
        };
      }
    }
  }
  
  // Default based on plan status
  if (state.steps.length > 0 && state.steps.every(s => s.status === 'done')) {
    return { agent: 'Archivist', reason: 'All steps complete - ready for archival' };
  }
  
  return { agent: 'Coordinator', reason: 'Unable to determine - defaulting to Coordinator' };
}

/**
 * Get tools allowed for an agent type
 */
function getAllowedTools(agentType: AgentType): string[] {
  const commonTools = ['initialise_agent', 'get_plan_state', 'handoff', 'complete_agent'];
  
  const agentTools: Record<AgentType, string[]> = {
    Coordinator: [...commonTools, 'create_plan', 'modify_plan', 'get_lineage'],
    Analyst: [...commonTools, 'create_plan', 'append_research', 'store_context', 'get_context', 'list_research_notes', 'modify_plan'],
    Brainstorm: [...commonTools, 'create_plan', 'modify_plan', 'store_context', 'get_context'],
    Runner: [...commonTools, 'create_plan', 'update_step', 'store_context', 'append_research'],
    Researcher: [...commonTools, 'append_research', 'store_context', 'list_research_notes'],
    Architect: [...commonTools, 'modify_plan', 'update_step', 'store_context'],
    Executor: [...commonTools, 'update_step', 'store_context', 'create_file', 'edit_file'],
    Reviewer: [...commonTools, 'update_step', 'store_context', 'add_build_script', 'list_build_scripts', 'run_build_script'],
    Tester: [...commonTools, 'update_step', 'store_context', 'run_tests'],
    Revisionist: [...commonTools, 'modify_plan', 'update_step', 'store_context'],
    Archivist: [...commonTools, 'archive_plan', 'reindex_workspace', 'edit_file', 'create_file'],
    SkillWriter: [...commonTools, 'update_step', 'store_context', 'list_skills', 'match_skills', 'deploy_skills'],
    Worker: [...commonTools, 'store_context', 'create_file', 'edit_file'],
    TDDDriver: [...commonTools, 'update_step', 'store_context', 'get_context', 'create_plan', 'modify_plan'],
    Cognition: [...commonTools, 'get_plan_state', 'get_context', 'list_research_notes'],
    Migrator: [...commonTools, 'update_step', 'store_context', 'create_file', 'edit_file']
  };
  
  return agentTools[agentType];
}

const BUILD_TASK_PATTERN = /build|compile|bundle|package|assemble|dist|artifact/i;

function getBuildRelatedSteps(state: PlanState): PlanStep[] {
  return state.steps.filter(step => {
    if (step.status !== 'pending' && step.status !== 'active') {
      return false;
    }

    const taskText = `${step.phase} ${step.task}`.toLowerCase();
    return step.type === 'build' || BUILD_TASK_PATTERN.test(taskText);
  });
}

/**
 * Determine if Reviewer is deployed at end-of-plan (Final Verification mode)
 * vs mid-plan (Regression Check mode) for build validation.
 */
function isEndOfPlanDeployment(state: PlanState): boolean {
  const nonBuildSteps = state.steps.filter(s => s.type !== 'build');
  return nonBuildSteps.every(s => s.status === 'done');
}

/**
 * Validate Reviewer build mode based on plan state.
 * Returns warnings/instructions for mid-plan vs end-of-plan deployment.
 */
function validateReviewerBuildMode(state: PlanState): {
  mode: 'regression_check' | 'final_verification';
  warnings: string[];
  blocked: boolean;
  blockReason?: string;
} {
  const atEndOfPlan = isEndOfPlanDeployment(state);
  const prePlanStatus = (state as PlanState & { pre_plan_build_status?: string }).pre_plan_build_status;
  const deployCtx = state.deployment_context;
  const requestedMode = deployCtx?.reason?.toLowerCase().includes('regression') ? 'regression_check' : undefined;

  if (atEndOfPlan) {
    return { mode: 'final_verification', warnings: [], blocked: false };
  }

  // Mid-plan deployment
  if (requestedMode === 'regression_check' || deployCtx?.reason?.toLowerCase().includes('regression')) {
    // Regression check requested
    if (prePlanStatus === 'passing') {
      return { mode: 'regression_check', warnings: [], blocked: false };
    }
    if (prePlanStatus === 'failing') {
      return {
        mode: 'regression_check',
        warnings: ['⚠️ pre_plan_build_status is "failing" — regression check may produce false positives. Cannot distinguish new failures from pre-existing ones.'],
        blocked: false
      };
    }
    // unknown or not set
    return {
      mode: 'regression_check',
      warnings: ['⚠️ pre_plan_build_status is "unknown" — regression check results may be unreliable. Consider setting pre_plan_build_status at plan creation.'],
      blocked: false
    };
  }

  // Mid-plan deployment without regression justification
  return {
    mode: 'regression_check',
    warnings: [
      '⚠️ Reviewer deployed mid-plan in build-check mode without regression justification.',
      'If this is intentional regression checking, set mode to "regression_check" in deployment context.',
      'Consider waiting until all phases complete for Final Verification mode.'
    ],
    blocked: false
  };
}

/**
 * Generate a todo list for the agent based on plan steps and workflow requirements
 */
function generateTodoList(
  agentType: AgentType, 
  state: PlanState, 
  boundaries: AgentRoleBoundaries,
  action: 'continue' | 'switch',
  switchTo?: AgentType
): TodoItem[] {
  const todos: TodoItem[] = [];
  let id = 1;
  
  // If wrong agent, just one todo: handoff
  if (action === 'switch' && switchTo) {
    todos.push({
      id: id++,
      title: `⚠️ WRONG AGENT - Call handoff to ${switchTo}`,
      status: 'not-started'
    });
    todos.push({
      id: id++,
      title: 'Call complete_agent with handoff summary',
      status: 'not-started'
    });
    return todos;
  }
  
  // Validation is already done (this todo is completed)
  todos.push({
    id: id++,
    title: `✅ validate_${agentType.toLowerCase()} - Confirmed correct agent`,
    status: 'completed'
  });
  
  // Get pending steps for this agent's phase
  const pendingSteps = state.steps.filter(s => s.status === 'pending' || s.status === 'active');
  const currentPhaseSteps = pendingSteps.filter(s => 
    s.phase.toLowerCase().includes(state.current_phase.toLowerCase().split(' ')[0]) ||
    state.current_phase.toLowerCase().includes(s.phase.toLowerCase().split(' ')[0])
  );
  
  // Use current phase steps if available, otherwise all pending
  const stepsToShow = currentPhaseSteps.length > 0 ? currentPhaseSteps : pendingSteps.slice(0, 5);
  
  // Add plan steps as todos
  for (const step of stepsToShow) {
    const stepStatus = step.status === 'done' ? 'completed' : 
                       step.status === 'active' ? 'in-progress' : 'not-started';
    todos.push({
      id: id++,
      title: `Step ${step.index}: ${step.task}`,
      status: stepStatus
    });
  }
  
  // Add remaining count if more steps
  if (pendingSteps.length > stepsToShow.length) {
    todos.push({
      id: id++,
      title: `... and ${pendingSteps.length - stepsToShow.length} more steps`,
      status: 'not-started'
    });
  }
  
  // Add workflow steps based on agent type
  if (agentType === 'Executor') {
    todos.push({
      id: id++,
      title: 'Call store_context with execution_log',
      status: 'not-started'
    });
  }
  
  if (agentType === 'Reviewer') {
    todos.push({
      id: id++,
      title: 'Call store_context with review findings',
      status: 'not-started'
    });
    todos.push({
      id: id++,
      title: 'If approved: Call reindex_workspace',
      status: 'not-started'
    });
  }
  
  if (agentType === 'Tester') {
    todos.push({
      id: id++,
      title: 'Call store_context with test_results',
      status: 'not-started'
    });
  }
  
  // Handoff requirement (except Archivist)
  if (!boundaries.can_finalize) {
    const handoffTargets = boundaries.must_handoff_to.join(' or ');
    todos.push({
      id: id++,
      title: `🔄 Call handoff to ${handoffTargets}`,
      status: 'not-started'
    });
  }
  
  // Final step
  if (agentType === 'Archivist') {
    todos.push({
      id: id++,
      title: 'Call archive_plan to complete',
      status: 'not-started'
    });
  }
  
  todos.push({
    id: id++,
    title: 'Call complete_agent with summary',
    status: 'not-started'
  });
  
  return todos;
}

/**
 * Core validation logic - used by all agent-specific validators
 * 
 * PRIORITY ORDER:
 * 1. deployment_context.override_validation — if the orchestrator explicitly deployed this agent,
 *    validation ALWAYS says "continue" (with advisory warnings at most)
 * 2. current_agent match — if plan state says this agent is current, continue
 * 3. Heuristic matching (phase/keyword) — only used when no deployment context exists
 */
async function validateAgent(
  agentType: AgentType,
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  try {
    const { workspace_id, plan_id } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const boundaries = AGENT_BOUNDARIES[agentType];
    const { agent: expectedAgent, reason: heuristicReason } = getExpectedAgent(state);
    const currentStep = state.steps.find(s => s.status === 'active') || 
                        state.steps.find(s => s.status === 'pending');
    
    const warnings: string[] = [];

    // Worker-specific validation: must be deployed by a hub agent with task scope
    if (agentType === 'Worker') {
      const deployCtx = state.deployment_context;
      const hubAgents = ['Coordinator', 'Analyst', 'Runner'];
      if (!deployCtx || !hubAgents.includes(deployCtx.deployed_by)) {
        warnings.push(
          `⚠️ Worker was not deployed by a hub agent (Coordinator, Analyst, Runner). ` +
          `Deployed by: ${deployCtx?.deployed_by ?? 'unknown'}. Workers must be delegated by hub agents.`
        );
      }
      // Check if the deployment reason includes task scope information
      if (!deployCtx?.reason || deployCtx.reason.length < 10) {
        warnings.push(
          '⚠️ Worker deployment is missing a meaningful task scope. ' +
          'Hub agents must provide a specific task description when spawning Workers.'
        );
      }
    }

    // Reviewer build-check mode: validate when Reviewer is handling build steps
    if (agentType === 'Reviewer') {
      const buildSteps = getBuildRelatedSteps(state);
      if (buildSteps.length > 0) {
        const reviewerBuildMode = validateReviewerBuildMode(state);
        if (reviewerBuildMode.blocked) {
          return {
            success: false,
            error: `BLOCKED: ${reviewerBuildMode.blockReason}`
          };
        }
        if (reviewerBuildMode.warnings.length > 0) {
          warnings.push(...reviewerBuildMode.warnings);
        }

        const scripts = await store.getBuildScripts(workspace_id, plan_id);
        if (scripts.length === 0) {
          const stepList = buildSteps.map(step => `Step ${step.index}: ${step.task}`).join('; ');
          warnings.push(
            `⚠️ Build-related steps detected but no build scripts registered: ${stepList}. ` +
            `Use memory_plan add_build_script to register build steps.`
          );
        }
      }
    }
    
    // =========================================================================
    // PRIORITY 1: Check deployment_context — orchestrator's explicit choice wins
    // =========================================================================
    const deployCtx = state.deployment_context;
    const wasExplicitlyDeployed = deployCtx && 
      deployCtx.deployed_agent === agentType && 
      deployCtx.override_validation !== false;
    
    // PRIORITY 2: Check if plan state says this is the current agent
    const isCurrentAgent = state.current_agent === agentType;
    
    if (wasExplicitlyDeployed || isCurrentAgent) {
      // Agent was explicitly deployed — validation says CONTINUE
      // Add advisory warning if heuristics disagree, but do NOT redirect
      if (expectedAgent !== agentType) {
        warnings.push(
          `ℹ️ Advisory: Heuristics suggest ${expectedAgent} for phase "${state.current_phase}", ` +
          `but you were explicitly deployed${deployCtx ? ` by ${deployCtx.deployed_by}: "${deployCtx.reason}"` : ''}. Continuing as ${agentType}.`
        );
      }
      
      // Check for incomplete handoff warning
      const lastLineage = state.lineage[state.lineage.length - 1];
      if (lastLineage && lastLineage.to_agent !== agentType && !isCurrentAgent && !wasExplicitlyDeployed) {
        warnings.push(`⚠️ Lineage shows handoff to ${lastLineage.to_agent}, not ${agentType}`);
      }
      
      // Generate todo list for correct agent
      const todoList = generateTodoList(agentType, state, boundaries, 'continue');
      
      // Build instructions
      let instructions = `✅ ${agentType} is confirmed for this task. `;
      if (deployCtx) {
        instructions += `Deployed by ${deployCtx.deployed_by}: "${deployCtx.reason}". `;
      }
      if (currentStep) {
        instructions += `Current task: "${currentStep.task}". `;
      }
      if (!boundaries.can_implement && !boundaries.can_edit_docs) {
        instructions += `⚠️ You CANNOT create or edit files. `;
      } else if (!boundaries.can_implement && boundaries.can_edit_docs) {
        instructions += `📝 You CAN edit documentation files (README, docs, etc.) but NOT source code. `;
      }
      if (!boundaries.can_finalize) {
        instructions += `You MUST call handoff to ${boundaries.must_handoff_to.join(' or ')} before completing. `;
      }

      if (agentType === 'Reviewer') {
        const buildSteps = getBuildRelatedSteps(state);
        if (buildSteps.length > 0) {
          const reviewerBuildMode = validateReviewerBuildMode(state);
          instructions += `Build-check mode: operating in ${reviewerBuildMode.mode.replace('_', ' ')} mode. `;
          instructions += 'Use memory_plan add_build_script to register build steps and run_build_script to execute them. ';
          if (reviewerBuildMode.mode === 'regression_check') {
            instructions += 'Produce a regression report identifying which step broke the build if compilation fails. ';
          } else {
            instructions += 'Produce user-facing build instructions, optimization suggestions, and dependency notes. ';
          }
        }
      }
      
      return {
        success: true,
        data: {
          action: 'continue',
          current_agent: agentType,
          role_boundaries: boundaries,
          current_phase: state.current_phase,
          current_step: currentStep,
          todo_list: todoList,
          todo_instruction: '📋 REQUIRED: Call manage_todo_list with operation "write" and the todo_list above to track your progress.',
          instructions,
          allowed_tools: getAllowedTools(agentType),
          warnings: warnings.length > 0 ? warnings : undefined
        }
      };
    }
    
    // =========================================================================
    // PRIORITY 3: No deployment context — fall back to heuristic matching
    // This only runs if the agent was NOT explicitly deployed by an orchestrator
    // =========================================================================
    
    if (agentType !== expectedAgent) {
      const todoList = generateTodoList(agentType, state, boundaries, 'switch', expectedAgent);
      
      return {
        success: true,
        data: {
          action: 'switch',
          current_agent: agentType,
          role_boundaries: boundaries,
          current_phase: state.current_phase,
          current_step: currentStep,
          todo_list: todoList,
          todo_instruction: '🚨 IMMEDIATE ACTION: Call manage_todo_list with operation "write" and the todo_list above, then execute the handoff.',
          switch_to: expectedAgent,
          switch_reason: `${agentType} is not the right agent for this work. ${heuristicReason}. ` +
            `You MUST call handoff to ${expectedAgent} immediately.`,
          warnings: [
            `⚠️ WRONG AGENT: You are ${agentType} but ${expectedAgent} should handle this.`,
            `Your role: ${boundaries.primary_responsibility}`,
            `Expected: ${AGENT_BOUNDARIES[expectedAgent].primary_responsibility}`
          ]
        }
      };
    }
    
    // Check for incomplete handoff (agent re-entering without proper handoff)
    const lastLineage = state.lineage[state.lineage.length - 1];
    if (lastLineage && lastLineage.to_agent !== agentType && state.current_agent !== agentType) {
      warnings.push(`⚠️ Lineage shows handoff to ${lastLineage.to_agent}, not ${agentType}`);
    }
    
    // Generate todo list for correct agent
    const todoList = generateTodoList(agentType, state, boundaries, 'continue');
    
    // Agent is correct - provide instructions
    let instructions = `✅ ${agentType} is the correct agent for phase "${state.current_phase}". `;
    
    if (currentStep) {
      instructions += `Current task: "${currentStep.task}". `;
    }
    
    if (!boundaries.can_implement && !boundaries.can_edit_docs) {
      instructions += `⚠️ You CANNOT create or edit files. `;
    } else if (!boundaries.can_implement && boundaries.can_edit_docs) {
      instructions += `📝 You CAN edit documentation files (README, docs, etc.) but NOT source code. `;
    }
    
    if (!boundaries.can_finalize) {
      instructions += `You MUST call handoff to ${boundaries.must_handoff_to.join(' or ')} before completing. `;
    }

    if (agentType === 'Reviewer') {
      const buildSteps = getBuildRelatedSteps(state);
      if (buildSteps.length > 0) {
        const reviewerBuildMode = validateReviewerBuildMode(state);
        instructions += `Build-check mode: operating in ${reviewerBuildMode.mode.replace('_', ' ')} mode. `;
        instructions += 'Use memory_plan add_build_script to register build steps and run_build_script to execute them. ';
        if (reviewerBuildMode.mode === 'regression_check') {
          instructions += 'Produce a regression report identifying which step broke the build if compilation fails. ';
        } else {
          instructions += 'Produce user-facing build instructions, optimization suggestions, and dependency notes. ';
        }
      }
    }
    
    return {
      success: true,
      data: {
        action: 'continue',
        current_agent: agentType,
        role_boundaries: boundaries,
        current_phase: state.current_phase,
        current_step: currentStep,
        todo_list: todoList,
        todo_instruction: '📋 REQUIRED: Call manage_todo_list with operation "write" and the todo_list above to track your progress.',
        instructions,
        allowed_tools: getAllowedTools(agentType),
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Validation failed: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Per-Agent Validation Tools
// =============================================================================

export async function validateCoordinator(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Coordinator', params);
}

export async function validateResearcher(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Researcher', params);
}

export async function validateArchitect(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Architect', params);
}

export async function validateExecutor(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Executor', params);
}

/** @deprecated Builder merged into Reviewer — redirects to validateReviewer */
export async function validateBuilder(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Reviewer', params);
}

export async function validateReviewer(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Reviewer', params);
}

export async function validateTester(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Tester', params);
}

export async function validateRevisionist(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Revisionist', params);
}

export async function validateArchivist(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Archivist', params);
}

export async function validateAnalyst(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Analyst', params);
}

export async function validateBrainstorm(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Brainstorm', params);
}

export async function validateRunner(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Runner', params);
}

export async function validateSkillWriter(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('SkillWriter', params);
}

export async function validateWorker(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Worker', params);
}

export async function validateTDDDriver(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('TDDDriver', params);
}

export async function validateCognition(
  params: ValidateAgentParams
): Promise<ToolResponse<AgentValidationResult>> {
  return validateAgent('Cognition', params);
}
