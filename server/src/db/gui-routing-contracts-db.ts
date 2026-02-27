/**
 * GUI routing contracts storage.
 *
 * One row per contract_type ('approval' | 'brainstorm').
 * Seeded at server start (idempotent).
 * Hub agents query by contract_type at spawn time — no GUI logic lives
 * in hub.agent.md, only the contract_type reference key.
 */

import type { GuiRoutingContractRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Seed types (typed input for the seed helper and admin callers)
// ---------------------------------------------------------------------------

export interface TriggerCriteria {
  /** Risk levels that require GUI confirmation (e.g. ['high', 'critical']). */
  riskLevels?:          string[];
  /** If true, only irreversible actions trigger the GUI. */
  irreversibleOnly?:    boolean;
  /** Confirmation scopes that require GUI (e.g. ['multi-step', 'plan-level']). */
  confirmationScopes?:  string[];
  /** Plan categories that trigger the GUI (e.g. ['orchestration', 'analysis']). */
  planCategories?:      string[];
  /** If true, trigger when the prompt/task contains deliberate optionality signals. */
  optionalitySignal?:   boolean;
}

export interface FeedbackPath {
  tool:    string;
  action:  string;
  /** Static params merged with the runtime params from the GUI response. */
  params?: Record<string, unknown>;
}

export interface FeedbackPaths {
  approve?:  FeedbackPath[];
  reject?:   FeedbackPath[];
  timeout?:  FeedbackPath[];
  select?:   FeedbackPath[];
}

export interface GuiContractSeedInput {
  contractType:             'approval' | 'brainstorm';
  version?:                 string;
  triggerCriteria:          TriggerCriteria;
  /** JSON Schema object describing the FormRequest payload Hub sends to the GUI. */
  invocationParamsSchema:   Record<string, unknown>;
  /** Expected response envelope shape. */
  responseSchema:           Record<string, unknown>;
  feedbackPaths:            FeedbackPaths;
  fallbackBehavior?:        'auto-select-recommended' | 'block' | 'skip';
  enabled?:                 boolean;
}

// ---------------------------------------------------------------------------
// Seed (idempotent — update if exists, insert if new)
// ---------------------------------------------------------------------------

export function seedGuiContract(input: GuiContractSeedInput): GuiRoutingContractRow {
  const now = nowIso();
  const existing = getGuiContract(input.contractType);

  const row = {
    trigger_criteria:         JSON.stringify(input.triggerCriteria),
    invocation_params_schema: JSON.stringify(input.invocationParamsSchema),
    response_schema:          JSON.stringify(input.responseSchema),
    feedback_paths:           JSON.stringify(input.feedbackPaths),
    fallback_behavior:        input.fallbackBehavior ?? 'block',
    enabled:                  input.enabled !== false ? 1 : 0,
    version:                  input.version ?? '1.0',
  };

  if (existing) {
    run(
      `UPDATE gui_routing_contracts
          SET version = ?, trigger_criteria = ?, invocation_params_schema = ?,
              response_schema = ?, feedback_paths = ?,
              fallback_behavior = ?, enabled = ?, updated_at = ?
        WHERE contract_type = ?`,
      [
        row.version,
        row.trigger_criteria,
        row.invocation_params_schema,
        row.response_schema,
        row.feedback_paths,
        row.fallback_behavior,
        row.enabled,
        now,
        input.contractType,
      ]
    );
    return getGuiContract(input.contractType)!;
  }

  run(
    `INSERT INTO gui_routing_contracts
       (id, contract_type, version,
        trigger_criteria, invocation_params_schema, response_schema,
        feedback_paths, fallback_behavior, enabled,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.contractType,
      row.version,
      row.trigger_criteria,
      row.invocation_params_schema,
      row.response_schema,
      row.feedback_paths,
      row.fallback_behavior,
      row.enabled,
      now,
      now,
    ]
  );

  return getGuiContract(input.contractType)!;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getGuiContract(
  contractType: 'approval' | 'brainstorm'
): GuiRoutingContractRow | null {
  return queryOne<GuiRoutingContractRow>(
    'SELECT * FROM gui_routing_contracts WHERE contract_type = ?',
    [contractType]
  ) ?? null;
}

export function listGuiContracts(): GuiRoutingContractRow[] {
  return queryAll<GuiRoutingContractRow>(
    'SELECT * FROM gui_routing_contracts ORDER BY contract_type'
  );
}

/** Parsed helper — returns null when the contract is disabled or missing. */
export function getActiveContract(
  contractType: 'approval' | 'brainstorm'
): GuiRoutingContractRow | null {
  return queryOne<GuiRoutingContractRow>(
    'SELECT * FROM gui_routing_contracts WHERE contract_type = ? AND enabled = 1',
    [contractType]
  ) ?? null;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** Enable or disable a contract at runtime (feature flag path). */
export function setContractEnabled(
  contractType: 'approval' | 'brainstorm',
  enabled:      boolean
): void {
  run(
    'UPDATE gui_routing_contracts SET enabled = ?, updated_at = ? WHERE contract_type = ?',
    [enabled ? 1 : 0, nowIso(), contractType]
  );
}
