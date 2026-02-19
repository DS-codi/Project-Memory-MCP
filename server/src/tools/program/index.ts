/**
 * Program Module — barrel export for the v2 Integrated Programs system.
 *
 * Re-exports lifecycle, manifest, dependencies, and phase announcer functions.
 * Future modules (program-risks) will be added here.
 */

export {
  generateProgramId,
  createProgram,
  getProgram,
  updateProgram,
  archiveProgram,
  listPrograms,
} from './program-lifecycle.js';

export {
  addPlanToProgram,
  removePlanFromProgram,
  listProgramPlans,
  upgradeToProgram,
} from './program-manifest.js';

export type { ProgramPlanSummary } from './program-manifest.js';

export {
  setDependency,
  removeDependency,
  getDependencies,
  getDependentsOf,
  validateNoCycles,
} from './program-dependencies.js';

export type {
  SetDependencyInput,
  SetDependencyResult,
  RemoveDependencyResult,
  CycleValidationResult,
} from './program-dependencies.js';

export {
  announcePhaseCompletion,
} from './program-phase-announcer.js';

export type {
  PhaseCompletionResult,
} from './program-phase-announcer.js';

export {
  addRisk,
  updateRisk,
  removeRisk,
  listRisks,
  getRisk,
} from './program-risks.js';

export type {
  AddRiskInput,
  UpdateRiskInput,
  ListRisksFilter,
} from './program-risks.js';

export {
  autoDetectRisks,
  classifyRiskType,
} from './program-risk-detector.js';

export type {
  AutoDetectResult,
} from './program-risk-detector.js';

export {
  migratePrograms,
} from './program-migration.js';

export type {
  MigratedProgramEntry,
  MigrationReport,
} from './program-migration.js';

export {
  detectIssues,
  detectSinglePlanAdvisory,
  detectMigrationAdvisories,
} from './program-migration-advisor.js';

export type {
  MigrationAdvisory,
} from './program-migration-advisor.js';
