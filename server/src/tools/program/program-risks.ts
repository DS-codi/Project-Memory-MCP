/**
 * Program Risks — Risk register CRUD operations for programs.
 *
 * Functions: addRisk, updateRisk, removeRisk, listRisks, getRisk
 *
 * Risks are stored in data/{workspace_id}/programs/{program_id}/risks.json
 * as a ProgramRisk[] array.
 *
 * Each risk tracks type (functional_conflict, behavioral_change, dependency_risk),
 * severity, status, mitigation, and detection origin (auto/manual).
 */

import crypto from 'crypto';
import type {
  ProgramRisk,
  RiskType,
  RiskSeverity,
  RiskStatus,
} from '../../types/program-v2.types.js';
import {
  readRisks,
  saveRisks,
} from '../../storage/db-store.js';

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique risk ID.
 * Format: risk_{base36-timestamp}_{8-hex-random}
 */
function generateRiskId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `risk_${timestamp}_${random}`;
}

// =============================================================================
// Types
// =============================================================================

/** Input for creating a risk (auto-generated fields omitted). */
export type AddRiskInput = Omit<ProgramRisk, 'id' | 'created_at' | 'updated_at'>;

/** Fields that may be updated on an existing risk. */
export interface UpdateRiskInput {
  status?: RiskStatus;
  severity?: RiskSeverity;
  mitigation?: string;
  title?: string;
  description?: string;
}

/** Filter options for listing risks. */
export interface ListRisksFilter {
  severity?: RiskSeverity;
  status?: RiskStatus;
  type?: RiskType;
}

// =============================================================================
// addRisk
// =============================================================================

/**
 * Add a new risk to the program's risk register.
 *
 * Generates a unique ID and timestamps, appends to risks.json.
 * @returns The newly created ProgramRisk.
 */
export async function addRisk(
  workspaceId: string,
  programId: string,
  input: AddRiskInput
): Promise<ProgramRisk> {
  const now = new Date().toISOString();
  const risk: ProgramRisk = {
    ...input,
    id: generateRiskId(),
    program_id: programId,
    created_at: now,
    updated_at: now,
  };

  const risks = await readRisks(workspaceId, programId);
  risks.push(risk);
  await saveRisks(workspaceId, programId, risks);

  return risk;
}

// =============================================================================
// updateRisk
// =============================================================================

/**
 * Update fields on an existing risk entry.
 *
 * Only provided fields in `updates` are applied.
 * @returns The updated ProgramRisk.
 * @throws If the riskId is not found.
 */
export async function updateRisk(
  workspaceId: string,
  programId: string,
  riskId: string,
  updates: UpdateRiskInput
): Promise<ProgramRisk> {
  const risks = await readRisks(workspaceId, programId);
  const idx = risks.findIndex(r => r.id === riskId);
  if (idx === -1) {
    throw new Error(`Risk not found: ${riskId}`);
  }

  const existing = risks[idx];
  const updated: ProgramRisk = {
    ...existing,
    ...(updates.status !== undefined && { status: updates.status }),
    ...(updates.severity !== undefined && { severity: updates.severity }),
    ...(updates.mitigation !== undefined && { mitigation: updates.mitigation }),
    ...(updates.title !== undefined && { title: updates.title }),
    ...(updates.description !== undefined && { description: updates.description }),
    updated_at: new Date().toISOString(),
  };

  risks[idx] = updated;
  await saveRisks(workspaceId, programId, risks);

  return updated;
}

// =============================================================================
// removeRisk
// =============================================================================

/**
 * Remove a risk from the register by ID.
 *
 * @returns `true` if the risk was found and removed, `false` otherwise.
 */
export async function removeRisk(
  workspaceId: string,
  programId: string,
  riskId: string
): Promise<boolean> {
  const risks = await readRisks(workspaceId, programId);
  const idx = risks.findIndex(r => r.id === riskId);
  if (idx === -1) return false;

  risks.splice(idx, 1);
  await saveRisks(workspaceId, programId, risks);

  return true;
}

// =============================================================================
// listRisks
// =============================================================================

/**
 * List all risks for a program, optionally filtered by severity, status, or type.
 *
 * Filters are combined with AND logic: a risk must match ALL provided filters.
 */
export async function listRisks(
  workspaceId: string,
  programId: string,
  filters?: ListRisksFilter
): Promise<ProgramRisk[]> {
  let risks = await readRisks(workspaceId, programId);

  if (filters) {
    if (filters.severity) {
      risks = risks.filter(r => r.severity === filters.severity);
    }
    if (filters.status) {
      risks = risks.filter(r => r.status === filters.status);
    }
    if (filters.type) {
      risks = risks.filter(r => r.type === filters.type);
    }
  }

  return risks;
}

// =============================================================================
// getRisk
// =============================================================================

/**
 * Get a single risk by ID.
 *
 * @returns The ProgramRisk or null if not found.
 */
export async function getRisk(
  workspaceId: string,
  programId: string,
  riskId: string
): Promise<ProgramRisk | null> {
  const risks = await readRisks(workspaceId, programId);
  return risks.find(r => r.id === riskId) ?? null;
}
