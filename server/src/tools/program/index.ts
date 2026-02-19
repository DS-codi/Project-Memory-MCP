/**
 * Program Module — barrel export for the v2 Integrated Programs system.
 *
 * Re-exports lifecycle and manifest functions.
 * Future modules (program-dependencies, program-risks) will be added here.
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
