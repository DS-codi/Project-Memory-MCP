/**
 * @module db/index
 * @description Data Access Module Index
 *
 * Barrel export for the entire DB layer. Import everything from one place:
 *
 * ```typescript
 * import {
 *   getDb, createWorkspace, assemblePlanState,
 *   createPlan, getPlan, updatePlan,
 *   getStepDependencies, addStepDependency,
 *   appendResearch, appendPlanResearch,
 *   linkWorkspace, getProgramsLinkedToWorkspace,
 *   recordFileEdit, getPlanFileEdits,
 * } from '../db/index.js'
 * ```
 */

// ── Bootstrap ────────────────────────────────────────────────────────────────
export { getDb, closeDb, getDbPath, _resetConnectionForTesting } from './connection.js';
export { runMigrations, migrationStatus } from './migration-runner.js';
export type { MigrationResult } from './migration-runner.js';

// ── Query helpers ────────────────────────────────────────────────────────────
export { queryOne, queryAll, run, transaction, newId, nowIso } from './query-helpers.js';
export type { RunResult } from './query-helpers.js';

// ── Row types ────────────────────────────────────────────────────────────────
export type {
  WorkspaceRow,
  ProgramRow,
  ProgramPlanRow,
  ProgramRiskRow,
  PlanRow,
  PhaseRow,
  StepRow,
  PlanNoteRow,
  SessionRow,
  LineageRow,
  ContextItemRow,
  ResearchDocumentRow,
  KnowledgeRow,
  BuildScriptRow,
  DependencyRow,
  ToolRow,
  ToolActionRow,
  ToolActionParamRow,
  ToolHelp,
  AgentDefinitionRow,
  DeployableAgentProfileRow,
  CategoryWorkflowDefinitionRow,
  AgentDeploymentRow,
  InstructionDeploymentRow,
  SkillDeploymentRow,
  InstructionFileRow,
  SkillDefinitionRow,
  UpdateLogRow,
  EventLogRow,
  MigrationRow,
  WorkspaceSessionRegistryRow,
  GuiRoutingContractRow,
  // Archive variants
  PlanArchiveRow,
  PhaseArchiveRow,
  StepArchiveRow,
  SessionArchiveRow,
  LineageArchiveRow,
  // Cross-workspace & file-edit rows
  ProgramWorkspaceLinkRow,
  FileEditRow,
} from './types.js';

// ── Mappers ──────────────────────────────────────────────────────────────────
export {
  rowToWorkspaceMeta,
  workspaceMetaToRow,
  rowToStep,
  rowToSession,
  sessionToRow,
  rowToLineage,
  lineageToRow,
  assemblePlanState,
  decomposePlanState,
  // Conventional mapper-naming aliases & new mappers
  planRowToState,
  stateToPlanRow,
  programRowToState,
  stateToProgramRow,
  dependencyRowToEdge,
  programWorkspaceLinkRowToLink,
  researchDocumentRowToNote,
  stepRowToStep,
} from './mappers.js';
export type {
  DecomposedPlanState,
  PlanDependencyEdge,
  WorkspaceLinkEntry,
  ResearchNote,
} from './mappers.js';

// ── Workspace CRUD ───────────────────────────────────────────────────────────
export {
  createWorkspace,
  getWorkspace,
  getWorkspaceByPath,
  listWorkspaces,
  listChildWorkspaces,
  updateWorkspace,
  deleteWorkspace,
} from './workspace-db.js';

// ── Plan CRUD ────────────────────────────────────────────────────────────────
export {
  createPlan,
  getPlan,
  getPlansByWorkspace,
  getPlansByCategory,
  getPausedPlans,
  getChildPlans,
  getPlansByStatus,
  findPlanById,
  updatePlan,
  deletePlan,
  archivePlan,
} from './plan-db.js';
export type { CreatePlanData, UpdatePlanData, ListPlansOptions } from './plan-db.js';

// ── Phase CRUD ───────────────────────────────────────────────────────────────
export {
  createPhase,
  getOrCreatePhase,
  getPhase,
  getPhases,
  updatePhase,
  deletePhase,
  reorderPhases,
  normalizePhaseOrder,
} from './phase-db.js';

