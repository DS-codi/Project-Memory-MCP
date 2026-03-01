import type { CategoryRoutingConfig, PlanningDepth } from '../../types/category-routing.js';
import type { AgentType } from '../../types/agent.types.js';
import { CATEGORY_ROUTING } from '../../types/category-routing.js';
import { getCategoryWorkflowDefinition } from '../../db/category-workflow-db.js';

export type CategoryWorkflowSource = 'categorization_result' | 'db_definition' | 'static_fallback' | 'none';

export interface ResolvedCategoryWorkflow {
  routing?: CategoryRoutingConfig;
  source: CategoryWorkflowSource;
}

function parseAgentArray(raw: string | null): AgentType[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as AgentType[] : [];
  } catch {
    return [];
  }
}

function rowToRoutingConfig(row: {
  planning_depth: string;
  workflow_path: string;
  skip_agents: string;
  requires_research: number;
  requires_brainstorm: number;
}): CategoryRoutingConfig {
  return {
    planning_depth: row.planning_depth as PlanningDepth,
    workflow_path: parseAgentArray(row.workflow_path),
    skip_agents: parseAgentArray(row.skip_agents),
    requires_research: Boolean(row.requires_research),
    requires_brainstorm: Boolean(row.requires_brainstorm),
  };
}

export function resolveCategoryWorkflow(
  category: string | undefined,
  decisionRouting?: CategoryRoutingConfig,
): ResolvedCategoryWorkflow {
  if (decisionRouting) {
    return {
      routing: decisionRouting,
      source: 'categorization_result',
    };
  }

  if (category) {
    const dbRow = getCategoryWorkflowDefinition(category);
    if (dbRow) {
      return {
        routing: rowToRoutingConfig(dbRow),
        source: 'db_definition',
      };
    }

    const fallback = CATEGORY_ROUTING[category];
    if (fallback) {
      return {
        routing: fallback,
        source: 'static_fallback',
      };
    }
  }

  return {
    source: 'none',
  };
}
