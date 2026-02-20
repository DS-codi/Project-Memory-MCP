/**
 * Project Memory MCP Server - Type Definitions
 *
 * Barrel re-export file. All types are organized into domain modules:
 * - agent.types.ts   — Agent identity, sessions, lineage, role boundaries
 * - build.types.ts   — Build scripts and result types
 * - categorization.types.ts — Prompt categorization & decomposition storage schemas
 * - category-routing.ts — Category routing config and planning depth
 * - context.types.ts — Request categories and categorization
 * - deploy.types.ts  — Deploy-for-task params, context bundles, agent manifests
 * - investigation.types.ts — Investigation workflow phases and records
 * - plan.types.ts    — Plan state, steps, notes, confirmation, compact state
 * - workspace.types.ts — Workspace metadata, profiles, context
 * - common.types.ts  — Tool parameters, responses, instruction files
 * - handoff-stats.types.ts — Handoff stats, incident reports, difficulty profiles
 * - gui-forms.types.ts — FormRequest/FormResponse wire protocol types (GUI forms)
 */

export * from './agent.types.js';
export * from './build.types.js';
export * from './categorization.types.js';
export * from './category-routing.js';
export * from './context.types.js';
export * from './deploy.types.js';
export * from './handoff-stats.types.js';
export * from './investigation.types.js';
export * from './plan.types.js';
export * from './program.types.js';
export * from './program-v2.types.js';
export * from './skill.types.js';
export * from './workspace.types.js';
export * from './preflight.types.js';
export * from './common.types.js';
export * from './gui-forms.types.js';
