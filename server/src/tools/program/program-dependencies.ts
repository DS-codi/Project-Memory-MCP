/**
 * Program Dependencies — Cross-plan dependency graph management.
 *
 * Functions: setDependency, removeDependency, getDependencies,
 *            getDependentsOf, validateNoCycles
 *
 * Dependencies are stored in data/{workspace_id}/programs/{program_id}/dependencies.json
 * as a ProgramDependency[] array.
 *
 * Each dependency links a source plan+phase to a target plan+phase with a type
 * ('blocks' | 'informs') and tracks satisfaction status.
 */

import crypto from 'crypto';
import type {
  ProgramDependency,
  DependencyType,
  DependencyStatus,
} from '../../types/program-v2.types.js';
import {
  readDependencies,
  saveDependencies,
} from '../../storage/db-store.js';

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique dependency ID.
 * Format: dep_{base36-timestamp}_{8-hex-random}
 */
function generateDependencyId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `dep_${timestamp}_${random}`;
}

// =============================================================================
// Types
// =============================================================================

export interface SetDependencyInput {
  source_plan_id: string;
  source_phase?: string;
  target_plan_id: string;
  target_phase?: string;
  type: DependencyType;
}

export interface SetDependencyResult {
  dependency: ProgramDependency;
  created: boolean;
}

export interface RemoveDependencyResult {
  removed: boolean;
  remaining_count: number;
}

export interface CycleValidationResult {
  valid: boolean;
  cycle?: string[];
}

// =============================================================================
// setDependency
// =============================================================================

/**
 * Add or update a dependency in the program's dependency graph.
 *
 * If an existing dependency with the same source+target plan+phase combo exists,
 * it is updated (type overwritten). Otherwise a new dependency is created.
 *
 * Validates that the new graph has no cycles before persisting.
 *
 * @returns The dependency and whether it was newly created.
 * @throws If adding the dependency would create a cycle.
 */
export async function setDependency(
  workspaceId: string,
  programId: string,
  dep: SetDependencyInput,
): Promise<SetDependencyResult> {
  if (dep.source_plan_id === dep.target_plan_id) {
    throw new Error('A plan cannot depend on itself');
  }

  const deps = await readDependencies(workspaceId, programId);

  // Check for existing dependency with same source+target pairing
  const existingIdx = deps.findIndex(
    (d) =>
      d.source_plan_id === dep.source_plan_id &&
      d.target_plan_id === dep.target_plan_id &&
      (d.source_phase ?? '') === (dep.source_phase ?? '') &&
      (d.target_phase ?? '') === (dep.target_phase ?? ''),
  );

  let created: boolean;
  let dependency: ProgramDependency;

  if (existingIdx >= 0) {
    // Update existing
    deps[existingIdx].type = dep.type;
    dependency = deps[existingIdx];
    created = false;
  } else {
    // Create new
    dependency = {
      id: generateDependencyId(),
      source_plan_id: dep.source_plan_id,
      source_phase: dep.source_phase,
      target_plan_id: dep.target_plan_id,
      target_phase: dep.target_phase,
      type: dep.type,
      status: 'pending' as DependencyStatus,
      created_at: new Date().toISOString(),
    };
    deps.push(dependency);
    created = true;
  }

  // Validate no cycles before saving
  const validation = validateNoCycles(deps);
  if (!validation.valid) {
    throw new Error(
      `Adding dependency would create a cycle: ${validation.cycle!.join(' → ')}`,
    );
  }

  await saveDependencies(workspaceId, programId, deps);
  return { dependency, created };
}

// =============================================================================
// removeDependency
// =============================================================================

/**
 * Remove a dependency by its ID from the program's graph.
 */
export async function removeDependency(
  workspaceId: string,
  programId: string,
  dependencyId: string,
): Promise<RemoveDependencyResult> {
  const deps = await readDependencies(workspaceId, programId);
  const beforeLen = deps.length;
  const filtered = deps.filter((d) => d.id !== dependencyId);

  if (filtered.length === beforeLen) {
    return { removed: false, remaining_count: beforeLen };
  }

  await saveDependencies(workspaceId, programId, filtered);
  return { removed: true, remaining_count: filtered.length };
}