// ── Step CRUD ────────────────────────────────────────────────────────────────
export {
  createStep,
  createStepInPhase,
  getStep,
  getSteps,
  getAllSteps,
  getNextPendingStep,
  updateStep,
  batchUpdateSteps,
  insertStepAt,
  moveStep,
  reorderSteps,
  deleteStep,
  markCurrentDoneAndGetNext,
  // Step dependency graph
  getStepDependencies,
  getStepDependents,
  addStepDependency,
  removeStepDependency,
  markStepDependenciesSatisfied,
} from './step-db.js';
export type { CreateStepData, UpdateStepData, BatchUpdate, MarkDoneAndGetNextResult } from './step-db.js';

// ── Session CRUD ─────────────────────────────────────────────────────────────
export {
  createSession,
  getSession,
  getSessions,
  getOrphanedSessions,
  completeSession,
  markSessionOrphaned,
  deleteSession,
} from './session-db.js';

// ── Lineage ──────────────────────────────────────────────────────────────────
export { addLineageEntry, getLineage, getRecentLineage } from './lineage-db.js';

// ── Context ──────────────────────────────────────────────────────────────────
export {
  storeContext,
  getContext,
  getContextItem,
  listContextTypes,
  searchContext,
  deleteContext,
  deleteAllContext,
} from './context-db.js';
export type { SearchContextOptions } from './context-db.js';

// ── Research ─────────────────────────────────────────────────────────────────
export {
  appendResearch,
  getResearch,
  listResearch,
  listWorkspaceResearch,
  deleteResearch,
  // Backward-compat plan-scoped wrappers
  appendPlanResearch,
  listPlanResearch,
} from './research-db.js';
export type { ResearchParentType } from './research-db.js';

// ── Knowledge ────────────────────────────────────────────────────────────────
export {
  storeKnowledge,
  getKnowledge,
  listKnowledge,
  deleteKnowledge,
} from './knowledge-db.js';

// ── Build scripts ────────────────────────────────────────────────────────────
export {
  addBuildScript,
  getBuildScripts,
  findBuildScript,
  deleteBuildScript,
} from './build-script-db.js';

// ── Dependencies ─────────────────────────────────────────────────────────────
export {
  addDependency,
  getDependencies,
  getDependents,
  checkCycle,
  markDependencySatisfied,
  removeDependency,
  removeDependenciesFor,
} from './dependency-db.js';

// ── Tool catalog ─────────────────────────────────────────────────────────────
export {
  seedToolCatalog,
  getTools,
  getTool,
  getToolActions,
  getActionParams,
  getToolHelp,
} from './tool-catalog-db.js';
export type { CatalogTool, CatalogAction, CatalogParam } from './tool-catalog-db.js';

// ── Agent definitions ────────────────────────────────────────────────────────
export {
  storeAgent,
  setAgentSurfaceConfig,
  getAgent,
  listAgents,
  listPermanentAgents,
  getBlockedTools,
  getRequiredContextKeys,
  deleteAgent,
} from './agent-definition-db.js';
export type { StoreAgentInput, AgentSurfaceConfig } from './agent-definition-db.js';

// ── Deployable agent profiles ───────────────────────────────────────────────
export {
  upsertDeployableAgentProfile,
  getDeployableAgentProfileByName,
  getDeployableAgentProfileByRole,
  listDeployableAgentProfiles,
  deleteDeployableAgentProfile,
} from './deployable-agent-profile-db.js';
export type {
  DeployableAgentRole,
  UpsertDeployableAgentProfileInput,
} from './deployable-agent-profile-db.js';

// ── Category workflow definitions ───────────────────────────────────────────
export {
  upsertCategoryWorkflowDefinition,
  getCategoryWorkflowDefinition,
  listCategoryWorkflowDefinitions,
  listCategoryWorkflowDefinitionsByScope,
  deleteCategoryWorkflowDefinition,
} from './category-workflow-db.js';
export type {
  WorkflowScopeClassification,
  UpsertCategoryWorkflowDefinitionInput,
} from './category-workflow-db.js';

// ── Agent deployments ────────────────────────────────────────────────────────
export {
  upsertDeployment,
  getDeployment,
  listDeploymentsByWorkspace,
  listDeploymentsByAgent,
  listAllDeployments,
  deleteDeployment,
  deleteDeploymentsByWorkspace,
} from './agent-deployment-db.js';
export type { SyncStatus, UpsertDeploymentInput } from './agent-deployment-db.js';

// ── Workspace session registry ────────────────────────────────────────────────
export {
  upsertSessionRegistry,
  updateSessionRegistry,
  completeRegistrySession,
  getRegistryRow,
  getActivePeerSessions,
  getAllWorkspaceSessions,
  pruneCompletedSessions,
} from './workspace-session-registry-db.js';
export type {
  UpsertRegistryInput,
  UpdateRegistryInput,
  PeerSessionSummary,
} from './workspace-session-registry-db.js';

