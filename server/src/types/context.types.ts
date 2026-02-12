/**
 * Context & Request Category Type Definitions
 *
 * Types for request categorization and context management.
 */

import type { AgentType } from './agent.types.js';

// =============================================================================
// Request Categories - Different types of user prompts
// =============================================================================

export type RequestCategory =
  | 'feature'      // Add new functionality
  | 'bug'          // Fix something broken
  | 'change'       // Modify existing behavior
  | 'analysis'     // Understand how something works
  | 'investigation' // Deep problem resolution and discovery
  | 'debug'        // Investigate a specific issue
  | 'refactor'     // Improve code without changing behavior
  | 'documentation'; // Update or create docs

export interface RequestCategorization {
  category: RequestCategory;
  confidence: number;  // 0-1 confidence in categorization
  reasoning: string;
  suggested_workflow: AgentType[];
  skip_agents?: AgentType[];  // Agents that can be skipped for this category
}
