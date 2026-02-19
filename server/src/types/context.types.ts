/**
 * Context & Request Category Type Definitions
 *
 * Types for request categorization and context management.
 */

import type { AgentType } from './agent.types.js';
import type { CategoryRoutingConfig } from './category-routing.js';

// =============================================================================
// Request Categories — 7-category model (v2)
// =============================================================================

export type RequestCategory =
  | 'feature'        // Add new functionality
  | 'bugfix'         // Fix something broken
  | 'refactor'       // Improve code without changing behavior
  | 'orchestration'  // Systemic/cross-cutting changes to agent system
  | 'program'        // Multi-plan container, decomposes into child plans
  | 'quick_task'     // Small task, hub routes directly to Runner/Executor
  | 'advisory';      // Conversational, no action taken

// =============================================================================
// Legacy Categories — for migration compatibility
// =============================================================================

/** @deprecated Use RequestCategory instead. Retained for migration from v1 plans. */
export type LegacyRequestCategory =
  | 'bug'
  | 'change'
  | 'analysis'
  | 'investigation'
  | 'debug'
  | 'documentation';

/**
 * Map a legacy (v1) category name to the corresponding v2 {@link RequestCategory}.
 *
 * **Purpose: Display & Compatibility Only**
 *
 * This function normalizes legacy category strings (e.g. `'bug'`, `'change'`,
 * `'debug'`, `'documentation'`) into their v2 equivalents so that downstream
 * consumers (dashboard display, test fixtures, category string comparisons)
 * can work with a single canonical set of category names.
 *
 * **NOT intended for on-read migration of legacy plans.**
 * Legacy plans stored with v1 categories should be fully rewritten by the
 * Migrator agent (Plan 10) during a dedicated migration pass — not silently
 * converted at read time. This function does not modify stored data.
 *
 * **Typical use cases:**
 * - Dashboard display of legacy plans that have not yet been migrated
 * - Test fixtures that reference old category names
 * - Category string normalization before comparison or routing
 *
 * @param category - A v1 or v2 category string
 * @returns The canonical v2 {@link RequestCategory}
 */
export function migrateCategoryToV2(
  category: RequestCategory | LegacyRequestCategory
): RequestCategory {
  const migrationMap: Record<string, RequestCategory> = {
    bug: 'bugfix',
    change: 'feature',
    analysis: 'advisory',
    investigation: 'advisory',
    debug: 'bugfix',
    documentation: 'quick_task',
  };
  return migrationMap[category] ?? (category as RequestCategory);
}

// =============================================================================
// Categorization Result
// =============================================================================

export interface RequestCategorization {
  category: RequestCategory;
  confidence: number;  // 0-1 confidence in categorization
  reasoning: string;
  suggested_workflow: AgentType[];
  skip_agents?: AgentType[];  // Agents that can be skipped for this category
  routing_workflow?: CategoryRoutingConfig;  // Resolved routing config for this category
}