// ── GUI routing contracts ─────────────────────────────────────────────────────
export {
  seedGuiContract,
  getGuiContract,
  listGuiContracts,
  getActiveContract,
  setContractEnabled,
} from './gui-routing-contracts-db.js';
export type {
  GuiContractSeedInput,
  TriggerCriteria,
  FeedbackPath,
  FeedbackPaths,
} from './gui-routing-contracts-db.js';

// ── Instruction deployments ───────────────────────────────────────────────────
export {
  upsertInstructionDeployment,
  getInstructionDeployment,
  listInstructionDeploymentsByWorkspace,
  listInstructionDeploymentsByFile,
  listAllInstructionDeployments,
  deleteInstructionDeployment,
  deleteInstructionDeploymentsByWorkspace,
} from './instruction-deployment-db.js';
export type { InstructionSyncStatus, UpsertInstructionDeploymentInput } from './instruction-deployment-db.js';

// ── Skill deployments ────────────────────────────────────────────────────────────
export {
  upsertSkillDeployment,
  getSkillDeployment,
  listSkillDeploymentsByWorkspace,
  listSkillDeploymentsBySkill,
  listAllSkillDeployments,
  deleteSkillDeployment,
  deleteSkillDeploymentsByWorkspace,
} from './skill-deployment-db.js';
export type { SkillSyncStatus, UpsertSkillDeploymentInput } from './skill-deployment-db.js';

// ── Reproducibility package helpers ─────────────────────────────────────────
export {
  exportReproPackage,
  importReproPackage,
  compareReproPackages,
} from './reproducibility-package.js';
export type {
  ReproPackage,
  ReproPackageMeta,
  ReproTableSnapshot,
  ReproParityResult,
  ReproParityDiff,
  ExportReproPackageInput,
  ImportReproPackageInput,
} from './reproducibility-package.js';

// ── Instruction files ────────────────────────────────────────────────────────
export {
  storeInstruction,
  getInstruction,
  listInstructions,
  getInstructionsForFile,
  deleteInstruction,
} from './instruction-db.js';

// ── Skills ───────────────────────────────────────────────────────────────────
export {
  storeSkill,
  getSkill,
  listSkills,
  matchSkills,
  deleteSkill,
} from './skill-db.js';
export type { StoreSkillData, MatchSkillsOptions } from './skill-db.js';

// ── Update log ───────────────────────────────────────────────────────────────
export {
  addUpdateLog,
  getUpdateLog,
  getUpdateLogSince,
  cleanupUpdateLog,
} from './update-log-db.js';

// ── Event log ────────────────────────────────────────────────────────────────
export {
  addEventLog,
  getRecentEvents,
  getEventsSince,
  getEventsByType,
  cleanupOldEvents,
} from './event-log-db.js';

// ── Programs ─────────────────────────────────────────────────────────────────
export {
  createProgram,
  getProgram,
  listPrograms,
  listProgramPlans,
  getProgramPlanRows,
  addPlanToProgram,
  removePlanFromProgram,
  upgradeToProgram,
  updateProgram,
  deleteProgram,
} from './program-db.js';
export type { CreateProgramData, UpdateProgramData } from './program-db.js';

// ── Program risks ─────────────────────────────────────────────────────────────
export {
  addRisk,
  getRisk,
  getRisks,
  deleteRisk,
  deleteRisksForProgram,
} from './program-risks-db.js';
export type { AddRiskData } from './program-risks-db.js';

// ── Plan notes ───────────────────────────────────────────────────────────────
export { addPlanNote, getPlanNotes, deletePlanNote } from './plan-note-db.js';

// ── Program workspace links ──────────────────────────────────────────────────
export {
  linkWorkspace,
  unlinkWorkspace,
  getLinkedWorkspaces,
  getProgramsLinkedToWorkspace,
  canAcceptPlanFromWorkspace,
  ensureWorkspaceLink,
} from './program-workspace-links-db.js';

// ── File edit history ────────────────────────────────────────────────────────
export {
  recordFileEdit,
  recordFileEdits,
  getFileEditHistory,
  getStepFileEdits,
  getPlanFileEdits,
  searchFileEdits,
  getEditedFilesForPlan,
  deletePlanFileEdits,
} from './file-edits-db.js';
export type { FileChangeType, RecordFileEditOptions } from './file-edits-db.js';
