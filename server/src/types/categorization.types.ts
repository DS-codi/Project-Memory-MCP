/**
 * Categorization Data Layer — Storage Schemas
 *
 * Interfaces for prompt categorization and decomposition results produced
 * by Coordinator agent reasoning.
 *
 * The MCP server stores/retrieves these; it does NOT perform inference (JC-003).
 */

import type { RequestCategory } from './context.types.js';
import type { CategoryRoutingConfig } from './category-routing.js';

// =============================================================================
// Prompt Decomposition — Model C Hybrid
// =============================================================================

/** A single atomic statement extracted from a user prompt. */
export interface AtomicStatement {
  /** Statement identifier, e.g. 'stmt_1'. */
  id: string;
  /** The atomic statement text. */
  text: string;
  /** Suggested category for this statement. */
  category_hint?: RequestCategory;
  /** IDs of statements this depends on. */
  depends_on?: string[];
  /** True if this can be a standalone task. */
  is_independent?: boolean;
}

/** Result of prompt decomposition — Model C hybrid output. */
export interface DecomposedPrompt {
  /** The raw user prompt. */
  original_prompt: string;
  /** Extracted atomic statements. */
  statements: AtomicStatement[];
  /** stmt_id → depends_on[]. */
  dependency_graph?: Record<string, string[]>;
  /** Overall scope assessment based on the decomposition. */
  scope_assessment: ScopeAssessment;
}

// =============================================================================
// Scope Assessment
// =============================================================================

/** Scope assessment to determine quick_task vs formal plan. */
export interface ScopeAssessment {
  /** Number of extracted atomic statements. */
  total_statements: number;
  /** Distinct categories found across statements. */
  distinct_categories: RequestCategory[];
  /** Estimated complexity of the overall request. */
  estimated_complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  /** True if ≤3-4 small steps — eligible for Runner/quick_task routing. */
  quick_task_eligible: boolean;
  /** Why this assessment was made. */
  reasoning: string;
}

// =============================================================================
// Intent Extraction
// =============================================================================

/** Intent extraction result — high-level goal identification for categorization. */
export interface IntentExtraction {
  /** Main goal description. */
  primary_intent: string;
  /** Additional goals, if any. */
  secondary_intents?: string[];
  /** Determined category for the request. */
  category: RequestCategory;
  /** 0-1 confidence score. */
  confidence: number;
  /** Why this category was chosen. */
  reasoning: string;
}

// =============================================================================
// Category Decision — Full Categorization Record
// =============================================================================

/**
 * Full categorization decision — produced by Coordinator, stored on plan.
 *
 * This is the complete record of the categorization reasoning that the
 * Coordinator agent produces and hands to the MCP server for storage.
 */
export interface CategoryDecision {
  /** Intent extraction result. */
  intent: IntentExtraction;
  /** Decomposition result — only for multi-statement prompts. */
  decomposition?: DecomposedPrompt;
  /** Resolved routing from CATEGORY_ROUTING. */
  routing: CategoryRoutingConfig;
  /** ISO timestamp when decision was made. */
  decided_at: string;
  /** Agent that made the decision (usually 'Coordinator'). */
  decided_by: string;
}