// =============================================================================
// getDependencies
// =============================================================================

/**
 * Retrieve the full dependency array for a program.
 */
export async function getDependencies(
  workspaceId: string,
  programId: string,
): Promise<ProgramDependency[]> {
  return readDependencies(workspaceId, programId);
}

// =============================================================================
// getDependentsOf
// =============================================================================

/**
 * Reverse lookup — find all dependencies where a given plan is the *target*.
 *
 * This answers: "Which other plans depend on (are blocked/informed by) planId?"
 */
export async function getDependentsOf(
  workspaceId: string,
  programId: string,
  planId: string,
): Promise<ProgramDependency[]> {
  const deps = await readDependencies(workspaceId, programId);
  return deps.filter((d) => d.target_plan_id === planId);
}

// =============================================================================
// validateNoCycles — DFS cycle detection
// =============================================================================

/**
 * Validate that the dependency graph has no cycles.
 *
 * Uses DFS traversal through source → target chains. Only 'blocks'
 * dependencies form hard edges for cycle detection (an 'informs'
 * dependency is advisory and doesn't create true ordering constraints).
 *
 * Phase-aware: dependencies with different phases on the same plan are
 * treated as distinct nodes (planId::phase).
 *
 * @returns { valid: true } if no cycle exists, or { valid: false, cycle: [...] }.
 */
export function validateNoCycles(
  dependencies: ProgramDependency[],
): CycleValidationResult {
  // Build adjacency list from blocking dependencies only
  const blockingDeps = dependencies.filter((d) => d.type === 'blocks');

  if (blockingDeps.length === 0) {
    return { valid: true };
  }

  // Build adjacency map: source_node → [target_node, ...]
  const adjacency = new Map<string, string[]>();
  const allNodes = new Set<string>();

  for (const dep of blockingDeps) {
    const sourceNode = nodeKey(dep.source_plan_id, dep.source_phase);
    const targetNode = nodeKey(dep.target_plan_id, dep.target_phase);
    allNodes.add(sourceNode);
    allNodes.add(targetNode);

    if (!adjacency.has(sourceNode)) {
      adjacency.set(sourceNode, []);
    }
    adjacency.get(sourceNode)!.push(targetNode);
  }

  // DFS cycle detection
  const WHITE = 0; // Unvisited
  const GRAY = 1;  // In current path
  const BLACK = 2; // Fully processed

  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const node of allNodes) {
    color.set(node, WHITE);
  }

  for (const startNode of allNodes) {
    if (color.get(startNode) !== WHITE) continue;

    // Iterative DFS using explicit stack
    const stack: Array<{ node: string; childIdx: number }> = [
      { node: startNode, childIdx: 0 },
    ];
    color.set(startNode, GRAY);
    parent.set(startNode, null);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const children = adjacency.get(top.node) ?? [];

      if (top.childIdx >= children.length) {
        // All children processed — mark fully done
        color.set(top.node, BLACK);
        stack.pop();
        continue;
      }

      const child = children[top.childIdx];
      top.childIdx++;

      const childColor = color.get(child) ?? WHITE;

      if (childColor === GRAY) {
        // Back-edge found → cycle detected. Reconstruct path.
        const cycle = [child];
        for (let i = stack.length - 1; i >= 0; i--) {
          cycle.push(stack[i].node);
          if (stack[i].node === child) break;
        }
        cycle.reverse();
        return { valid: false, cycle };
      }

      if (childColor === WHITE) {
        color.set(child, GRAY);
        parent.set(child, top.node);
        stack.push({ node: child, childIdx: 0 });
      }
      // BLACK nodes are already fully processed — skip
    }
  }

  return { valid: true };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a node key for the dependency graph.
 * If a phase is specified, the node is plan-phase scoped; otherwise plan-scoped.
 */
function nodeKey(planId: string, phase?: string): string {
  return phase ? `${planId}::${phase}` : planId;
}
