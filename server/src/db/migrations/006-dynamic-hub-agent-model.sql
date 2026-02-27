-- Migration 006: Dynamic Hub Agent Model — Phase 0
-- Extends agent_definitions with tool surfaces, context keys and permanence;
-- adds workspace_session_registry for cross-session awareness;
-- adds gui_routing_contracts for DB-owned GUI contract storage.

-- ============================================================
-- 1. Extend agent_definitions
-- ============================================================
-- allowed_tools  : JSON string[] of "tool:action" or "tool:*" patterns
--                  that agents of this type are permitted to call.
-- blocked_tools  : JSON string[] of "tool:action" patterns that are
--                  explicitly denied and injected as blocked-surface
--                  declarations into every materialised file.
-- required_context_keys : JSON string[] — keys that MUST be present in
--                  the context_payload before deploy_agent_to_workspace
--                  will write the file (validation gate).
-- checkpoint_triggers   : JSON object — conditions that embed a
--                  mandatory plan-update checkpoint rule into every
--                  materialised file.  Shape:
--                  { step_complete: bool, blocker_detected: bool,
--                    scope_escalation: bool, error: bool,
--                    all_steps_done: bool }
-- is_permanent   : 1 = hub / prompt-analyst (persist at .github/agents/);
--                  0 = all other roles (ephemeral, session-scoped path).

ALTER TABLE agent_definitions ADD COLUMN allowed_tools        TEXT;
ALTER TABLE agent_definitions ADD COLUMN blocked_tools        TEXT;
ALTER TABLE agent_definitions ADD COLUMN required_context_keys TEXT;
ALTER TABLE agent_definitions ADD COLUMN checkpoint_triggers  TEXT;
ALTER TABLE agent_definitions ADD COLUMN is_permanent         INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Workspace session registry
-- ============================================================
-- One row per active agent session across the entire workspace.
-- Created/upserted by deploy_agent_to_workspace at spawn time;
-- updated by every memory_steps update and memory_agent handoff/complete.
-- Queried by deploy_agent_to_workspace to build the ##PEER_SESSIONS
-- block injected into every materialised agent file.

CREATE TABLE IF NOT EXISTS workspace_session_registry (
  id                   TEXT    NOT NULL PRIMARY KEY,
  -- id mirrors the sessions.id value so the two rows stay in sync.
  workspace_id         TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id              TEXT    REFERENCES plans(id) ON DELETE SET NULL,
  agent_type           TEXT    NOT NULL,
  current_phase        TEXT,
  step_indices_claimed TEXT    NOT NULL DEFAULT '[]',  -- JSON: number[]
  files_in_scope       TEXT    NOT NULL DEFAULT '[]',  -- JSON: string[] (absolute paths)
  materialised_path    TEXT,   -- path to the session-scoped .agent.md written on disk
  status               TEXT    NOT NULL DEFAULT 'active'
                         CHECK(status IN ('active', 'stopping', 'completed')),
  started_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wsr_workspace
  ON workspace_session_registry(workspace_id);

CREATE INDEX IF NOT EXISTS idx_wsr_workspace_status
  ON workspace_session_registry(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_wsr_plan
  ON workspace_session_registry(plan_id);

-- ============================================================
-- 3. GUI routing contracts
-- ============================================================
-- One row per contract_type.  Seeded at server start (idempotent).
-- hub.agent.md carries only the contract_type key; all logic lives here.
--
-- trigger_criteria    : JSON — conditions under which Hub MUST invoke GUI.
--                       Shape: { risk_level?: string[], reversible?: bool,
--                                confirmation_scope?: string[],
--                                plan_category?: string[],
--                                optionality_signal?: bool }
-- invocation_params_schema : JSON schema describing the FormRequest payload
--                       Hub sends to the GUI process.
-- response_schema     : JSON — shape of the GUI response object.
--                       Standard envelope:
--                       { outcome: 'approve'|'reject'|'timeout'|'select',
--                         selected_option?: string,
--                         notes?: string }
-- feedback_paths      : JSON — keyed by outcome, each value is an array of
--                       MCP calls to execute.
--                       Example "approve": [{ tool: "memory_plan",
--                         action: "confirm", params: {...} }]
-- fallback_behavior   : what Hub does when GUI is unavailable.
--                       'auto-select-recommended' = pick the recommended option
--                       'block' = treat as reject / pause plan
--                       'skip'  = proceed without confirmation (low-risk only)
-- enabled             : feature flag; 0 = contract inactive (Hub proceeds as
--                       if GUI unavailable using fallback_behavior).

CREATE TABLE IF NOT EXISTS gui_routing_contracts (
  id                      TEXT    NOT NULL PRIMARY KEY,
  contract_type           TEXT    NOT NULL UNIQUE
                            CHECK(contract_type IN ('approval', 'brainstorm')),
  version                 TEXT    NOT NULL DEFAULT '1.0',
  trigger_criteria        TEXT    NOT NULL DEFAULT '{}',
  invocation_params_schema TEXT   NOT NULL DEFAULT '{}',
  response_schema         TEXT    NOT NULL DEFAULT '{}',
  feedback_paths          TEXT    NOT NULL DEFAULT '{}',
  fallback_behavior       TEXT    NOT NULL DEFAULT 'block'
                            CHECK(fallback_behavior IN (
                              'auto-select-recommended', 'block', 'skip'
                            )),
  enabled                 INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gui_contracts_type
  ON gui_routing_contracts(contract_type);
